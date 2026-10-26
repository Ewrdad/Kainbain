// Domain: The Flow — queued work preserves priority and project cancellation.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ExecutionQueue, EQUEUE_TIMEOUT_CODE } from './index.js';

afterEach(() => {
	vi.useRealTimers();
});

describe('ExecutionQueue', () => {
  it('finishes active work, then high priority FIFO, then normal FIFO, even after rejection', async () => {
    const queue = new ExecutionQueue();
    const order = [];
    let release;
    const active = queue.enqueue(() => new Promise((resolve) => { release = resolve; }));
    const normal = queue.enqueue(() => order.push('normal'));
    const high = queue.enqueue(() => { order.push('high'); throw new Error('rejected job'); }, { priority: 'high' });
    const rejection = expect(high).rejects.toThrow('rejected job');
    const nextHigh = queue.enqueue(() => order.push('next high'), { priority: 'high' });
    expect(queue.size).toBe(3);
    expect(queue.isRunning).toBe(true);
    release('active result');
    expect(await active).toBe('active result');
    await Promise.all([normal, nextHigh, rejection]);
    expect(order).toEqual(['high', 'next high', 'normal']);
    expect(queue.size).toBe(0);
    expect(queue.isRunning).toBe(false);
  });

  it('drains to idle, then a newly enqueued job still runs without a restart', async () => {
    const queue = new ExecutionQueue();
    const order = [];
    await Promise.all([
      queue.enqueue(() => order.push('first')),
      queue.enqueue(() => order.push('second')),
    ]);
    expect(order).toEqual(['first', 'second']);
    expect(queue.size).toBe(0);
    expect(queue.isRunning).toBe(false);
    // The drained queue must stay re-entrant: new work runs immediately.
    await queue.enqueue(() => order.push('third'));
    expect(order).toEqual(['first', 'second', 'third']);
    expect(queue.size).toBe(0);
    expect(queue.isRunning).toBe(false);
  });

  it('clears only pending work for the selected project, not its running job', async () => {
    const queue = new ExecutionQueue();
    const order = [];
    let release;
    const active = queue.enqueue(() => new Promise((resolve) => { release = resolve; }), { projectId: 'a' });
    void queue.enqueue(() => order.push('cancelled'), { projectId: 'a', priority: 'high' });
    const retained = queue.enqueue(() => order.push('retained'), { projectId: 'b' });
    queue.clear('a');
    expect(queue.size).toBe(1);
    expect(queue.isRunning).toBe(true);
    release();
    await Promise.all([active, retained]);
    expect(order).toEqual(['retained']);
  });

  it('ships disabled by default: a hung entry never times out unless a budget is set', () => {
    const queue = new ExecutionQueue();
    expect(queue.activeTimeoutMs).toBe(0);
    expect(new ExecutionQueue({ activeTimeoutMs: -5 }).activeTimeoutMs).toBe(0);
    expect(new ExecutionQueue({ activeTimeoutMs: Number.NaN }).activeTimeoutMs).toBe(0);
    expect(new ExecutionQueue(60000).activeTimeoutMs).toBe(60000);
    expect(new ExecutionQueue({ timeoutMs: 45000 }).activeTimeoutMs).toBe(45000);
  });

  it('force-settling one hung entry never parks the queue: the drain advances and the late settlement is dropped', async () => {
    const queue = new ExecutionQueue();
    const order = [];
    let lateResolve;
    const hung = queue.enqueue(
      () => new Promise((resolve) => { lateResolve = resolve; }),
      { taskId: 'wedged' },
    );
    const hungRejection = expect(hung).rejects.toThrow('force-settled by test');
    const next = queue.enqueue(() => order.push('next'));
    expect(queue.isRunning).toBe(true);
    expect(queue.activeEntry?.taskId).toBe('wedged');
    expect(queue.settleActive(new Error('force-settled by test'))).toBe(true);
    await hungRejection;
    await next;
    expect(order).toEqual(['next']);
    expect(queue.isRunning).toBe(false);
    // Settling an idle queue is a no-op: exactly one rescue wins per entry.
    expect(queue.settleActive(new Error('force-settled by test'))).toBe(false);
    // The late run resolving after the settle must not re-drive or re-resolve.
    lateResolve('too late');
    await new Promise((r) => setTimeout(r, 10));
    expect(queue.isRunning).toBe(false);
    expect(queue.size).toBe(0);
  });

  it('settleActive always targets the live entry: a queued-behind run is settled, never stranded', async () => {
    const queue = new ExecutionQueue();
    const hung = queue.enqueue(() => new Promise(() => {}), { taskId: 'first' });
    hung.catch(() => {});
    const next = queue.enqueue(() => new Promise(() => {}), { taskId: 'second' });
    const nextRejection = expect(next).rejects.toThrow('second rescue');
    expect(queue.settleActive(new Error('first rescue'))).toBe(true);
    // The drain picked up the next entry synchronously, so the second rescue
    // settles that live entry (and rejects its promise) instead of no-op-ing.
    await expect(hung).rejects.toThrow('first rescue');
    expect(queue.activeEntry?.taskId).toBe('second');
    expect(queue.settleActive(new Error('second rescue'))).toBe(true);
    await nextRejection;
    expect(queue.isRunning).toBe(false);
  });

  it('settling an idle queue is a no-op', () => {
    const queue = new ExecutionQueue();
    expect(queue.settleActive(new Error('nothing'))).toBe(false);
  });

  it('a per-entry timeout rejects with EQUEUE_TIMEOUT and the drain advances', async () => {
    vi.useFakeTimers();
    const queue = new ExecutionQueue();
    const order = [];
    const hung = queue.enqueue(() => new Promise(() => {}), { timeoutMs: 1000 });
    const hungRejection = expect(hung).rejects.toMatchObject({ code: EQUEUE_TIMEOUT_CODE });
    const next = queue.enqueue(() => order.push('next'));
    expect(queue.isRunning).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    await hungRejection;
    await next;
    expect(order).toEqual(['next']);
    expect(queue.isRunning).toBe(false);
    expect(queue.size).toBe(0);
  });

  it('the queue default timeout applies to entries without their own budget', async () => {
    vi.useFakeTimers();
    const queue = new ExecutionQueue({ activeTimeoutMs: 500 });
    const hung = queue.enqueue(() => new Promise(() => {}));
    const hungRejection = expect(hung).rejects.toMatchObject({ code: EQUEUE_TIMEOUT_CODE });
    await vi.advanceTimersByTimeAsync(500);
    await hungRejection;
    expect(queue.isRunning).toBe(false);
  });

  it('a settling run clears its timer so no late timeout can fire', async () => {
    vi.useFakeTimers();
    const queue = new ExecutionQueue({ activeTimeoutMs: 100 });
    let release;
    const gate = queue.enqueue(
      () => new Promise((resolve) => { release = resolve; }),
      { taskId: 'quick' },
    );
    release('done');
    await expect(gate).resolves.toBe('done');
    // Advancing past the budget must not reject anything or wedge the queue.
    await vi.advanceTimersByTimeAsync(10000);
    expect(queue.isRunning).toBe(false);
    await expect(queue.enqueue(() => 'again')).resolves.toBe('again');
  });

  it('reports live entry age, collapsing to 0 when idle or the clock is corrupt', async () => {
    const queue = new ExecutionQueue();
    expect(queue.activeAgeMs).toBe(0);
    let release;
    const active = queue.enqueue(() => new Promise((resolve) => { release = resolve; }));
    expect(queue.activeAgeMs).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(queue.activeAgeMs)).toBe(true);
    queue._activeStartedAt = 'not-a-time';
    expect(queue.activeAgeMs).toBe(0);
    release();
    await active;
    expect(queue.activeAgeMs).toBe(0);
    expect(queue.activeStartedAt).toBeNull();
  });
});
