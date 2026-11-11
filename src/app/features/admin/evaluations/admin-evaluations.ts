import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { I18n } from '../../../core/i18n/i18n.service';
import { ActionsMenu, MenuAction } from '../../../shared/actions-menu/actions-menu';
import { Icon } from '../../../shared/icon/icon';
import { LocalDatePipe } from '../../../core/i18n/local-date.pipe';
import {
  DEFAULT_PACE,
  DEFAULT_PASSING_SCORE,
  passingScoreOf,
  EVALUATION_PACES,
  Evaluation,
  EvaluationAdjustment,
  EvaluationGrade,
  EvaluationRubric,
  RubricScores,
  evaluationWindow,
} from '../../../core/models/evaluation';
import { PracticeSession, PracticeTrade } from '../../../core/models/practice';
import { formatElapsed } from '../../practice/bars';
import { marketCovered } from '../../practice/live';
import { Mentorship, audienceIds } from '../../../core/models/mentorship';
import { EvaluationService, StudentOption } from '../../evaluations/evaluation.service';
import { MentorshipService } from '../../mentorships/mentorship.service';
import { NotificationService } from '../../notifications/notification.service';
import { AudiencePicker } from '../audience/audience-picker';
import {
  INSTRUMENTS,
  randomReplayStart,
  replayStartAt,
  replayWindow,
} from '../../practice/market-data.service';
import { PracticeService } from '../../practice/practice.service';
import { STARTING_BALANCE } from '../../practice/replay';
import { IndabScore } from '../../ranking/score';
import { EvaluationStanding, evaluationStandings } from '../../ranking/standings';
import { TimeZoneService } from '../../../core/time-zone/time-zone.service';
import { fromLocalInput, toLocalInput } from '../exams/exam-form';
import { EVALUATION_NEWS, EvaluationNews } from '../../../core/models/market-news';
import { EvaluationResults } from './evaluation-results';
import { RubricForm } from './rubric-form';

/** The evaluation form, as the inputs hold it. */
interface EvaluationForm {
  title: string;
  description: string;
  symbol: string;
  randomStart: boolean;
  /** yyyy-mm-dd (UTC) when not random. */
  startDate: string;
  hideDates: boolean;
  /** How the chart shows economic news during attempts. */
  news: EvaluationNews;
  durationMinutes: number;
  /** Market minutes per real minute: the attempt runs by the clock at this pace. */
  pace: number;
  /** The INDAB score that passes, 0 to 100. */
  passingScore: number;
  /** yyyy-mm-ddTHH:mm, local time. */
  opensAt: string;
  closesAt: string;
  studentIds: string[];
  mentorshipIds: string[];
}

export const MIN_DURATION = 5;
/** Most minutes staff add at once to an attempt. */
export const MAX_EXTRA_MINUTES = 120;
const MINUTE = 60_000;
export const MAX_DURATION = 600;
const DAY = 24 * 60 * 60 * 1000;

export { toLocalInput };

const utcDay = (time: number) => new Date(time).toISOString().slice(0, 10);

/**
 * Trainers and admins set up timed practice evaluations here: the market and replay start
 * every student gets, the time limit, the window to start in and the students assigned.
 * Each evaluation's results rank its attempts; publishing them shows the ranking to students.
 */
@Component({
  selector: 'app-admin-evaluations',
  imports: [
    ActionsMenu,
    AudiencePicker,
    EvaluationResults,
    Icon,
    LocalDatePipe,
    RouterLink,
    RubricForm,
  ],
  templateUrl: './admin-evaluations.html',
  styleUrls: ['../admin.scss', './admin-evaluations.scss'],
})
export class AdminEvaluations {
  protected readonly zones = inject(TimeZoneService);
  private readonly service = inject(EvaluationService);
  private readonly practice = inject(PracticeService);
  private readonly mentorshipService = inject(MentorshipService);
  private readonly notifications = inject(NotificationService);
  private readonly route = inject(ActivatedRoute);
  protected readonly i18n = inject(I18n);

