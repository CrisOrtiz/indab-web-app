import { SessionTabs } from './session-tabs';

describe('SessionTabs', () => {
  const wait = () => new Promise((resolve) => setTimeout(resolve, 50));

  it('lets go of a session another tab opens', async () => {
    const first = new SessionTabs();
    const second = new SessionTabs();
    const taken = vi.fn();
    first.onTaken(taken);
    first.open('s1');
    second.open('s2');
    await wait();
    expect(taken).not.toHaveBeenCalled();
    second.open('s1');
    await wait();
    expect(taken).toHaveBeenCalledWith('s1');
    first.ngOnDestroy();
    second.ngOnDestroy();
  });

  it('ignores sessions it no longer shows', async () => {
    const first = new SessionTabs();
    const second = new SessionTabs();
    const taken = vi.fn();
    first.onTaken(taken);
    first.open('s1');
    first.close();
    second.open('s1');
    await wait();
    expect(taken).not.toHaveBeenCalled();
    first.ngOnDestroy();
    second.ngOnDestroy();
  });
});
