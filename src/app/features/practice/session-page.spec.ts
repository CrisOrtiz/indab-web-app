import { Component, input, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { AuthService } from '../../core/auth/auth.service';
import { PracticeSession } from '../../core/models/practice';
import { EvaluationService } from '../evaluations/evaluation.service';
import { PracticeService } from './practice.service';
import { SessionPage } from './session-page';
import { SessionReview } from './session-review';

@Component({
  selector: 'app-session-review',
  template: 'review {{ session().id }} {{ evaluationTitle() }}',
})
class FakeReview {
  readonly session = input.required<PracticeSession>();
  readonly evaluationTitle = input('');
}

describe('SessionPage', () => {
  let fixture: ComponentFixture<SessionPage>;
  let el: HTMLElement;
  const auth = { isStaff: signal(false) };
  const practice = { getSession: vi.fn() };
  const evaluations = { get: vi.fn(async () => ({ id: 'e1', title: 'Final de oro' })) };
  const session = (extra: Partial<PracticeSession> = {}) =>
    ({
      id: 's1',
      uid: 'ana',
      userName: 'Ana Pérez',
      symbol: 'XAUUSDT',
      interval: '15m',
      pnl: 12.5,
      tradeCount: 3,
      evaluationId: null,
      startedAt: { toDate: () => new Date('2026-10-20T12:00:00Z') },
      ...extra,
    }) as unknown as PracticeSession;

  const render = async (id = 's1') => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: auth },
        { provide: PracticeService, useValue: practice },
        { provide: EvaluationService, useValue: evaluations },
      ],
    });
    TestBed.overrideComponent(SessionPage, {
      remove: { imports: [SessionReview] },
      add: { imports: [FakeReview] },
    });
    fixture = TestBed.createComponent(SessionPage);
    fixture.componentRef.setInput('id', id);
    el = fixture.nativeElement;
    await fixture.whenStable();
    await fixture.whenStable();
  };

  beforeEach(() => {
    vi.clearAllMocks();
    auth.isStaff.set(false);
  });

  it('opens a student’s free practice with its review', async () => {
    practice.getSession.mockResolvedValue(session());
    await render();
    expect(practice.getSession).toHaveBeenCalledWith('s1');
    expect(el.querySelector('h1')?.textContent).toContain('Práctica libre');
    expect(el.textContent).toContain('review s1');
    expect(el.textContent).toContain('12.50');
    expect(el.querySelector('a.back')?.getAttribute('href')).toBe('/academy/practice');
    expect(evaluations.get).not.toHaveBeenCalled();
  });

  it('names the student and the evaluation for staff', async () => {
    auth.isStaff.set(true);
    practice.getSession.mockResolvedValue(session({ id: 'e1_ana', evaluationId: 'e1' }));
    await render('e1_ana');
    expect(el.querySelector('h1')?.textContent).toContain('Final de oro');
    expect(el.textContent).toContain('Ana Pérez');
    expect(el.textContent).toContain('review e1_ana Final de oro');
    expect(el.querySelector('a.back')?.getAttribute('href')).toBe('/admin/practice');
  });

  it('says when the session does not exist', async () => {
    practice.getSession.mockResolvedValue(null);
    await render('nope');
    expect(el.textContent).toContain('No encontramos esta práctica.');
  });
});
