import { Routes } from '@angular/router';
import { adminGuard, authGuard, enrolledGuard, guestGuard } from './core/auth/auth.guards';

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
    path: 'academy/material',
    title: 'material',
    canActivate: [enrolledGuard],
    loadComponent: () => import('./features/repository/repository').then((m) => m.Repository),
  },
  // The material used to be its own section; keep old links working.
  { path: 'repository', redirectTo: 'academy/material' },

  // Admins only
  {
    path: 'admin',
    title: 'admin',
    canActivate: [adminGuard],
    loadComponent: () => import('./features/admin/admin').then((m) => m.Admin),
  },
  {
    path: 'admin/practice',
    title: 'adminPractice',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./features/admin/practice-review/practice-review').then((m) => m.PracticeReview),
  },

  {
    path: '**',
    title: 'notFound',
    loadComponent: () => import('./features/not-found/not-found').then((m) => m.NotFound),
  },
];
