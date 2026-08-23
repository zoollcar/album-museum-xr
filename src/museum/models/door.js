import { box, entity } from './primitives.js';
import { textPlane } from './signage.js';
import { resolveDoorStyle } from './door-styles.js';

function buildDoorLoadIndicator(parent) {
  const root = entity('a-entity', { position: '0 1.42 .2', visible: false }, parent);
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const context = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide, depthWrite: false, toneMapped: false });
  const label = entity('a-entity', {}, root);
  label.setObject3D('mesh', new THREE.Mesh(new THREE.PlaneGeometry(1.86, .58), material));
  box(root, { position: '0 -.35 .005', width: 1.86, height: .075, depth: .012, color: '#2d2925', shadow: false, material: 'color: #2d2925; opacity: .88; transparent: true' });
  const bar = box(root, { position: '-.93 -.35 .014', width: 1.86, height: .055, depth: .014, color: '#d2ad69', shadow: false, material: 'color: #d2ad69; emissive: #6e4f22; emissiveIntensity: .28' });
  bar.object3D.scale.x = 0.001;
  let lastLabel = '';
  let lastDetail = '';
  let lastBucket = -1;
  const draw = (stage, detail, progress) => {
    const percent = Math.round(Math.max(0, Math.min(1, progress)) * 100);
    const bucket = Math.floor(percent / 5);
    if (stage === lastLabel && detail === lastDetail && bucket === lastBucket) return;
    lastLabel = stage;
    lastDetail = detail;
    lastBucket = bucket;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = 'rgba(32, 28, 24, .9)';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#f4eadc';
    context.font = '600 36px "Segoe UI", sans-serif';
    context.textBaseline = 'middle';
    context.fillText((stage || 'Preparing').slice(0, 14), 24, 42);
    context.fillStyle = '#cfc3b3';
    context.font = '500 27px "Segoe UI", sans-serif';
    context.fillText((detail || 'Please wait…').slice(0, 22), 24, 101);
    context.fillStyle = '#d2ad69';
    context.font = '500 30px "Segoe UI", sans-serif';
    context.textAlign = 'right';
    context.fillText(`${percent}%`, 488, 101);
    context.textAlign = 'left';
    texture.needsUpdate = true;
    const scale = Math.max(.001, percent / 100);
    bar.object3D.scale.x = scale;
    bar.object3D.position.x = -.93 + .93 * scale;
  };
  return {
    root,
    set({ state = 'preparing', stage = 'Preparing', detail = '', progress = 0 } = {}) {
      root.setAttribute('visible', state !== 'idle' && state !== 'ready');
      draw(
        state === 'error' ? 'Loading failed' : stage,
        state === 'error' ? 'Click the door to retry' : detail,
        state === 'error' ? 0 : progress
      );
    },
    dispose() {
      texture.dispose();
      material.dispose();
    }
  };
}

function makeInteractive(panel, destination, onClick) {
  panel.setAttribute('tabindex', '0');
  panel.setAttribute('aria-label', `To ${destination.title}`);
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
  const plan = doorModelBuildSteps({ parent, port, endpoint, destination, connection, room, styleId, onClick });
  for (const step of plan.steps) step();
  return plan.result();
}

export function doorModelBuildSteps({ parent, port, endpoint, destination, connection, room, styleId = null, onClick }) {
  const style = resolveDoorStyle(room, connection.kind, styleId);
  const state = { root: null, model: null, loadingIndicator: null };
  const steps = [() => {
    state.root = entity('a-entity', { position: `${port.x} 0 ${port.z}`, rotation: `0 ${-port.yaw} 0` }, parent);
    state.root.dataset.doorStyle = style.id;
  }];
  if (style.kind === 'sliding') {
    const sliding = { left: null, right: null };
    steps.push(
      () => {
        box(state.root, { position: '-1.14 1.32 0', width: .18, height: 2.68, depth: .28, shadow: false, material: style.frame });
        box(state.root, { position: '1.14 1.32 0', width: .18, height: 2.68, depth: .28, shadow: false, material: style.frame });
        box(state.root, { position: '0 2.62 0', width: 2.46, height: .18, depth: .28, shadow: false, material: style.frame });
      },
      () => {
        sliding.left = box(state.root, { position: '-.515 1.3 -.02', width: 1.03, height: 2.48, depth: .09, className: 'interactive museum-door', shadow: false, material: style.leaf });
        sliding.right = box(state.root, { position: '.515 1.3 -.02', width: 1.03, height: 2.48, depth: .09, className: 'interactive museum-door', shadow: false, material: style.leaf });
      },
      () => {
        box(sliding.left, { position: '.505 0 -.052', width: .018, height: 2.38, depth: .012, color: style.seam, shadow: false });
        box(sliding.right, { position: '-.505 0 -.052', width: .018, height: 2.38, depth: .012, color: style.seam, shadow: false });
        box(state.root, { position: '0 2.82 -.01', width: .54, height: .075, depth: .05, color: style.accent, shadow: false });
        makeInteractive(sliding.left, destination, onClick);
        makeInteractive(sliding.right, destination, onClick);
        state.model = { motion: 'sliding', panels: [
          { element: sliding.left, closed: '-.515 1.3 -.02', open: '-1.06 1.3 -.02' },
          { element: sliding.right, closed: '.515 1.3 -.02', open: '1.06 1.3 -.02' }
        ], panel: sliding.left };
      }
    );
  } else {
    const hinged = { hinge: null, panel: null };
    steps.push(
      () => {
        box(state.root, { position: '-1.14 1.32 0', width: .18, height: 2.68, depth: .3, shadow: false, material: style.frame });
        box(state.root, { position: '1.14 1.32 0', width: .18, height: 2.68, depth: .3, shadow: false, material: style.frame });
        box(state.root, { position: '0 2.62 0', width: 2.46, height: .18, depth: .3, shadow: false, material: style.frame });
      },
      () => {
        hinged.hinge = entity('a-entity', { position: '-1.03 1.3 0' }, state.root);
        hinged.panel = box(hinged.hinge, { position: '1.03 0 -.02', width: 2.06, height: 2.48, depth: .1, className: 'interactive museum-door', shadow: false, material: style.leaf });
        box(hinged.panel, { position: '0 .48 -.061', width: 1.7, height: .9, depth: .025, color: style.inset, shadow: false });
        box(hinged.panel, { position: '0 -.58 -.061', width: 1.7, height: .9, depth: .025, color: style.inset, shadow: false });
      },
      () => {
        entity('a-cylinder', { position: '.72 0 -.11', rotation: '90 0 0', radius: .035, height: .08, material: `color: ${style.hardware}; metalness: .8; roughness: .3` }, hinged.panel);
        makeInteractive(hinged.panel, destination, onClick);
        state.model = { motion: 'hinged', hinge: hinged.hinge, panel: hinged.panel };
      }
    );
  }
  steps.push(
    () => textPlane(state.root, {
      position: '1.67 1.42 .19', width: .66, height: .46, signStyle: 'brass',
      title: endpoint.doorId.replace('door-', '').padStart(2, '0'),
      lines: [destination.title, connection.kind === 'elevator' ? 'ELEVATOR' : 'GALLERY']
    }),
    () => { state.loadingIndicator = buildDoorLoadIndicator(state.root); }
  );
  return { steps, result: () => ({ root: state.root, ...state.model, port, style, loadingIndicator: state.loadingIndicator }) };
}
