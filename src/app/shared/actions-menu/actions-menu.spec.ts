import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ActionsMenu, MenuAction } from './actions-menu';

@Component({
  imports: [ActionsMenu],
  template: `<app-actions-menu
    [actions]="actions"
    label="Acciones: Semana 1"
    (picked)="picked.set($event)"
  />`,
})
class Host {
  readonly picked = signal<string | null>(null);
  readonly actions: MenuAction[] = [
    { id: 'open', label: 'Abrir', icon: 'grade', link: ['/admin/forms', 'x1'] },
    { id: 'edit', label: 'Editar', icon: 'edit' },
    { id: 'delete', label: 'Eliminar', icon: 'trash', danger: true },
  ];
}

describe('ActionsMenu', () => {
  let fixture: ComponentFixture<Host>;
  let el: HTMLElement;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    fixture = TestBed.createComponent(Host);
    el = fixture.nativeElement;
    await fixture.whenStable();
  });

  const trigger = () => el.querySelector<HTMLButtonElement>('.trigger')!;
  const items = () => [...el.querySelectorAll<HTMLElement>('[role="menuitem"]')];
  const key = async (target: HTMLElement, name: string) => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }));
    await fixture.whenStable();
  };

  it('opens a menu of actions with icon and text, focusing the first', async () => {
    expect(trigger().getAttribute('aria-label')).toBe('Acciones: Semana 1');
    expect(el.querySelector('[role="menu"]')).toBeNull();
    trigger().click();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    expect(items().map((i) => i.textContent?.trim())).toEqual(['Abrir', 'Editar', 'Eliminar']);
    expect(items()[0].getAttribute('href')).toBe('/admin/forms/x1');
    expect(items()[2].classList).toContain('danger');
    expect(document.activeElement).toBe(items()[0]);
  });

  it('moves with the arrow keys and emits the picked action', async () => {
    trigger().click();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
    await key(items()[0], 'ArrowDown');
    expect(document.activeElement).toBe(items()[1]);
    await key(items()[1], 'ArrowUp');
    await key(items()[0], 'ArrowUp');
    expect(document.activeElement).toBe(items()[2]);
    items()[1].click();
    await fixture.whenStable();
    expect(fixture.componentInstance.picked()).toBe('edit');
    expect(el.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it('closes on Escape and on a click outside', async () => {
    trigger().click();
    await fixture.whenStable();
    await key(items()[0], 'Escape');
    expect(el.querySelector('[role="menu"]')).toBeNull();
    trigger().click();
    await fixture.whenStable();
    document.body.click();
    await fixture.whenStable();
    expect(el.querySelector('[role="menu"]')).toBeNull();
  });
});
