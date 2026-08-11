import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  DEFAULT_USER_PREFERENCES,
  type InitialsColor,
  type UserPreferences,
} from '@draftlab/domain';
import { firstValueFrom } from 'rxjs';
import { clearAllForUser } from './offline-draft.store';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  createdAt?: string;
  timeZone?: string;
  initialsColor?: InitialsColor;
  passwordChangedAt?: string | null;
  preferences?: UserPreferences;
  leagueCount?: number;
}

export interface AuthSession {
  id: string;
  label: string;
  userAgent: string | null;
  createdAt: string;
  current: boolean;
}

interface SessionResponse {
  accessToken: string;
  user: AuthUser;
}

const ACCESS_KEY = 'draftlab.accessToken';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  private readonly userSignal = signal<AuthUser | null>(null);
  private readonly accessTokenSignal = signal<string | null>(sessionStorage.getItem(ACCESS_KEY));
  private readonly readySignal = signal(false);

  readonly user = this.userSignal.asReadonly();
  readonly accessToken = this.accessTokenSignal.asReadonly();
  readonly ready = this.readySignal.asReadonly();
  readonly isAuthenticated = computed(() => !!this.userSignal());

  async bootstrap(): Promise<void> {
    try {
      if (this.accessTokenSignal()) {
        const me = await firstValueFrom(this.http.get<AuthUser>('/me'));
        this.userSignal.set(normalizeUser(me));
      } else {
        await this.refresh();
      }
    } catch {
      this.clearSession();
    } finally {
      this.readySignal.set(true);
    }
  }

  async login(email: string, password: string): Promise<void> {
    const session = await firstValueFrom(
      this.http.post<SessionResponse>('/auth/login', { email, password }, { withCredentials: true }),
    );
    this.applySession(session);
  }

  async register(displayName: string, email: string, password: string): Promise<void> {
    const session = await firstValueFrom(
      this.http.post<SessionResponse>(
        '/auth/register',
        { displayName, email, password },
        { withCredentials: true },
      ),
    );
    this.applySession(session);
  }

  async refresh(): Promise<string | null> {
    try {
      const session = await firstValueFrom(
        this.http.post<SessionResponse>('/auth/refresh', {}, { withCredentials: true }),
      );
      this.applySession(session);
      return session.accessToken;
    } catch {
      this.clearSession();
      return null;
    }
  }

  async logout(): Promise<void> {
    const userId = this.userSignal()?.id;
    try {
      await firstValueFrom(this.http.post('/auth/logout', {}, { withCredentials: true }));
    } catch {
      // ignore
    }
    if (userId) await clearAllForUser(userId);
    this.clearSession();
    await this.router.navigateByUrl('/login');
  }

  async updateProfile(body: {
    displayName?: string;
    timeZone?: string;
    initialsColor?: InitialsColor;
    preferences?: Partial<UserPreferences>;
  }): Promise<AuthUser> {
    const me = await firstValueFrom(
      this.http.patch<AuthUser>('/me', body, { withCredentials: true }),
    );
    const normalized = normalizeUser(me);
    this.userSignal.set(normalized);
    return normalized;
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await firstValueFrom(
      this.http.post(
        '/me/password',
        { currentPassword, newPassword },
        { withCredentials: true },
      ),
    );
  }

  async listSessions(): Promise<AuthSession[]> {
    const res = await firstValueFrom(
      this.http.get<{ sessions: AuthSession[] }>('/me/sessions', { withCredentials: true }),
    );
    return res.sessions;
  }

  async revokeSession(id: string): Promise<void> {
    await firstValueFrom(
      this.http.delete(`/me/sessions/${id}`, { withCredentials: true }),
    );
  }

  async revokeOtherSessions(): Promise<void> {
    await firstValueFrom(
      this.http.post('/me/sessions/revoke-all', {}, { withCredentials: true }),
    );
  }

  async exportAccount(): Promise<Blob> {
    const data = await firstValueFrom(
      this.http.get('/me/export', { withCredentials: true }),
    );
    return new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  }

  async deleteAccount(password: string): Promise<void> {
    const userId = this.userSignal()?.id;
    await firstValueFrom(
      this.http.delete('/me', { body: { password }, withCredentials: true }),
    );
    if (userId) await clearAllForUser(userId);
    this.clearSession();
    await this.router.navigateByUrl('/signup');
  }

  private applySession(session: SessionResponse) {
    this.accessTokenSignal.set(session.accessToken);
    this.userSignal.set(normalizeUser(session.user));
    sessionStorage.setItem(ACCESS_KEY, session.accessToken);
  }

  private clearSession() {
    this.accessTokenSignal.set(null);
    this.userSignal.set(null);
    sessionStorage.removeItem(ACCESS_KEY);
  }
}

function normalizeUser(user: AuthUser): AuthUser {
  return {
    ...user,
    timeZone: user.timeZone ?? 'America/New_York',
    initialsColor: user.initialsColor ?? 'accent',
    preferences: user.preferences ?? DEFAULT_USER_PREFERENCES,
    leagueCount: user.leagueCount ?? 0,
  };
}
