import { describe, expect, it, vi } from 'vitest';
import { MuseumScene } from '../src/museum/scene-builder.js';
import { FrameBudgetScheduler } from '../src/museum/frame-budget-scheduler.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
  return { promise, resolve, reject };
}

describe('asynchronous room loading', () => {
  it('deduplicates a room job and promotes it after door interaction', () => {
    const pending = deferred();
    const promote = vi.fn();
    const scene = {
      loadedRooms: new Map(),
      roomJobs: new Map([['target', { promise: pending.promise, handle: { promote }, priority: 'background' }]]),
      textureManager: { setRoomPriority: vi.fn() }
    };

    expect(MuseumScene.prototype.loadRoom.call(scene, 'target', { priority: 'interactive' })).toBe(pending.promise);
    expect(promote).toHaveBeenCalledOnce();
    expect(scene.textureManager.setRoomPriority).toHaveBeenCalledWith('target', 'interactive');
  });

  it('keeps a door closed until both room and connector are ready', async () => {
    const room = deferred();
    const view = {
      connection: { id: 'a-b', from: { roomId: 'from' }, to: { roomId: 'target' } },
      loading: false,
      elevator: null,
      open: false,
      doors: []
    };
    const scene = {
      connectionViews: new Map([['a-b', view]]),
      isDoorOpen: MuseumScene.prototype.isDoorOpen,
      roomConfig: (id) => ({ id, title: id }),
      ui: { toast: vi.fn() },
      loadRoom: vi.fn(() => room.promise),
      ensureConnector: vi.fn(() => Promise.resolve()),
      updateRoomDoorProgress: vi.fn(),
      setConnectionOpen: vi.fn()
    };

    const opening = MuseumScene.prototype.toggleDoor.call(scene, 'a-b', 'from');
    await Promise.resolve();
    expect(view.loading).toBe(true);
    expect(scene.updateRoomDoorProgress).toHaveBeenNthCalledWith(1, 'target', {
      state: 'preparing', stage: '正在准备房间', detail: 'target', progress: .01
    });
    expect(scene.setConnectionOpen).not.toHaveBeenCalled();
    room.resolve({});
    await opening;
    expect(scene.ensureConnector).toHaveBeenCalledOnce();
    expect(scene.setConnectionOpen).toHaveBeenCalledWith(view, true);
    expect(view.loading).toBe(false);
  });

  it('leaves the door closed and retryable after a load failure', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const view = {
      connection: { id: 'a-b', from: { roomId: 'from' }, to: { roomId: 'target' } },
      loading: false,
      elevator: null,
      open: false,
      doors: []
    };
    const scene = {
      connectionViews: new Map([['a-b', view]]),
      isDoorOpen: MuseumScene.prototype.isDoorOpen,
      roomConfig: (id) => ({ id, title: id }),
      ui: { toast: vi.fn() },
      loadRoom: vi.fn(() => Promise.reject(new Error('failed'))),
      ensureConnector: vi.fn(),
      updateRoomDoorProgress: vi.fn(),
      setConnectionOpen: vi.fn()
    };

    await MuseumScene.prototype.toggleDoor.call(scene, 'a-b', 'from');
    expect(scene.setConnectionOpen).not.toHaveBeenCalled();
    expect(view.loading).toBe(false);
    expect(scene.ui.toast).toHaveBeenLastCalledWith('房间加载失败，点击门可重试。', 4200);
    consoleError.mockRestore();
  });

  it('waits for an in-progress room disposal before rebuilding the same room', async () => {
    const disposal = deferred();
    const loaded = { id: 'replacement' };
    const scene = {
      retiringRooms: new Map(),
      loadedRooms: new Map(),
      cancelPendingRoomUnload: vi.fn(),
      loadRoom: MuseumScene.prototype.loadRoom
    };
    const entry = {
      promise: disposal.promise.then(() => {
        scene.retiringRooms.delete('target');
        scene.loadedRooms.set('target', loaded);
      })
    };
    scene.retiringRooms.set('target', entry);

    const request = MuseumScene.prototype.loadRoom.call(scene, 'target');
    disposal.resolve();
    await expect(request).resolves.toBe(loaded);
    expect(scene.cancelPendingRoomUnload).toHaveBeenCalledTimes(2);
  });

  it('retains distant rooms for eight seconds and cancels retirement when they become adjacent again', () => {
    const timers = new Map();
    let timerId = 0;
    const performanceNow = vi.spyOn(performance, 'now').mockReturnValue(1000);
    vi.stubGlobal('window', {
      setTimeout: vi.fn((callback, delay) => { const id = ++timerId; timers.set(id, callback); return id; }),
      clearTimeout: vi.fn((id) => timers.delete(id))
    });
    const loaded = { group: {} };
    const scene = {
      currentRoomId: 'current',
      layout: { adjacency: new Map([['current', []]]) },
      roomJobs: new Map(),
      connectionJobs: new Map(),
      loadedRooms: new Map([['current', {}], ['distant', loaded]]),
      roomUnloadTimers: new Map(),
      retiringRooms: new Map(),
      roomLastVisitedAt: new Map([['distant', 1000]]),
      lastMovementAt: 1000,
      scheduler: { cancelOwner: vi.fn() },
      textureManager: { disposeRoom: vi.fn() },
      cancelPendingRoomUnload: MuseumScene.prototype.cancelPendingRoomUnload,
      scheduleRoomUnload: MuseumScene.prototype.scheduleRoomUnload,
      recordPerformanceEvent: vi.fn(),
      beginRoomRetirement: vi.fn()
    };

    MuseumScene.prototype.unloadDistantRooms.call(scene);
    expect(window.setTimeout).toHaveBeenCalledWith(expect.any(Function), 8000);
    expect(scene.beginRoomRetirement).not.toHaveBeenCalled();

    scene.layout.adjacency.set('current', [{ other: { roomId: 'distant' } }]);
    MuseumScene.prototype.unloadDistantRooms.call(scene);
    expect(window.clearTimeout).toHaveBeenCalledOnce();
    expect(scene.roomUnloadTimers.size).toBe(0);
    performanceNow.mockRestore();
    vi.unstubAllGlobals();
  });

  it('does not expose an automatic adjacent-room preloader', () => {
    expect(MuseumScene.prototype.preloadAdjacentRooms).toBeUndefined();
  });

  it('collects colliders by walking one element per frame', async () => {
    const collider = { children: [], classList: { contains: () => true } };
    const plain = { children: [], classList: { contains: () => false } };
    const root = { children: [plain, collider], classList: { contains: () => false } };
    const scheduler = new FrameBudgetScheduler();
    const scene = {
      scheduler,
      removeColliders: vi.fn(),
      registerColliderElement: vi.fn(),
      recordPerformanceEvent: vi.fn()
    };

    const task = MuseumScene.prototype.scheduleColliderBuild.call(scene, 'room:test', root, 'interactive');
    scheduler.runFrame(0);
    expect(scene.registerColliderElement).not.toHaveBeenCalled();
    scheduler.runFrame(14);
    expect(scene.registerColliderElement).not.toHaveBeenCalled();
    scheduler.runFrame(28);
    await task.promise;
    expect(scene.registerColliderElement).toHaveBeenCalledOnce();
    expect(scene.recordPerformanceEvent).toHaveBeenCalledWith('colliders:build-ready', expect.objectContaining({
      owner: 'room:test', visitedElements: 3, colliderCount: 1
    }));
  });
});
