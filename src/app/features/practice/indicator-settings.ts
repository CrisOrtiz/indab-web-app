import {
  Component,
  ElementRef,
  afterNextRender,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { I18n } from '../../core/i18n/i18n.service';
import {
  Indicator,
  IndicatorConfig,
  IndicatorInput,
  LINE_WIDTHS,
  VISIBILITY_TIMEFRAMES,
  clampInput,
  defaultConfig,
  indicatorLabel,
  readConfig,
} from './indicators';

type Tab = 'inputs' | 'style' | 'visibility';

/**
 * An indicator's settings, as TradingView's dialog: its inputs (lengths, multipliers,
 * switches), the color and width of each of its lines, and the timeframes it shows on. Nothing
 * changes until "OK"; "Reset" puts back how it comes. A modal `<dialog>`, so it sits above the
 * chart whatever contains it; a sheet over the whole screen on phones.
 */
@Component({
  selector: 'app-indicator-settings',
  templateUrl: './indicator-settings.html',
  styleUrl: './indicator-settings.scss',
})
export class IndicatorSettings {
  protected readonly i18n = inject(I18n);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  readonly indicator = input.required<Indicator>();
  readonly config = input.required<IndicatorConfig>();
  readonly saved = output<IndicatorConfig>();
  readonly closed = output<void>();

  protected readonly tabs: Tab[] = ['inputs', 'style', 'visibility'];
  protected readonly tab = signal<Tab>('inputs');
  /** The setup being edited; the chart only gets it on "OK". */
  protected readonly draft = signal<IndicatorConfig | null>(null);
  protected readonly widths = LINE_WIDTHS;
  protected readonly timeframes = VISIBILITY_TIMEFRAMES;
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    afterNextRender(() => {
      const dialog = this.dialog().nativeElement;
      if (dialog.showModal) {
        dialog.showModal();
      } else {
        // Browsers (and test DOMs) without modal dialogs still show it.
        dialog.setAttribute('open', '');
      }
      this.draft.set(structuredClone(this.config()));
      this.host.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus();
    });
  }

  /** The setup shown: the draft once made, the given one until then. */
  protected current(): IndicatorConfig {
    return this.draft() ?? this.config();
  }

  protected title(): string {
    const indicator = this.indicator();
    return (
      indicatorLabel(indicator, this.current()) ?? this.i18n.messages().chart.indicatorNames.volume
    );
  }

  private edit(change: (config: IndicatorConfig) => void): void {
    const next = structuredClone(this.current());
    change(next);
    this.draft.set(next);
  }

  protected setNumber(input: IndicatorInput, raw: string): void {
    const value = Number(raw);
    if (raw.trim() !== '' && Number.isFinite(value)) {
      this.edit((c) => (c.inputs[input.key] = clampInput(input, value)));
    }
  }

  protected setBool(key: string, value: boolean): void {
    this.edit((c) => (c.inputs[key] = value));
  }

  protected setColor(key: string, value: string): void {
    this.edit((c) => (c.colors[key] = value.toLowerCase()));
  }

  protected setWidth(key: string, value: string): void {
    this.edit((c) => (c.widths[key] = Number(value)));
  }

  protected shownOn(seconds: number): boolean {
    return !this.current().hidden.includes(seconds);
  }

  protected setShownOn(seconds: number, shown: boolean): void {
    this.edit((c) => {
      c.hidden = this.timeframes
        .map((t) => t.seconds)
        .filter((s) => (s === seconds ? !shown : c.hidden.includes(s)));
    });
  }

  /** A click on the backdrop (the dialog itself, outside its content) closes it. */
  protected backdropClick(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement) {
      this.closed.emit();
    }
  }

  protected reset(): void {
    this.draft.set(defaultConfig(this.indicator()));
  }

  protected accept(): void {
    this.saved.emit(readConfig(this.indicator(), this.current()));
  }

  /** Arrow keys move between the tabs, as in a tab list. */
  protected tabKey(event: KeyboardEvent): void {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!step) {
      return;
    }
    event.preventDefault();
    const i = (this.tabs.indexOf(this.tab()) + step + this.tabs.length) % this.tabs.length;
    this.tab.set(this.tabs[i]);
    this.host.querySelectorAll<HTMLElement>('[role="tab"]')[i]?.focus();
  }
}
