import { DOCUMENT } from '@angular/common';
import {
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18n } from '../../core/i18n/i18n.service';
import {
  COUNTRIES,
  Country,
  DEFAULT_COUNTRIES,
  Importance,
  WIDGET_SCRIPT,
  widgetConfig,
} from './widget';

/**
 * Economic calendar, part of the academy: TradingView's free widget with the scheduled news
 * (forecast, previous and actual, updated live) for the economies behind our markets, plus a
 * short guide to the events that move each one. Nothing is stored or paid for on our side.
 */
@Component({
  selector: 'app-calendar',
  imports: [RouterLink],
  templateUrl: './calendar.html',
  styleUrl: './calendar.scss',
})
export class Calendar {
  private readonly document = inject(DOCUMENT);
  protected readonly i18n = inject(I18n);

  protected readonly countries = COUNTRIES;
  protected readonly selected = signal<Country[]>(DEFAULT_COUNTRIES);
  protected readonly importance = signal<Importance>('high');

  private readonly host = viewChild<ElementRef<HTMLElement>>('widget');
  private readonly config = computed(() =>
    this.selected().length
      ? widgetConfig(
          { countries: this.selected(), importance: this.importance() },
          this.i18n.language(),
        )
      : null,
  );

  constructor() {
    // The embed reads its settings once, so it is rebuilt whenever they change.
    afterRenderEffect(() => {
      const host = this.host()?.nativeElement;
      const config = this.config();
      if (host && config) {
        this.mountWidget(host, config, this.i18n.messages().calendar.credit);
      }
    });
  }

  protected toggle(country: Country): void {
    this.selected.update((list) =>
      list.includes(country) ? list.filter((c) => c !== country) : [...list, country],
    );
  }

  private mountWidget(host: HTMLElement, config: object, credit: string): void {
    const doc = this.document;
    const container = doc.createElement('div');
    container.className = 'tradingview-widget-container';
    const widget = doc.createElement('div');
    widget.className = 'tradingview-widget-container__widget';

    // TradingView's terms for the free widgets ask to keep this link.
    const copyright = doc.createElement('div');
    copyright.className = 'tradingview-widget-copyright';
    const link = doc.createElement('a');
    link.href = 'https://www.tradingview.com/';
    link.rel = 'noopener nofollow';
    link.target = '_blank';
    link.textContent = credit;
    copyright.append(link);

    const script = doc.createElement('script');
    script.src = WIDGET_SCRIPT;
    script.async = true;
    script.textContent = JSON.stringify(config);

    container.append(widget, copyright, script);
    host.replaceChildren(container);
  }
}
