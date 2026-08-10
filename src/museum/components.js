import { movementAxesFromDirections, resolvePlanarMovement } from './movement.js';

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
      speed: { default: 2.2 },
      enabled: { default: true }
    },
    init() {
      this.forward = new THREE.Vector3();
      this.movement = new THREE.Vector3();
    },
    tick(time, delta) {
      if (!this.data.enabled || !this.el.sceneEl.is('vr-mode') || !this.data.camera || !delta) return;
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

  AFRAME.registerComponent('mobile-dpad-movement', {
    schema: {
      camera: { type: 'selector' },
      controls: { type: 'selector' },
      speed: { default: 2.6 }
    },
    init() {
      this.directions = new Set();
      this.pointerDirections = new Map();
      this.forward = new THREE.Vector3();
      this.movement = new THREE.Vector3();
      this.listeners = [];
      this.reset = () => {
        this.directions.clear();
        this.pointerDirections.clear();
        this.data.controls?.querySelectorAll('.is-active').forEach((button) => button.classList.remove('is-active'));
      };
      for (const button of this.data.controls?.querySelectorAll('[data-move-direction]') || []) {
        const start = (event) => {
          event.preventDefault();
          event.stopPropagation();
          button.setPointerCapture?.(event.pointerId);
          this.pointerDirections.set(event.pointerId, button.dataset.moveDirection);
          this.directions.add(button.dataset.moveDirection);
          button.classList.add('is-active');
        };
        const stop = (event) => {
          event.preventDefault();
          event.stopPropagation();
          const direction = this.pointerDirections.get(event.pointerId);
          this.pointerDirections.delete(event.pointerId);
          if (direction && ![...this.pointerDirections.values()].includes(direction)) this.directions.delete(direction);
          button.classList.remove('is-active');
        };
        button.addEventListener('pointerdown', start);
        button.addEventListener('pointerup', stop);
        button.addEventListener('pointercancel', stop);
        button.addEventListener('lostpointercapture', stop);
        this.listeners.push([button, start, stop]);
      }
      window.addEventListener('blur', this.reset);
      window.addEventListener('mobile-controls-reset', this.reset);
    },
    tick(time, delta) {
      if (this.el.sceneEl.is('vr-mode') || !this.data.camera || !delta || !this.directions.size) return;
      const axes = movementAxesFromDirections(this.directions);
      if (!axes.forward && !axes.right) return;
      this.data.camera.object3D.getWorldDirection(this.forward);
      const movement = resolvePlanarMovement(this.forward, axes.forward, axes.right);
      this.movement.set(movement.x, 0, movement.z);
      moveWithCollision(this.el, this.movement, this.data.speed * delta / 1000);
    },
    remove() {
      for (const [button, start, stop] of this.listeners) {
        button.removeEventListener('pointerdown', start);
        button.removeEventListener('pointerup', stop);
        button.removeEventListener('pointercancel', stop);
        button.removeEventListener('lostpointercapture', stop);
      }
      window.removeEventListener('blur', this.reset);
      window.removeEventListener('mobile-controls-reset', this.reset);
    }
  });

  AFRAME.registerComponent('pinch-grab-events', {
    schema: {
      startDistance: { default: .025 },
      endDistance: { default: .04 }
    },
    init() {
      this.positionA = new THREE.Vector3();
      this.positionB = new THREE.Vector3();
      this.hands = ['left', 'right'].map((hand) => ({
        hand,
        index: this.el.querySelector(`.${hand}-index-tip`),
        thumb: this.el.querySelector(`.${hand}-thumb-tip`),
        grip: this.el.querySelector(`#${hand}-grab`),
        pinching: false
      }));
    },
    tick() {
      const session = this.el.sceneEl.renderer?.xr?.getSession?.();
      const activeHands = new Set([...(session?.inputSources || [])].filter((source) => source.hand).map((source) => source.handedness));
      for (const state of this.hands) {
        if (!activeHands.has(state.hand)) {
          if (state.pinching) state.grip?.emit('pinchgrabend');
          state.pinching = false;
          continue;
        }
        state.index.object3D.getWorldPosition(this.positionA);
        state.thumb.object3D.getWorldPosition(this.positionB);
        const distance = this.positionA.distanceTo(this.positionB);
        if (!state.pinching && distance <= this.data.startDistance) {
          state.pinching = true;
          state.grip?.emit('pinchgrabstart');
        } else if (state.pinching && distance >= this.data.endDistance) {
          state.pinching = false;
          state.grip?.emit('pinchgrabend');
        }
      }
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
