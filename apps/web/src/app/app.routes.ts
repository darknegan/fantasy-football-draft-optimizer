import { Routes } from '@angular/router';
import { ShellComponent } from './layout/shell.component';

export const routes: Routes = [
  {
    path: '',
    component: ShellComponent,
    children: [
      {
        path: '',
        loadComponent: () => import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
      },
      {
        path: 'leagues/connect',
        loadComponent: () => import('./features/connect/connect.component').then((m) => m.ConnectComponent),
      },
      {
        path: 'leagues/:id/strategy',
        loadComponent: () => import('./features/strategy/strategy.component').then((m) => m.StrategyComponent),
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
        loadComponent: () => import('./features/player-detail/player-detail.component').then((m) => m.PlayerDetailComponent),
      },
      {
        path: 'leagues/:id/draft',
        loadComponent: () => import('./features/draft/draft.component').then((m) => m.DraftComponent),
      },
      {
        path: 'leagues/:id/scoring',
        loadComponent: () => import('./features/scoring/scoring.component').then((m) => m.ScoringComponent),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
