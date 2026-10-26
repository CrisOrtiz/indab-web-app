import { signal } from '@angular/core';

/** One page read from Firestore: its items, the cursor after the last one, and whether more follow. */
export interface CursorPage<T, C> {
  items: T[];
  last: C | undefined;
  hasMore: boolean;
}

/**
 * Pages through a query with cursors (`limit` + `startAfter`), so each page costs only its own
 * reads. `fetch` reads the page that starts after a cursor (none for the first page); the
 * cursors of the pages already seen are kept, so going back reads that page again from its start.
 * Responses of older requests (a filter changed meanwhile) are dropped.
 */
export class CursorPages<T, C> {
  readonly items = signal<T[]>([]);
  /** Zero-based page number. */
  readonly page = signal(0);
  readonly hasNext = signal(false);
  readonly loading = signal(false);

  private starts: (C | undefined)[] = [undefined];
  private last: C | undefined;
  private request = 0;

  constructor(private readonly fetch: (after: C | undefined) => Promise<CursorPage<T, C>>) {}

  /** Reads the first page again (after a filter change, for instance). */
  first(): Promise<void> {
    this.starts = [undefined];
    return this.load(0);
  }

  next(): Promise<void> {
    if (!this.hasNext() || this.loading()) {
      return Promise.resolve();
    }
    const page = this.page() + 1;
    this.starts[page] = this.last;
    return this.load(page);
  }

  previous(): Promise<void> {
    return this.page() > 0 && !this.loading() ? this.load(this.page() - 1) : Promise.resolve();
  }

  /** Drops an item from the page shown, e.g. after deleting it. */
  remove(match: (item: T) => boolean): void {
    this.items.update((items) => items.filter((item) => !match(item)));
  }

  private async load(page: number): Promise<void> {
    const request = ++this.request;
    this.loading.set(true);
    try {
      const result = await this.fetch(this.starts[page]);
      if (request === this.request) {
        this.items.set(result.items);
        this.last = result.last;
        this.hasNext.set(result.hasMore);
        this.page.set(page);
      }
    } finally {
      if (request === this.request) {
        this.loading.set(false);
      }
    }
  }
}

/** The zero-based `page` of `items`, for lists already in memory. */
export function pageOf<T>(items: readonly T[], page: number, size: number): T[] {
  return items.slice(page * size, (page + 1) * size);
}

/** How many pages `count` items fill (at least one, so an empty list shows "page 1 of 1"). */
export function pageCount(count: number, size: number): number {
  return Math.max(1, Math.ceil(count / size));
}