  protected readonly instruments = INSTRUMENTS;
  protected readonly minDuration = MIN_DURATION;
  protected readonly maxDuration = MAX_DURATION;
  protected readonly newsChoices = EVALUATION_NEWS;
  protected readonly paces = EVALUATION_PACES;
  protected readonly passingScoreOf = passingScoreOf;
  /** "2 d 12 h": the market time an attempt covers at the form's pace and time limit. */
  protected readonly covered = (pace: number, minutes: number) =>
    formatElapsed(marketCovered(pace, minutes));
  protected readonly windowOf = (evaluation: Evaluation) => evaluationWindow(evaluation);

  protected readonly evaluations = signal<Evaluation[]>([]);
  protected readonly students = signal<StudentOption[]>([]);
  protected readonly mentorships = signal<Mentorship[]>([]);
  protected readonly loading = signal(true);
  protected readonly message = signal<{ kind: 'ok' | 'error'; text: string } | null>(null);

  /** The form, while creating (`editing` null) or editing an evaluation. */
  protected readonly form = signal<EvaluationForm | null>(null);
  protected readonly editing = signal<Evaluation | null>(null);
  /** The evaluation being copied, while the form holds its copy. */
  protected readonly cloning = signal<Evaluation | null>(null);
  protected readonly saving = signal(false);

  /** Evaluation whose results are shown, and its standings once loaded. */
  protected readonly selected = signal<string | null>(null);
  /** The shown evaluation's attempts and what staff did to them. */
  private readonly attempts = signal<PracticeSession[]>([]);
  protected readonly adjustments = signal<EvaluationAdjustment[]>([]);
  /** The attempt staff are adding minutes to or restarting, with the form's values. */
  protected readonly adjusting = signal<{
    row: EvaluationStanding;
    kind: 'extraTime' | 'reset';
  } | null>(null);
  protected readonly adjustMinutes = signal(10);
  protected readonly adjustReason = signal('');
  protected readonly adjustBusy = signal(false);
  protected readonly maxExtra = MAX_EXTRA_MINUTES;
  /** The attempt the mentor is rating with the rubric. */
  protected readonly rating = signal<EvaluationStanding | null>(null);
  protected readonly ratingBusy = signal(false);
  protected readonly standings = signal<EvaluationStanding[] | null>(null);

  protected readonly dateRange = computed(() => {
    const instrument = INSTRUMENTS.find((i) => i.symbol === this.form()?.symbol) ?? INSTRUMENTS[0];
    const { earliest, latest } = replayWindow(instrument);
    return { min: utcDay(earliest), max: utcDay(latest) };
  });
  /** Mentorship names by id, for the cards. */
  private readonly mentorshipNames = computed(
    () => new Map(this.mentorships().map((m) => [m.id, m.name])),
  );

  /** The names of the mentorships an item is assigned to, for its card. */
  protected mentorshipList(item: Evaluation): string {
    const deleted = this.i18n.messages().audience.deleted;
    return (item.mentorshipIds ?? [])
      .map((id) => this.mentorshipNames().get(id) ?? deleted)
      .join(', ');
  }

  /** Each evaluation's card menu, by id. */
  protected readonly menus = computed(() => {
    const t = this.i18n.messages().evaluations;
    const selected = this.selected();
    return new Map(
      this.evaluations().map((ev): [string, MenuAction[]] => [
        ev.id,
        [
          {
            id: 'results',
            label: selected === ev.id ? t.hideResults : t.showResults,
            icon: 'results',
          },
          {
            id: 'publish',
            label: ev.resultsPublished ? t.unpublish : t.publish,
            icon: ev.resultsPublished ? 'eyeOff' : 'eye',
          },
          { id: 'edit', label: t.edit, icon: 'edit' },
          { id: 'clone', label: t.clone, icon: 'copy' },
          { id: 'delete', label: t.delete, icon: 'trash', danger: true },
        ],
      ]),
    );
  });

  constructor() {
    void this.load();
  }

  /** Runs an action picked from a card's menu. */
  protected act(evaluation: Evaluation, action: string): void {
    if (action === 'results') {
      void this.toggleResults(evaluation);
    } else if (action === 'publish') {
      void this.togglePublished(evaluation);
    } else if (action === 'edit') {
      this.edit(evaluation);
    } else if (action === 'clone') {
      this.clone(evaluation);
    } else if (action === 'delete') {
      void this.remove(evaluation);
    }
  }

