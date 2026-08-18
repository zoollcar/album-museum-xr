import { describe, expect, it, vi } from 'vitest';
import { createGpuReadySignageBitmap } from '../src/museum/models/signage-bitmap.js';
import { installWorkerBitmap } from '../src/museum/models/signage.js';

describe('worker signage textures', () => {
  it('preflips worker bitmaps for the WebGL texture coordinate system', async () => {
    const bitmap = {};
    const createBitmap = vi.fn(() => Promise.resolve(bitmap));
    await expect(createGpuReadySignageBitmap({}, createBitmap)).resolves.toBe(bitmap);
    expect(createBitmap).toHaveBeenCalledWith({}, { imageOrientation: 'flipY' });
  });

  it('closes an uncommitted bitmap when room cleanup cancels its scheduler task', async () => {
    const abort = Object.assign(new Error('cancelled'), { name: 'AbortError' });
    const bitmap = { close: vi.fn() };
    const scheduler = { enqueue: vi.fn(() => ({ promise: Promise.reject(abort) })) };

    await expect(installWorkerBitmap({
      bitmap,
      plane: { isConnected: true },
      material: {},
      roomId: 'gallery',
      scheduler,
      taskId: 'signage:gallery:1'
    })).rejects.toBe(abort);

    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(scheduler.enqueue.mock.calls[0][0].owner).toBe('room:gallery');
  });

  it('marks the installed texture as already flipped', async () => {
    class Texture {
      constructor(image) { this.image = image; this.userData = {}; this.flipY = true; }
    }
    vi.stubGlobal('THREE', { Texture, SRGBColorSpace: 'srgb' });
    const bitmap = { close: vi.fn() };
    const material = { color: { set: vi.fn() } };

    await installWorkerBitmap({
      bitmap,
      plane: { isConnected: true },
      material,
      roomId: 'gallery',
      scheduler: null,
      taskId: 'unused'
    });

    expect(material.map.image).toBe(bitmap);
    expect(material.map.flipY).toBe(false);
    expect(material.map.userData.imageBitmap).toBe(bitmap);
    expect(bitmap.close).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
