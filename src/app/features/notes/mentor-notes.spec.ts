import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { AuthService } from '../../core/auth/auth.service';
import { MentorNote, NoteTarget } from '../../core/models/mentor-note';
import { MentorNotes } from './mentor-notes';
import { MentorNotesService } from './mentor-notes.service';

const at = (ms: number) => ({ toMillis: () => ms, toDate: () => new Date(ms) });
const note = (id: string, authorId: string, text: string) =>
  ({
    id,
    authorId,
    authorName: authorId === 'coach' ? 'Coach' : 'Admin',
    text,
    createdAt: at(Date.UTC(2026, 9, 27, 15)),
    updatedAt: at(Date.UTC(2026, 9, 27, 15)),
  }) as unknown as MentorNote;

describe('MentorNotes', () => {
  let fixture: ComponentFixture<MentorNotes>;
  let el: HTMLElement;
  const target: NoteTarget = {
    studentId: 'ana',
    kind: 'practice',
    targetId: 's1',
    contextId: null,
    title: '',
  };
  const auth = {
    user: signal({ uid: 'coach' }),
    isStaff: signal(true),
    isAdmin: signal(false),
  };
  const service = {
    forTarget: vi.fn(async () => [] as MentorNote[]),
    access: vi.fn(async () => ({ canWrite: true, mentorshipId: 'm1' as string | null })),
    add: vi.fn(async () => 'n2'),
    edit: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined),
  };

  const render = async () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: MentorNotesService, useValue: service },
      ],
    });
    fixture = TestBed.createComponent(MentorNotes);
    fixture.componentRef.setInput('target', target);
    el = fixture.nativeElement;
    await fixture.whenStable();
    await fixture.whenStable();
  };
  const button = (name: string) =>
    [...el.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === name || b.getAttribute('aria-label') === name,
    );

  beforeEach(() => {
    vi.clearAllMocks();
    auth.isStaff.set(true);
    auth.isAdmin.set(false);
    service.forTarget.mockResolvedValue([note('n1', 'coach', 'Revisa tu entrada.')]);
    service.access.mockResolvedValue({ canWrite: true, mentorshipId: 'm1' });
  });

  it('lets a mentor read and leave notes, naming the shared mentorship', async () => {
    await render();
    expect(el.textContent).toContain('Notas del mentor');
    expect(el.textContent).toContain('Revisa tu entrada.');
    expect(el.textContent).toContain('El estudiante verá la nota');
    const textarea = el.querySelector<HTMLTextAreaElement>('textarea')!;
    textarea.value = '  Buen stop loss.  ';
    textarea.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    el.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    expect(service.add).toHaveBeenCalledWith(target, 'Buen stop loss.', 'm1');
    expect(service.forTarget).toHaveBeenCalledTimes(2);
  });

  it('edits and deletes the mentor’s own notes', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await render();
    button('Editar nota')!.click();
    await fixture.whenStable();
    const editor = el.querySelector<HTMLTextAreaElement>('.note textarea')!;
    editor.value = 'Revisa tu salida.';
    editor.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    el.querySelector<HTMLFormElement>('.note form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    expect(service.edit).toHaveBeenCalledWith('n1', 'Revisa tu salida.');
    button('Eliminar nota')!.click();
    await fixture.whenStable();
    expect(service.remove).toHaveBeenCalledWith('n1');
    expect(el.textContent).toContain('Aún no hay notas.');
  });

  it('tells staff outside the student’s mentorships why they cannot write', async () => {
    service.access.mockResolvedValue({ canWrite: false, mentorshipId: null });
    await render();
    expect(el.querySelector('textarea')).toBeNull();
    expect(button('Editar nota')).toBeUndefined();
    expect(el.textContent).toContain('Solo los mentores de una mentoría de este estudiante');
  });

  it('shows the student their notes, read only, and nothing when there are none', async () => {
    auth.isStaff.set(false);
    await render();
    expect(el.textContent).toContain('Notas de tu mentor');
    expect(el.textContent).toContain('Revisa tu entrada.');
    expect(el.querySelector('textarea, button')).toBeNull();
    expect(service.access).not.toHaveBeenCalled();

    service.forTarget.mockResolvedValue([]);
    fixture.componentRef.setInput('target', { ...target, targetId: 's2' });
    await fixture.whenStable();
    await fixture.whenStable();
    expect(el.textContent?.trim()).toBe('');
  });
});
