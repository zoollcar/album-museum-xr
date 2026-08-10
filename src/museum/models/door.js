import { box, entity } from './primitives.js';
import { textPlane } from './signage.js';
import { resolveDoorStyle } from './door-styles.js';

function makeInteractive(panel, destination, onClick) {
  panel.setAttribute('tabindex', '0');
  panel.setAttribute('aria-label', `通往${destination.title}`);
  panel.addEventListener('click', onClick);
}

export function buildSlidingDoorFacade(parent, style, { interactive = false, destination = null, onClick = null } = {}) {
  box(parent, { position: '-1.14 1.32 0', width: .18, height: 2.68, depth: .28, shadow: false, material: style.frame });
  box(parent, { position: '1.14 1.32 0', width: .18, height: 2.68, depth: .28, shadow: false, material: style.frame });
  box(parent, { position: '0 2.62 0', width: 2.46, height: .18, depth: .28, shadow: false, material: style.frame });
  const left = box(parent, {
    position: '-.515 1.3 -.02', width: 1.03, height: 2.48, depth: .09,
    className: interactive ? 'interactive museum-door' : '', shadow: false, material: style.leaf
  });
  const right = box(parent, {
    position: '.515 1.3 -.02', width: 1.03, height: 2.48, depth: .09,
    className: interactive ? 'interactive museum-door' : '', shadow: false, material: style.leaf
  });
  box(left, { position: '.505 0 -.052', width: .018, height: 2.38, depth: .012, color: style.seam, shadow: false });
  box(right, { position: '-.505 0 -.052', width: .018, height: 2.38, depth: .012, color: style.seam, shadow: false });
  box(parent, { position: '0 2.82 -.01', width: .54, height: .075, depth: .05, color: style.accent, shadow: false });
  if (interactive) {
    makeInteractive(left, destination, onClick);
    makeInteractive(right, destination, onClick);
  }
  return {
    motion: 'sliding',
    panels: [
      { element: left, closed: '-.515 1.3 -.02', open: '-1.06 1.3 -.02' },
      { element: right, closed: '.515 1.3 -.02', open: '1.06 1.3 -.02' }
    ],
    panel: left
  };
}

export function buildDoorModel({ parent, port, endpoint, destination, connection, room, styleId = null, onClick }) {
  const root = entity('a-entity', { position: `${port.x} 0 ${port.z}`, rotation: `0 ${-port.yaw} 0` }, parent);
  const style = resolveDoorStyle(room, connection.kind, styleId);
  let model;
  if (style.kind === 'sliding') model = buildSlidingDoorFacade(root, style, { interactive: true, destination, onClick });
  else {
    box(root, { position: '-1.14 1.32 0', width: .18, height: 2.68, depth: .3, shadow: false, material: style.frame });
    box(root, { position: '1.14 1.32 0', width: .18, height: 2.68, depth: .3, shadow: false, material: style.frame });
    box(root, { position: '0 2.62 0', width: 2.46, height: .18, depth: .3, shadow: false, material: style.frame });
    const hinge = entity('a-entity', { position: '-1.03 1.3 0' }, root);
    const panel = box(hinge, { position: '1.03 0 -.02', width: 2.06, height: 2.48, depth: .1, className: 'interactive museum-door', shadow: false, material: style.leaf });
    box(panel, { position: '0 .48 -.061', width: 1.7, height: .9, depth: .025, color: style.inset, shadow: false });
    box(panel, { position: '0 -.58 -.061', width: 1.7, height: .9, depth: .025, color: style.inset, shadow: false });
    entity('a-cylinder', { position: '.72 0 -.11', rotation: '90 0 0', radius: .035, height: .08, material: `color: ${style.hardware}; metalness: .8; roughness: .3` }, panel);
    makeInteractive(panel, destination, onClick);
    model = { motion: 'hinged', hinge, panel };
  }
  textPlane(root, {
    position: '1.67 1.42 .19', width: .66, height: .46, signStyle: 'brass',
    title: endpoint.doorId.replace('door-', '').padStart(2, '0'),
    lines: [destination.title, connection.kind === 'elevator' ? 'ELEVATOR' : 'GALLERY']
  });
  root.dataset.doorStyle = style.id;
  return { root, ...model, port, style };
}
