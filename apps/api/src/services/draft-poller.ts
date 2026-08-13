import type { PickEvent } from '@draftlab/domain';
import {
  nextPollIntervalMs,
  SleeperApiError,
  SleeperClient,
  type SleeperPick,
} from '@draftlab/integrations';
import { projectUserPickProgress } from '@draftlab/tiers';
import type { AppStore } from './store.js';

export type DraftBroadcast = (leagueId: string, payload: unknown) => void;

/**
 * Per-draft Sleeper poller with last_picked cheap checks, adaptive intervals,
 * and automatic degrade → manual on 429 / unreachable (plan §1.2 / §7).
 */
export class DraftPoller {
  private timers = new Map<string, NodeJS.Timeout>();
  private unchanged = new Map<string, number>();
  private lastPicked = new Map<string, number | null>();
  private failureStreak = new Map<string, number>();

  constructor(
    private readonly store: AppStore,
    private readonly client = new SleeperClient(),
    private readonly broadcast: DraftBroadcast = () => undefined,
  ) {}

  start(leagueId: string) {
    if (this.timers.has(leagueId)) return;
    const tick = async () => {
      try {
        await this.pollOnce(leagueId);
        this.failureStreak.set(leagueId, 0);
      } catch (err) {
        this.handleFailure(leagueId, err);
      }

      const league = this.store.getLeague(leagueId);
      const draft = this.store.getDraft(leagueId);
      if (!league?.sleeperDraftId || !draft) {
        this.timers.delete(leagueId);
        return;
      }

      const picksUntilUser = this.computePicksUntilUser(leagueId);
      const interval = nextPollIntervalMs({
        draftStatus: draft.status,
        picksUntilUser,
        consecutiveUnchanged: this.unchanged.get(leagueId) ?? 0,
        degraded: draft.syncMode === 'degraded',
      });

      if (interval <= 0 || draft.status === 'complete') {
        this.timers.delete(leagueId);
        return;
      }
      this.timers.set(leagueId, setTimeout(tick, interval));
    };
    void tick();
  }

  stop(leagueId: string) {
    const t = this.timers.get(leagueId);
    if (t) clearTimeout(t);
    this.timers.delete(leagueId);
  }

  stopAll() {
    for (const id of [...this.timers.keys()]) this.stop(id);
  }

  private handleFailure(leagueId: string, err: unknown) {
    const streak = (this.failureStreak.get(leagueId) ?? 0) + 1;
    this.failureStreak.set(leagueId, streak);
    const is429 = err instanceof SleeperApiError && err.status === 429;
    const banner = is429
      ? 'Sleeper rate limited — slowing polls. Board stays usable; enter picks manually if needed.'
      : 'Sleeper unreachable — switched to manual pick entry. Local state preserved.';

    this.store.patchDraft(leagueId, {
      syncMode: streak >= 2 || is429 ? 'degraded' : 'hybrid',
      syncBanner: banner,
    });

    this.broadcast(leagueId, {
      type: 'sync_status',
      draft: this.store.getDraft(leagueId),
    });
    console.error(`[poller] ${leagueId}`, err);
  }

  private computePicksUntilUser(leagueId: string): number | null {
    const league = this.store.getLeague(leagueId);
    const draft = this.store.getDraft(leagueId);
    if (!league || !draft) return null;
    const slot = league.draftSlot ?? 1;
    const progress = projectUserPickProgress(
      slot,
      league.teamCount,
      draft.currentPick,
      draft.picksUntilUser,
    );
    return progress?.picksUntilNext ?? null;
  }

  private async pollOnce(leagueId: string) {
    const league = this.store.getLeague(leagueId);
    if (!league?.sleeperDraftId) return;

    // Cheap change detection via last_picked before pulling full picks.
    const draftMeta = await this.client.getDraft(league.sleeperDraftId);
    const upstreamStatus = draftMeta.status;
    const lastPicked = draftMeta.last_picked ?? null;
    const prevLast = this.lastPicked.get(leagueId) ?? null;

    if (upstreamStatus === 'complete') {
      this.store.patchDraft(leagueId, {
        status: 'complete',
        lastSyncedAt: new Date().toISOString(),
        syncBanner: null,
        syncMode: 'polling',
        lastPickedUpstream: lastPicked,
      });
      this.broadcast(leagueId, { type: 'draft_complete', draft: this.store.getDraft(leagueId) });
      return;
    }

    if (lastPicked != null && prevLast != null && lastPicked === prevLast) {
      this.unchanged.set(leagueId, (this.unchanged.get(leagueId) ?? 0) + 1);
      this.store.patchDraft(leagueId, {
        lastSyncedAt: new Date().toISOString(),
        picksUntilUser: this.computePicksUntilUser(leagueId),
        lastPickedUpstream: lastPicked,
        syncMode: 'polling',
        syncBanner: null,
        status: upstreamStatus === 'drafting' ? 'drafting' : 'pre_draft',
      });
      return;
    }

    const picks = await this.client.getDraftPicks(league.sleeperDraftId);
    this.lastPicked.set(leagueId, lastPicked);
    this.unchanged.set(leagueId, 0);

    for (const pick of picks) {
      this.store.applyPick(leagueId, this.mapPick(pick));
    }

    this.store.patchDraft(leagueId, {
      status: upstreamStatus === 'drafting' ? 'drafting' : 'pre_draft',
      lastSyncedAt: new Date().toISOString(),
      syncMode: 'polling',
      syncBanner: null,
      lastPickedUpstream: lastPicked,
      picksUntilUser: this.computePicksUntilUser(leagueId),
    });

    this.broadcast(leagueId, {
      type: 'draft_update',
      draft: this.store.getDraft(leagueId),
      board: this.store.getBoard(leagueId).slice(0, 50),
    });
  }

  private mapPick(pick: SleeperPick): Omit<PickEvent, 'pickedAt'> & { pickedAt?: string } {
    // Prefer metadata name mapping later; store sleeper player id for now.
    return {
      pickNumber: pick.pick_no,
      round: pick.round,
      slot: pick.draft_slot,
      playerId: pick.player_id,
      rosterId: `roster-${pick.roster_id}`,
      source: 'sleeper',
    };
  }
}
