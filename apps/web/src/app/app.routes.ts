import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth.guard';
import { ShellComponent } from './layout/shell.component';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'signup',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/signup.component').then((m) => m.SignupComponent),
  },
  {
    path: '',
    component: ShellComponent,
    canActivate: [authGuard],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
      },
      {
        path: 'leagues/connect',
        loadComponent: () => import('./features/connect/connect.component').then((m) => m.ConnectComponent),
      },
      {
        path: 'leagues/manual-setup',
        loadComponent: () =>
          import('./features/manual-setup/manual-setup.component').then((m) => m.ManualSetupComponent),
      },
      {
        path: 'leagues/:id/strategy',
        loadComponent: () => import('./features/strategy/strategy.component').then((m) => m.StrategyComponent),
      },
      {
        path: 'leagues/:id/simulator',
        loadComponent: () =>
          import('./features/simulator/simulator.component').then((m) => m.SimulatorComponent),
      },
      {
        path: 'leagues/:id/cheat-sheet',
        loadComponent: () =>
          import('./features/cheat-sheet/cheat-sheet.component').then((m) => m.CheatSheetComponent),
      },
      {
        path: 'leagues/:id/board',
        loadComponent: () => import('./features/board/board.component').then((m) => m.BoardComponent),
      },
      {
        path: 'leagues/:id/board/:pid',
        loadComponent: () =>
          import('./features/player-detail/player-detail.component').then((m) => m.PlayerDetailComponent),
      },
      {
        path: 'leagues/:id/draft',
        loadComponent: () => import('./features/draft/draft.component').then((m) => m.DraftComponent),
      },
      {
        path: 'leagues/:id/recap',
        loadComponent: () => import('./features/recap/recap.component').then((m) => m.RecapComponent),
      },
      {
        path: 'leagues/:id/scoring',
        loadComponent: () => import('./features/scoring/scoring.component').then((m) => m.ScoringComponent),
      },
      {
        path: 'leagues/:id/roster',
        loadComponent: () => import('./features/dynasty/dynasty.component').then((m) => m.DynastyComponent),
      },
      {
        path: 'leagues/:id/auction',
        loadComponent: () => import('./features/auction/auction.component').then((m) => m.AuctionComponent),
      },
      {
        path: 'leagues/:id/calibration',
        loadComponent: () =>
          import('./features/calibration/calibration.component').then((m) => m.CalibrationComponent),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
