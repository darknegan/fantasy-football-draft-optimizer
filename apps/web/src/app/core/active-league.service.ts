import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';
import type { League } from './api.types';

@Injectable({ providedIn: 'root' })
export class ActiveLeagueService {
  private readonly auth = inject(AuthService);
  private readonly leaguesSignal = signal<League[]>([]);
  private readonly selectedIdSignal = signal<string | null>(null);

  readonly leagues = this.leaguesSignal.asReadonly();
  readonly selectedId = this.selectedIdSignal.asReadonly();
  readonly selected = computed(
    () => this.leaguesSignal().find((l) => l.id === this.selectedIdSignal()) ?? null,
  );

  setLeagues(leagues: League[]) {
    this.leaguesSignal.set(leagues);
    const userId = this.auth.user()?.id;
    const stored = userId ? localStorage.getItem(`draftlab.activeLeague.${userId}`) : null;
    const next =
      (stored && leagues.some((l) => l.id === stored) && stored) ||
      leagues[0]?.id ||
      null;
    this.selectedIdSignal.set(next);
  }

  select(leagueId: string) {
    this.selectedIdSignal.set(leagueId);
    const userId = this.auth.user()?.id;
    if (userId) localStorage.setItem(`draftlab.activeLeague.${userId}`, leagueId);
  }

  clear() {
    this.leaguesSignal.set([]);
    this.selectedIdSignal.set(null);
  }
}
