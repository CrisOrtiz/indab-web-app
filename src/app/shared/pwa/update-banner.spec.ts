import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { I18n } from '../../core/i18n/i18n.service';
import { AppUpdates } from '../../core/pwa/app-updates.service';
import { UpdateBanner } from './update-banner';

describe('UpdateBanner', () => {
  const ready = signal(false);
  const updates = { ready, reload: vi.fn(), dismiss: vi.fn(() => ready.set(false)) };

  const render = async () => {
    TestBed.configureTestingModule({ providers: [{ provide: AppUpdates, useValue: updates }] });
    const fixture = TestBed.createComponent(UpdateBanner);
    await fixture.whenStable();
    return fixture;
  };

  beforeEach(() => {
    ready.set(false);
    vi.clearAllMocks();
  });

  it('stays hidden until a new version is ready', async () => {
    const fixture = await render();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[role="status"]')).toBeNull();

    ready.set(true);
    await fixture.whenStable();
    expect(el.textContent).toContain('Hay una nueva versión de INDAB.');
  });

  it('reloads into the new version, or hides until later', async () => {
    ready.set(true);
    const fixture = await render();
    const el = fixture.nativeElement as HTMLElement;
    el.querySelector<HTMLButtonElement>('.btn')!.click();
    expect(updates.reload).toHaveBeenCalled();

    el.querySelector<HTMLButtonElement>('[aria-label="Más tarde"]')!.click();
    await fixture.whenStable();
    expect(updates.dismiss).toHaveBeenCalled();
    expect(el.querySelector('[role="status"]')).toBeNull();
  });

  it('follows the chosen language', async () => {
    ready.set(true);
    const fixture = await render();
    await TestBed.inject(I18n).use('pt-BR', false);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Há uma nova versão do INDAB.');
    expect(el.textContent).toContain('Atualizar');
  });
});
