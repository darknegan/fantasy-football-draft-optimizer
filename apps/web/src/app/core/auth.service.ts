import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { clearAllForUser } from './offline-draft.store';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  createdAt?: string;
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
        this.userSignal.set(me);
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

  private applySession(session: SessionResponse) {
    this.accessTokenSignal.set(session.accessToken);
    this.userSignal.set(session.user);
    sessionStorage.setItem(ACCESS_KEY, session.accessToken);
  }

  private clearSession() {
    this.accessTokenSignal.set(null);
    this.userSignal.set(null);
    sessionStorage.removeItem(ACCESS_KEY);
  }
}
