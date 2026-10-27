import { DecimalPipe, PercentPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { I18n } from '../../../core/i18n/i18n.service';
import { LocalDatePipe } from '../../../core/i18n/local-date.pipe';
import { Mentorship } from '../../../core/models/mentorship';
import { Pager } from '../../../shared/pager/pager';
import { pageCount, pageOf } from '../../../shared/pager/cursor-pages';
import { MentorshipService } from '../../mentorships/mentorship.service';
import {
  Activity,
  DashboardPeriod,
  Delivery,
  Member,
  PERIODS,
  StudentRow,
  groupSummary,
  periodStart,
  studentRows,
  winRate,
} from './dashboard';
import { MentorDashboardService } from './mentor-dashboard.service';

/** Students per page of the table. */
export const DASHBOARD_PAGE_SIZE = 20;

/** `all`, students without practice in the period, or students with something pending. */
export type StudentFilter = 'all' | 'idle' | 'pending';

/**
 * The mentor dashboard: for one mentorship at a time, who practised in the period, how the group
 * trades (P/L, win rate) and does in forms and evaluations, and who has not handed in what was
 * assigned, with links to the review pages. Trainers see the mentorships they lead; admins see
 * every one (their own first).
 */
@Component({
  selector: 'app-mentor-dashboard',
  imports: [DecimalPipe, LocalDatePipe, Pager, PercentPipe, RouterLink],
  templateUrl: './mentor-dashboard.html',
  styleUrls: ['../admin.scss', './mentor-dashboard.scss'],
})
export class MentorDashboard {
  private readonly service = inject(MentorDashboardService);
  private readonly mentorshipService = inject(MentorshipService);
  private readonly auth = inject(AuthService);
  protected readonly i18n = inject(I18n);

  protected readonly periods = PERIODS;
  protected readonly winRate = winRate;

  protected readonly mentorships = signal<Mentorship[]>([]);
  protected readonly mentorshipId = signal('');
  protected readonly period = signal<DashboardPeriod>('week');
  protected readonly filter = signal<StudentFilter>('all');
  protected readonly page = signal(0);

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly members = signal<Member[]>([]);
  protected readonly activity = signal<ReadonlyMap<string, Activity>>(new Map());
  /** Students whose activity is still loading. */
  protected readonly pendingActivity = signal(0);
  protected readonly deliveries = signal<Delivery[]>([]);
  /** Forms and evaluations are still loading (the pending column waits for them). */
  protected readonly loadingDeliveries = signal(false);

  protected readonly mentorship = computed(() =>
    this.mentorships().find((m) => m.id === this.mentorshipId()),
  );
  protected readonly rows = computed(() =>
    studentRows(this.members(), this.activity(), this.deliveries()),
  );
  protected readonly summary = computed(() => groupSummary(this.rows(), this.deliveries()));
  protected readonly filtered = computed<StudentRow[]>(() => {
    const filter = this.filter();
    return this.rows().filter((r) =>
      filter === 'idle'
        ? r.activity !== null && r.activity.sessions === 0
        : filter === 'pending'
          ? r.pending.length > 0
          : true,
    );
  });
  protected readonly visible = computed(() =>
    pageOf(this.filtered(), this.page(), DASHBOARD_PAGE_SIZE),
  );
  protected readonly pages = computed(() => pageCount(this.filtered().length, DASHBOARD_PAGE_SIZE));
  private readonly names = computed(() => new Map(this.members().map((m) => [m.uid, m.name])));

  /** Bumped on every load, so an old load that finishes late is ignored. */
  private run = 0;

  constructor() {
    void this.start();
  }

  protected nameOf(uid: string): string {
    return this.names().get(uid) ?? uid;
  }

  /** Names of the students who have not handed a delivery in. */
  protected missing(delivery: Delivery): string[] {
    return delivery.assigned
      .filter((uid) => !delivery.done.includes(uid))
      .map((uid) => this.nameOf(uid));
  }

  /** Average of a delivery's results (share of points for forms, P/L for evaluations). */
  protected averageOf(delivery: Delivery): number | null {
    const values = Object.values(delivery.results);
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  }

  protected pickMentorship(id: string): void {
    this.mentorshipId.set(id);
    void this.load();
  }

  protected pickPeriod(period: string): void {
    this.period.set(period as DashboardPeriod);
    void this.load();
  }

  protected pickFilter(filter: string): void {
    this.filter.set(filter as StudentFilter);
    this.page.set(0);
  }

  private async start(): Promise<void> {
    try {
      const uid = this.auth.user()?.uid ?? '';
      const all = await this.mentorshipService.all();
      const mine = all.filter((m) => m.mentorIds.includes(uid));
      // Admins see every mentorship, with the ones they lead first.
      const list = this.auth.isAdmin()
        ? [...mine, ...all.filter((m) => !m.mentorIds.includes(uid))]
        : mine;
      this.mentorships.set(list);
      this.mentorshipId.set(list[0]?.id ?? '');
    } catch {
      this.error.set(this.i18n.messages().mentorDashboard.loadFailed);
      this.loading.set(false);
      return;
    }
    await this.load();
  }

  private async load(): Promise<void> {
    const run = ++this.run;
    const id = this.mentorshipId();
    this.error.set(null);
    this.page.set(0);
    this.members.set([]);
    this.activity.set(new Map());
    this.deliveries.set([]);
    if (!id) {
      this.loading.set(false);
      this.loadingDeliveries.set(false);
      return;
    }
    this.loading.set(true);
    this.loadingDeliveries.set(true);
    const from = periodStart(this.period());
    try {
      const members = await this.service.members(id);
      if (run !== this.run) {
        return;
      }
      this.members.set(members);
      this.loading.set(false);
      this.pendingActivity.set(members.length);
      // Each student's practice fills in as it arrives; a failure leaves a dash in that row.
      for (const m of members) {
        this.service
          .activity(m.uid, from)
          .then((a) => {
            if (run === this.run) {
              this.activity.update((map) => new Map(map).set(m.uid, a));
            }
          })
          .catch(() => undefined)
          .finally(() => {
            if (run === this.run) {
              this.pendingActivity.update((n) => n - 1);
            }
          });
      }
      const deliveries = await this.service.deliveries(members, from);
      if (run === this.run) {
        this.deliveries.set(deliveries);
      }
    } catch {
      if (run === this.run) {
        this.error.set(this.i18n.messages().mentorDashboard.loadFailed);
        this.loading.set(false);
      }
    } finally {
      if (run === this.run) {
        this.loadingDeliveries.set(false);
      }
    }
  }
}
