import { box, entity } from './primitives.js';

export const DECOR_TEXTURES = {
  marble: '/museum-assets/material-marble-warm.webp',
  celadon: '/museum-assets/material-celadon-crackle.webp',
  bronze: '/museum-assets/material-bronze-patina.webp',
  rug: '/museum-assets/material-rug-burgundy.webp'
};

const marbleMaterial = `src: url(${DECOR_TEXTURES.marble}); color: #f5f0e6; repeat: 1 1; roughness: .72; metalness: 0`;
const celadonMaterial = `src: url(${DECOR_TEXTURES.celadon}); color: #dfe9dd; repeat: 1 1; roughness: .38; metalness: 0`;
const bronzeMaterial = `src: url(${DECOR_TEXTURES.bronze}); color: #c2a477; repeat: 1 1; roughness: .52; metalness: .48`;

export function buildMarbleBust(parent, position, rotation = '0 0 0') {
  const group = entity('a-entity', { position, rotation }, parent);
  box(group, { position: '0 .48 0', width: .72, height: .96, depth: .72, color: '#eee7dc', material: marbleMaterial, collidable: true });
  box(group, { position: '0 .99 0', width: .82, height: .08, depth: .82, color: '#eee7dc', material: marbleMaterial });
  entity('a-sphere', { position: '0 1.25 0', radius: '.42', scale: '1.22 .65 .72', material: marbleMaterial, shadow: 'cast: true; receive: true' }, group);
  entity('a-cylinder', { position: '0 1.5 0', radius: '.14', height: '.28', material: marbleMaterial, shadow: 'cast: true; receive: true' }, group);
  entity('a-sphere', { position: '0 1.82 0', radius: '.3', scale: '.82 1.08 .86', material: marbleMaterial, shadow: 'cast: true; receive: true' }, group);
  entity('a-sphere', { position: '0 1.84 -.245', radius: '.075', scale: '.7 .55 1.15', material: marbleMaterial, shadow: 'cast: true; receive: true' }, group);
  entity('a-sphere', { position: '-.29 1.82 0', radius: '.075', scale: '.55 1 .72', material: marbleMaterial }, group);
  entity('a-sphere', { position: '.29 1.82 0', radius: '.075', scale: '.55 1 .72', material: marbleMaterial }, group);
  return group;
}

function ceramicVessel(parent, x, scale, profile = 'round') {
  const group = entity('a-entity', { position: `${x} .8 0`, scale: `${scale} ${scale} ${scale}` }, parent);
  if (profile === 'round') entity('a-sphere', { position: '0 .25 0', radius: '.34', scale: '1 .82 1', material: celadonMaterial, shadow: 'cast: true; receive: true' }, group);
  else entity('a-cylinder', { position: '0 .25 0', radius: '.28', 'radius-top': '.18', height: '.62', material: celadonMaterial, shadow: 'cast: true; receive: true' }, group);
  entity('a-cylinder', { position: '0 .54 0', radius: '.14', height: '.26', material: celadonMaterial, shadow: 'cast: true; receive: true' }, group);
  entity('a-torus', { position: '0 .68 0', rotation: '90 0 0', radius: '.14', 'radius-tubular': '.025', material: celadonMaterial }, group);
}

export function buildCeladonVesselGroup(parent, position) {
  const group = entity('a-entity', { position }, parent);
  box(group, { position: '0 .42 0', width: 1.75, height: .84, depth: .68, color: '#6e5946', material: 'color: #6e5946; roughness: .84', collidable: true });
  box(group, { position: '0 .87 0', width: 1.84, height: .07, depth: .76, color: '#4f4034' });
  ceramicVessel(group, '-.52', .7, 'round');
  ceramicVessel(group, '0', .92, 'tall');
  ceramicVessel(group, '.54', .58, 'round');
  return group;
}

