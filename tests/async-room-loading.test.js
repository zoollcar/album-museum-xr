import { describe, expect, it, vi } from 'vitest';
import { MuseumScene } from '../src/museum/scene-builder.js';

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
});
