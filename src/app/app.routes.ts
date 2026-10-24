import { Routes } from '@angular/router';
import { authGuard, enrolledGuard, guestGuard, staffGuard } from './core/auth/auth.guards';

// Titles are keys of `Messages['titles']`, translated by `I18nTitleStrategy`.
export const routes: Routes = [
  // Public
  {
    path: '',
    pathMatch: 'full',
    title: 'landing',
    loadComponent: () => import('./features/landing/landing').then((m) => m.Landing),
  },
  {
    path: 'eleva',
    title: 'eleva',
    loadComponent: () => import('./features/eleva/eleva').then((m) => m.Eleva),
  },
  {
    path: 'login',
    title: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login/login').then((m) => m.Login),
  },
  {
    path: 'register',
    title: 'register',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/register/register').then((m) => m.Register),
  },

  // Signed-in users
  {
    path: 'academy',
    title: 'academy',
    canActivate: [authGuard],
    loadComponent: () => import('./features/academy/academy').then((m) => m.Academy),
  },
  {
    path: 'profile',
    title: 'profile',
    canActivate: [authGuard],
    loadComponent: () => import('./features/profile/profile').then((m) => m.Profile),
  },

  // Enrolled users only
  {
    path: 'academy/practice',
    title: 'practice',
    canActivate: [enrolledGuard],
    loadComponent: () => import('./features/practice/practice').then((m) => m.Practice),
  },
  {
    path: 'academy/ranking',
    title: 'ranking',
    canActivate: [enrolledGuard],
    loadComponent: () => import('./features/ranking/ranking').then((m) => m.Ranking),
  },
  {
    path: 'academy/material',
    title: 'material',
    canActivate: [enrolledGuard],
    loadComponent: () => import('./features/repository/repository').then((m) => m.Repository),
  },
  // The material used to be its own section; keep old links working.
  { path: 'repository', redirectTo: 'academy/material' },

  // Trainers and admins; user management inside /admin is for admins only.
  {
    path: 'admin',
    title: 'admin',
    canActivate: [staffGuard],
    loadComponent: () => import('./features/admin/admin').then((m) => m.Admin),
  },
  {
    path: 'admin/practice',
    title: 'adminPractice',
    canActivate: [staffGuard],
    loadComponent: () =>
      import('./features/admin/practice-review/practice-review').then((m) => m.PracticeReview),
  },
  {
    path: 'admin/evaluations',
    title: 'adminEvaluations',
    canActivate: [staffGuard],
    loadComponent: () =>
      import('./features/admin/evaluations/admin-evaluations').then((m) => m.AdminEvaluations),
  },

  {
    path: '**',
    title: 'notFound',
    loadComponent: () => import('./features/not-found/not-found').then((m) => m.NotFound),
  },
];
