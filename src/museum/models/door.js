import { box, entity, COLORS } from './primitives.js';
import { textPlane } from './signage.js';

export function buildDoorModel({ parent, port, endpoint, destination, connection, onClick }) {
  const root = entity('a-entity', { position: `${port.x} 0 ${port.z}`, rotation: `0 ${-port.yaw} 0` }, parent);
  const frameMaterial = 'src: url(/museum-assets/white-oak-floor.jpg); color: #735037; repeat: 1 2; roughness: .76';
  box(root, { position: '-1.14 1.32 0', width: .18, height: 2.68, depth: .3, color: COLORS.bronze, shadow: false, material: frameMaterial });
  box(root, { position: '1.14 1.32 0', width: .18, height: 2.68, depth: .3, color: COLORS.bronze, shadow: false, material: frameMaterial });
  box(root, { position: '0 2.62 0', width: 2.46, height: .18, depth: .3, color: COLORS.bronze, shadow: false, material: frameMaterial });
  const hinge = entity('a-entity', { position: '-1.03 1.3 0' }, root);
  const panel = box(hinge, { position: '1.03 0 -.02', width: 2.06, height: 2.48, depth: .1, color: '#71472f', className: 'interactive museum-door', shadow: false, material: frameMaterial });
  box(panel, { position: '0 .48 -.061', width: 1.7, height: .9, depth: .025, color: '#5d3e2d', shadow: false });
  box(panel, { position: '0 -.58 -.061', width: 1.7, height: .9, depth: .025, color: '#5d3e2d', shadow: false });
  entity('a-cylinder', { position: '.72 0 -.11', rotation: '90 0 0', radius: .035, height: .08, material: 'color: #282522; metalness: .8; roughness: .3' }, panel);
  panel.setAttribute('tabindex', '0');
  panel.setAttribute('aria-label', `通往${destination.title}`);
  panel.addEventListener('click', onClick);
  textPlane(root, {
    position: '1.67 1.42 .19', width: .66, height: .46, signStyle: 'brass',
    title: endpoint.doorId.replace('door-', '').padStart(2, '0'),
    lines: [destination.title, connection.kind === 'elevator' ? 'ELEVATOR' : 'GALLERY']
  });
  return { root, hinge, panel, port };
}
