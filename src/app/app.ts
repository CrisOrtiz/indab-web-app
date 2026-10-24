import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Header } from './shared/layout/header';
import { AppLoader } from './shared/loader/loader';

@Component({
  imports: [RouterOutlet, Header, AppLoader],
  selector: 'app-root',
  templateUrl: './app.html',
})
export class App {}
