import { describe, expect, it } from 'vitest';
import { buildMuseumLayout, MAX_CORRIDOR, overlaps, roomRect, worldPort } from '../src/museum/layout.js';
import { museumConfig, room } from './fixtures.js';

describe('museum layout', () => {
  it('places every reachable room without user-authored coordinates', () => {
    const config = museumConfig({
      rooms: [room('small'), room('medium', 'gallery-medium'), room('large', 'gallery-large')],
      connections: [
        { from: 'lobby.door-1', to: 'small.door-1' },
        { from: 'lobby.door-3', to: 'medium.door-1' },
        { from: 'medium.door-3', to: 'large.door-1' }
      ]
    });
    const layout = buildMuseumLayout(config);
    expect([...layout.placements.keys()].sort()).toEqual(['large', 'lobby', 'medium', 'small']);
    expect(layout.connections.every((connection) => ['direct', 'corridor', 'elevator'].includes(connection.kind))).toBe(true);
  });

  it('uses an elevator when an existing-room cycle is too long', () => {
    const config = museumConfig({
      rooms: [room('a', 'gallery-medium'), room('b', 'gallery-medium')],
      connections: [
        { from: 'lobby.door-1', to: 'a.door-1' },
        { from: 'lobby.door-3', to: 'b.door-1' },
        { from: 'a.door-3', to: 'b.door-3' }
      ]
    });
    const layout = buildMuseumLayout(config);
    const cycle = layout.connections[2];
    expect(cycle.distance > MAX_CORRIDOR || cycle.kind === 'elevator').toBe(true);
    if (cycle.distance > MAX_CORRIDOR) expect(cycle.kind).toBe('elevator');
  });

  it('preserves an elevator style declared on a connection', () => {
    const config = museumConfig({
      rooms: [room('a')],
      connections: [{ from: 'lobby.door-1', to: 'a.door-1', elevatorDoorStyle: 'elevator-dark' }]
    });
    expect(buildMuseumLayout(config).connections[0].elevatorDoorStyle).toBe('elevator-dark');
  });

  it('rotates rooms so doors on the same wall face each other without overlap', () => {
    const config = museumConfig({
      rooms: [room('a', 'gallery-medium')],
      connections: [{ from: 'lobby.door-3', to: 'a.door-3' }]
    });
    const layout = buildMuseumLayout(config);
    const lobby = layout.rooms.get('lobby');
    const target = layout.rooms.get('a');
    const lobbyPlacement = layout.placements.get('lobby');
    const targetPlacement = layout.placements.get('a');
    const sourcePort = worldPort(lobby, lobbyPlacement, 'door-3');
    const targetPort = worldPort(target, targetPlacement, 'door-3');

    expect(targetPlacement.rotation).toBe(180);
    expect(targetPort.outward.x).toBeCloseTo(-sourcePort.outward.x);
    expect(targetPort.outward.z).toBeCloseTo(-sourcePort.outward.z);
    expect(overlaps(
      roomRect(lobby, lobbyPlacement.x, lobbyPlacement.z, lobbyPlacement.rotation),
      roomRect(target, targetPlacement.x, targetPlacement.z, targetPlacement.rotation)
    )).toBe(false);
    expect(layout.connections[0].kind).toBe('direct');
  });

  it('carries source-room rotation into chained door placement', () => {
    const config = museumConfig({
      rooms: [room('a', 'gallery-large'), room('b', 'gallery-medium')],
      connections: [
        { from: 'lobby.door-3', to: 'a.door-3' },
        { from: 'a.door-2', to: 'b.door-2' }
      ]
    });
    const layout = buildMuseumLayout(config);
    const aPort = worldPort(layout.rooms.get('a'), layout.placements.get('a'), 'door-2');
    const bPort = worldPort(layout.rooms.get('b'), layout.placements.get('b'), 'door-2');

    expect(aPort.outward.x).toBeCloseTo(-bPort.outward.x);
    expect(aPort.outward.z).toBeCloseTo(-bPort.outward.z);
  });
});
