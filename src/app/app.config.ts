import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { TitleStrategy, provideRouter, withComponentInputBinding } from '@angular/router';
import { environment } from '../environments/environment';
import { routes } from './app.routes';
import { provideFirebase } from './core/firebase/firebase.providers';
import { I18n } from './core/i18n/i18n.service';
import { I18nTitleStrategy } from './core/i18n/title-strategy';
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
      return inject(I18n).init();
    }),
    provideFirebase({ options: environment.firebase, useEmulators: environment.useEmulators }),
  ],
};
