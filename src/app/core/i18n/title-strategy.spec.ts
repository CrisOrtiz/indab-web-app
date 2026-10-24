import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { TitleStrategy, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { I18n } from './i18n.service';
import { I18nTitleStrategy } from './title-strategy';

@Component({ template: '' })
class Page {}

describe('I18nTitleStrategy', () => {
  it('translates route titles and follows a language switch', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'login', title: 'login', component: Page }]),
        { provide: TitleStrategy, useClass: I18nTitleStrategy },
      ],
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/login');
    const title = TestBed.inject(Title);
    expect(title.getTitle()).toBe('Ingresar | INDAB');

    await TestBed.inject(I18n).use('en-US');
    TestBed.tick();
    expect(title.getTitle()).toBe('Sign in | INDAB');
  });
});