export function buildArmillarySphere(parent, position) {
  const group = entity('a-entity', { position }, parent);
  entity('a-cylinder', { position: '0 .1 0', radius: '.42', height: '.2', material: bronzeMaterial, shadow: 'cast: true; receive: true' }, group).classList.add('museum-collider');
  entity('a-cylinder', { position: '0 .75 0', radius: '.045', height: '1.22', material: bronzeMaterial, shadow: 'cast: true; receive: true' }, group);
  entity('a-sphere', { position: '0 1.52 0', radius: '.22', material: 'color: #263f43; roughness: .72; metalness: .18', shadow: 'cast: true; receive: true' }, group);
  for (const rotation of ['0 0 0', '90 0 0', '35 55 20', '65 -35 28']) {
    entity('a-torus', { position: '0 1.52 0', rotation, radius: '.52', 'radius-tubular': '.025', material: bronzeMaterial, shadow: 'cast: true; receive: true' }, group);
  }
  entity('a-cylinder', { position: '0 2.06 0', radius: '.045', height: '.16', material: bronzeMaterial }, group);
  return group;
}

export function buildGalleryRug(parent, position = '0 .018 0', width = 4.4, depth = 3.2) {
  return entity('a-plane', {
    position, rotation: '-90 0 0', width, height: depth,
    material: `src: url(${DECOR_TEXTURES.rug}); color: #c9ada1; repeat: 1 1; roughness: .96; metalness: 0; side: double`,
    shadow: 'cast: false; receive: true'
  }, parent);
}

export function buildRopeBarrier(parent, position, rotation = '0 0 0') {
  const group = entity('a-entity', { position, rotation }, parent);
  for (const x of [-1.15, 0, 1.15]) {
    entity('a-cylinder', { position: `${x} .06 0`, radius: '.22', height: '.12', material: bronzeMaterial }, group).classList.add('museum-collider');
    entity('a-cylinder', { position: `${x} .48 0`, radius: '.035', height: '.78', material: bronzeMaterial }, group);
    entity('a-sphere', { position: `${x} .9 0`, radius: '.09', material: bronzeMaterial }, group);
  }
  for (const x of [-.575, .575]) entity('a-cylinder', {
    position: `${x} .73 0`, rotation: '0 0 90', radius: '.027', height: '1.15',
    material: 'color: #6f2028; roughness: .9', shadow: 'cast: true; receive: true'
  }, group);
  return group;
}

export function additionalDecorSteps(parent, template, themeId) {
  const x = template.width / 2 - 1.15;
  const northZ = -template.depth / 2 + 1.2;
  const southZ = template.depth / 2 - 1.25;
  const steps = [];
  if (template.kind === 'lobby') {
    steps.push(() => buildGalleryRug(parent, '0 .018 2.2', 4.8, 3.1));
    steps.push(() => buildRopeBarrier(parent, '0 0 -3.75'));
    return steps;
  }
  if (themeId === 'botanical') {
    steps.push(() => buildCeladonVesselGroup(parent, `${x - .2} 0 ${northZ}`));
    steps.push(() => buildMarbleBust(parent, `${-x} 0 ${southZ}`, '0 28 0'));
  } else if (themeId === 'art-deco') {
    steps.push(() => buildGalleryRug(parent, '0 .018 0', 4.6, 3.35));
    steps.push(() => buildArmillarySphere(parent, `${-x} 0 ${southZ}`));
  } else if (themeId === 'modern') {
    steps.push(() => buildMarbleBust(parent, `${-x} 0 ${northZ}`, '0 24 0'));
    steps.push(() => buildCeladonVesselGroup(parent, `${x - .2} 0 ${northZ}`));
  } else {
    steps.push(() => buildGalleryRug(parent, '0 .018 0', 4.25, 3.05));
    steps.push(() => buildMarbleBust(parent, `${-x} 0 ${northZ}`, '0 24 0'));
    steps.push(() => buildArmillarySphere(parent, `${x} 0 ${northZ}`));
  }
  return steps;
}

export function buildAdditionalDecor(parent, template, themeId) {
  for (const step of additionalDecorSteps(parent, template, themeId)) step();
}
