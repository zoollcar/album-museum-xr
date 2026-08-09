export const COLORS = {
  wall: '#e8dfd4', wallSide: '#d8ccbf', floor: '#a68a70', floorLine: '#76583f',
  ceiling: '#f1ece6', bronze: '#745737', frame: '#302a25', mat: '#eeeae3',
  plaque: '#6d5438', ink: '#29231e', green: '#60725a', leaf: '#718268', pot: '#b7aa98'
};

export function entity(tag = 'a-entity', attrs = {}, parent) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value !== undefined && value !== null) el.setAttribute(key, typeof value === 'object' ? value : String(value));
  }
  parent?.appendChild(el);
  return el;
}

export function box(parent, {
  position, width, height, depth, color, rotation, shadow = true,
  className = '', material = null, collidable = false
}) {
  const el = entity('a-box', {
    position, width, height, depth, rotation,
    material: material || `color: ${color}; roughness: 0.72; metalness: ${color === COLORS.bronze ? 0.28 : 0}`,
    shadow: shadow ? 'cast: true; receive: true' : 'cast: false; receive: true'
  }, parent);
  if (className) el.className = className;
  if (collidable) el.classList.add('museum-collider');
  return el;
}

export function disposeTree(root) {
  root.object3D?.traverse((object) => {
    object.geometry?.dispose?.();
    if (!object.material) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => {
      if (material.map && !material.map.userData?.managedProgressive) material.map.dispose?.();
      material.dispose?.();
    });
  });
}
