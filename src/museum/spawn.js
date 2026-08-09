export function isLocalDebugHost(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname.endsWith('.localhost');
}

export function parseSpawnRequest(params, hostname) {
  if (!isLocalDebugHost(hostname)) return null;
  let value = params.get('spawn');
  if (!value && params.get('previewRoom')) {
    value = [params.get('previewRoom'), params.get('previewDoor')].filter(Boolean).join('.');
  }
  if (!value) return null;

  const marker = value.indexOf('.');
  const roomId = marker < 0 ? value : value.slice(0, marker);
  const anchorId = marker < 0 ? null : value.slice(marker + 1);
  if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(roomId) || (anchorId && !/^[a-zA-Z0-9_-]+$/.test(anchorId))) return null;

  const requestedSide = params.get('spawnSide');
  const side = ['inside', 'cabin'].includes(requestedSide) ? requestedSide : 'inside';
  const rawDistance = Number(params.get('spawnDistance'));
  const distance = Number.isFinite(rawDistance) && rawDistance > 0 ? Math.min(8, Math.max(.6, rawDistance)) : null;
  const yawValue = params.get('spawnYaw');
  const rawYaw = yawValue === null ? Number.NaN : Number(yawValue);

  return {
    roomId,
    anchorId,
    side,
    distance,
    yaw: Number.isFinite(rawYaw) ? rawYaw : null
  };
}
