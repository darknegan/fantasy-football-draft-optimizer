import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  DEFAULT_USER_PREFERENCES,
  type DraftLeadTime,
  type InitialsColor,
  type UserPreferences,
} from '@draftlab/domain';
import { AuthService, type AuthSession } from '../../core/auth.service';
import { ActiveLeagueService } from '../../core/active-league.service';

const INITIALS_SWATCHES: Array<{ id: InitialsColor; css: string }> = [
  { id: 'accent', css: 'var(--dl-accent)' },
  { id: 'pos-qb', css: 'var(--dl-pos-qb)' },
  { id: 'pos-rb', css: 'var(--dl-pos-rb)' },
  { id: 'pos-wr', css: 'var(--dl-pos-wr)' },
  { id: 'pos-te', css: 'var(--dl-pos-te)' },
  { id: 'accent-secondary', css: 'var(--dl-accent-secondary)' },
];

const TIME_ZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
  'Pacific/Honolulu',
  'UTC',
  'Europe/London',
];

@Component({
  selector: 'app-profile',
  imports: [FormsModule, DatePipe, RouterLink],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly leagues = inject(ActiveLeagueService);

  readonly swatches = INITIALS_SWATCHES;
  readonly timeZones = TIME_ZONES;

  readonly displayName = signal('');
  readonly email = signal('');
  readonly timeZone = signal('America/New_York');
  readonly initialsColor = signal<InitialsColor>('accent');
  readonly preferences = signal<UserPreferences>({ ...DEFAULT_USER_PREFERENCES });

  readonly sessions = signal<AuthSession[]>([]);
  readonly currentPassword = signal('');
  readonly newPassword = signal('');
  readonly deletePassword = signal('');

  readonly saving = signal(false);
  readonly passwordBusy = signal(false);
  readonly dangerBusy = signal(false);
  readonly accountMessage = signal<string | null>(null);
  readonly accountError = signal<string | null>(null);
  readonly passwordMessage = signal<string | null>(null);
  readonly passwordError = signal<string | null>(null);
  readonly dangerError = signal<string | null>(null);

  readonly initials = computed(() => {
    const name = this.displayName().trim() || this.auth.user()?.displayName?.trim() || 'DL';
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  });

  readonly avatarCss = computed(() => {
    const hit = INITIALS_SWATCHES.find((s) => s.id === this.initialsColor());
    return hit?.css ?? 'var(--dl-accent)';
  });

  readonly memberSince = computed(() => this.auth.user()?.createdAt ?? null);
  readonly leagueCount = computed(
    () => this.auth.user()?.leagueCount ?? this.leagues.leagues().length,
  );
  readonly passwordChangedAt = computed(() => this.auth.user()?.passwordChangedAt ?? null);
  readonly sleeperMeta = computed(() => {
    const sleeper = this.leagues.leagues().find((l) => l.platform === 'sleeper');
    return sleeper
      ? { connected: true as const, label: sleeper.name }
      : { connected: false as const, label: null };
  });

  ngOnInit() {
    this.hydrateFromUser();
    void this.reloadSessions();
  }

  hydrateFromUser() {
    const user = this.auth.user();
    if (!user) return;
    this.displayName.set(user.displayName);
    this.email.set(user.email);
    this.timeZone.set(user.timeZone ?? 'America/New_York');
    this.initialsColor.set(user.initialsColor ?? 'accent');
    this.preferences.set(user.preferences ?? { ...DEFAULT_USER_PREFERENCES });
  }

  async saveAccount() {
    this.saving.set(true);
    this.accountError.set(null);
    this.accountMessage.set(null);
    try {
      await this.auth.updateProfile({
        displayName: this.displayName().trim(),
        timeZone: this.timeZone(),
        initialsColor: this.initialsColor(),
        preferences: this.preferences(),
      });
      this.accountMessage.set('Saved');
      this.hydrateFromUser();
    } catch (err) {
      this.accountError.set(readError(err, 'Could not save profile'));
    } finally {
      this.saving.set(false);
    }
  }

  setDensity(value: UserPreferences['boardDensity']) {
    this.preferences.update((p) => ({ ...p, boardDensity: value }));
    void this.persistPreferences();
  }

  setLanding(value: UserPreferences['landingScreen']) {
    this.preferences.update((p) => ({ ...p, landingScreen: value }));
    void this.persistPreferences();
  }

  setAdp(value: UserPreferences['adpNotation']) {
    this.preferences.update((p) => ({ ...p, adpNotation: value }));
    void this.persistPreferences();
  }

  togglePref(key: 'confirmBeforePick' | 'autoScrollToPick') {
    this.preferences.update((p) => ({ ...p, [key]: !p[key] }));
    void this.persistPreferences();
  }

  toggleNotification(key: 'draftStarting' | 'pickUp' | 'positionRun') {
    this.preferences.update((p) => ({
      ...p,
      notifications: { ...p.notifications, [key]: !p.notifications[key] },
    }));
    void this.persistPreferences();
  }

  toggleLeadTime(value: DraftLeadTime) {
    this.preferences.update((p) => {
      const set = new Set(p.notifications.draftLeadTimes);
      if (set.has(value)) set.delete(value);
      else set.add(value);
      const order: DraftLeadTime[] = ['24h', '1h', '15m'];
      return {
        ...p,
        notifications: {
          ...p.notifications,
          draftLeadTimes: order.filter((t) => set.has(t)),
        },
      };
    });
    void this.persistPreferences();
  }

  private async persistPreferences() {
    try {
      await this.auth.updateProfile({ preferences: this.preferences() });
    } catch (err) {
      this.accountError.set(readError(err, 'Could not save preferences'));
    }
  }

  leadActive(value: DraftLeadTime): boolean {
    return this.preferences().notifications.draftLeadTimes.includes(value);
  }

  async changePassword() {
    this.passwordBusy.set(true);
    this.passwordError.set(null);
    this.passwordMessage.set(null);
    try {
      await this.auth.changePassword(this.currentPassword(), this.newPassword());
      this.currentPassword.set('');
      this.newPassword.set('');
      this.passwordMessage.set('Password updated');
      await this.auth.bootstrap();
      this.hydrateFromUser();
    } catch (err) {
      this.passwordError.set(readError(err, 'Could not change password'));
    } finally {
      this.passwordBusy.set(false);
    }
  }

  async reloadSessions() {
    try {
      this.sessions.set(await this.auth.listSessions());
    } catch {
      this.sessions.set([]);
    }
  }

  async revokeSession(id: string) {
    try {
      await this.auth.revokeSession(id);
      await this.reloadSessions();
    } catch (err) {
      this.passwordError.set(readError(err, 'Could not revoke session'));
    }
  }

  async revokeOthers() {
    try {
      await this.auth.revokeOtherSessions();
      await this.reloadSessions();
      this.passwordMessage.set('Signed out of other devices');
    } catch (err) {
      this.passwordError.set(readError(err, 'Could not sign out elsewhere'));
    }
  }

  async exportData() {
    this.dangerBusy.set(true);
    this.dangerError.set(null);
    try {
      const blob = await this.auth.exportAccount();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `draftlab-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      this.dangerError.set(readError(err, 'Could not export data'));
    } finally {
      this.dangerBusy.set(false);
    }
  }

  async deleteAccount() {
    if (!this.deletePassword()) {
      this.dangerError.set('Enter your password to delete the account');
      return;
    }
    const ok = window.confirm(
      `Delete this account and ${this.leagueCount()} league${this.leagueCount() === 1 ? '' : 's'}? This cannot be undone.`,
    );
    if (!ok) return;
    this.dangerBusy.set(true);
    this.dangerError.set(null);
    try {
      await this.auth.deleteAccount(this.deletePassword());
    } catch (err) {
      this.dangerError.set(readError(err, 'Could not delete account'));
      this.dangerBusy.set(false);
    }
  }
}

function readError(err: unknown, fallback: string): string {
  const http = err as { error?: { error?: string }; message?: string };
  return http?.error?.error || http?.message || fallback;
}