  protected nameOf(uid: string): string {
    return this.students().find((s) => s.uid === uid)?.name ?? uid;
  }

  protected create(): void {
    const opens = new Date();
    opens.setSeconds(0, 0);
    this.editing.set(null);
    this.cloning.set(null);
    this.form.set({
      title: '',
      description: '',
      symbol: INSTRUMENTS[0].symbol,
      randomStart: true,
      startDate: '',
      hideDates: true,
      news: EVALUATION_NEWS[0],
      durationMinutes: 60,
      pace: DEFAULT_PACE,
      passingScore: DEFAULT_PASSING_SCORE,
      opensAt: toLocalInput(opens, this.zones.zone()),
      closesAt: toLocalInput(new Date(opens.getTime() + 7 * DAY), this.zones.zone()),
      studentIds: [],
      mentorshipIds: [],
    });
  }

  protected edit(evaluation: Evaluation): void {
    this.editing.set(evaluation);
    this.cloning.set(null);
    this.form.set({
      title: evaluation.title,
      description: evaluation.description,
      symbol: evaluation.symbol,
      randomStart: false,
      startDate: utcDay(evaluation.replayStart),
      hideDates: evaluation.hideDates,
      news: evaluation.news ?? EVALUATION_NEWS[0],
      durationMinutes: evaluation.durationMinutes,
      pace: evaluation.pace ?? DEFAULT_PACE,
      passingScore: passingScoreOf(evaluation),
      opensAt: toLocalInput(evaluation.opensAt.toDate(), this.zones.zone()),
      closesAt: toLocalInput(evaluation.closesAt.toDate(), this.zones.zone()),
      studentIds: [...evaluation.studentIds],
      mentorshipIds: [...(evaluation.mentorshipIds ?? [])],
    });
  }

  /**
   * Opens the form with a copy of the evaluation (same market, replay start, dates hidden or
   * not and time limit) to assign it to other students. Its window opens now and lasts as long
   * as the original's; the students are cleared so staff pick the new ones.
   */
  protected clone(evaluation: Evaluation): void {
    const opens = new Date();
    opens.setSeconds(0, 0);
    const length = Math.max(evaluation.closesAt.toMillis() - evaluation.opensAt.toMillis(), DAY);
    this.editing.set(null);
    this.cloning.set(evaluation);
    this.message.set(null);
    this.form.set({
      title: this.i18n.messages().evaluations.copyOf(evaluation.title).slice(0, 120),
      description: evaluation.description,
      symbol: evaluation.symbol,
      randomStart: false,
      startDate: utcDay(evaluation.replayStart),
      hideDates: evaluation.hideDates,
      news: evaluation.news ?? EVALUATION_NEWS[0],
      durationMinutes: evaluation.durationMinutes,
      pace: evaluation.pace ?? DEFAULT_PACE,
      passingScore: passingScoreOf(evaluation),
      opensAt: toLocalInput(opens, this.zones.zone()),
      closesAt: toLocalInput(new Date(opens.getTime() + length), this.zones.zone()),
      studentIds: [],
      mentorshipIds: [],
    });
  }

  protected cancel(): void {
    this.form.set(null);
    this.editing.set(null);
    this.cloning.set(null);
  }

  protected patch(change: Partial<EvaluationForm>): void {
    this.form.update((form) => (form ? { ...form, ...change } : form));
  }

  /** The students an evaluation is for: picked by name or through its mentorships. */
  protected assigned(evaluation: Evaluation): string[] {
    return audienceIds(evaluation, this.students());
  }

