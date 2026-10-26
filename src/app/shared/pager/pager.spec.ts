import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Pager } from './pager';

describe('Pager', () => {
  let fixture: ComponentFixture<Pager>;
  let el: HTMLElement;

  const render = async (inputs: {
    page: number;
    hasNext: boolean;
    pages?: number;
    busy?: boolean;
  }) => {
    fixture = TestBed.createComponent(Pager);
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    el = fixture.nativeElement;
    await fixture.whenStable();
  };
  const buttons = () => [...el.querySelectorAll('button')];

  it('hides itself when everything fits on one page', async () => {
    await render({ page: 0, hasNext: false });
    expect(el.querySelector('nav')).toBeNull();
  });

  it('shows the page and emits previous and next', async () => {
    await render({ page: 1, hasNext: true });
    expect(el.querySelector('nav')?.getAttribute('aria-label')).toBe('Páginas de la lista');
    expect(el.textContent).toContain('Página 2');
    let moves = '';
    fixture.componentInstance.previous.subscribe(() => (moves += '<'));
    fixture.componentInstance.next.subscribe(() => (moves += '>'));
    buttons()[0].click();
    buttons()[1].click();
    expect(moves).toBe('<>');
  });

  it('counts pages when the total is known and disables the ends', async () => {
    await render({ page: 2, hasNext: false, pages: 3 });
    expect(el.textContent).toContain('Página 3 de 3');
    expect(buttons().map((b) => b.disabled)).toEqual([false, true]);
  });

  it('disables both buttons while a page loads', async () => {
    await render({ page: 1, hasNext: true, busy: true });
    expect(buttons().every((b) => b.disabled)).toBe(true);
  });
});
