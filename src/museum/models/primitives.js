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

function disposeTexture(texture, released) {
  if (!texture || texture.userData?.managedProgressive || released.textures.has(texture)) return;
  released.textures.add(texture);
  const bitmap = texture.userData?.imageBitmap;
  if (bitmap && !released.bitmaps.has(bitmap)) {
    released.bitmaps.add(bitmap);
    bitmap.close?.();
  }
  texture.dispose?.();
}

export function disposeObject(object, released = {
  geometries: new WeakSet(), materials: new WeakSet(), textures: new WeakSet(), bitmaps: new WeakSet()
}) {
  if (object.geometry && !released.geometries.has(object.geometry)) {
    released.geometries.add(object.geometry);
    object.geometry.dispose?.();
  }
  if (!object.material) return;
  const materials = Array.isArray(object.material) ? object.material : [object.material];
  materials.forEach((material) => {
    if (!material || released.materials.has(material)) return;
    released.materials.add(material);
    for (const value of Object.values(material)) if (value?.isTexture) disposeTexture(value, released);
    material.dispose?.();
  });
}

export function disposeTree(root) {
  const released = {
    geometries: new WeakSet(), materials: new WeakSet(), textures: new WeakSet(), bitmaps: new WeakSet()
  };
  root.object3D?.traverse((object) => disposeObject(object, released));
}

export function createIncrementalTreeDisposer(root) {
  const released = {
    geometries: new WeakSet(), materials: new WeakSet(), textures: new WeakSet(), bitmaps: new WeakSet()
  };

  return () => {
    if (!root.parentNode) return true;
    let leaf = root;
    while (leaf.lastElementChild) leaf = leaf.lastElementChild;
    const manuallyOwned = !leaf.components?.geometry && leaf.object3DMap?.mesh;
    if (manuallyOwned) leaf.object3DMap.mesh.traverse((object) => disposeObject(object, released));
    leaf.remove();
    return leaf === root;
  };
}
