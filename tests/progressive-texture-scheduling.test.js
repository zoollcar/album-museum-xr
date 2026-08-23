import { describe, expect, it, vi } from 'vitest';
import { ProgressiveTextureManager } from '../src/museum/progressive-textures.js';

class Vector3 {
  copy() { return this; }
  sub() { return this; }
  length() { return 1; }
  normalize() { return this; }
}

describe('progressive texture scheduling', () => {
  it('reports the current photo name and completed count while waiting for room previews', async () => {
    globalThis.THREE = { Vector3 };
    const first = Promise.resolve();
    let finishSecond;
    const second = new Promise((resolve) => { finishSecond = resolve; });
    const manager = new ProgressiveTextureManager({ camera: null });
    manager.items.set('first', {
      id: 'first', roomId: 'gallery', label: 'Sunset by the Sea', tier: null, lowReady: first
    });
    manager.items.set('second', {
      id: 'second', roomId: 'gallery', label: 'Mountain Path', tier: null, lowReady: second
    });
    const updates = [];

    const waiting = manager.waitForRoomLow('gallery', (status) => updates.push(status));
    await Promise.resolve();
    expect(updates[0]).toMatchObject({ label: 'Sunset by the Sea', completed: 0, total: 2, progress: 0 });
    expect(updates).toContainEqual(expect.objectContaining({ label: 'Mountain Path', completed: 1, total: 2, progress: .5 }));
    finishSecond();
    await waiting;
    expect(updates.at(-1)).toMatchObject({ label: 'Mountain Path', completed: 2, total: 2, progress: 1 });
  });

  it('does not mutate the scene before the scheduled commit runs', async () => {
    globalThis.THREE = { Vector3, SRGBColorSpace: 'srgb', MathUtils: { radToDeg: (value) => value } };
    const queued = [];
    const scheduler = {
      enqueue: vi.fn(({ steps }) => {
        const wait = {};
        wait.promise = new Promise((resolve) => { wait.run = () => { steps[0].run(); resolve(); }; });
        queued.push(wait);
        return wait;
      })
    };
    const material = { map: null, color: { set: vi.fn() }, needsUpdate: false };
    const plane = {
      dataset: {},
      getObject3D: () => ({ material }),
      setAttribute: vi.fn(),
      object3D: { visible: true }
    };
    const texture = { image: { width: 100, height: 80 }, userData: {}, dispose: vi.fn() };
    const manager = new ProgressiveTextureManager({ camera: null, scheduler });
    manager.createTexture = vi.fn(() => Promise.resolve(texture));
    const item = {
      id: 'photo', roomId: 'room', plane, frame: null, sources: { original: '/photo.jpg' },
      tier: null, requestedTier: null, texture: null, loading: false, disposed: false
    };

    const request = manager.requestTier(item, 'low');
    await Promise.resolve();
    await Promise.resolve();
    expect(scheduler.enqueue).toHaveBeenCalledOnce();
    expect(material.map).toBeNull();
    queued[0].run();
    await request;
    expect(material.map).toBe(texture);
    expect(item.tier).toBe('low');
  });

  it('backs off network failures and stops after three attempts', async () => {
    globalThis.THREE = { Vector3, SRGBColorSpace: 'srgb', MathUtils: { radToDeg: (value) => value } };
    let now = 0;
    const onError = vi.fn();
    const manager = new ProgressiveTextureManager({ camera: null, onError, now: () => now });
    manager.createTexture = vi.fn(() => Promise.reject(Object.assign(new TypeError('Failed to fetch'), { retryable: true })));
    const item = {
      id: 'photo', roomId: 'room', plane: {}, frame: null, sources: { original: '/photo.jpg' },
      tier: null, requestedTier: null, texture: null, loading: false, disposed: false
    };

    await manager.requestTier(item, 'low');
    await manager.requestTier(item, 'low');
    expect(manager.createTexture).toHaveBeenCalledTimes(1);

    now = 1000;
    await manager.requestTier(item, 'low');
    now = 6000;
    await manager.requestTier(item, 'low');
    now = 60000;
    await manager.requestTier(item, 'low');

    expect(manager.createTexture).toHaveBeenCalledTimes(3);
    expect(onError).toHaveBeenCalledTimes(3);
    expect(onError.mock.calls[2][0]).toContain('automatic retries have stopped');
  });

  it('does not retry permanent HTTP or decode failures', async () => {
    globalThis.THREE = { Vector3, SRGBColorSpace: 'srgb', MathUtils: { radToDeg: (value) => value } };
    let now = 0;
    const manager = new ProgressiveTextureManager({ camera: null, now: () => now, onError: vi.fn() });
    manager.createTexture = vi.fn(() => Promise.reject(Object.assign(new Error('404 Not Found'), { retryable: false })));
    const item = {
      id: 'missing', roomId: 'room', plane: {}, frame: null, sources: { original: '/missing.jpg' },
      tier: null, requestedTier: null, texture: null, loading: false, disposed: false
    };

    await manager.requestTier(item, 'low');
    now = 60000;
    await manager.requestTier(item, 'low');

    expect(manager.createTexture).toHaveBeenCalledOnce();
  });
});
