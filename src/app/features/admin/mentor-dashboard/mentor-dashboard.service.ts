import { Injectable, inject } from '@angular/core';
import {
  Query,
  collection,
  collectionGroup,
  count,
  getAggregateFromServer,
  getDocs,
  limit,
  orderBy,
  query,
  sum,
  where,
} from 'firebase/firestore';
import { FIRESTORE } from '../../../core/firebase/firebase.providers';
import { LoadingService } from '../../../core/loading/loading.service';
import { Evaluation } from '../../../core/models/evaluation';
import { Exam, bestGrade } from '../../../core/models/exam';
import { audienceIds } from '../../../core/models/mentorship';
import { PracticeSession } from '../../../core/models/practice';
import { UserProfile } from '../../../core/models/user-profile';
import { ExamService } from '../../exams/exam.service';
import { PracticeService } from '../../practice/practice.service';
import { Activity, Delivery, Member, inPeriod } from './dashboard';

/** Most values an `array-contains-any` filter takes. */
const MAX_ANY = 30;

const chunks = <T>(list: T[], size = MAX_ANY): T[][] =>
  Array.from({ length: Math.ceil(list.length / size) }, (_, i) =>
    list.slice(i * size, i * size + size),
  );

/**
 * Reads for the mentor dashboard (`/admin/mentor`). Practice is counted with aggregation
 * queries per student (a handful of reads each, however much they practised) instead of
 * reading every session or trade; forms and evaluations are only those whose window touches
 * the period.
 */
@Injectable({ providedIn: 'root' })
export class MentorDashboardService {
  private readonly firestore = inject(FIRESTORE);
  private readonly loading = inject(LoadingService);
  private readonly exams = inject(ExamService);
  private readonly practice = inject(PracticeService);

