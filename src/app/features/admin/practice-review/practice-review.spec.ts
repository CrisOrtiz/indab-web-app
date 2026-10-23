import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { PracticeService } from '../../practice/practice.service';
import { PracticeReview } from './practice-review';

const session = (id: string, uid: string, userName: string, symbol: string, pnl: number) => ({
  id,
  uid,
  userName,
  symbol,
  interval: '1h',
  replayStart: Date.UTC(2021, 4, 10),
  tradeCount: 2,
  pnl,
  status: 'finished',
  startedAt: { toDate: () => new Date(2026, 9, 20) },
});

describe('PracticeReview', () => {
  let fixture: ComponentFixture<PracticeReview>;
  let el: HTMLElement;
  const practice = { allSessions: vi.fn(), sessionTrades: vi.fn() };

  const render = async () => {
    TestBed.configureTestingModule({
      imports: [PracticeReview],
      providers: [provideRouter([]), { provide: PracticeService, useValue: practice }],
    });
    fixture = TestBed.createComponent(PracticeReview);
    el = fixture.nativeElement;
    await fixture.whenStable();
  };

  beforeEach(() => {
    vi.clearAllMocks();
    practice.allSessions.mockResolvedValue([
      session('s1', 'ana', 'Ana', 'XAUUSD', 25),
      session('s2', 'ana', 'Ana', 'NAS100', -5),
      session('s3', 'luis', 'Luis', 'XAUUSD', 0),
    ]);
    practice.sessionTrades.mockResolvedValue([
      {
        id: 't1',
        side: 'long',
        orderType: 'limit',
        orderPrice: 50000,
        quantity: 0.01,
        entryPrice: 50000,
        entryTime: 1_620_000_000,
        stopLoss: 49000,
        takeProfit: null,
        status: 'closed',
        exitPrice: 52500,
        exitTime: 1_620_003_600,
        exitReason: 'takeProfit',
        pnl: 25,
      },
      {
        id: 't2',
        side: 'short',
        orderType: 'stop',
        orderPrice: 100,
        quantity: 1,
        entryPrice: 100,
        entryTime: 1_620_000_000,
        stopLoss: null,
        takeProfit: null,
        status: 'pending',
      },
    ]);
  });

  const sessionRows = () => [...el.querySelectorAll('table.sessions > tbody > tr:not(.detail)')];

  it('lists every session with totals and a search', async () => {
    await render();
    expect([...el.querySelectorAll('.stat strong')].map((s) => s.textContent)).toEqual([
      '3',
      '2',
      '6',
    ]);
    expect(sessionRows()).toHaveLength(3);
    expect(el.textContent).toContain('10 May 2021');

    const search = el.querySelector<HTMLInputElement>('input[type=search]')!;
    search.value = 'luis';
    search.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(sessionRows()).toHaveLength(1);
  });

  it("shows a session's trades on demand", async () => {
    await render();
    sessionRows()[0].querySelector('button')!.click();
    await fixture.whenStable();
    expect(practice.sessionTrades).toHaveBeenCalledWith('s1');
    const detail = el.querySelector('.detail')!;
    expect(detail.textContent).toContain('Take profit');
    expect(detail.textContent).toContain('52,500.00');
    expect(detail.textContent).toContain('Compra límite');
    expect(detail.textContent).toContain('Venta stop');
    expect(detail.textContent).toContain('Orden pendiente');

    sessionRows()[0].querySelector('button')!.click();
    await fixture.whenStable();
    expect(el.querySelector('.detail')).toBeNull();
  });

  it('explains when the sessions cannot load', async () => {
    practice.allSessions.mockRejectedValue(new Error('denied'));
    await render();
    expect(el.textContent).toContain('No se pudieron cargar las prácticas.');
  });
});
