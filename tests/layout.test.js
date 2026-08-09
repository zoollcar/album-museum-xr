import { describe, expect, it } from 'vitest';
import { buildMuseumLayout, MAX_CORRIDOR } from '../src/museum/layout.js';
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
});
