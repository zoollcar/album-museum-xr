export const TEXTURE_LIMITS = {
  lowMaxEdge: 512,
  mediumMaxEdge: 2048,
  mediumDistance: 8,
  originalDistance: 2,
  originalExitDistance: 2.5,
  gazeAngleDegrees: 30,
  originalDwellMs: 300,
  originalReleaseMs: 1000,
  maxOriginalTextures: 2
};

export function desiredTier({ distance, angleDegrees, gazeMs, isOriginal, gazeLostMs }, limits = TEXTURE_LIMITS) {
  if (isOriginal) {
    if (distance > limits.originalExitDistance || gazeLostMs >= limits.originalReleaseMs) return 'medium';
    return 'original';
  }
  if (distance <= limits.originalDistance && angleDegrees <= limits.gazeAngleDegrees && gazeMs >= limits.originalDwellMs) {
    return 'original';
  }
  if (distance <= limits.mediumDistance) return 'medium';
  return 'low';
}

export function sourceForTier(sources, tier) {
  if (tier === 'original') return { url: sources.original, maxEdge: null, derived: false };
  const url = sources[tier] || sources.original;
  return {
    url,
    maxEdge: sources[tier] ? null : tier === 'low' ? TEXTURE_LIMITS.lowMaxEdge : TEXTURE_LIMITS.mediumMaxEdge,
    derived: !sources[tier]
  };
}
