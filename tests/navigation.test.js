import { describe, expect, it } from 'vitest';
import {
  constrainWalkableMovement,
  elevatorCabinPosition,
  elevatorWalkRegion,
  hasExitedElevator,
  isDoorwayBlocked,
  isInsideElevatorTrigger,
  isPointWalkable,
  transferElevatorPosition,
  transferElevatorYaw
} from '../src/museum/navigation.js';

describe('museum collision navigation', () => {
  const regions = [{ x: 0, z: 0, width: 10, depth: 10 }];
  const wall = [{ minX: 1.9, maxX: 2.1, minZ: -5, maxZ: 5 }];

  it('blocks actual wall volumes inside a room region', () => {
    expect(isPointWalkable(regions, wall, 2, 0)).toBe(false);
    expect(isPointWalkable(regions, wall, 1.5, 0)).toBe(true);
  });

  it('rejects positions outside all active walk regions', () => {
    expect(isPointWalkable(regions, [], 6, 0)).toBe(false);
  });

  it('detects entry anywhere inside an oriented elevator cabin', () => {
    const eastPort = { x: 10, z: 3, outward: { x: 1, z: 0 } };
    expect(isInsideElevatorTrigger(eastPort, { x: 11.1, z: 3.4 })).toBe(true);
    expect(isInsideElevatorTrigger(eastPort, { x: 10.3, z: 3 })).toBe(false);
    expect(isInsideElevatorTrigger(eastPort, { x: 11.2, z: 4.1 })).toBe(false);
  });

  it('blocks a closed doorway but not the adjacent wall area', () => {
    const northPort = { x: 2, z: -5, outward: { x: 0, z: -1 } };
    expect(isDoorwayBlocked(northPort, { x: 2.4, z: -5.1 })).toBe(true);
    expect(isDoorwayBlocked(northPort, { x: 3.3, z: -5.1 })).toBe(false);
  });

  it('cannot tunnel through a thin closed door in one large frame', () => {
    const door = { x: 0, z: 0, outward: { x: 0, z: -1 } };
    const walkable = (x, z) => !isDoorwayBlocked(door, { x, z });
    const result = constrainWalkableMovement({ x: 0, z: 1 }, { x: 0, z: -1 }, walkable);
    expect(result.z).toBeGreaterThan(.26);
  });

  it('slides along a wall when diagonal movement is partially blocked', () => {
    const walkable = (x) => x < .5;
    const result = constrainWalkableMovement({ x: 0, z: 0 }, { x: 1, z: 1 }, walkable);
    expect(result.x).toBeLessThan(.5);
    expect(result.z).toBeCloseTo(1);
  });

  it('places arrivals inside the destination cabin and detects room-side exit', () => {
    const eastPort = { x: 10, z: 3, outward: { x: 1, z: 0 } };
    expect(elevatorCabinPosition(eastPort)).toEqual({ x: 11.65, z: 3 });
    expect(hasExitedElevator(eastPort, { x: 9.75, z: 3 })).toBe(true);
    expect(hasExitedElevator(eastPort, { x: 9.75, z: 8 })).toBe(true);
    expect(hasExitedElevator(eastPort, { x: 11.2, z: 3 })).toBe(false);
  });

  it('keeps an offset on the same visual side of oriented endpoint cabins', () => {
    const source = { x: 10, z: 3, outward: { x: 1, z: 0 } };
    const target = { x: -4, z: 8, outward: { x: 0, z: -1 } };

    expect(transferElevatorPosition(source, target, { x: 11.9, z: 3.45 })).toEqual({ x: -4.45, z: 7 });
  });

  it('rotates the rig with the cabin so a door-facing visitor still faces the door', () => {
    const source = { yaw: 0 };
    const target = { yaw: 180 };

    expect(transferElevatorYaw(source, target, 180)).toBe(360);
  });

  it('overlaps the inset room floor across an elevator threshold', () => {
    const northPort = { x: 0, z: -5, outward: { x: 0, z: -1 } };
    const room = { x: 0, z: 0, width: 9.55, depth: 9.55 };
    const elevator = elevatorWalkRegion(northPort, 'connection-1', 'room-a');
    const regions = [room, elevator];

    expect(isPointWalkable(regions, [], 0, -4.77)).toBe(true);
    expect(isPointWalkable(regions, [], 0, -4.9)).toBe(true);
    expect(isPointWalkable(regions, [], 0, -5.2)).toBe(true);
  });
});
