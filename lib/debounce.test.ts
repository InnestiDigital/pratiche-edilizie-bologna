import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { debounce } from './debounce';

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not fire before the delay elapses', () => {
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d('a');
    vi.advanceTimersByTime(99);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('coalesces a burst into a single trailing call with the last args', () => {
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d('a');
    d('ab');
    d('abc');
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('abc');
  });

  it('resets the timer on each call (fires from the last call, not the first)', () => {
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d('a');
    vi.advanceTimersByTime(50);
    d('b');
    vi.advanceTimersByTime(50); // 100ms since first call, but only 50 since last
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(50); // now 100ms since the last call
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('b');
  });

  it('fires separate bursts separately', () => {
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d('first');
    vi.advanceTimersByTime(100);
    d('second');
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenNthCalledWith(1, 'first');
    expect(fn).toHaveBeenNthCalledWith(2, 'second');
  });

  it('cancel drops a pending call', () => {
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d('a');
    d.cancel();
    vi.advanceTimersByTime(200);
    expect(fn).not.toHaveBeenCalled();
  });

  it('cancel after fire is a no-op and lets later calls through', () => {
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d('a');
    vi.advanceTimersByTime(100);
    d.cancel();
    d('b');
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith('b');
  });

  it('flush runs the pending call immediately with the last args', () => {
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d('a');
    d('b');
    d.flush();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('b');
    // the flushed timer must not fire again afterwards
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('flush with nothing pending is a no-op', () => {
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d.flush();
    expect(fn).not.toHaveBeenCalled();
  });

  it('passes multiple arguments through', () => {
    const fn = vi.fn();
    const d = debounce(fn, 50);
    d('x', 1, true);
    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledWith('x', 1, true);
  });
});
