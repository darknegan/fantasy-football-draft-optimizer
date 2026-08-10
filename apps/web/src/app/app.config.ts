import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { providePrimeNG } from 'primeng/config';
import Aura from '@primeuix/themes/aura';
import { definePreset } from '@primeuix/themes';

import { routes } from './app.routes';
import { authInterceptor } from './core/auth.interceptor';

const DraftLabPreset = definePreset(Aura, {
  semantic: {
    primary: {
      50: '#e6fff6',
      100: '#b3ffe6',
      200: '#80ffd6',
      300: '#4dffc6',
      400: '#1affb6',
      500: '#00e5a0',
      600: '#00b87f',
      700: '#008a5f',
      800: '#005c3f',
      900: '#002e20',
      950: '#001910',
    },
    colorScheme: {
      dark: {
        surface: {
          0: '#ffffff',
          50: '#e8edf5',
          100: '#c5cddb',
          200: '#96a3b8',
          300: '#5d6b80',
          400: '#2e3a4d',
          500: '#1e2635',
          600: '#1a2130',
          700: '#111722',
          800: '#0a0e14',
          900: '#070a0f',
          950: '#04060a',
        },
      },
    },
  },
});

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideRouter(routes),
    providePrimeNG({
      theme: {
        preset: DraftLabPreset,
        options: {
          darkModeSelector: '.dl-dark',
        },
      },
    }),
  ],
};
