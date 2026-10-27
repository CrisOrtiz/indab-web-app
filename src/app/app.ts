import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Footer } from './shared/layout/footer';
import { Header } from './shared/layout/header';
import { AppLoader } from './shared/loader/loader';
import { InstallHelp } from './shared/pwa/install-help';
import { UpdateBanner } from './shared/pwa/update-banner';

@Component({
  imports: [RouterOutlet, Header, Footer, AppLoader, UpdateBanner, InstallHelp],
  selector: 'app-root',
  templateUrl: './app.html',
  // The footer stays at the bottom of the window on short pages.
  styles: ':host { display: flex; flex-direction: column; min-height: 100vh; } main { flex: 1; }',
})
export class App {}
