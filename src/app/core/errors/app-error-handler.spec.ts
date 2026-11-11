import { ErrorHandler } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppErrorHandler, isBenignError } from './app-error-handler';

describe('AppErrorHandler', () => {
  afterEach(() => vi.restoreAllMocks());

  function setup(): { handler: ErrorHandler; log: ReturnType<typeof vi.spyOn> } {
    TestBed.configureTestingModule({
      providers: [{ provide: ErrorHandler, useClass: AppErrorHandler }],
    });
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    return { handler: TestBed.inject(ErrorHandler), log };
  }

  it('ignores the ResizeObserver loop warnings', () => {
    const { handler, log } = setup();
    handler.handleError(new Error('ResizeObserver loop completed with undelivered notifications.'));
    handler.handleError(new ErrorEvent('error', { message: 'ResizeObserver loop limit exceeded' }));
    handler.handleError('ResizeObserver loop completed with undelivered notifications.');
    expect(log).not.toHaveBeenCalled();
  });

  it('still logs real errors', () => {
    const { handler, log } = setup();
    handler.handleError(new Error('boom'));
    expect(log).toHaveBeenCalled();
  });

  it('tells benign errors apart', () => {
    expect(isBenignError(null)).toBe(false);
    expect(isBenignError({ message: 42 })).toBe(false);
    expect(isBenignError(new TypeError('x is undefined'))).toBe(false);
  });
});
