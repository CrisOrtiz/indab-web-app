import { vi } from 'vitest';
import { CursorPage, CursorPages, pageCount, pageOf } from './cursor-pages';

describe('CursorPages', () => {
  const page = (items: string[], hasMore: boolean): CursorPage<string, string> => ({
    items,
    last: items.at(-1),
    hasMore,
  });

  it('reads each page after the cursor of the one before, and goes back from the start', async () => {
    const fetch = vi.fn(async (after: string | undefined) =>
      after === undefined
        ? page(['a', 'b'], true)
        : after === 'b'
          ? page(['c', 'd'], true)
          : page(['e'], false),
    );
    const pages = new CursorPages(fetch);
    await pages.first();
    expect(pages.items()).toEqual(['a', 'b']);
    expect(pages.page()).toBe(0);
    expect(pages.hasNext()).toBe(true);

    await pages.next();
    await pages.next();
    expect(pages.items()).toEqual(['e']);
    expect(pages.page()).toBe(2);
    expect(pages.hasNext()).toBe(false);
    await pages.next();
    expect(fetch).toHaveBeenCalledTimes(3);

    await pages.previous();
    expect(fetch).toHaveBeenLastCalledWith('b');
    expect(pages.items()).toEqual(['c', 'd']);
    await pages.first();
    expect(pages.page()).toBe(0);
    await pages.previous();
    expect(fetch).toHaveBeenCalledTimes(5);
  });

  it('keeps only the latest request when filters change mid-load', async () => {
    let resolveSlow!: (value: CursorPage<string, string>) => void;
    const fetch = vi
      .fn<(after: string | undefined) => Promise<CursorPage<string, string>>>()
      .mockReturnValueOnce(new Promise((resolve) => (resolveSlow = resolve)))
      .mockResolvedValueOnce(page(['new'], false));
    const pages = new CursorPages(fetch);
    const slow = pages.first();
    await pages.first();
    resolveSlow(page(['old'], true));
    await slow;
    expect(pages.items()).toEqual(['new']);
    expect(pages.loading()).toBe(false);
  });

  it('removes an item from the page and passes errors on', async () => {
    const pages = new CursorPages(async () => page(['a', 'b'], false));
    await pages.first();
    pages.remove((item) => item === 'a');
    expect(pages.items()).toEqual(['b']);

    const failing = new CursorPages(async () => Promise.reject(new Error('denied')));
    await expect(failing.first()).rejects.toThrow('denied');
    expect(failing.loading()).toBe(false);
  });
});

describe('pageOf / pageCount', () => {
  it('slices lists in memory', () => {
    const list = [1, 2, 3, 4, 5];
    expect(pageOf(list, 1, 2)).toEqual([3, 4]);
    expect(pageOf(list, 2, 2)).toEqual([5]);
    expect(pageCount(5, 2)).toBe(3);
    expect(pageCount(0, 20)).toBe(1);
  });
});
