import { describe, expect, it, vi } from 'vitest';
import { MuseumScene } from '../src/museum/scene-builder.js';

function door(roomId) {
  return {
    roomId,
    hinge: {
      removeAttribute: vi.fn(),
      setAttribute: vi.fn()
    }
  };
}

describe('elevator door state', () => {
  it('opens only the selected endpoint door', () => {
    const fromDoor = door('from');
    const toDoor = door('to');
    const view = {
      elevator: { openRoomId: null, phase: 'idle', exitRoomId: null },
      doors: [fromDoor, toDoor],
      open: false
    };
    const scene = {
      animateDoor: MuseumScene.prototype.animateDoor,
      refreshConnectorRegions: vi.fn()
    };

    MuseumScene.prototype.setElevatorDoor.call(scene, view, 'to', { immediate: true });

    expect(view.elevator.openRoomId).toBe('to');
    expect(MuseumScene.prototype.isDoorOpen.call(scene, view, 'from')).toBe(false);
    expect(MuseumScene.prototype.isDoorOpen.call(scene, view, 'to')).toBe(true);
    expect(fromDoor.hinge.setAttribute).toHaveBeenCalledWith('rotation', '0 0 0');
    expect(toDoor.hinge.setAttribute).toHaveBeenCalledWith('rotation', '0 104 0');
  });
});
