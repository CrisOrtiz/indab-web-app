import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Footer } from './shared/layout/footer';
import { Header } from './shared/layout/header';
import { AppLoader } from './shared/loader/loader';

@Component({
  imports: [RouterOutlet, Header, Footer, AppLoader],
  selector: 'app-root',
  templateUrl: './app.html',
  // The footer stays at the bottom of the window on short pages.
  styles: ':host { display: flex; flex-direction: column; min-height: 100vh; } main { flex: 1; }',
})
export class App {}
