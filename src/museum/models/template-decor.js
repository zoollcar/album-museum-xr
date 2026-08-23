import { buildArchiveCabinet, buildBench, buildDisplayCase, buildFloorLamp, buildPlant, buildSculpturePlinth } from './furniture.js';
import { buildArmillarySphere, buildMarbleBust } from './decorations.js';

export function buildTemplateDecor(parent, template, items) {
  for (const item of items) {
    const position = `${item.x} 0 ${item.z}`;
    if (item.type === 'bench') buildBench(parent, template, position);
    else if (item.type === 'plant') buildPlant(parent, position, { src: item.id === 'plant-west' ? '/museum-assets/olive-tree.png' : '/museum-assets/compact-fern.png', width: item.id === 'plant-west' ? 2.1 : 1.55, height: item.id === 'plant-west' ? 3.15 : 1.55, scale: item.id === 'plant-west' ? .78 : .75 });
    else if (item.type === 'archive-cabinet') buildArchiveCabinet(parent, position);
    else if (item.type === 'display-case') buildDisplayCase(parent, position, { accent: '#7a715d', artifact: 'stone' });
    else if (item.type === 'floor-lamp') buildFloorLamp(parent, position);
    else if (item.type === 'sculpture-plinth') buildSculpturePlinth(parent, position);
    else if (item.type === 'marble-bust') buildMarbleBust(parent, position, '0 24 0');
    else if (item.type === 'armillary-sphere') buildArmillarySphere(parent, position);
  }
}
