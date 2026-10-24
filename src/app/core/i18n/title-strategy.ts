import { Injectable, effect, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { I18n } from './i18n.service';
import { Messages } from './messages/es';

export type TitleKey = keyof Messages['titles'];

/**
 * Route `title`s are keys of `Messages['titles']`; this sets the translated text, and sets it
 * again when the language changes.
 */
@Injectable()
export class I18nTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);
  private readonly i18n = inject(I18n);
  private key: string | undefined;

  constructor() {
    super();
    effect(() => this.apply(this.i18n.messages()));
  }

  override updateTitle(snapshot: RouterStateSnapshot): void {
    this.key = this.buildTitle(snapshot);
    this.apply(this.i18n.messages());
  }

  private apply(messages: Messages): void {
    if (this.key !== undefined) {
      this.title.setTitle(messages.titles[this.key as TitleKey] ?? this.key);
    }
  }
}
