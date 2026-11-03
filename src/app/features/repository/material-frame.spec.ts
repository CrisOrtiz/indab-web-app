import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { MaterialKind } from '../../core/models/material';
import { MaterialFrame } from './material-frame';

const SLIDES = 'https://docs.google.com/presentation/d/1SlideDeckId_x/edit';

describe('MaterialFrame', () => {
  let fixture: ComponentFixture<MaterialFrame>;
  let el: HTMLElement;
  const staff = signal(false);
  const auth = {
    isStaff: staff,
    user: signal({ email: 'jose@indab.test', displayName: 'José' }),
    profile: signal({ email: 'jose@indab.test', displayName: 'José Pérez' }),
  };

  const render = async (url = SLIDES, kind: MaterialKind = 'presentation') => {
    TestBed.configureTestingModule({
      imports: [MaterialFrame],
      providers: [{ provide: AuthService, useValue: auth }],
    });
    fixture = TestBed.createComponent(MaterialFrame);
    fixture.componentRef.setInput('url', url);
    fixture.componentRef.setInput('title', 'Plan de trading');
    fixture.componentRef.setInput('kind', kind);
    el = fixture.nativeElement;
    await fixture.whenStable();
  };

  beforeEach(() => staff.set(false));

  it('keeps the player from opening the material outside the academy', async () => {
    await render();
    const frame = el.querySelector('iframe')!;
    expect(frame.getAttribute('src')).toBe(
      'https://docs.google.com/presentation/d/1SlideDeckId_x/embed',
    );
    const sandbox = frame.getAttribute('sandbox')!.split(' ');
    expect(sandbox).toContain('allow-scripts');
    expect(sandbox).not.toContain('allow-popups');
    expect(sandbox).not.toContain('allow-top-navigation');
    // Full screen is ours, so the watermark stays on.
    expect(frame.hasAttribute('allowfullscreen')).toBe(false);
    expect(frame.getAttribute('allow')).not.toContain('fullscreen');
  });

  it('marks the player with the student and gives them no link to the original', async () => {
    await render();
    const marks = el.querySelectorAll('app-material-watermark span');
    expect(marks.length).toBeGreaterThan(4);
    expect(marks[0].textContent).toBe('José Pérez · jose@indab.test');
    expect(el.querySelector('a[target="_blank"]')).toBeNull();
    expect(el.textContent).toContain('Inicia sesión en Google con jose@indab.test');
  });

  it('gives staff the original link', async () => {
    staff.set(true);
    await render();
    const open = el.querySelector<HTMLAnchorElement>('a[target="_blank"]')!;
    expect(open.textContent).toContain('Abrir en Google Slides');
    expect(open.href).toBe(SLIDES);
    expect(el.textContent).toContain('El enlace original solo lo ve el equipo.');
  });

  it('fills the window when the browser has no full screen (iPhone) and Escape closes it', async () => {
    await render('https://youtu.be/dQw4w9WgXcQ', 'video');
    const box = el.querySelector<HTMLElement>('.frame')!;
    Object.defineProperty(box, 'requestFullscreen', { value: undefined });
    el.querySelector<HTMLButtonElement>('.below button')!.click();
    await fixture.whenStable();
    expect(box.classList).toContain('expanded');
    expect(el.querySelector('.exit')?.textContent).toContain('Salir de pantalla completa');
    expect(el.textContent).not.toContain('Inicia sesión en Google');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await fixture.whenStable();
    expect(box.classList).not.toContain('expanded');
  });

  it('still opens links it cannot embed in a new tab', async () => {
    await render('https://example.com/guia.pdf', 'document');
    expect(el.querySelector('iframe')).toBeNull();
    expect(el.querySelector('a[target="_blank"]')?.textContent).toContain('Abrir el PDF');
  });
});
