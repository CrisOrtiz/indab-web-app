import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { vi } from 'vitest';
import { AuthService } from '../../core/auth/auth.service';
import { MaterialWatermark, WATERMARK_MOVE_MS } from './material-watermark';

describe('MaterialWatermark', () => {
  let fixture: ComponentFixture<MaterialWatermark>;
  const profile = signal<{ email: string; displayName: string } | null>({
    email: 'luis@indab.test',
    displayName: 'Luis Díaz',
  });

  const render = () => {
    TestBed.configureTestingModule({
      imports: [MaterialWatermark],
      providers: [
        {
          provide: AuthService,
          useValue: { user: signal({ email: 'luis@indab.test', displayName: '' }), profile },
        },
      ],
    });
    fixture = TestBed.createComponent(MaterialWatermark);
    fixture.detectChanges();
  };

  afterEach(() => vi.useRealTimers());

  it('repeats the viewer name and email over the player', () => {
    render();
    const marks = fixture.nativeElement.querySelectorAll('span');
    expect(marks.length).toBe(12);
    expect(marks[5].textContent).toBe('Luis Díaz · luis@indab.test');
    expect(getComputedStyle(fixture.nativeElement).pointerEvents).toBe('none');
  });

  it('falls back to the sign-in email before the profile loads', () => {
    profile.set(null);
    render();
    expect(fixture.nativeElement.querySelector('span').textContent).toBe('luis@indab.test');
  });

  it('moves the marks every little while', () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(1);
    render();
    const marks = fixture.nativeElement.querySelector('.marks') as HTMLElement;
    expect(marks.style.transform).toMatch(/^translate\(0(px|%)?, 0(px|%)?\)$/);
    vi.advanceTimersByTime(WATERMARK_MOVE_MS);
    fixture.detectChanges();
    expect(marks.style.transform).toBe('translate(12%, 12%)');
  });
});
