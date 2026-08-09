import { describe, expect, it } from 'vitest';
import { DECOR_TEXTURES } from '../src/museum/models/decorations.js';

describe('museum decoration textures', () => {
  it('maps each generated material to a unique project asset', () => {
    const textures = Object.values(DECOR_TEXTURES);
    expect(new Set(textures).size).toBe(4);
    expect(textures.every((path) => path.startsWith('/museum-assets/material-') && path.endsWith('.webp'))).toBe(true);
  });
});
