import { box, entity } from './primitives.js';
import { textPlane } from './signage.js';

export function buildElevatorCabin({ parent, port, roomTitle }) {
  const cabin = entity('a-entity', { position: `${port.x} 0 ${port.z}`, rotation: `0 ${-port.yaw} 0` }, parent);
  box(cabin, { position: '0 .02 -1.42', width: 2.32, height: .12, depth: 2.9, color: '#6c6258', shadow: false });
  box(cabin, { position: '0 2.68 -1.42', width: 2.32, height: .12, depth: 2.9, color: '#e7e2dc', shadow: false });
  box(cabin, { position: '0 1.35 -2.82', width: 2.32, height: 2.66, depth: .12, color: '#b9b5b0', shadow: false, collidable: true, material: 'color: #aaa8a5; metalness: .18; roughness: .55' });
  box(cabin, { position: '-1.1 1.35 -1.42', width: .12, height: 2.66, depth: 2.9, color: '#c6c2bd', shadow: false, collidable: true, material: 'color: #bbb8b4; metalness: .12; roughness: .6' });
  box(cabin, { position: '1.1 1.35 -1.42', width: .12, height: 2.66, depth: 2.9, color: '#c6c2bd', shadow: false, collidable: true, material: 'color: #bbb8b4; metalness: .12; roughness: .6' });
  box(cabin, { position: '0 2.55 -1.42', width: 1.12, height: .035, depth: .42, color: '#f5e4c8', shadow: false });
  textPlane(cabin, { position: '0 1.68 -2.74', width: .92, height: .26, signStyle: 'brass', title: 'ELEVATOR', lines: [roomTitle], align: 'center' });
  entity('a-entity', { position: '0 2.25 -1.4', light: 'type: point; intensity: .56; color: #ffdfb7; distance: 4; decay: 2' }, cabin);
  return cabin;
}