  /** The mentorship's students, by name. */
  async members(mentorshipId: string): Promise<Member[]> {
    const snapshot = await this.loading.track(
      getDocs(
        query(
          collection(this.firestore, 'users'),
          where('mentorshipIds', 'array-contains', mentorshipId),
        ),
      ),
    );
    return snapshot.docs
      .map((d) => ({ ...(d.data() as UserProfile), uid: d.id }))
      .filter((p) => p.role === 'student')
      .map((p) => ({
        uid: p.uid,
        name: p.displayName || p.email || p.uid,
        email: p.email ?? '',
        mentorshipIds: p.mentorshipIds ?? [],
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
  }

  /** A student's practice since `from`. */
  async activity(uid: string, from: Date): Promise<Activity> {
    const sessions = collection(this.firestore, 'practiceSessions');
    const closed = query(
      collectionGroup(this.firestore, 'trades'),
      where('uid', '==', uid),
      where('status', '==', 'closed'),
      where('closedAt', '>=', from),
    );
    const [period, latest, trades, wins] = await Promise.all([
      getAggregateFromServer(
        query(
          sessions,
          where('uid', '==', uid),
          where('startedAt', '>=', from),
          orderBy('startedAt', 'desc'),
        ),
        { sessions: count(), pnl: sum('pnl') },
      ),
      getDocs(query(sessions, where('uid', '==', uid), orderBy('startedAt', 'desc'), limit(1))),
      getAggregateFromServer(closed, { n: count() }),
      getAggregateFromServer(query(closed, where('pnl', '>', 0)), { n: count() }),
    ]);
    const last = latest.docs[0]?.data() as PracticeSession | undefined;
    return {
      sessions: period.data().sessions,
      pnl: period.data().pnl ?? 0,
      closedTrades: trades.data().n,
      wins: wins.data().n,
      lastPractice: last?.startedAt?.toDate() ?? null,
    };
  }

  /**
   * Published forms and practice evaluations given to the members (by name, through this or
   * another of their mentorships, or to everyone) whose window opened and had not closed
   * before `from`, newest close first, with who handed them in and their results.
   */
  async deliveries(members: Member[], from: Date, now = new Date()): Promise<Delivery[]> {
    if (!members.length) {
      return [];
    }
    const uids = members.map((m) => m.uid);
    const groups = [...new Set(members.flatMap((m) => m.mentorshipIds))];
    const [forms, evaluations] = await this.loading.track(
      Promise.all([
        this.assigned<Exam>('examForms', uids, groups, [where('audience', '==', 'all')]),
        this.assigned<Evaluation>('evaluations', uids, groups),
      ]),
    );
    const relevant = <T extends { opensAt: { toDate(): Date }; closesAt: { toDate(): Date } }>(
      list: T[],
    ) => list.filter((item) => inPeriod(item.opensAt.toDate(), item.closesAt.toDate(), from, now));
    const deliveries = await this.loading.track(
      Promise.all([
        ...relevant(forms.filter((f) => f.published)).map((f) =>
          this.formDelivery(f, members, now),
        ),
        ...relevant(evaluations).map((e) => this.evaluationDelivery(e, members, now)),
      ]),
    );
    return deliveries
      .filter((d) => d.assigned.length > 0)
      .sort((a, b) => b.closesAt.getTime() - a.closesAt.getTime());
  }

  private async formDelivery(form: Exam, members: Member[], now: Date): Promise<Delivery> {
    const memberIds = new Set(members.map((m) => m.uid));
    const assigned =
      form.audience === 'all'
        ? [...memberIds]
        : audienceIds(form, members).filter((uid) => memberIds.has(uid));
    const [submissions, grades] = await Promise.all([
      this.exams.submissions(form.id),
      this.exams.grades(form.id),
    ]);
    const results: Record<string, number> = {};
    for (const uid of assigned) {
      const best = bestGrade(grades.filter((g) => g.uid === uid));
      if (best && form.totalPoints > 0) {
        results[uid] = best.total / form.totalPoints;
      }
    }
    return {
      kind: 'form',
      id: form.id,
      title: form.title,
      closesAt: form.closesAt.toDate(),
      open: form.closesAt.toMillis() > now.getTime(),
      assigned,
      done: assigned.filter((uid) =>
        submissions.some((s) => s.uid === uid && s.status === 'submitted'),
      ),
      results,
    };
  }

  private async evaluationDelivery(
    evaluation: Evaluation,
    members: Member[],
    now: Date,
  ): Promise<Delivery> {
    const memberIds = new Set(members.map((m) => m.uid));
    const assigned = audienceIds(evaluation, members).filter((uid) => memberIds.has(uid));
    const attempts = await this.practice.evaluationSessions(evaluation.id);
    const results: Record<string, number> = {};
    for (const attempt of attempts) {
      if (assigned.includes(attempt.uid)) {
        results[attempt.uid] = attempt.pnl;
      }
    }
    return {
      kind: 'evaluation',
      id: evaluation.id,
      title: evaluation.title,
      closesAt: evaluation.closesAt.toDate(),
      open: evaluation.closesAt.toMillis() > now.getTime(),
      assigned,
      done: Object.keys(results),
      results,
    };
  }

  /**
   * Documents of `path` assigned to any of `uids` by name or to any of `groups`, plus those
   * matching `extra` queries, without repeats.
   */
  private async assigned<T extends { id: string }>(
    path: string,
    uids: string[],
    groups: string[],
    extra: ReturnType<typeof where>[] = [],
  ): Promise<T[]> {
    const ref = collection(this.firestore, path);
    const queries: Query[] = [
      ...chunks(uids).map((ids) => query(ref, where('studentIds', 'array-contains-any', ids))),
      ...chunks(groups).map((ids) => query(ref, where('mentorshipIds', 'array-contains-any', ids))),
      ...extra.map((filter) => query(ref, filter)),
    ];
    const snapshots = await Promise.all(queries.map((q) => getDocs(q)));
    const byId = new Map<string, T>();
    for (const d of snapshots.flatMap((s) => s.docs)) {
      byId.set(d.id, { ...(d.data() as T), id: d.id });
    }
    return [...byId.values()];
  }
}
