import { getDoorPort } from './templates.js';

const rect = (id, x, z, width, depth, type = 'item') => ({ id, x, z, width, depth, type });

export function rectanglesOverlap(a, b, padding = 0) {
  return Math.abs(a.x - b.x) < (a.width + b.width) / 2 + padding
    && Math.abs(a.z - b.z) < (a.depth + b.depth) / 2 + padding;
}

export function doorExitRect(room, doorId, depth = 3.15, width = 2.45) {
  const port = getDoorPort(room, doorId);
  return rect(`exit-${doorId}`, port.x + port.outward.x * depth / 2, port.z + port.outward.z * depth / 2,
    Math.abs(port.outward.x) ? depth : width, Math.abs(port.outward.x) ? width : depth, 'exit');
}

// Checks the first metres inside a room after leaving an elevator/door cabin.
// It is deliberately independent of A-Frame so configuration fixtures can
// catch a blocked arrival route in Vitest.
export function hasClearEntrancePath(room, doorId, items, distance = 3.25, step = .1) {
  const port = getDoorPort(room, doorId);
  for (let travelled = .12; travelled <= distance; travelled += step) {
    const point = rect('arrival', port.x - port.outward.x * travelled, port.z - port.outward.z * travelled, .4, .4, 'path');
    if (items.some((item) => rectanglesOverlap(point, item, 0))) return false;
  }
  return true;
}

function allowed(candidate, exits, placed) {
  return ![...exits, ...placed].some((other) => rectanglesOverlap(candidate, other, .18));
}

function wallSlot(template, wall, offset, y, maxWidth, maxHeight) {
  if (wall === 'north' || wall === 'south') return { wall, offset, y, maxWidth, maxHeight, x: offset, z: wall === 'north' ? -template.depth / 2 + .145 : template.depth / 2 - .145, rotation: wall === 'north' ? '0 0 0' : '0 180 0' };
  return { wall, offset, y, maxWidth, maxHeight, x: wall === 'west' ? -template.width / 2 + .145 : template.width / 2 - .145, z: offset, rotation: wall === 'west' ? '0 90 0' : '0 -90 0' };
}

export function photoSlots(template, connectedDoorIds) {
  const slots = [];
  for (const spec of template.layout.photoWalls) {
    const length = spec.wall === 'north' || spec.wall === 'south' ? template.width : template.depth;
    const count = Math.max(2, Math.floor((length - 2) / 2.25));
    for (const y of spec.rows) for (let index = 0; index < count; index += 1) {
      const offset = -length / 2 + 1.35 + index * ((length - 2.7) / Math.max(1, count - 1));
      const nearDoor = template.doors.some((door) => door.wall === spec.wall && connectedDoorIds.has(door.id) && Math.abs(offset - door.offset) < template.layout.wallDoorClearance);
      if (!nearDoor) slots.push(wallSlot(template, spec.wall, offset, y, index % 4 === 1 ? 2.35 : 1.72, index % 4 === 1 ? 1.5 : 1.32));
    }
  }
  return slots.slice(0, template.maxPhotos);
}

function lobbyPlan(room, template, exits) {
  const items = [];
  const add = (item) => { if (allowed(item, exits, items)) items.push(item); };
  add(rect('bench', 0, 2.55, 3.15, .78, 'bench'));
  add(rect('display-case', 5.65, 3.65, 1.18, 1.18, 'display-case'));
  add(rect('plant-west', -6.55, -4.75, .7, .7, 'plant'));
  add(rect('plant-east', 6.15, -3.8, .7, .7, 'plant'));
  return {
    exits, items,
    hero: wallSlot(template, 'east', 3.7, 2.2, 3.9, 2.8),
    signage: {
      headline: { position: `0 3.35 ${-template.depth / 2 + .16}`, rotation: '0 0 0', width: 5.8, height: 1.2, signStyle: 'slogan' },
      welcome: { position: `${-template.width / 2 + .16} 1.55 -3.65`, rotation: '0 90 0', width: 2.65, height: 1.65, signStyle: 'wall-label' }
    }
  };
}

function decorCandidates(template, theme) {
  const x = template.width / 2 - 1.35;
  const z = template.depth / 2 - 1.35;
  const common = theme === 'botanical'
    ? [{ type: 'archive-cabinet', width: 2.2, depth: .52 }, { type: 'display-case', width: 1.18, depth: 1.18 }]
    : theme === 'art-deco'
      ? [{ type: 'sculpture-plinth', width: .78, depth: .78 }, { type: 'floor-lamp', width: .6, depth: .6 }]
      : [{ type: 'marble-bust', width: .82, depth: .82 }, { type: 'armillary-sphere', width: .84, depth: .84 }];
  return common.map((item, index) => ({ ...item, id: `decor-${index + 1}`, candidates: index ? [[x, z], [x, -z], [-x, z]] : [[-x, z], [x, z], [-x, -z]] }));
}

function galleryPlan(room, template, connectedDoorIds, theme) {
  const exits = [...connectedDoorIds].map((id) => doorExitRect(room, id));
  const items = [];
  for (const decor of decorCandidates(template, theme)) {
    const point = decor.candidates.find(([x, z]) => allowed(rect(decor.id, x, z, decor.width, decor.depth, decor.type), exits, items));
    if (point) items.push(rect(decor.id, point[0], point[1], decor.width, decor.depth, decor.type));
  }
  return {
    exits, items, slots: photoSlots(template, connectedDoorIds),
    signage: { headline: { position: `${-template.width * .28} ${template.height - .82} ${-template.depth / 2 + .135}`, rotation: '0 0 0', width: Math.min(6.4, template.width * .48), height: .9, signStyle: 'slogan' } }
  };
}

export function planRoomLayout(room, template, connectedDoorIds, theme = 'classic') {
  const exits = [...connectedDoorIds].map((id) => doorExitRect(room, id));
  return template.kind === 'lobby' ? lobbyPlan(room, template, exits) : galleryPlan(room, template, connectedDoorIds, theme);
}
