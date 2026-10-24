import { DecimalPipe, PercentPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18n } from '../../../core/i18n/i18n.service';
import { LocalDatePipe } from '../../../core/i18n/local-date.pipe';
import { Evaluation, evaluationWindow } from '../../../core/models/evaluation';
import { EvaluationService, StudentOption } from '../../evaluations/evaluation.service';
import {
  INSTRUMENTS,
  randomReplayStart,
  replayStartAt,
  replayWindow,
} from '../../practice/market-data.service';
import { PracticeService } from '../../practice/practice.service';
import { STARTING_BALANCE } from '../../practice/replay';
import { EvaluationStanding, evaluationStandings } from '../../ranking/standings';

/** The evaluation form, as the inputs hold it. */
interface EvaluationForm {
  title: string;
  description: string;
  symbol: string;
  randomStart: boolean;
  /** yyyy-mm-dd (UTC) when not random. */
  startDate: string;
  hideDates: boolean;
  durationMinutes: number;
  /** yyyy-mm-ddTHH:mm, local time. */
  opensAt: string;
  closesAt: string;
  studentIds: string[];
}

export const MIN_DURATION = 5;
export const MAX_DURATION = 600;
const DAY = 24 * 60 * 60 * 1000;

/** A date as a `datetime-local` input value, in local time. */
export function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const utcDay = (time: number) => new Date(time).toISOString().slice(0, 10);

/**
 * Trainers and admins set up timed practice evaluations here: the market and replay start
 * every student gets, the time limit, the window to start in and the students assigned.
 * Each evaluation's results rank its attempts; publishing them shows the ranking to students.
 */
@Component({
  selector: 'app-admin-evaluations',
  imports: [DecimalPipe, PercentPipe, LocalDatePipe, RouterLink],
  templateUrl: './admin-evaluations.html',
  styleUrls: ['../admin.scss', './admin-evaluations.scss'],
})
export class AdminEvaluations {
  private readonly service = inject(EvaluationService);
  private readonly practice = inject(PracticeService);
  protected readonly i18n = inject(I18n);

  protected readonly instruments = INSTRUMENTS;
  protected readonly minDuration = MIN_DURATION;
  protected readonly maxDuration = MAX_DURATION;
  protected readonly windowOf = (evaluation: Evaluation) => evaluationWindow(evaluation);

  protected readonly evaluations = signal<Evaluation[]>([]);
  protected readonly students = signal<StudentOption[]>([]);
  protected readonly loading = signal(true);
  protected readonly message = signal<{ kind: 'ok' | 'error'; text: string } | null>(null);

  /** The form, while creating (`editing` null) or editing an evaluation. */
  protected readonly form = signal<EvaluationForm | null>(null);
  protected readonly editing = signal<Evaluation | null>(null);
  protected readonly saving = signal(false);
  protected readonly studentSearch = signal('');

  /** Evaluation whose results are shown, and its standings once loaded. */
  protected readonly selected = signal<string | null>(null);
  protected readonly standings = signal<EvaluationStanding[] | null>(null);

  protected readonly dateRange = computed(() => {
    const instrument = INSTRUMENTS.find((i) => i.symbol === this.form()?.symbol) ?? INSTRUMENTS[0];
    const { earliest, latest } = replayWindow(instrument);
    return { min: utcDay(earliest), max: utcDay(latest) };
  });
  protected readonly visibleStudents = computed(() => {
    const term = this.studentSearch().trim().toLowerCase();
    const list = this.students().filter((s) => s.academy);
    return term ? list.filter((s) => `${s.name} ${s.email}`.toLowerCase().includes(term)) : list;
  });

  constructor() {
    void this.load();
  }

  protected nameOf(uid: string): string {
    return this.students().find((s) => s.uid === uid)?.name ?? uid;
  }

  protected create(): void {
    const opens = new Date();
    opens.setSeconds(0, 0);
    this.editing.set(null);
    this.studentSearch.set('');
    this.form.set({
      title: '',
      description: '',
      symbol: INSTRUMENTS[0].symbol,
      randomStart: true,
      startDate: '',
      hideDates: true,
      durationMinutes: 60,
      opensAt: toLocalInput(opens),
      closesAt: toLocalInput(new Date(opens.getTime() + 7 * DAY)),
      studentIds: [],
    });
  }

  protected edit(evaluation: Evaluation): void {
    this.editing.set(evaluation);
    this.studentSearch.set('');
    this.form.set({
      title: evaluation.title,
      description: evaluation.description,
      symbol: evaluation.symbol,
      randomStart: false,
      startDate: utcDay(evaluation.replayStart),
      hideDates: evaluation.hideDates,
      durationMinutes: evaluation.durationMinutes,
      opensAt: toLocalInput(evaluation.opensAt.toDate()),
      closesAt: toLocalInput(evaluation.closesAt.toDate()),
      studentIds: [...evaluation.studentIds],
    });
  }

  protected cancel(): void {
    this.form.set(null);
    this.editing.set(null);
  }

