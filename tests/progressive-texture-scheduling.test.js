import { describe, expect, it, vi } from 'vitest';
import { ProgressiveTextureManager } from '../src/museum/progressive-textures.js';

class Vector3 {
  copy() { return this; }
  sub() { return this; }
  length() { return 1; }
  normalize() { return this; }
}

describe('progressive texture scheduling', () => {
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
});
