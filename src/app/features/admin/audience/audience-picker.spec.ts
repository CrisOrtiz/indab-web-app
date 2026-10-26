import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Mentorship } from '../../../core/models/mentorship';
import { AudiencePicker } from './audience-picker';

describe('AudiencePicker', () => {
  let fixture: ComponentFixture<AudiencePicker>;
  let picker: AudiencePicker;
  let el: HTMLElement;
  const mentorships = [
    { id: 'm1', name: 'Grupo oro', active: true },
    { id: 'm2', name: 'Grupo 2025', active: false },
  ] as Mentorship[];
  const students = [
    { uid: 'ana', name: 'Ana', email: 'ana@x.co', academy: true, mentorshipIds: ['m1'] },
    { uid: 'luis', name: 'Luis', email: 'luis@x.co', academy: true, mentorshipIds: ['m1', 'm2'] },
    { uid: 'jose', name: 'José', email: 'jose@x.co', academy: true, mentorshipIds: [] },
    { uid: 'eva', name: 'Eva', email: 'eva@x.co', academy: false, mentorshipIds: ['m1'] },
  ];

  const render = async (studentIds: string[], mentorshipIds: string[]) => {
    fixture = TestBed.createComponent(AudiencePicker);
    fixture.componentRef.setInput('students', students);
    fixture.componentRef.setInput('mentorships', mentorships);
    fixture.componentRef.setInput('studentIds', studentIds);
    fixture.componentRef.setInput('mentorshipIds', mentorshipIds);
    picker = fixture.componentInstance;
    el = fixture.nativeElement;
    await fixture.whenStable();
  };
  const labels = (list: string) =>
    [...el.querySelectorAll(`.${list} label`)].map((l) =>
      l.textContent!.replace(/\s+/g, ' ').trim(),
    );
  const total = () => el.querySelector('.total')!.textContent!.trim();

  it('offers active mentorships, with their students who have academy access', async () => {
    await render([], []);
    expect(labels('mentorship-list')).toEqual(['Grupo oro 2 estudiantes']);
    expect(labels('student-list').map((l) => l.split(' ')[0])).toEqual(['Ana', 'Luis', 'José']);
    expect(total()).toBe('En total: 0 estudiantes');
  });

  it('keeps an inactive mentorship that is already assigned, marked as such', async () => {
    await render([], ['m2']);
    const [, inactive] = labels('mentorship-list');
    expect(inactive).toContain('Grupo 2025 1 estudiante');
    expect(inactive).toContain('inactiva');
    expect(total()).toBe('En total: 1 estudiante');
  });

  it('ticks mentorships and students, counting each student once', async () => {
    await render(['jose'], []);
    el.querySelector<HTMLInputElement>('.mentorship-list input')!.click();
    await fixture.whenStable();
    expect(picker.mentorshipIds()).toEqual(['m1']);
    expect(total()).toBe('En total: 3 estudiantes');
    // Students in a ticked mentorship are shown as included.
    const ana = el.querySelectorAll<HTMLInputElement>('.student-list input')[0];
    expect(ana.checked).toBe(true);
    expect(ana.disabled).toBe(true);
    expect(labels('student-list')[0]).toContain('por Grupo oro');

    el.querySelectorAll<HTMLInputElement>('.student-list input')[2].click();
    await fixture.whenStable();
    expect(picker.studentIds()).toEqual([]);
    expect(total()).toBe('En total: 2 estudiantes');
  });

  it('searches students and selects the ones shown', async () => {
    await render([], []);
    const search = el.querySelector<HTMLInputElement>('input[type=search]')!;
    search.value = 'lu';
    search.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(labels('student-list')).toHaveLength(1);
    [...el.querySelectorAll('button')]
      .find((b) => b.textContent?.trim() === 'Seleccionar los mostrados')!
      .click();
    await fixture.whenStable();
    expect(picker.studentIds()).toEqual(['luis']);
  });
});
