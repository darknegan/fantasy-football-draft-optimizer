import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { AuthService } from './auth.service';

let refreshInFlight: Promise<string | null> | null = null;

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const token = auth.accessToken();
  const isAuthEndpoint =
    req.url.startsWith('/auth/') || req.url === '/me' || req.url.startsWith('/auth');

  const authed = token
    ? req.clone({
        setHeaders: { Authorization: `Bearer ${token}` },
        withCredentials: req.withCredentials || isAuthEndpoint,
      })
    : req.clone({ withCredentials: req.withCredentials || isAuthEndpoint });

  return next(authed).pipe(
    catchError((err: unknown) => {
      if (!(err instanceof HttpErrorResponse) || err.status !== 401) {
        return throwError(() => err);
      }
      if (req.url.includes('/auth/login') || req.url.includes('/auth/register') || req.url.includes('/auth/refresh')) {
        return throwError(() => err);
      }
      if (!refreshInFlight) {
        refreshInFlight = auth.refresh().finally(() => {
          refreshInFlight = null;
        });
      }
      return from(refreshInFlight).pipe(
        switchMap((nextToken) => {
          if (!nextToken) {
            void router.navigateByUrl('/login');
            return throwError(() => err);
          }
          return next(
            req.clone({
              setHeaders: { Authorization: `Bearer ${nextToken}` },
              withCredentials: true,
            }),
          );
        }),
      );
    }),
  );
};
