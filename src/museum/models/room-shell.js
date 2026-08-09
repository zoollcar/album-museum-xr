import { getTemplate } from '../templates.js';
import { getRoomTheme, surfaceMaterial } from '../themes.js';
import { box, entity, COLORS } from './primitives.js';

function wallDoorOpenings(room, wall, connectedDoorIds) {
  return getTemplate(room.template).doors
    .filter((door) => door.wall === wall && connectedDoorIds.has(door.id))
    .map((door) => ({ start: door.offset - 1.08, end: door.offset + 1.08, door }));
}

export function buildWall(parent, room, wall, connectedDoorIds) {
  const template = getTemplate(room.template);
  const theme = getRoomTheme(room);
  const horizontal = wall === 'north' || wall === 'south';
  const length = horizontal ? template.width : template.depth;
  const openings = wallDoorOpenings(room, wall, connectedDoorIds).sort((a, b) => a.start - b.start);
  const intervals = [];
  let cursor = -length / 2;
  for (const opening of openings) {
    if (opening.start > cursor) intervals.push([cursor, opening.start]);
    cursor = opening.end;
  }
  if (cursor < length / 2) intervals.push([cursor, length / 2]);
  for (const [start, end] of intervals) {
    const segmentLength = end - start;
    const center = (start + end) / 2;
    box(parent, {
      position: horizontal ? `${center} ${template.height / 2} ${wall === 'north' ? -template.depth / 2 : template.depth / 2}` : `${wall === 'west' ? -template.width / 2 : template.width / 2} ${template.height / 2} ${center}`,
      width: horizontal ? segmentLength : .24, height: template.height, depth: horizontal ? .24 : segmentLength,
      color: theme.wall.tint, shadow: false, collidable: true,
      material: surfaceMaterial(theme.wall, Math.max(1, segmentLength / theme.wall.repeatMeters), Math.max(1, template.height / theme.wall.repeatMeters))
    });
    box(parent, {
      position: horizontal ? `${center} .13 ${wall === 'north' ? -template.depth / 2 + .15 : template.depth / 2 - .15}` : `${wall === 'west' ? -template.width / 2 + .15 : template.width / 2 - .15} .13 ${center}`,
      width: horizontal ? segmentLength : .12, height: .26, depth: horizontal ? .12 : segmentLength,
      color: theme.trim, shadow: false,
      material: `color: ${theme.trim}; roughness: .8; metalness: ${theme.id === 'art-deco' ? .18 : 0}`
    });
  }
  for (const opening of openings) {
    const lintelHeight = template.height - 2.6;
    box(parent, {
      position: horizontal ? `${opening.door.offset} ${2.6 + lintelHeight / 2} ${wall === 'north' ? -template.depth / 2 : template.depth / 2}` : `${wall === 'west' ? -template.width / 2 : template.width / 2} ${2.6 + lintelHeight / 2} ${opening.door.offset}`,
      width: horizontal ? 2.16 : .24, height: lintelHeight, depth: horizontal ? .24 : 2.16,
      color: theme.wall.tint, shadow: false,
      material: surfaceMaterial(theme.wall, 1, 1)
    });
  }
}

export function buildSkylight(parent, template) {
  const openingWidth = template.width * .54;
  const openingDepth = template.depth * .48;
  const cofferY = template.height - .25;
  const borderX = (template.width - openingWidth) / 2;
  const borderZ = (template.depth - openingDepth) / 2;
  box(parent, { position: `0 ${cofferY} ${-(openingDepth + borderZ) / 2}`, width: template.width, height: .5, depth: borderZ, color: COLORS.ceiling, shadow: false });
  box(parent, { position: `0 ${cofferY} ${(openingDepth + borderZ) / 2}`, width: template.width, height: .5, depth: borderZ, color: COLORS.ceiling, shadow: false });
  box(parent, { position: `${-(openingWidth + borderX) / 2} ${cofferY} 0`, width: borderX, height: .5, depth: openingDepth, color: COLORS.ceiling, shadow: false });
  box(parent, { position: `${(openingWidth + borderX) / 2} ${cofferY} 0`, width: borderX, height: .5, depth: openingDepth, color: COLORS.ceiling, shadow: false });
  entity('a-plane', { position: `0 ${template.height + .05} 0`, rotation: '-90 0 0', width: openingWidth, height: openingDepth, material: 'color: #f2f5f3; emissive: #dce6e5; emissiveIntensity: .62; roughness: .16; side: double' }, parent);
  for (let i = 1; i < 5; i += 1) box(parent, { position: `${-openingWidth / 2 + i * openingWidth / 5} ${template.height} 0`, width: .026, height: .04, depth: openingDepth, color: '#a69d92', shadow: false });
  for (let i = 1; i < 4; i += 1) box(parent, { position: `0 ${template.height} ${-openingDepth / 2 + i * openingDepth / 4}`, width: openingWidth, height: .04, depth: .026, color: '#a69d92', shadow: false });
}

export function buildTrackLights(parent, template) {
  const xTracks = [-template.width * .34, template.width * .34];
  for (const x of xTracks) {
    box(parent, { position: `${x} ${template.height - .55} 0`, width: .025, height: .025, depth: template.depth * .74, color: '#3a3530', shadow: false });
    for (let index = -3; index <= 3; index += 1) {
      const z = index * template.depth * .1;
      entity('a-cylinder', { position: `${x} ${template.height - .67} ${z}`, radius: .055, height: .18, rotation: '90 0 0', material: 'color: #4b4540; emissive: #e8d7bd; emissiveIntensity: .2; roughness: .42' }, parent);
      entity('a-entity', { position: `${x} ${template.height - .73} ${z}`, light: 'type: point; color: #ffe2bd; intensity: .19; distance: 5.5; decay: 2' }, parent);
    }
  }
}
