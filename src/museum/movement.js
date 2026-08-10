export function resolvePlanarMovement(cameraDirection, forwardAmount, rightAmount) {
  const length = Math.hypot(cameraDirection.x, cameraDirection.z) || 1;
  // A-Frame's camera entity reports its local +Z axis; the viewer looks down -Z.
  const forwardX = -cameraDirection.x / length;
  const forwardZ = -cameraDirection.z / length;
  const rightX = -forwardZ;
  const rightZ = forwardX;
  let x = forwardX * forwardAmount + rightX * rightAmount;
  let z = forwardZ * forwardAmount + rightZ * rightAmount;
  const movementLength = Math.hypot(x, z);
  if (movementLength > 1) {
    x /= movementLength;
    z /= movementLength;
  }
  return { x, z };
}

export function movementAxesFromDirections(directions) {
  const active = directions instanceof Set ? directions : new Set(directions || []);
  return {
    forward: Number(active.has('forward')) - Number(active.has('backward')),
    right: Number(active.has('right')) - Number(active.has('left'))
  };
}