  protected patch(change: Partial<EvaluationForm>): void {
    this.form.update((form) => (form ? { ...form, ...change } : form));
  }

  protected toggleStudent(uid: string, on: boolean): void {
    const ids = this.form()?.studentIds ?? [];
    this.patch({ studentIds: on ? [...new Set([...ids, uid])] : ids.filter((id) => id !== uid) });
  }

  protected selectAll(): void {
    const ids = this.form()?.studentIds ?? [];
    this.patch({ studentIds: [...new Set([...ids, ...this.visibleStudents().map((s) => s.uid)])] });
  }

  protected async save(): Promise<void> {
    const form = this.form();
    const t = this.i18n.messages().evaluations;
    if (!form) {
      return;
    }
    const opensAt = new Date(form.opensAt);
    const closesAt = new Date(form.closesAt);
    const duration = Math.round(Number(form.durationMinutes));
    let problem: string | null = null;
    if (!form.title.trim()) {
      problem = t.titleRequired;
    } else if (!(duration >= MIN_DURATION && duration <= MAX_DURATION)) {
      problem = t.durationRange(MIN_DURATION, MAX_DURATION);
    } else if (isNaN(opensAt.getTime()) || isNaN(closesAt.getTime()) || closesAt <= opensAt) {
      problem = t.windowInvalid;
    } else if (!form.randomStart && !form.startDate) {
      problem = t.startRequired;
    } else if (!form.studentIds.length) {
      problem = t.studentsRequired;
    }
    if (problem) {
      this.message.set({ kind: 'error', text: problem });
      return;
    }
    const editing = this.editing();
    const instrument = INSTRUMENTS.find((i) => i.symbol === form.symbol) ?? INSTRUMENTS[0];
    const keepStart =
      editing && !form.randomStart && form.symbol === editing.symbol
        ? utcDay(editing.replayStart) === form.startDate
        : false;
    const replayStart = keepStart
      ? editing!.replayStart
      : form.randomStart
        ? randomReplayStart(instrument)
        : replayStartAt(instrument, Date.parse(`${form.startDate}T00:00:00Z`));
    const input = {
      title: form.title.trim(),
      description: form.description.trim(),
      symbol: form.symbol,
      replayStart,
      hideDates: form.hideDates,
      startingBalance: editing?.startingBalance ?? STARTING_BALANCE,
      durationMinutes: duration,
      opensAt,
      closesAt,
      studentIds: form.studentIds,
      resultsPublished: editing?.resultsPublished ?? false,
    };
    this.saving.set(true);
    try {
      if (editing) {
        await this.service.update(editing.id, input);
      } else {
        await this.service.create(input);
      }
      this.message.set({ kind: 'ok', text: t.saved(input.title) });
      this.cancel();
      await this.reload();
    } catch {
      this.message.set({ kind: 'error', text: t.saveFailed });
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove(evaluation: Evaluation): Promise<void> {
    const t = this.i18n.messages().evaluations;
    if (!confirm(t.confirmDelete(evaluation.title))) {
      return;
    }
    try {
      await this.service.remove(evaluation.id);
      this.evaluations.update((list) => list.filter((e) => e.id !== evaluation.id));
      if (this.selected() === evaluation.id) {
        this.selected.set(null);
      }
    } catch {
      this.message.set({ kind: 'error', text: t.deleteFailed });
    }
  }

  protected async togglePublished(evaluation: Evaluation): Promise<void> {
    const t = this.i18n.messages().evaluations;
    const published = !evaluation.resultsPublished;
    try {
      await this.service.setResultsPublished(evaluation.id, published);
      this.evaluations.update((list) =>
        list.map((e) => (e.id === evaluation.id ? { ...e, resultsPublished: published } : e)),
      );
      this.message.set({
        kind: 'ok',
        text: published ? t.published(evaluation.title) : t.unpublished(evaluation.title),
      });
    } catch {
      this.message.set({ kind: 'error', text: t.saveFailed });
    }
  }

  protected async toggleResults(evaluation: Evaluation): Promise<void> {
    if (this.selected() === evaluation.id) {
      this.selected.set(null);
      return;
    }
    this.selected.set(evaluation.id);
    this.standings.set(null);
    try {
      const sessions = await this.practice.evaluationSessions(evaluation.id);
      const students = evaluation.studentIds.map((uid) => ({ uid, name: this.nameOf(uid) }));
      if (this.selected() === evaluation.id) {
        this.standings.set(evaluationStandings(sessions, students));
      }
    } catch {
      this.standings.set([]);
      this.message.set({ kind: 'error', text: this.i18n.messages().evaluations.resultsFailed });
    }
  }

  private async load(): Promise<void> {
    try {
      const [, students] = await Promise.all([this.reload(), this.service.students()]);
      this.students.set(students);
    } catch {
      this.message.set({ kind: 'error', text: this.i18n.messages().evaluations.loadFailed });
    } finally {
      this.loading.set(false);
    }
  }

  private async reload(): Promise<void> {
    this.evaluations.set(await this.service.all());
  }
}
