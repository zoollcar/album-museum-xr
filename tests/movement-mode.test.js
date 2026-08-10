import { describe, expect, it, vi } from 'vitest';
import { applyVrMovementMode, VR_MOVEMENT_MODES } from '../src/museum/movement-mode.js';

function element() {
  return { setAttribute: vi.fn(), removeAttribute: vi.fn() };
}

describe('VR movement mode', () => {
  it('defaults invalid values to teleport and enables blink controls', () => {
    const rig = element();
    const teleporters = [element(), element()];
    expect(applyVrMovementMode({ mode: 'unknown', rig, teleporters })).toBe(VR_MOVEMENT_MODES.TELEPORT);
    expect(rig.setAttribute).toHaveBeenCalledWith('xr-thumbstick-move', 'enabled', false);
    teleporters.forEach((teleporter) => expect(teleporter.setAttribute).toHaveBeenCalledWith('blink-controls', expect.stringContaining('cameraRig: #camera-rig')));
  });

  it('makes smooth movement and teleport mutually exclusive', () => {
    const rig = element();
    const teleporters = [element(), element()];
    applyVrMovementMode({ mode: VR_MOVEMENT_MODES.MOVE, rig, teleporters });
    expect(rig.setAttribute).toHaveBeenCalledWith('xr-thumbstick-move', 'enabled', true);
    teleporters.forEach((teleporter) => expect(teleporter.removeAttribute).toHaveBeenCalledWith('blink-controls'));
  });
});
