const PRIORITY = { interactive: 0, background: 1, cleanup: 2 };

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function frameTarget(values) {
  if (!values.length) return 1000 / 72;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * .75))];
}

function abortError(message = 'Task cancelled') {
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

export class FrameBudgetScheduler {
  constructor({
    now = () => performance.now(), onError = console.error, onDiagnostic = () => {}, shouldRunTask = () => true
  } = {}) {
    this.now = now;
    this.onError = onError;
    this.onDiagnostic = onDiagnostic;
    this.shouldRunTask = shouldRunTask;
    this.tasks = new Map();
    this.frameSamples = [];
    this.lastFrameTime = null;
    this.sequence = 0;
    this.diagnostics = {
      frames: 0,
      lateFrames: 0,
      pauses: 0,
      slices: 0,
      maxSliceMs: 0,
      maxSliceLabel: '',
      maxSliceTask: '',
      cleanupSlices: 0,
      maxCleanupSliceMs: 0,
      maxCleanupSliceTask: '',
      lastBudgetMs: 0,
      targetFrameMs: 1000 / 72
    };
  }

  enqueueIncremental({ id, owner = id, priority = 'cleanup', label = '', runSlice, onProgress = null, yieldAfterStep = priority === 'cleanup' }) {
    return this.enqueue({
      id,
      owner,
      priority,
      onProgress,
      yieldAfterStep,
      steps: [{ label, incremental: true, run: runSlice }]
    });
  }

  enqueue({ id, owner = id, priority = 'background', steps, onProgress = null, yieldAfterStep = false }) {
    const existing = this.tasks.get(id);
    if (existing && !['complete', 'cancelled', 'error'].includes(existing.state)) return existing.handle;
    const normalized = [...steps].map((step) => typeof step === 'function'
      ? { run: step, label: '', weight: 1 }
      : { weight: 1, label: '', ...step });
    const totalWeight = normalized.reduce((sum, step) => sum + Math.max(0, step.weight), 0) || 1;
    let resolvePromise;
    let rejectPromise;
    const promise = new Promise((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });
    const task = {
      id,
      owner,
      priority,
      steps: normalized,
      totalWeight,
      completedWeight: 0,
      index: 0,
      state: 'queued',
      sequence: this.sequence++,
      onProgress,
      yieldAfterStep,
      resolve: resolvePromise,
      reject: rejectPromise,
      promise,
      handle: null
    };
    task.handle = {
      id,
      promise,
      get state() { return task.state; },
      get progress() { return task.completedWeight / task.totalWeight; },
      promote: () => this.promote(id),
      cancel: (reason) => this.cancel(id, reason)
    };
    this.tasks.set(id, task);
    this.report(task, normalized[0]?.label || '', 0);
    return task.handle;
  }

  promote(id) {
    const task = this.tasks.get(id);
    if (!task || ['complete', 'cancelled', 'error'].includes(task.state)) return false;
    task.priority = 'interactive';
    task.sequence = this.sequence++;
    return true;
  }

  cancel(id, reason = 'Task cancelled') {
    const task = this.tasks.get(id);
    if (!task || ['complete', 'cancelled', 'error'].includes(task.state)) return false;
    task.state = 'cancelled';
    task.reject(abortError(reason));
    this.tasks.delete(id);
    return true;
  }

  cancelOwner(owner, reason = 'Owner disposed') {
    for (const task of [...this.tasks.values()]) if (task.owner === owner) this.cancel(task.id, reason);
  }

  nextTask() {
    return [...this.tasks.values()]
      .filter((task) => (task.state === 'queued' || task.state === 'running') && this.shouldRunTask(task))
      .sort((a, b) => (PRIORITY[a.priority] ?? PRIORITY.background) - (PRIORITY[b.priority] ?? PRIORITY.background) || a.sequence - b.sequence)[0] || null;
  }

  runFrame(frameTime = this.now()) {
    this.diagnostics.frames += 1;
    if (this.lastFrameTime !== null) {
      const delta = frameTime - this.lastFrameTime;
      const currentTarget = frameTarget(this.frameSamples);
      if (delta >= 8 && delta <= 25) {
        this.frameSamples.push(delta);
        if (this.frameSamples.length > 30) this.frameSamples.shift();
      }
      if (delta > currentTarget * 1.1) {
        this.diagnostics.lateFrames += 1;
        this.diagnostics.pauses += 1;
        this.onDiagnostic({ type: 'late-frame', deltaMs: delta, targetFrameMs: currentTarget });
        this.lastFrameTime = frameTime;
        return 0;
      }
    }
    this.lastFrameTime = frameTime;
    const targetFrameMs = frameTarget(this.frameSamples);
    const budget = clamp(targetFrameMs * .25, 1, 3);
    this.diagnostics.targetFrameMs = targetFrameMs;
    this.diagnostics.lastBudgetMs = budget;
    const started = this.now();
    let ran = 0;
    while (this.now() - started < budget) {
      const task = this.nextTask();
      if (!task) break;
      const step = task.steps[task.index];
      if (!step) {
        this.complete(task);
        continue;
      }
      task.state = 'running';
      const stepStarted = this.now();
      try {
        const sliceComplete = step.run();
        const stepComplete = !step.incremental || sliceComplete === true;
        if (stepComplete) {
          task.index += 1;
          task.completedWeight += Math.max(0, step.weight);
        }
        ran += 1;
        this.diagnostics.slices += 1;
        const sliceMs = this.now() - stepStarted;
        if (sliceMs > this.diagnostics.maxSliceMs) {
          this.diagnostics.maxSliceMs = sliceMs;
          this.diagnostics.maxSliceLabel = step.label;
          this.diagnostics.maxSliceTask = task.id;
        }
        if (sliceMs > 4) this.onDiagnostic({
          type: 'slow-slice', taskId: task.id, owner: task.owner, priority: task.priority,
          label: step.label, durationMs: sliceMs
        });
        if (task.priority === 'cleanup') {
          this.diagnostics.cleanupSlices += 1;
          if (sliceMs > this.diagnostics.maxCleanupSliceMs) {
            this.diagnostics.maxCleanupSliceMs = sliceMs;
            this.diagnostics.maxCleanupSliceTask = task.id;
          }
        }
        const next = stepComplete ? task.steps[task.index] : step;
        this.report(task, next?.label || step.label || '', task.completedWeight / task.totalWeight);
        task.sequence = this.sequence++;
        if (task.index >= task.steps.length) this.complete(task);
        if (task.priority === 'cleanup' || task.yieldAfterStep) break;
      } catch (error) {
        task.state = 'error';
        this.tasks.delete(task.id);
        task.reject(error);
        this.onError(error);
      }
    }
    return ran;
  }

  report(task, label, progress) {
    task.onProgress?.({ id: task.id, label, progress: clamp(progress, 0, 1), state: task.state });
  }

  complete(task) {
    task.state = 'complete';
    task.completedWeight = task.totalWeight;
    this.report(task, 'Complete', 1);
    this.tasks.delete(task.id);
    task.resolve();
  }

  snapshot() {
    return {
      ...this.diagnostics,
      queuedTasks: this.tasks.size,
      queuedCleanupTasks: [...this.tasks.values()].filter((task) => task.priority === 'cleanup').length,
      tasks: [...this.tasks.values()].map(({ id, owner, priority, state, completedWeight, totalWeight }) => ({
        id, owner, priority, state, progress: completedWeight / totalWeight
      }))
    };
  }

  dispose() {
    for (const task of [...this.tasks.values()]) this.cancel(task.id, 'Scheduler disposed');
  }
}
