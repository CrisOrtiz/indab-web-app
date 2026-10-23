import { Injectable, inject } from '@angular/core';
import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { FIRESTORE } from '../../core/firebase/firebase.providers';
import { PracticeSession, PracticeTrade } from '../../core/models/practice';

export type NewPracticeSession = Pick<
  PracticeSession,
  'uid' | 'userName' | 'symbol' | 'interval' | 'replayStart' | 'startingBalance'
>;

export type SessionSummary = Pick<PracticeSession, 'balance' | 'pnl' | 'tradeCount'>;

/**
 * Logs chart-replay practice to Firestore: `practiceSessions/{id}` and its `trades`.
 * Students write only their own sessions while they are active; admins read everything
 * (see `firestore.rules`).
 */
@Injectable({ providedIn: 'root' })
export class PracticeService {
  private readonly firestore = inject(FIRESTORE);

  private readonly sessions = collection(this.firestore, 'practiceSessions');
  private trades(sessionId: string) {
    return collection(this.firestore, 'practiceSessions', sessionId, 'trades');
  }

  /** A fresh id for a trade, so the replay can track it before the write completes. */
  newTradeId(sessionId: string): string {
    return doc(this.trades(sessionId)).id;
  }

  async startSession(session: NewPracticeSession): Promise<string> {
    const ref = doc(this.sessions);
    await setDoc(ref, {
      ...session,
      balance: session.startingBalance,
      pnl: 0,
      tradeCount: 0,
      status: 'active',
      startedAt: serverTimestamp(),
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

  openTrade(sessionId: string, uid: string, trade: PracticeTrade): Promise<void> {
    const { id, side, quantity, entryPrice, entryTime, stopLoss, takeProfit } = trade;
    return setDoc(doc(this.trades(sessionId), id), {
      uid,
      side,
      quantity,
      entryPrice,
      entryTime,
      stopLoss,
      takeProfit,
      status: 'open',
      openedAt: serverTimestamp(),
    });
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

  /** The student's most recent sessions. */
  async mySessions(uid: string, max = 20): Promise<PracticeSession[]> {
    const snapshot = await getDocs(
      query(this.sessions, where('uid', '==', uid), orderBy('startedAt', 'desc'), limit(max)),
    );
    return snapshot.docs.map((d) => ({ ...(d.data() as PracticeSession), id: d.id }));
  }

  /** Every student's most recent sessions (admins only). */
  async allSessions(max = 200): Promise<PracticeSession[]> {
    const snapshot = await getDocs(query(this.sessions, orderBy('startedAt', 'desc'), limit(max)));
    return snapshot.docs.map((d) => ({ ...(d.data() as PracticeSession), id: d.id }));
  }

  async sessionTrades(sessionId: string): Promise<PracticeTrade[]> {
    const snapshot = await getDocs(query(this.trades(sessionId), orderBy('entryTime')));
    return snapshot.docs.map((d) => ({ ...(d.data() as PracticeTrade), id: d.id }));
  }
}
