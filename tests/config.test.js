import { describe, expect, it } from 'vitest';
import { validateMuseumConfig } from '../src/config/validate.js';
import { museumConfig, photo, room } from './fixtures.js';

describe('museum config validation', () => {
  it('accepts a minimum museum with original-only photos', () => {
    expect(validateMuseumConfig(museumConfig())).toEqual({ valid: true, errors: [] });
  });

  it('accepts all three progressive image URLs and empty captions', () => {
    const config = museumConfig({
      rooms: [room('room-a', 'gallery-small', [{
        sources: {
          original: 'https://r2.example.com/photo.jpg',
          medium: 'https://r2.example.com/photo-2048.webp',
          low: 'https://r2.example.com/photo-512.webp'
        }
      }])]
    });
    expect(validateMuseumConfig(config).valid).toBe(true);
  });

  it('accepts museum room themes and rejects unknown themes', () => {
    const themed = museumConfig({ rooms: [{ ...room('room-a'), theme: 'botanical' }] });
    expect(validateMuseumConfig(themed).valid).toBe(true);
    themed.rooms[0].theme = 'neon-space';
    expect(validateMuseumConfig(themed).valid).toBe(false);
  });

  it('rejects illegal and reused door numbers', () => {
    const config = museumConfig({
      rooms: [room('room-a'), room('room-b')],
      connections: [
        { from: 'lobby.door-1', to: 'room-a.door-3' },
        { from: 'lobby.door-1', to: 'room-b.door-1' }
      ]
    });
    const result = validateMuseumConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors.join('\n')).toContain('没有 door-3');
    expect(result.errors.join('\n')).toContain('被重复连接');
  });

  it('enforces per-template photo capacity', () => {
    const config = museumConfig({ rooms: [room('room-a', 'gallery-small', Array.from({ length: 17 }, () => photo()))] });
    const result = validateMuseumConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors.join('\n')).toContain('超过 gallery-small 的 16 张上限');
  });

  it('rejects rooms that cannot be reached from the lobby', () => {
    const config = museumConfig({ rooms: [room('room-a'), room('room-b')] });
    const result = validateMuseumConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors.join('\n')).toContain('room-b');
    expect(result.errors.join('\n')).toContain('无法从大厅到达');
  });
});
