import type { PickEvent } from '@draftlab/domain';
import { nextPollIntervalMs, SleeperClient, type SleeperPick } from '@draftlab/integrations';
import type { AppStore } from './store.js';

export type DraftBroadcast = (leagueId: string, payload: unknown) => void;

/**
 * Per-draft Sleeper poller. Centralised so browser clients never burn the shared IP budget.
 * Falls back gracefully when no sleeperDraftId is configured (manual mode).
 */
export class DraftPoller {
  private timers = new Map<string, NodeJS.Timeout>();
  private unchanged = new Map<string, number>();
  private lastPickCount = new Map<string, number>();

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
      } catch (err) {
        console.error(`[poller] ${leagueId}`, err);
      }
      const league = this.store.getLeague(leagueId);
      const draft = this.store.getDraft(leagueId);
      const interval = nextPollIntervalMs({
        draftStatus: draft?.status === 'drafting' ? 'drafting' : 'pre_draft',
        consecutiveUnchanged: this.unchanged.get(leagueId) ?? 0,
      });
      if (league?.sleeperDraftId) {
        this.timers.set(leagueId, setTimeout(tick, interval));
      } else {
        this.timers.delete(leagueId);
      }
    };
    void tick();
  }

  stop(leagueId: string) {
    const t = this.timers.get(leagueId);
    if (t) clearTimeout(t);
    this.timers.delete(leagueId);
  }

  stopAll() {
    for (const id of this.timers.keys()) this.stop(id);
  }

  private async pollOnce(leagueId: string) {
    const league = this.store.getLeague(leagueId);
    if (!league?.sleeperDraftId) return;

    const picks = await this.client.getDraftPicks(league.sleeperDraftId);
    const prev = this.lastPickCount.get(leagueId) ?? 0;
    if (picks.length === prev) {
      this.unchanged.set(leagueId, (this.unchanged.get(leagueId) ?? 0) + 1);
      return;
    }
    this.unchanged.set(leagueId, 0);
    this.lastPickCount.set(leagueId, picks.length);

    for (const pick of picks) {
      const mapped = this.mapPick(pick);
      this.store.applyPick(leagueId, mapped);
    }

    const draft = this.store.getDraft(leagueId);
    this.broadcast(leagueId, {
      type: 'draft_update',
      draft,
      board: this.store.getBoard(leagueId).slice(0, 50),
    });
  }

  private mapPick(pick: SleeperPick): Omit<PickEvent, 'pickedAt'> & { pickedAt?: string } {
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
