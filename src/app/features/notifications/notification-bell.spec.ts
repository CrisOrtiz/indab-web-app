import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { AuthService } from '../../core/auth/auth.service';
import { AppNotification } from '../../core/models/notification';
import { NotificationBell } from './notification-bell';
import { NotificationService } from './notification.service';

const at = (ms: number) => ({ toMillis: () => ms, toDate: () => new Date(ms) });
const item = (id: string, extra: Partial<AppNotification>) =>
  ({
    id,
    type: 'note',
    kind: 'practice',
    refId: 's1',
    contextId: null,
    title: '',
    actorId: 'coach',
    actorName: 'Coach',
    studentId: 'ana',
    read: false,
    createdAt: at(Date.UTC(2026, 9, 27, 15)),
    ...extra,
  }) as AppNotification;

describe('NotificationBell', () => {
  let fixture: ComponentFixture<NotificationBell>;
  let el: HTMLElement;
  let push: (list: AppNotification[]) => void;
  const stop = vi.fn();
  const service = {
    listen: vi.fn((_uid: string, next: (list: AppNotification[]) => void) => {
      push = next;
      return stop;
    }),
    markRead: vi.fn(async () => undefined),
  };
  const auth = { user: signal<{ uid: string } | null>({ uid: 'ana' }), isStaff: signal(false) };

  beforeEach(async () => {
    vi.clearAllMocks();
    auth.user.set({ uid: 'ana' });
    auth.isStaff.set(false);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: auth },
        { provide: NotificationService, useValue: service },
      ],
    });
    fixture = TestBed.createComponent(NotificationBell);
    el = fixture.nativeElement;
    await fixture.whenStable();
  });

  const bell = () => el.querySelector<HTMLButtonElement>('.bell')!;
  const open = async () => {
    bell().click();
    await fixture.whenStable();
  };

  it('listens to the user’s notifications and shows the unread count', async () => {
    expect(service.listen).toHaveBeenCalledWith('ana', expect.any(Function), expect.any(Function));
    expect(el.querySelector('.badge')).toBeNull();
    expect(bell().getAttribute('aria-label')).toBe('Notificaciones');
    push([
      item('a', {}),
      item('b', { type: 'results', kind: 'exam', refId: 'x1', contextId: 'x1', title: 'Examen 1' }),
      item('c', { read: true }),
    ]);
    await fixture.whenStable();
    expect(el.querySelector('.badge')?.textContent).toBe('2');
    expect(bell().getAttribute('aria-label')).toBe('Notificaciones, 2 sin leer');
    push(Array.from({ length: 12 }, (_, i) => item(`n${i}`, {})));
    await fixture.whenStable();
    expect(el.querySelector('.badge')?.textContent).toBe('9+');
  });

  it('describes each notification and opens what it is about', async () => {
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    push([
      item('a', {}),
      item('b', { type: 'assigned', kind: 'evaluation', refId: 'e1', title: 'Final de oro' }),
    ]);
    await open();
    const items = [...el.querySelectorAll<HTMLButtonElement>('.item')];
    expect(items.map((b) => b.querySelector('.text')?.textContent)).toEqual([
      'Coach dejó una nota en tu práctica',
      'Tienes una evaluación de práctica nueva: «Final de oro»',
    ]);
    items[0].click();
    await fixture.whenStable();
    expect(service.markRead).toHaveBeenCalledWith('ana', ['a']);
    expect(navigate).toHaveBeenCalledWith(['/academy/practice/sessions/s1'], {
      queryParams: undefined,
    });
    expect(el.querySelector('.panel')).toBeNull();
  });

  it('marks everything as read', async () => {
    push([item('a', {}), item('b', {}), item('c', { read: true })]);
    await open();
    [...el.querySelectorAll<HTMLButtonElement>('button')]
      .find((b) => b.textContent?.includes('Marcar todo como leído'))!
      .click();
    await fixture.whenStable();
    expect(service.markRead).toHaveBeenCalledWith('ana', ['a', 'b']);
    expect(el.querySelector('.badge')).toBeNull();
  });

  it('says when there is nothing, and links staff to what they follow', async () => {
    await open();
    expect(el.textContent).toContain('No tienes notificaciones.');
    expect(el.querySelector('a.settings')).toBeNull();
    auth.isStaff.set(true);
    await fixture.whenStable();
    expect(el.querySelector('a.settings')?.getAttribute('href')).toBe('/profile#notifications');
  });

  it('stops listening when the user signs out', async () => {
    auth.user.set(null);
    await fixture.whenStable();
    expect(stop).toHaveBeenCalled();
  });
});
