export function isPointWalkable(regions, colliders, x, z, padding = .2) {
  const inRegion = regions.some((region) => Math.abs(x - region.x) <= region.width / 2 && Math.abs(z - region.z) <= region.depth / 2);
  if (!inRegion) return false;
  return !colliders.some((collider) => x >= collider.minX - padding && x <= collider.maxX + padding && z >= collider.minZ - padding && z <= collider.maxZ + padding);
}

export function constrainWalkableMovement(start, end, isWalkable, maxStep = .08) {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / maxStep));
  const position = { x: start.x, z: start.z };
  const stepX = dx / steps;
  const stepZ = dz / steps;
  let blockX = false;
  let blockZ = false;

  for (let step = 0; step < steps; step += 1) {
    const target = {
      x: position.x + (blockX ? 0 : stepX),
      z: position.z + (blockZ ? 0 : stepZ)
    };
    if (isWalkable(target.x, target.z)) {
      position.x = target.x;
      position.z = target.z;
      continue;
    }

    // Preserve movement parallel to a wall instead of snapping the whole step back.
    if (!blockX && isWalkable(target.x, position.z)) position.x = target.x;
    else blockX = true;
    if (!blockZ && isWalkable(position.x, target.z)) position.z = target.z;
    else blockZ = true;
  }

  return position;
}

export function elevatorEntryDepth(port, position) {
  const dx = position.x - port.x;
  const dz = position.z - port.z;
  return {
    depth: dx * port.outward.x + dz * port.outward.z,
    lateral: Math.abs(dx * -port.outward.z + dz * port.outward.x)
  };
}

export function isInsideElevatorTrigger(port, position) {
  const { depth, lateral } = elevatorEntryDepth(port, position);
  return depth >= .72 && depth <= 2.72 && lateral <= .82;
}

export function elevatorCabinPosition(port, depth = 1.65) {
  return {
    x: port.x + port.outward.x * depth,
    z: port.z + port.outward.z * depth
  };
}

export function elevatorWalkRegion(port, connectionId, roomId) {
  const eastWest = Math.abs(port.outward.x) > .5;
  return {
    type: 'elevator',
    connectionId,
    roomId,
    x: port.x + port.outward.x * 1.25,
    z: port.z + port.outward.z * 1.25,
    // Extend half a metre through the doorway so the inset room region and
    // cabin floor overlap. The closed-door test still gates the threshold.
    width: eastWest ? 3.5 : 2.1,
    depth: eastWest ? 2.1 : 3.5
  };
}

export function hasExitedElevator(port, position, threshold = -.18) {
  const { depth } = elevatorEntryDepth(port, position);
  return depth <= threshold;
}

export function isDoorwayBlocked(port, position, halfWidth = 1.02, halfDepth = .26) {
  const dx = position.x - port.x;
  const dz = position.z - port.z;
  const depth = Math.abs(dx * port.outward.x + dz * port.outward.z);
  const lateral = Math.abs(dx * -port.outward.z + dz * port.outward.x);
  return depth <= halfDepth && lateral <= halfWidth;
}
