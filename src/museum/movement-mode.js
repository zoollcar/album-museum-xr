export const VR_MOVEMENT_MODES = Object.freeze({ TELEPORT: 'teleport', MOVE: 'move' });

const BLINK_CONTROLS = 'cameraRig: #camera-rig; teleportOrigin: #head; collisionEntities: .navmesh; rotateOnTeleport: false';

export function applyVrMovementMode({ mode, rig, teleporters }) {
  const normalized = mode === VR_MOVEMENT_MODES.MOVE ? VR_MOVEMENT_MODES.MOVE : VR_MOVEMENT_MODES.TELEPORT;
  rig?.setAttribute('xr-thumbstick-move', 'enabled', normalized === VR_MOVEMENT_MODES.MOVE);
  for (const teleporter of teleporters || []) {
    if (normalized === VR_MOVEMENT_MODES.TELEPORT) teleporter.setAttribute('blink-controls', BLINK_CONTROLS);
    else teleporter.removeAttribute('blink-controls');
  }
  return normalized;
}

export class VrMovementModeController {
  constructor({ scene, rig, teleporters, inputs = [] }) {
    this.scene = scene;
    this.rig = rig;
    this.teleporters = teleporters;
    this.inputs = [...inputs];
    this.mode = VR_MOVEMENT_MODES.TELEPORT;
    this.onInput = (event) => this.setMode(event.currentTarget.value);
    this.onEnterVr = () => this.apply();
    this.inputs.forEach((input) => input.addEventListener('change', this.onInput));
    this.scene?.addEventListener('enter-vr', this.onEnterVr);
    this.setMode(this.mode);
  }

  setMode(mode) {
    this.mode = mode === VR_MOVEMENT_MODES.MOVE ? VR_MOVEMENT_MODES.MOVE : VR_MOVEMENT_MODES.TELEPORT;
    this.inputs.forEach((input) => { input.checked = input.value === this.mode; });
    this.apply();
  }

  apply() {
    applyVrMovementMode({ mode: this.mode, rig: this.rig, teleporters: this.teleporters });
  }

  dispose() {
    this.inputs.forEach((input) => input.removeEventListener('change', this.onInput));
    this.scene?.removeEventListener('enter-vr', this.onEnterVr);
  }
}