  protected async save(): Promise<void> {
    const form = this.form();
    const t = this.i18n.messages().evaluations;
    if (!form) {
      return;
    }
    const opensAt = fromLocalInput(form.opensAt, this.zones.zone());
    const closesAt = fromLocalInput(form.closesAt, this.zones.zone());
    const duration = Math.round(Number(form.durationMinutes));
    const passingScore = Number(form.passingScore);
    let problem: string | null = null;
    if (!form.title.trim()) {
      problem = t.titleRequired;
    } else if (!(duration >= MIN_DURATION && duration <= MAX_DURATION)) {
      problem = t.durationRange(MIN_DURATION, MAX_DURATION);
    } else if (!(Number.isInteger(passingScore) && passingScore >= 0 && passingScore <= 100)) {
      problem = t.passingScoreRange;
    } else if (isNaN(opensAt.getTime()) || isNaN(closesAt.getTime()) || closesAt <= opensAt) {
      problem = t.windowInvalid;
    } else if (!form.randomStart && !form.startDate) {
      problem = t.startRequired;
    } else if (!form.studentIds.length && !form.mentorshipIds.length) {
      problem = t.studentsRequired;
    }
    if (problem) {
      this.message.set({ kind: 'error', text: problem });
      return;
    }
    const editing = this.editing();
    // An edit or a copy keeps the exact replay start while its day and market stay the same.
    const base = editing ?? this.cloning();
    const instrument = INSTRUMENTS.find((i) => i.symbol === form.symbol) ?? INSTRUMENTS[0];
    const keepStart =
      base && !form.randomStart && form.symbol === base.symbol
        ? utcDay(base.replayStart) === form.startDate
        : false;
    const replayStart = keepStart
      ? base!.replayStart
      : form.randomStart
        ? randomReplayStart(instrument)
        : replayStartAt(instrument, Date.parse(`${form.startDate}T00:00:00Z`));
    const input = {
      title: form.title.trim(),
      description: form.description.trim(),
      symbol: form.symbol,
      replayStart,
      hideDates: form.hideDates,
      news: EVALUATION_NEWS.includes(form.news) ? form.news : EVALUATION_NEWS[0],
      startingBalance: base?.startingBalance ?? STARTING_BALANCE,
      durationMinutes: duration,
      pace: (EVALUATION_PACES as readonly number[]).includes(form.pace) ? form.pace : DEFAULT_PACE,
      passingScore,
      opensAt,
      closesAt,
      studentIds: form.studentIds,
      mentorshipIds: form.mentorshipIds,
      resultsPublished: editing?.resultsPublished ?? false,
    };
    this.saving.set(true);
    try {
      const id = editing ? editing.id : await this.service.create(input);
      if (editing) {
        await this.service.update(editing.id, input);
      }
      // Students who were not given it before hear of it once.
      const before = new Set(editing ? this.assigned(editing) : []);
      void this.notifications.notifyStudents(
        'assigned',
        'evaluation',
        { id, title: input.title },
        audienceIds(input, this.students()).filter((uid) => !before.has(uid)),
      );
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

  /** The evaluation about to be published while some attempts have no rubric yet, and who. */
  protected readonly unratedPublish = signal<{ evaluation: Evaluation; names: string[] } | null>(
    null,
  );
  private readonly publishConfirm =
    viewChild.required<ElementRef<HTMLDialogElement>>('publishConfirm');

  /**
   * Publishes the results, or takes them back. Before publishing, the mentor is warned about
   * the students who took it and have no rubric yet (Cris, 2026-11-11): their score would show
   * without the mentor's part.
   */
  protected async togglePublished(evaluation: Evaluation): Promise<void> {
    if (!evaluation.resultsPublished) {
      const [sessions, rubrics] = await Promise.all([
        this.practice.evaluationSessions(evaluation.id).catch(() => []),
        this.service.rubrics(evaluation.id).catch(() => new Map<string, EvaluationRubric>()),
      ]);
      const unrated = sessions.filter((s) => !rubrics.has(s.uid));
      if (unrated.length) {
        this.unratedPublish.set({ evaluation, names: unrated.map((s) => this.nameOf(s.uid)) });
        const dialog = this.publishConfirm().nativeElement;
        if (dialog.showModal) {
          dialog.showModal();
        } else {
          // Browsers (and test DOMs) without modal dialogs still show it.
          dialog.setAttribute('open', '');
        }
        return;
      }
    }
    await this.setPublished(evaluation, !evaluation.resultsPublished);
  }

  /** Closes the "some have no rubric" warning; `publish` publishes all the same. */
  protected async closePublishConfirm(choice: 'publish' | 'rate' | 'cancel'): Promise<void> {
    const pending = this.unratedPublish();
    const dialog = this.publishConfirm().nativeElement;
    if (dialog.close) {
      dialog.close();
    } else {
      dialog.removeAttribute('open');
    }
    this.unratedPublish.set(null);
    if (!pending) {
      return;
    }
    if (choice === 'publish') {
      await this.setPublished(pending.evaluation, true);
    } else if (choice === 'rate' && this.selected() !== pending.evaluation.id) {
      await this.toggleResults(pending.evaluation);
    }
  }

  /** A click on the dimmed backdrop (the dialog element itself) publishes nothing. */
  protected publishBackdrop(event: MouseEvent): void {
    if (event.target === this.publishConfirm().nativeElement) {
      void this.closePublishConfirm('cancel');
    }
  }

  private async setPublished(evaluation: Evaluation, published: boolean): Promise<void> {
    const t = this.i18n.messages().evaluations;
    try {
      await this.service.setResultsPublished(evaluation.id, published);
      if (published) {
        void this.notifyResults(evaluation);
      }
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

  /** Tells the students who took it that the ranking is out. */
  private async notifyResults(evaluation: Evaluation): Promise<void> {
    try {
      const sessions = await this.practice.evaluationSessions(evaluation.id);
      await this.notifications.notifyStudents(
        'results',
        'evaluation',
        evaluation,
        sessions.map((s) => s.uid),
      );
    } catch {
      // The ranking is published all the same; students find it in the academy.
    }
  }

  protected async toggleResults(evaluation: Evaluation): Promise<void> {
    if (this.selected() === evaluation.id) {
      this.selected.set(null);
      return;
    }
    this.selected.set(evaluation.id);
    this.standings.set(null);
    this.adjusting.set(null);
    await this.loadResults(evaluation);
  }

  private async loadResults(evaluation: Evaluation): Promise<void> {
    try {
      const [sessions, adjustments, rubrics, grades] = await Promise.all([
        this.practice.evaluationSessions(evaluation.id),
        this.service.adjustments(evaluation.id).catch(() => []),
        this.service.rubrics(evaluation.id).catch(() => new Map<string, EvaluationRubric>()),
        this.service.grades(evaluation.id).catch(() => new Map<string, EvaluationGrade>()),
      ]);
      const students = this.assigned(evaluation).map((uid) => ({ uid, name: this.nameOf(uid) }));
      // Each attempt's trades, for its statistics; one that fails to load just shows none.
      const trades = new Map<string, PracticeTrade[]>();
      await Promise.all(
        sessions.map(async (s) => {
          const list = await this.practice.sessionTrades(s.id).catch(() => null);
          if (list) {
            trades.set(s.id, list);
          }
        }),
      );
      if (this.selected() === evaluation.id) {
        this.attempts.set(sessions);
        this.adjustments.set(adjustments);
        const standings = evaluationStandings(sessions, students, Date.now(), {
          trades,
          rubrics,
          passingScore: passingScoreOf(evaluation),
        });
        this.standings.set(standings);
        void this.syncGrades(evaluation.id, standings, grades);
      }
    } catch {
      this.standings.set([]);
      this.message.set({ kind: 'error', text: this.i18n.messages().evaluations.resultsFailed });
    }
  }

  /** Opens the form to add minutes to an attempt, restart it or rate it. */
  protected startAdjust(row: EvaluationStanding, kind: 'extraTime' | 'reset' | 'rubric'): void {
    this.message.set(null);
    if (kind === 'rubric') {
      this.adjusting.set(null);
      this.rating.set(row);
      return;
    }
    this.rating.set(null);
    this.adjusting.set({ row, kind });
    this.adjustMinutes.set(10);
    this.adjustReason.set('');
    this.message.set(null);
  }

  /**
   * Adds the minutes (counted from the attempt's deadline, or from now if it already passed,
   * so the student really gets them), or deletes the attempt so the student starts it again,
   * and records why.
   */
  protected async applyAdjust(evaluation: Evaluation): Promise<void> {
    const adjusting = this.adjusting();
    const t = this.i18n.messages().evaluations;
    const session = this.attempts().find((s) => s.id === adjusting?.row.sessionId);
    if (!adjusting || !session || this.adjustBusy()) {
      return;
    }
    const reason = this.adjustReason().trim();
    const minutes = Math.round(this.adjustMinutes());
    if (!reason) {
      this.message.set({ kind: 'error', text: t.reasonRequired });
      return;
    }
    let extra = 0;
    if (adjusting.kind === 'extraTime') {
      const started = session.startedAt?.toMillis() ?? 0;
      const limit = session.durationMinutes ?? 0;
      const deadline = started + (limit + (session.extraMinutes ?? 0)) * MINUTE;
      const from = Math.max(deadline, Date.now());
      extra = Math.ceil((from + minutes * MINUTE - started) / MINUTE) - limit;
      if (!(minutes >= 1 && minutes <= MAX_EXTRA_MINUTES) || extra > 600) {
        this.message.set({ kind: 'error', text: t.extraRange(MAX_EXTRA_MINUTES) });
        return;
      }
    } else if (!confirm(t.confirmReset(adjusting.row.name))) {
      return;
    }
    this.adjustBusy.set(true);
    try {
      if (adjusting.kind === 'extraTime') {
        await this.practice.giveExtraTime(session.id, extra);
      } else {
        await this.practice.deleteSession(session.id);
        // A new attempt gets a new rating.
        await this.service.removeRubric(evaluation.id, session.uid).catch(() => undefined);
        await this.service.removeGrade(evaluation.id, session.uid).catch(() => undefined);
      }
      await this.service.logAdjustment(evaluation.id, {
        uid: session.uid,
        studentName: adjusting.row.name,
        kind: adjusting.kind,
        minutes: adjusting.kind === 'extraTime' ? minutes : null,
        reason,
      });
      this.message.set({
        kind: 'ok',
        text:
          adjusting.kind === 'extraTime'
            ? t.extraGiven(minutes, adjusting.row.name)
            : t.resetGiven(adjusting.row.name),
      });
      this.adjusting.set(null);
    } catch {
      this.message.set({ kind: 'error', text: t.adjustFailed });
    } finally {
      this.adjustBusy.set(false);
    }
    await this.loadResults(evaluation);
  }

  /**
   * Saves each scored attempt's INDAB score where it changed, so the students' ranking (which
   * cannot read trades or rubrics) shows the same score staff see. Best effort: the next
   * visit to the results tries again.
   */
  private async syncGrades(
    evaluationId: string,
    standings: EvaluationStanding[],
    saved: Map<string, EvaluationGrade>,
  ): Promise<void> {
    const changed = standings.filter((row) => {
      const score = row.score;
      // Only scores worked out here (saved ones have no trades behind them on this page).
      if (!score?.parts || !score.verdict || !row.stats || !row.rubric) {
        return false;
      }
      const before = saved.get(row.uid);
      return (
        !before ||
        before.score !== score.score ||
        before.verdict !== score.verdict ||
        (before.failedBy ?? []).join() !== score.failedBy.join() ||
        (['result', 'risk', 'discipline', 'rubric', 'journal'] as const).some(
          (part) => before.parts[part] !== score.parts![part],
        )
      );
    });
    await Promise.all(
      changed.map((row) =>
        this.service
          .saveGrade(evaluationId, row.uid, row.score as IndabScore)
          .catch(() => undefined),
      ),
    );
  }

  /** Saves the mentor's rubric for the attempt being rated. */
  protected async saveRubric(evaluation: Evaluation, scores: RubricScores): Promise<void> {
    const row = this.rating();
    const t = this.i18n.messages().evaluations.rubric;
    if (!row || this.ratingBusy()) {
      return;
    }
    this.ratingBusy.set(true);
    try {
      await this.service.saveRubric(evaluation.id, row.uid, scores);
      this.message.set({ kind: 'ok', text: t.saved(row.name) });
      this.rating.set(null);
    } catch {
      this.message.set({ kind: 'error', text: t.failed });
    } finally {
      this.ratingBusy.set(false);
    }
    await this.loadResults(evaluation);
  }

  private async load(): Promise<void> {
    try {
      const [, students, mentorships] = await Promise.all([
        this.reload(),
        this.service.assignable(),
        this.mentorshipService.all(),
      ]);
      this.students.set(students);
      this.mentorships.set(mentorships);
      // `?results=id` (from the mentor dashboard) opens that evaluation's results.
      const results = this.route.snapshot.queryParamMap.get('results');
      const evaluation = this.evaluations().find((e) => e.id === results);
      if (evaluation) {
        void this.toggleResults(evaluation);
      }
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
