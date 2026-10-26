import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { Admin } from './admin';

describe('Admin home', () => {
  let fixture: ComponentFixture<Admin>;
  let el: HTMLElement;
  const isAdmin = signal(true);

  beforeEach(async () => {
    isAdmin.set(true);
    TestBed.configureTestingModule({
      imports: [Admin],
      providers: [provideRouter([]), { provide: AuthService, useValue: { isAdmin } }],
    });
    fixture = TestBed.createComponent(Admin);
    el = fixture.nativeElement;
    await fixture.whenStable();
  });

  const titles = () => [...el.querySelectorAll('.card h2')].map((h) => h.textContent?.trim());
  const links = () => [...el.querySelectorAll('a.card')].map((a) => a.getAttribute('href'));

  it('opens each admin tool, users included, on its own page', () => {
    expect(titles()).toEqual([
      'Usuarios',
      'Mentorías',
      'Formularios de evaluación',
      'Evaluaciones de práctica',
      'Revisar prácticas de trading',
    ]);
    expect(links()).toEqual([
      '/admin/users',
      '/admin/mentorships',
      '/admin/forms',
      '/admin/evaluations',
      '/admin/practice',
    ]);
    expect(el.querySelector('table')).toBeNull();
  });

  it('shows trainers the evaluations and practice review, not the users', async () => {
    isAdmin.set(false);
    await fixture.whenStable();
    expect(el.textContent).toContain('Como entrenador puedes crear evaluaciones');
    expect(links()).toEqual([
      '/admin/mentorships',
      '/admin/forms',
      '/admin/evaluations',
      '/admin/practice',
    ]);
    expect(el.textContent).not.toContain('Rol, acceso a la academia y mentorías');
  });
});
