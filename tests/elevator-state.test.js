import { describe, expect, it, vi } from 'vitest';
import { MuseumScene } from '../src/museum/scene-builder.js';

function door(roomId) {
  return {
    roomId,
    motion: 'sliding',
    panels: [
      { element: { removeAttribute: vi.fn(), setAttribute: vi.fn() }, closed: '-.5 1.3 0', open: '-1 1.3 0' },
      { element: { removeAttribute: vi.fn(), setAttribute: vi.fn() }, closed: '.5 1.3 0', open: '1 1.3 0' }
    ]
  };
}

describe('elevator door state', () => {
  it('resolves one style from the elevator home endpoint for both sides', () => {
    const rooms = {
      from: { id: 'from', theme: 'art-deco' },
      to: { id: 'to', theme: 'classic' }
    };
    const scene = { roomConfig: (id) => rooms[id] };
    const connection = { from: { roomId: 'from' }, to: { roomId: 'to' } };

    expect(MuseumScene.prototype.elevatorStyleId.call(scene, connection)).toBe('elevator-bronze');
    connection.elevatorDoorStyle = 'elevator-dark';
    expect(MuseumScene.prototype.elevatorStyleId.call(scene, connection)).toBe('elevator-dark');
  });

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
    expect(fromDoor.panels[0].element.setAttribute).toHaveBeenCalledWith('position', '-.5 1.3 0');
    expect(toDoor.panels[0].element.setAttribute).toHaveBeenCalledWith('position', '-1 1.3 0');
  });
});
