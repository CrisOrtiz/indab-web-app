import { Injectable, inject } from '@angular/core';
import {
  QueryConstraint,
  QueryDocumentSnapshot,
  collection,
  count,
  doc,
  getAggregateFromServer,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  sum,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { FIRESTORE } from '../../core/firebase/firebase.providers';
import { LoadingService } from '../../core/loading/loading.service';
import { Evaluation, attemptId } from '../../core/models/evaluation';
import { PracticeSession, PracticeTrade } from '../../core/models/practice';
import { CursorPage } from '../../shared/pager/cursor-pages';

export type NewPracticeSession = Pick<
  PracticeSession,
  'uid' | 'userName' | 'symbol' | 'interval' | 'replayStart' | 'startingBalance'
>;

export type SessionSummary = Pick<PracticeSession, 'balance' | 'pnl' | 'tradeCount'>;

/**
 * Filters of a session list, all optional. `evaluationId` null keeps free practice only, an id
 * the attempts at that evaluation; `to` is exclusive. Each combination of `uid`, `evaluationId`
 * and `status` has an index in `firestore.indexes.json`.
 */
export interface SessionFilters {
  uid?: string;
  /** Sessions of any of these students (a mentorship's), at most `MAX_IN_FILTER`. */
  uids?: string[];
  evaluationId?: string | null;
  status?: PracticeSession['status'];
  from?: Date;
  to?: Date;
}

/** Most values a Firestore `in` filter takes. */
export const MAX_IN_FILTER = 30;

export type SessionCursor = QueryDocumentSnapshot;
export type SessionPage = CursorPage<PracticeSession, SessionCursor>;

/**
 * Logs chart-replay practice to Firestore: `practiceSessions/{id}` and its `trades`.
 * Students write only their own sessions while they are active; admins read everything
 * (see `firestore.rules`).
 */
@Injectable({ providedIn: 'root' })
export class PracticeService {
  private readonly firestore = inject(FIRESTORE);
  private readonly loading = inject(LoadingService);

  private readonly sessions = collection(this.firestore, 'practiceSessions');
  private trades(sessionId: string) {
    return collection(this.firestore, 'practiceSessions', sessionId, 'trades');
  }

  /** A fresh id for a trade, so the replay can track it before the write completes. */
  newTradeId(sessionId: string): string {
    return doc(this.trades(sessionId)).id;
  }

  /**
   * Starts free practice, or the student's one attempt at `evaluation` (rules check it is
   * assigned to them, open, and on the evaluation's market, start and time limit).
   */
  async startSession(
    session: NewPracticeSession,
    evaluation?: Pick<Evaluation, 'id' | 'durationMinutes'>,
  ): Promise<string> {
    const ref = evaluation
      ? doc(this.sessions, attemptId(evaluation.id, session.uid))
      : doc(this.sessions);
    await setDoc(ref, {
      ...session,
      balance: session.startingBalance,
      pnl: 0,
      tradeCount: 0,
      status: 'active',
      startedAt: serverTimestamp(),
      evaluationId: evaluation?.id ?? null,
      ...(evaluation ? { durationMinutes: evaluation.durationMinutes } : {}),
    });
    return ref.id;
  }

  updateSummary(sessionId: string, summary: SessionSummary): Promise<void> {
    return updateDoc(doc(this.sessions, sessionId), { ...summary });
  }

  finishSession(sessionId: string, summary: SessionSummary): Promise<void> {
    return updateDoc(doc(this.sessions, sessionId), {
      ...summary,
      status: 'finished',
      endedAt: serverTimestamp(),
    });
  }

  /** Logs a new order: `open` for market orders, `pending` for limit and stop orders. */
  openTrade(sessionId: string, uid: string, trade: PracticeTrade): Promise<void> {
    const { id, side, orderType, orderPrice, placedTime, quantity, entryPrice, entryTime } = trade;
    return setDoc(doc(this.trades(sessionId), id), {
      uid,
      side,
      orderType,
      orderPrice,
      placedTime,
      quantity,
      entryPrice,
      entryTime,
      stopLoss: trade.stopLoss,
      takeProfit: trade.takeProfit,
      status: trade.status,
      openedAt: serverTimestamp(),
    });
  }

  fillOrder(sessionId: string, trade: PracticeTrade): Promise<void> {
    return updateDoc(doc(this.trades(sessionId), trade.id), {
      status: 'open',
      entryPrice: trade.entryPrice,
      entryTime: trade.entryTime,
      filledAt: serverTimestamp(),
    });
  }

  cancelOrder(sessionId: string, trade: PracticeTrade): Promise<void> {
    return updateDoc(doc(this.trades(sessionId), trade.id), {
      status: 'cancelled',
      closedAt: serverTimestamp(),
    });
  }

  /** Saves moved stop loss / take profit, and a pending order's price. */
  updateLevels(sessionId: string, trade: PracticeTrade): Promise<void> {
    const levels: Record<string, number | null> = {
      stopLoss: trade.stopLoss,
      takeProfit: trade.takeProfit,
    };
    if (trade.status === 'pending') {
      levels['orderPrice'] = trade.orderPrice;
      levels['entryPrice'] = trade.entryPrice;
    }
    return updateDoc(doc(this.trades(sessionId), trade.id), levels);
  }

  closeTrade(sessionId: string, trade: PracticeTrade): Promise<void> {
    return updateDoc(doc(this.trades(sessionId), trade.id), {
      status: 'closed',
      exitPrice: trade.exitPrice,
      exitTime: trade.exitTime,
      exitReason: trade.exitReason,
      pnl: trade.pnl,
      closedAt: serverTimestamp(),
    });
  }

  /** The student's most recent sessions (the profile's P/L summary). */
  async mySessions(uid: string, max = 20): Promise<PracticeSession[]> {
    const snapshot = await this.loading.track(
      getDocs(
        query(this.sessions, where('uid', '==', uid), orderBy('startedAt', 'desc'), limit(max)),
      ),
    );
    return snapshot.docs.map((d) => ({ ...(d.data() as PracticeSession), id: d.id }));
  }

  /**
   * One page of sessions, newest first, that match `filters`, starting after `after`. Students
   * must filter by their own `uid` (the rules only let them list their own sessions).
   */
  async sessionsPage(
    filters: SessionFilters,
    pageSize: number,
    after?: SessionCursor,
  ): Promise<SessionPage> {
    if (filters.uids?.length === 0) {
      return { items: [], last: undefined, hasMore: false };
    }
    const constraints = [
      ...sessionFilters(filters),
      orderBy('startedAt', 'desc'),
      ...(after ? [startAfter(after)] : []),
      // One extra tells whether another page follows.
      limit(pageSize + 1),
    ];
    const snapshot = await this.loading.track(getDocs(query(this.sessions, ...constraints)));
    const docs = snapshot.docs.slice(0, pageSize);
    return {
      items: docs.map((d) => ({ ...(d.data() as PracticeSession), id: d.id })),
      last: docs.at(-1),
      hasMore: snapshot.docs.length > pageSize,
    };
  }

  /** How many sessions and trades match `filters`, read as one aggregation (not per session). */
  async sessionTotals(filters: SessionFilters): Promise<{ sessions: number; trades: number }> {
    if (filters.uids?.length === 0) {
      return { sessions: 0, trades: 0 };
    }
    const snapshot = await getAggregateFromServer(
      query(this.sessions, ...sessionFilters(filters)),
      {
        sessions: count(),
        trades: sum('tradeCount'),
      },
    );
    const { sessions, trades } = snapshot.data();
    return { sessions, trades };
  }

  /** Every attempt at an evaluation (staff, or anyone once its results are published). */
  async evaluationSessions(evaluationId: string): Promise<PracticeSession[]> {
    const snapshot = await this.loading.track(
      getDocs(query(this.sessions, where('evaluationId', '==', evaluationId))),
    );
    return snapshot.docs.map((d) => ({ ...(d.data() as PracticeSession), id: d.id }));
  }

  /** The student's attempts at these evaluations. */
  async myAttempts(uid: string, evaluationIds: string[]): Promise<PracticeSession[]> {
    const chunks: string[][] = [];
    // An `in` filter takes at most 30 values.
    for (let i = 0; i < evaluationIds.length; i += 30) {
      chunks.push(evaluationIds.slice(i, i + 30));
    }
    const snapshots = await this.loading.track(
      Promise.all(
        chunks.map((ids) =>
          getDocs(query(this.sessions, where('uid', '==', uid), where('evaluationId', 'in', ids))),
        ),
      ),
    );
    return snapshots.flatMap((s) =>
      s.docs.map((d) => ({ ...(d.data() as PracticeSession), id: d.id })),
    );
  }

  /** Deletes a session and its trades (admins only). */
  async deleteSession(sessionId: string): Promise<void> {
    const trades = await getDocs(this.trades(sessionId));
    const refs = [...trades.docs.map((d) => d.ref), doc(this.sessions, sessionId)];
    // A batch holds at most 500 writes; the session goes last so a failure leaves it listed.
    for (let i = 0; i < refs.length; i += 500) {
      const batch = writeBatch(this.firestore);
      refs.slice(i, i + 500).forEach((ref) => batch.delete(ref));
      await batch.commit();
    }
  }

  async sessionTrades(sessionId: string): Promise<PracticeTrade[]> {
    const snapshot = await this.loading.track(
      getDocs(query(this.trades(sessionId), orderBy('entryTime'))),
    );
    // Trades logged before order types existed were market orders.
    return snapshot.docs.map(
      (d) => ({ orderType: 'market', orderPrice: null, ...d.data(), id: d.id }) as PracticeTrade,
    );
  }
}

function sessionFilters(filters: SessionFilters): QueryConstraint[] {
  const constraints: QueryConstraint[] = [];
  if (filters.uid) {
    constraints.push(where('uid', '==', filters.uid));
  } else if (filters.uids) {
    constraints.push(where('uid', 'in', filters.uids.slice(0, MAX_IN_FILTER)));
  }
  if (filters.evaluationId !== undefined) {
    constraints.push(where('evaluationId', '==', filters.evaluationId));
  }
  if (filters.status) {
    constraints.push(where('status', '==', filters.status));
  }
  if (filters.from) {
    constraints.push(where('startedAt', '>=', filters.from));
  }
  if (filters.to) {
    constraints.push(where('startedAt', '<', filters.to));
  }
  return constraints;
}
