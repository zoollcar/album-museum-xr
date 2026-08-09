import { box, entity } from './primitives.js';

export function buildBench(parent, template) {
  const z = template.kind === 'lobby' ? 2.2 : 0;
  const group = entity('a-entity', { position: `0 0 ${z}` }, parent);
  box(group, { position: '0 .5 0', width: 3.15, height: .16, depth: .78, color: '#8f8174', material: 'color: #94877b; roughness: .96', collidable: true });
  box(group, { position: '0 .37 0', width: 2.95, height: .2, depth: .66, color: '#886a4e', material: 'src: url(/museum-assets/white-oak-floor.jpg); color: #8f7358; repeat: 2 1; roughness: .82' });
  for (const x of [-1.28, 1.28]) for (const dz of [-.25, .25]) {
    box(group, { position: `${x} .2 ${dz}`, width: .1, height: .4, depth: .1, color: '#604630', shadow: true });
  }
  return group;
}

export function buildPlant(parent, position, { src, width, height, scale = 1 }) {
  const group = entity('a-entity', { position, scale: `${scale} ${scale} ${scale}` }, parent);
  const pot = entity('a-cylinder', {
    position: '0 .28 0', radius: .28, height: .56,
    material: 'color: #aaa096; roughness: .88; metalness: 0', shadow: 'cast: true; receive: true'
  }, group);
  pot.classList.add('museum-collider');
  const material = `shader: flat; src: url(${src}); transparent: true; alphaTest: 0.08; side: double; depthWrite: true`;
  entity('a-plane', { position: `0 ${height / 2} 0`, width, height, material }, group);
  entity('a-plane', { position: `0 ${height / 2} 0`, rotation: '0 90 0', width, height, material }, group);
  return group;
}

export function buildArchiveCabinet(parent, position, rotation = '0 0 0') {
  const group = entity('a-entity', { position, rotation }, parent);
  box(group, { position: '0 .72 0', width: 2.2, height: 1.42, depth: .52, color: '#6f5138', material: 'color: #70523a; roughness: .84', collidable: true });
  for (let row = 0; row < 4; row += 1) for (let column = 0; column < 3; column += 1) {
    const x = (column - 1) * .68;
    const y = .31 + row * .28;
    box(group, { position: `${x} ${y} .271`, width: .61, height: .22, depth: .025, color: '#8b694b', shadow: false });
    box(group, { position: `${x} ${y} .292`, width: .16, height: .035, depth: .04, color: '#a9874f', shadow: false, material: 'color: #a9874f; metalness: .55; roughness: .35' });
  }
  box(group, { position: '0 1.48 0', width: 2.32, height: .1, depth: .6, color: '#49372b' });
  return group;
}

export function buildDisplayCase(parent, position, { accent = '#88704e', artifact = 'vessel' } = {}) {
  const group = entity('a-entity', { position }, parent);
  box(group, { position: '0 .18 0', width: 1.18, height: .36, depth: 1.18, color: accent, collidable: true, material: `color: ${accent}; roughness: .72` });
  box(group, { position: '0 1.56 0', width: 1.13, height: .08, depth: 1.13, color: '#6d604e', shadow: false });
  for (const x of [-.54, .54]) for (const z of [-.54, .54]) box(group, { position: `${x} .92 ${z}`, width: .035, height: 1.44, depth: .035, color: '#aa9470', shadow: false, material: 'color: #aa9470; metalness: .5; roughness: .3' });
  for (const [positionValue, width, height, rotationValue] of [
    ['0 .92 -.56', 1.08, 1.36, '0 0 0'], ['0 .92 .56', 1.08, 1.36, '0 180 0'],
    ['-.56 .92 0', 1.08, 1.36, '0 90 0'], ['.56 .92 0', 1.08, 1.36, '0 -90 0']
  ]) entity('a-plane', { position: positionValue, width, height, rotation: rotationValue, material: 'color: #dce9e8; transparent: true; opacity: .13; roughness: .12; metalness: .05; side: double', shadow: 'cast: false; receive: false' }, group);
  if (artifact === 'vessel') {
    entity('a-cylinder', { position: '0 .57 0', radius: '.23', 'radius-top': '.14', height: '.55', material: 'color: #b76f4d; roughness: .72', shadow: 'cast: true; receive: true' }, group);
    entity('a-torus', { position: '0 .88 0', rotation: '90 0 0', radius: '.13', 'radius-tubular': '.035', material: 'color: #b76f4d; roughness: .72' }, group);
  } else {
    entity('a-dodecahedron', { position: '0 .73 0', radius: '.34', material: 'color: #d4c2a2; roughness: .88', shadow: 'cast: true; receive: true' }, group);
  }
  return group;
}

export function buildSculpturePlinth(parent, position) {
  const group = entity('a-entity', { position }, parent);
  box(group, { position: '0 .52 0', width: .78, height: 1.04, depth: .78, color: '#d9d1c5', material: 'color: #d9d1c5; roughness: .92', collidable: true });
  entity('a-torus', { position: '0 1.47 0', rotation: '12 28 0', radius: '.38', 'radius-tubular': '.075', material: 'color: #9d7b45; metalness: .62; roughness: .3', shadow: 'cast: true; receive: true' }, group);
  entity('a-torus', { position: '0 1.47 0', rotation: '68 0 18', radius: '.28', 'radius-tubular': '.055', material: 'color: #253d45; metalness: .35; roughness: .42', shadow: 'cast: true; receive: true' }, group);
  return group;
}

export function buildFloorLamp(parent, position) {
  const group = entity('a-entity', { position }, parent);
  entity('a-cylinder', { position: '0 .06 0', radius: '.3', height: '.12', material: 'color: #6f5836; metalness: .55; roughness: .35' }, group).classList.add('museum-collider');
  entity('a-cylinder', { position: '0 1.05 0', radius: '.025', height: '2', material: 'color: #8e7144; metalness: .62; roughness: .3' }, group);
  entity('a-cone', { position: '0 2.02 0', radius: '.34', 'radius-top': '.18', height: '.48', material: 'color: #e9d7b5; emissive: #d9b77b; emissiveIntensity: .18; roughness: .72; side: double' }, group);
  entity('a-entity', { position: '0 1.82 0', light: 'type: point; color: #ffd7a0; intensity: .34; distance: 4.2; decay: 2' }, group);
  return group;
}

export function buildDecorCollection(parent, template, themeId) {
  const x = template.width / 2 - 1.05;
  const z = -template.depth / 2 + 1.05;
  if (themeId === 'botanical') {
    buildArchiveCabinet(parent, `0 0 ${-template.depth / 2 + .38}`);
    buildDisplayCase(parent, `${-x} 0 ${z}`, { accent: '#7a715d', artifact: 'stone' });
  } else if (themeId === 'art-deco') {
    buildSculpturePlinth(parent, `${-x} 0 ${z}`);
    buildFloorLamp(parent, `${x} 0 ${z}`);
    buildDisplayCase(parent, `${x} 0 ${template.depth / 2 - 1.15}`, { accent: '#5d4a35', artifact: 'vessel' });
  } else if (themeId === 'terrazzo') {
    buildSculpturePlinth(parent, `${-x} 0 ${z}`);
  } else if (template.kind === 'lobby') {
    buildDisplayCase(parent, '0 0 -4.7', { accent: '#846f56', artifact: 'stone' });
  }
}
