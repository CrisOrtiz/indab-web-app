import {
  ApplicationConfig,
  inject,
  isDevMode,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideServiceWorker } from '@angular/service-worker';
import { TitleStrategy, provideRouter, withComponentInputBinding } from '@angular/router';
import { environment } from '../environments/environment';
import { routes } from './app.routes';
import { provideFirebase } from './core/firebase/firebase.providers';
import { I18n } from './core/i18n/i18n.service';
import { I18nTitleStrategy } from './core/i18n/title-strategy';
import { AppUpdates } from './core/pwa/app-updates.service';
import { Seo } from './core/seo/seo.service';
import { ThemeService } from './core/theme/theme.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    { provide: TitleStrategy, useClass: I18nTitleStrategy },
    provideAppInitializer(() => {
      inject(Seo);
      inject(ThemeService);
      inject(AppUpdates);
      return inject(I18n).init();
    }),
    // Installable app: caches the app's own files only (Firestore, Auth and market data always
    // go to the network). Registered once the app is stable, so the first visit stays fast.
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
    provideFirebase({ options: environment.firebase, useEmulators: environment.useEmulators }),
  ],
};
