import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <div class="auth-page dl-dark">
      <form class="panel" [formGroup]="form" (ngSubmit)="submit()">
        <div class="brand">
          <img class="mark" src="/brand/logo-mark.png" width="44" height="44" alt="" aria-hidden="true" />
          <div class="name">DraftLab</div>
        </div>
        <h1>Sign in to your draft room</h1>
        <p class="support">
          Your leagues, strategies, and live drafts stay tied to this account.
        </p>

        @if (error()) {
          <div class="error" role="alert">{{ error() }}</div>
        }

        <label>
          <span>EMAIL</span>
          <input type="email" formControlName="email" autocomplete="email" placeholder="you@example.com" />
        </label>
        <label>
          <span>PASSWORD</span>
          <input type="password" formControlName="password" autocomplete="current-password" placeholder="••••••••" />
        </label>

        <button class="cta" type="submit" [disabled]="form.invalid || busy()">Sign in</button>
        <p class="footer">
          New here?
          <a routerLink="/signup">Create an account</a>
        </p>
      </form>
    </div>
  `,
  styleUrl: './auth-shared.css',
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  async submit() {
    if (this.form.invalid) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const { email, password } = this.form.getRawValue();
      await this.auth.login(email, password);
      await this.router.navigateByUrl('/');
    } catch {
      this.error.set('Invalid email or password.');
    } finally {
      this.busy.set(false);
    }
  }
}
