import { describe, expect, it } from 'vitest';
import { desiredTier, sourceForTier } from '../src/museum/texture-policy.js';

describe('progressive texture policy', () => {
  it('selects low, medium and original by distance, gaze and dwell', () => {
    expect(desiredTier({ distance: 10, angleDegrees: 0, gazeMs: 0, isOriginal: false, gazeLostMs: 0 })).toBe('low');
    expect(desiredTier({ distance: 5, angleDegrees: 0, gazeMs: 0, isOriginal: false, gazeLostMs: 0 })).toBe('medium');
    expect(desiredTier({ distance: 1.5, angleDegrees: 12, gazeMs: 301, isOriginal: false, gazeLostMs: 0 })).toBe('original');
  });

  it('uses hysteresis before releasing an original texture', () => {
    expect(desiredTier({ distance: 2.2, angleDegrees: 40, gazeMs: 0, isOriginal: true, gazeLostMs: 800 })).toBe('original');
    expect(desiredTier({ distance: 2.6, angleDegrees: 0, gazeMs: 0, isOriginal: true, gazeLostMs: 0 })).toBe('medium');
    expect(desiredTier({ distance: 2.2, angleDegrees: 40, gazeMs: 0, isOriginal: true, gazeLostMs: 1000 })).toBe('medium');
  });

  it('falls back to the original URL with client resize when a tier URL is missing', () => {
    expect(sourceForTier({ original: 'original.jpg' }, 'low')).toEqual({ url: 'original.jpg', maxEdge: 512, derived: true });
    expect(sourceForTier({ original: 'original.jpg', medium: 'medium.webp' }, 'medium')).toEqual({ url: 'medium.webp', maxEdge: null, derived: false });
  });
});
