import { box, entity, COLORS } from './primitives.js';

export function buildPhotoMount(parent, slot, id) {
  const holder = entity('a-entity', { position: `${slot.x} ${slot.y} ${slot.z}`, rotation: slot.rotation }, parent);
  const portable = entity('a-entity', { id, 'data-pick-up': '', 'data-magnet-range': '.28,.08,180,95' }, holder);
  portable.classList.add('portable-frame', 'magnet-left', 'magnet-right');
  portable.addEventListener('pickup', () => portable.addState('grabbed'));
  portable.addEventListener('putdown', () => portable.removeState('grabbed'));
  const frame = box(portable, { position: '0 0 0', width: slot.maxWidth + .1, height: slot.maxHeight + .1, depth: .06, color: COLORS.frame, material: 'color: #292622; roughness: .7' });
  box(portable, { position: '0 0 .035', width: slot.maxWidth, height: slot.maxHeight, depth: .016, color: COLORS.mat, shadow: false });
  const plane = entity('a-plane', { position: '0 0 .047', width: slot.maxWidth - .14, height: slot.maxHeight - .14, material: 'color: #cfc6b9; roughness: .8' }, portable);
  plane.dataset.maxWidth = String(slot.maxWidth - .14);
  plane.dataset.maxHeight = String(slot.maxHeight - .14);
  return { holder, portable, frame, plane };
}
