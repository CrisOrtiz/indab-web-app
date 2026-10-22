import { Routes } from '@angular/router';
import { authGuard, enrolledGuard, guestGuard } from './core/auth/auth.guards';

export const routes: Routes = [
  // Public
  {
    path: '',
    pathMatch: 'full',
    title: 'INDAB Academy',
    loadComponent: () => import('./features/landing/landing').then((m) => m.Landing),
  },
  {
    path: 'eleva',
    title: 'Eleva Inversiones',
    loadComponent: () => import('./features/eleva/eleva').then((m) => m.Eleva),
  },
  {
    path: 'login',
    title: 'Ingresar | INDAB',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login/login').then((m) => m.Login),
  },
  {
    path: 'register',
    title: 'Crear cuenta | INDAB',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/register/register').then((m) => m.Register),
  },

  // Signed-in users
  {
    path: 'academy',
    title: 'Academia | INDAB',
    canActivate: [authGuard],
    loadComponent: () => import('./features/academy/academy').then((m) => m.Academy),
  },

  // Enrolled users only
  {
    path: 'repository',
    title: 'Material de estudio | INDAB',
    canActivate: [enrolledGuard],
    loadComponent: () => import('./features/repository/repository').then((m) => m.Repository),
  },

  {
    path: '**',
    title: 'Página no encontrada | INDAB',
    loadComponent: () => import('./features/not-found/not-found').then((m) => m.NotFound),
  },
];
