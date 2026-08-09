const port = (id, wall, offset = 0) => ({ id: `door-${id}`, wall, offset });

export const TEMPLATE_DEFINITIONS = {
  'lobby-atrium': {
    id: 'lobby-atrium',
    kind: 'lobby',
    width: 18,
    depth: 14,
    height: 5,
    maxBlocks: 0,
    maxPhotos: 1,
    doors: [
      port(1, 'north', -4.5), port(2, 'north', 4.5),
      port(3, 'east'),
      port(4, 'south', 4.5), port(5, 'south', -4.5),
      port(6, 'west')
    ],
    palette: { wall: '#eee4d7', floor: '#b58a61', accent: '#8e704c' }
  },
  'gallery-small': {
    id: 'gallery-small',
    kind: 'gallery',
    width: 14,
    depth: 10,
    height: 4.5,
    maxBlocks: 2,
    maxPhotos: 16,
    doors: [port(1, 'west'), port(2, 'east')],
    palette: { wall: '#f0e7dc', floor: '#aa7d54', accent: '#876947' }
  },
  'gallery-medium': {
    id: 'gallery-medium',
    kind: 'gallery',
    width: 18,
    depth: 12,
    height: 5,
    maxBlocks: 3,
    maxPhotos: 24,
    doors: [port(1, 'west'), port(2, 'north'), port(3, 'east')],
    palette: { wall: '#f1e8dc', floor: '#ae825b', accent: '#8f704c' }
  },
  'gallery-large': {
    id: 'gallery-large',
    kind: 'gallery',
    width: 22,
    depth: 16,
    height: 5.5,
    maxBlocks: 4,
    maxPhotos: 36,
    doors: [port(1, 'west'), port(2, 'north'), port(3, 'east'), port(4, 'south')],
    palette: { wall: '#f2e9de', floor: '#b18660', accent: '#8d704d' }
  }
};

export function getTemplate(id) {
  return TEMPLATE_DEFINITIONS[id];
}

export function getDoorPort(room, doorId) {
  const template = getTemplate(room.template);
  const definition = template?.doors.find((door) => door.id === doorId);
  if (!definition) return null;
  const halfW = template.width / 2;
  const halfD = template.depth / 2;
  const positions = {
    north: { x: definition.offset, z: -halfD, outward: { x: 0, z: -1 }, yaw: 0 },
    east: { x: halfW, z: definition.offset, outward: { x: 1, z: 0 }, yaw: 90 },
    south: { x: definition.offset, z: halfD, outward: { x: 0, z: 1 }, yaw: 180 },
    west: { x: -halfW, z: definition.offset, outward: { x: -1, z: 0 }, yaw: -90 }
  };
  return { ...definition, ...positions[definition.wall] };
}

export function roomPhotoCount(room) {
  return (room.blocks || []).reduce((total, block) => total + block.photos.length, 0);
}
