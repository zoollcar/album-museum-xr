import { resolvePlanarMovement } from './movement.js';

function moveWithCollision(el, movement, distance) {
  const app = window.museumApp;
  if (!app?.ready) {
    el.object3D.position.addScaledVector(movement, distance);
    return;
  }
  const start = el.object3D.position;
  const end = {
    x: start.x + movement.x * distance,
    z: start.z + movement.z * distance
  };
  const resolved = app.constrainMovement(start, end);
  start.x = resolved.x;
  start.z = resolved.z;
}

export function registerMuseumComponents() {
  if (AFRAME.components['museum-walk-constraint']) return;

  AFRAME.registerComponent('museum-walk-constraint', {
    init() {
      this.lastValid = this.el.object3D.position.clone();
    },
    tick() {
      const app = window.museumApp;
      if (!app?.ready) return;
      const position = this.el.object3D.position;
      if (app.isWalkable(position.x, position.z)) this.lastValid.copy(position);
      else position.copy(this.lastValid);
    }
  });

  AFRAME.registerComponent('desktop-movement', {
    schema: {
      camera: { type: 'selector' },
      speed: { default: 3.2 }
    },
    init() {
      this.keys = new Set();
      this.forward = new THREE.Vector3();
      this.movement = new THREE.Vector3();
      this.onKeyDown = (event) => this.keys.add(event.code);
      this.onKeyUp = (event) => this.keys.delete(event.code);
      window.addEventListener('keydown', this.onKeyDown);
      window.addEventListener('keyup', this.onKeyUp);
    },
    tick(time, delta) {
      if (this.el.sceneEl.is('vr-mode') || !this.data.camera || !delta) return;
      const forwardAmount = Number(this.keys.has('KeyW') || this.keys.has('ArrowUp')) - Number(this.keys.has('KeyS') || this.keys.has('ArrowDown'));
      const rightAmount = Number(this.keys.has('KeyD') || this.keys.has('ArrowRight')) - Number(this.keys.has('KeyA') || this.keys.has('ArrowLeft'));
      if (!forwardAmount && !rightAmount) return;
      this.data.camera.object3D.getWorldDirection(this.forward);
      const movement = resolvePlanarMovement(this.forward, forwardAmount, rightAmount);
      this.movement.set(movement.x, 0, movement.z);
      moveWithCollision(this.el, this.movement, this.data.speed * delta / 1000);
    },
    remove() {
      window.removeEventListener('keydown', this.onKeyDown);
      window.removeEventListener('keyup', this.onKeyUp);
    }
  });

  AFRAME.registerComponent('xr-thumbstick-move', {
    schema: {
      camera: { type: 'selector' },
      hand: { default: 'right' },
      speed: { default: 2.2 }
    },
    init() {
      this.forward = new THREE.Vector3();
      this.movement = new THREE.Vector3();
    },
    tick(time, delta) {
      if (!this.el.sceneEl.is('vr-mode') || !this.data.camera || !delta) return;
      const session = this.el.sceneEl.renderer?.xr?.getSession?.();
      const source = [...(session?.inputSources || [])].find((item) => item.handedness === this.data.hand && item.gamepad);
      if (!source) return;
      const axes = source.gamepad.axes;
      const x = Math.abs(axes[2] ?? axes[0] ?? 0) > .16 ? axes[2] ?? axes[0] : 0;
      const y = Math.abs(axes[3] ?? axes[1] ?? 0) > .16 ? axes[3] ?? axes[1] : 0;
      if (!x && !y) return;
      this.data.camera.object3D.getWorldDirection(this.forward);
      const movement = resolvePlanarMovement(this.forward, -y, x);
      this.movement.set(movement.x, 0, movement.z);
      moveWithCollision(this.el, this.movement, this.data.speed * delta / 1000);
    }
  });

  AFRAME.registerComponent('hand-ray-click', {
    schema: { hand: { default: 'right' } },
    init() {
      this.onPinch = () => {
        const raycaster = this.el.components.raycaster;
        const hit = raycaster?.intersections?.find((entry) => entry.object?.el?.classList?.contains('interactive'));
        hit?.object?.el?.emit('click', { hand: this.data.hand }, false);
      };
      this.el.setAttribute('raycaster', 'objects: .interactive; far: 12; showLine: true; lineColor: #8c6a42');
      this.el.addEventListener('pinchstarted', this.onPinch);
    },
    remove() { this.el.removeEventListener('pinchstarted', this.onPinch); }
  });
}
