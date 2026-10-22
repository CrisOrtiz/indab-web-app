import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Header } from './shared/layout/header';

@Component({
  imports: [RouterOutlet, Header],
  selector: 'app-root',
  templateUrl: './app.html',
})
export class App {}
