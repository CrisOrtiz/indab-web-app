import { Routes } from '@angular/router';
import {
  adminGuard,
  authGuard,
  enrolledGuard,
  guestGuard,
  preloadFirestore,
  setupGuard,
  staffGuard,
} from './core/auth/auth.guards';
import { SeoData } from './core/seo/seo.service';

// Titles are keys of `Messages['titles']`, translated by `I18nTitleStrategy`. Public pages for
// search engines carry `SeoData` (and are prerendered, see `app.routes.server.ts`); the rest are
// marked noindex.
export const routes: Routes = [
  // Public
  {
    path: '',
    pathMatch: 'full',
    title: 'landing',
    data: { description: 'landing' } satisfies SeoData,
    loadComponent: () => import('./features/landing/landing').then((m) => m.Landing),
  },
  {
    path: 'eleva',
    title: 'eleva',
    data: { description: 'eleva' } satisfies SeoData,
    loadComponent: () => import('./features/eleva/eleva').then((m) => m.Eleva),
  },
  {
    path: 'calendar',
    title: 'calendar',
    data: { description: 'calendar' } satisfies SeoData,
    loadComponent: () => import('./features/calendar/calendar').then((m) => m.Calendar),
  },
  {
    path: 'login',
    title: 'login',
    data: { description: 'login' } satisfies SeoData,
    canActivate: [guestGuard, preloadFirestore],
    loadComponent: () => import('./features/auth/login/login').then((m) => m.Login),
  },
  {
    path: 'register',
    title: 'register',
    data: { description: 'register' } satisfies SeoData,
    canActivate: [guestGuard, preloadFirestore],
    loadComponent: () => import('./features/auth/register/register').then((m) => m.Register),
  },

  // Signed-in users
  {
    // Confirming the email and the details asked at registration; the other guards send here.
    path: 'account-setup',
    title: 'accountSetup',
    canActivate: [setupGuard],
    loadComponent: () =>
      import('./features/account-setup/account-setup').then((m) => m.AccountSetup),
  },
  {
    path: 'academy',
    title: 'academy',
    canActivate: [authGuard],
    loadComponent: () => import('./features/academy/academy').then((m) => m.Academy),
  },
  {
    // The public calendar opened from the academy: same page, with a link back to the academy.
    path: 'academy/calendar',
    title: 'calendar',
    canActivate: [authGuard],
    data: { fromAcademy: true },
    loadComponent: () => import('./features/calendar/calendar').then((m) => m.Calendar),
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
  {
    path: 'academy/exams',
    title: 'exams',
    canActivate: [enrolledGuard],
    loadComponent: () => import('./features/exams/exams').then((m) => m.Exams),
  },
  {
    path: 'academy/exams/:id',
    title: 'exam',
    canActivate: [enrolledGuard],
    loadComponent: () => import('./features/exams/exam-take').then((m) => m.ExamTake),
  },
  // The material used to be its own section; keep old links working.
  { path: 'repository', redirectTo: 'academy/material' },

  // Trainers and admins; user management is for admins only.
  {
    path: 'admin',
    title: 'admin',
    canActivate: [staffGuard],
    loadComponent: () => import('./features/admin/admin').then((m) => m.Admin),
  },
  {
    path: 'admin/users',
    title: 'adminUsers',
    canActivate: [adminGuard],
    loadComponent: () => import('./features/admin/users/users').then((m) => m.AdminUsers),
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
    path: 'admin/forms',
    title: 'adminExams',
    canActivate: [staffGuard],
    loadComponent: () => import('./features/admin/exams/admin-exams').then((m) => m.AdminExams),
  },
  {
    path: 'admin/forms/:id',
    title: 'adminExamResults',
    canActivate: [staffGuard],
    loadComponent: () => import('./features/admin/exams/exam-results').then((m) => m.ExamResults),
  },

  {
    path: '**',
    title: 'notFound',
    loadComponent: () => import('./features/not-found/not-found').then((m) => m.NotFound),
  },
];
