import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-signup',
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <div class="auth-page dl-dark">
      <form class="panel" [formGroup]="form" (ngSubmit)="submit()">
        <div class="brand">
          <img class="mark" src="/brand/logo-mark.svg" width="44" height="44" alt="" aria-hidden="true" />
          <div class="name">DraftLab</div>
        </div>
        <h1>Create your DraftLab account</h1>
        <p class="support">
          Connect Sleeper leagues, lock a strategy, and run live drafts from one account.
        </p>

        @if (error()) {
          <div class="error" role="alert">{{ error() }}</div>
        }

        <label>
          <span>DISPLAY NAME</span>
          <input type="text" formControlName="displayName" autocomplete="nickname" placeholder="Jordan" />
        </label>
        <label>
          <span>EMAIL</span>
          <input type="email" formControlName="email" autocomplete="email" placeholder="you@example.com" />
        </label>
        <label>
          <span>PASSWORD</span>
          <input
            type="password"
            formControlName="password"
            autocomplete="new-password"
            placeholder="At least 8 characters"
          />
        </label>
        <label>
          <span>CONFIRM PASSWORD</span>
          <input type="password" formControlName="confirm" autocomplete="new-password" placeholder="••••••••" />
        </label>

        <button class="cta" type="submit" [disabled]="form.invalid || busy()">Create account</button>
        <p class="footer">
          Already have an account?
          <a routerLink="/login">Sign in</a>
        </p>
      </form>
    </div>
  `,
  styleUrl: './auth-shared.css',
})
export class SignupComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    displayName: ['', [Validators.required]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    confirm: ['', [Validators.required]],
  });

  async submit() {
    if (this.form.invalid) return;
    const { displayName, email, password, confirm } = this.form.getRawValue();
    if (password !== confirm) {
      this.error.set('Passwords do not match.');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.auth.register(displayName, email, password);
      await this.router.navigateByUrl('/');
    } catch (err: unknown) {
      const msg =
        typeof err === 'object' &&
        err &&
        'error' in err &&
        typeof (err as { error?: { error?: string } }).error?.error === 'string'
          ? (err as { error: { error: string } }).error.error
          : 'Could not create account.';
      this.error.set(msg);
    } finally {
      this.busy.set(false);
    }
  }
}
