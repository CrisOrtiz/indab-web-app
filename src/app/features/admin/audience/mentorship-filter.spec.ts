import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Mentorship } from '../../../core/models/mentorship';
import { MentorshipFilter } from './mentorship-filter';

describe('MentorshipFilter', () => {
  let fixture: ComponentFixture<MentorshipFilter>;

  beforeEach(async () => {
    fixture = TestBed.createComponent(MentorshipFilter);
    fixture.componentRef.setInput('mentorships', [
      { id: 'm2', name: 'Grupo 2025', active: false },
      { id: 'm1', name: 'Grupo oro', active: true },
    ] as Mentorship[]);
    await fixture.whenStable();
  });

  it('lists any mentorship, then active ones before inactive ones', () => {
    const options = [...(fixture.nativeElement as HTMLElement).querySelectorAll('option')];
    expect(options.map((o) => o.textContent?.trim())).toEqual([
      'Todas las mentorías',
      'Grupo oro',
      'Grupo 2025 · inactiva',
    ]);
  });

  it('emits the picked mentorship', async () => {
    const select = (fixture.nativeElement as HTMLElement).querySelector('select')!;
    select.value = 'm1';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(fixture.componentInstance.value()).toBe('m1');
  });
});
