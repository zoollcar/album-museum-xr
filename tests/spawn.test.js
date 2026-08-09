import { describe, expect, it } from 'vitest';
import { isLocalDebugHost, parseSpawnRequest } from '../src/museum/spawn.js';

describe('local debug spawn parameters', () => {
  it('accepts localhost subdomains used by the app preview', () => {
    expect(isLocalDebugHost('app.localhost')).toBe(true);
    expect(isLocalDebugHost('museum.example.com')).toBe(false);
  });

  it('parses a door-side spawn with distance and yaw overrides', () => {
    const params = new URLSearchParams('spawn=cities.door-3&spawnSide=cabin&spawnDistance=2.6&spawnYaw=90');
    expect(parseSpawnRequest(params, 'app.localhost')).toEqual({
      roomId: 'cities', anchorId: 'door-3', side: 'cabin', distance: 2.6, yaw: 90
    });
  });

  it('keeps legacy preview parameters working locally', () => {
    const params = new URLSearchParams('previewRoom=coast&previewDoor=door-1');
    expect(parseSpawnRequest(params, 'localhost')).toMatchObject({ roomId: 'coast', anchorId: 'door-1', yaw: null });
  });

  it('does not enable debug spawning on public hosts', () => {
    expect(parseSpawnRequest(new URLSearchParams('spawn=cities'), 'museum.example.com')).toBeNull();
  });
});
