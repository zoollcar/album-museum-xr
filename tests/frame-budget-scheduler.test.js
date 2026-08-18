import { describe, expect, it, vi } from 'vitest';
import { FrameBudgetScheduler } from '../src/museum/frame-budget-scheduler.js';

function controlledClock() {
  let value = 0;
  return { now: () => value, advance: (amount) => { value += amount; }, set: (next) => { value = next; } };
}

describe('FrameBudgetScheduler', () => {
  it('deduplicates tasks and reports monotonic progress', async () => {
    const clock = controlledClock();
    const progress = [];
    const scheduler = new FrameBudgetScheduler({ now: clock.now });
    const steps = Array.from({ length: 3 }, () => ({ label: '工作', run: () => clock.advance(.6) }));
    const first = scheduler.enqueue({ id: 'room:a', steps, onProgress: ({ progress: value }) => progress.push(value) });
    expect(scheduler.enqueue({ id: 'room:a', steps })).toBe(first);
    scheduler.runFrame(0);
    scheduler.runFrame(14);
    await first.promise;
    expect(progress.at(-1)).toBe(1);
    expect(progress.every((value, index) => index === 0 || value >= progress[index - 1])).toBe(true);
  });

  it('pauses work after a late frame and resumes on the next stable frame', () => {
    const clock = controlledClock();
    const run = vi.fn(() => clock.advance(.2));
    const scheduler = new FrameBudgetScheduler({ now: clock.now });
    scheduler.runFrame(0);
    scheduler.enqueue({ id: 'room:a', steps: [run] });
    expect(scheduler.runFrame(20)).toBe(0);
    expect(run).not.toHaveBeenCalled();
    scheduler.runFrame(34);
    expect(run).toHaveBeenCalledOnce();
    expect(scheduler.snapshot().pauses).toBe(1);
  });

  it('promotes interactive work and isolates task failures', async () => {
    const clock = controlledClock();
    const order = [];
    const onError = vi.fn();
    const scheduler = new FrameBudgetScheduler({ now: clock.now, onError });
    const background = scheduler.enqueue({ id: 'background', steps: [() => { order.push('background'); clock.advance(.3); }] });
    const broken = scheduler.enqueue({ id: 'broken', steps: [() => { throw new Error('boom'); }] });
    const interactive = scheduler.enqueue({ id: 'interactive', steps: [() => { order.push('interactive'); clock.advance(.3); }] });
    interactive.promote();
    scheduler.runFrame(0);
    await Promise.allSettled([background.promise, broken.promise, interactive.promise]);
    expect(order[0]).toBe('interactive');
    expect(onError).toHaveBeenCalledOnce();
  });

  it('cancels all work owned by a room', async () => {
    const scheduler = new FrameBudgetScheduler();
    const task = scheduler.enqueue({ id: 'room:a:build', owner: 'room:a', steps: [() => {}] });
    scheduler.cancelOwner('room:a');
    await expect(task.promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(task.state).toBe('cancelled');
  });

  it('runs at most one incremental cleanup slice per frame after higher-priority work', async () => {
    const clock = controlledClock();
    const order = [];
    let cleanupSlices = 0;
    const scheduler = new FrameBudgetScheduler({ now: clock.now });
    const cleanup = scheduler.enqueueIncremental({
      id: 'room:a:dispose',
      runSlice: () => {
        order.push('cleanup');
        cleanupSlices += 1;
        clock.advance(.2);
        return cleanupSlices === 3;
      }
    });
    const interactive = scheduler.enqueue({
      id: 'room:b:build',
      priority: 'interactive',
      steps: [() => { order.push('interactive'); clock.advance(.2); }]
    });

    scheduler.runFrame(0);
    expect(order).toEqual(['interactive', 'cleanup']);
    expect(cleanupSlices).toBe(1);
    scheduler.runFrame(14);
    expect(cleanupSlices).toBe(2);
    scheduler.runFrame(28);
    await Promise.all([cleanup.promise, interactive.promise]);
    expect(cleanupSlices).toBe(3);
    expect(scheduler.snapshot()).toMatchObject({ cleanupSlices: 3, queuedCleanupTasks: 0 });
  });

  it('can pause cleanup while movement is active', async () => {
    let moving = true;
    const cleanupStep = vi.fn(() => true);
    const scheduler = new FrameBudgetScheduler({ shouldRunTask: (task) => task.priority !== 'cleanup' || !moving });
    const cleanup = scheduler.enqueueIncremental({ id: 'cleanup', runSlice: cleanupStep });

    scheduler.runFrame(0);
    expect(cleanupStep).not.toHaveBeenCalled();
    moving = false;
    scheduler.runFrame(14);
    await cleanup.promise;
    expect(cleanupStep).toHaveBeenCalledOnce();
  });

  it('yields after one structural build step even when frame budget remains', async () => {
    const clock = controlledClock();
    const steps = [vi.fn(() => clock.advance(.1)), vi.fn(() => clock.advance(.1))];
    const scheduler = new FrameBudgetScheduler({ now: clock.now });
    const task = scheduler.enqueue({ id: 'room:a', steps, yieldAfterStep: true });

    scheduler.runFrame(0);
    expect(steps[0]).toHaveBeenCalledOnce();
    expect(steps[1]).not.toHaveBeenCalled();
    scheduler.runFrame(14);
    await task.promise;
    expect(steps[1]).toHaveBeenCalledOnce();
  });
});
