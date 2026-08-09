import { describe, expect, it } from 'vitest';
import { resolvePlanarMovement } from '../src/museum/movement.js';

describe('museum movement directions', () => {
  it('moves W/Up toward the viewer-facing -Z axis', () => {
    expect(resolvePlanarMovement({ x: 0, z: 1 }, 1, 0)).toEqual({ x: 0, z: -1 });
  });

  it('moves D/Right toward +X', () => {
    const movement = resolvePlanarMovement({ x: 0, z: 1 }, 0, 1);
    expect(movement.x).toBe(1);
    expect(movement.z).toBeCloseTo(0);
  });

  it('normalizes diagonal movement', () => {
    const movement = resolvePlanarMovement({ x: 0, z: 1 }, 1, 1);
    expect(Math.hypot(movement.x, movement.z)).toBeCloseTo(1);
  });
});
