import { getDoorPort, getTemplate } from './templates.js';
import { parseEndpoint } from '../config/validate.js';

const ROOM_GAP = 2.4;
const MAX_CORRIDOR = 24;

function overlaps(a, b, padding = 1.2) {
  return !(
    a.x + a.width / 2 + padding <= b.x - b.width / 2 ||
    a.x - a.width / 2 - padding >= b.x + b.width / 2 ||
    a.z + a.depth / 2 + padding <= b.z - b.depth / 2 ||
    a.z - a.depth / 2 - padding >= b.z + b.depth / 2
  );
}

function roomRect(room, x, z) {
  const template = getTemplate(room.template);
  return { id: room.id, x, z, width: template.width, depth: template.depth };
}

function worldPort(room, placement, doorId) {
  const port = getDoorPort(room, doorId);
  return { x: placement.x + port.x, z: placement.z + port.z, yaw: port.yaw, outward: port.outward };
}

function endpointDistance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function candidatePlacement(sourceRoom, sourcePlacement, sourceDoor, targetRoom, targetDoor, multiplier = 1) {
  const sourcePort = worldPort(sourceRoom, sourcePlacement, sourceDoor);
  const targetPort = getDoorPort(targetRoom, targetDoor);
  const sourceTemplate = getTemplate(sourceRoom.template);
  const targetTemplate = getTemplate(targetRoom.template);
  const strideX = sourceTemplate.width / 2 + targetTemplate.width / 2 + ROOM_GAP * multiplier;
  const strideZ = sourceTemplate.depth / 2 + targetTemplate.depth / 2 + ROOM_GAP * multiplier;
  const stride = sourcePort.outward.x ? strideX : strideZ;
  return {
    x: sourcePlacement.x + sourcePort.outward.x * stride - targetPort.x,
    z: sourcePlacement.z + sourcePort.outward.z * stride - targetPort.z,
    rotation: 0
  };
}

function makePath(a, b) {
  if (Math.abs(a.x - b.x) < 0.1 || Math.abs(a.z - b.z) < 0.1) return [a, b];
  return [a, { x: a.x, z: b.z }, b];
}

export function buildMuseumLayout(config) {
  const lobby = { ...config.museum.lobby, title: config.museum.title, blocks: [] };
  const roomList = [lobby, ...config.rooms];
  const rooms = new Map(roomList.map((room) => [room.id, room]));
  const placements = new Map([[lobby.id, { x: 0, z: 0, rotation: 0 }]]);
  const adjacency = new Map(roomList.map((room) => [room.id, []]));

  const connections = config.connections.map((connection, index) => {
    const from = parseEndpoint(connection.from);
    const to = parseEndpoint(connection.to);
    const item = { id: `connection-${index + 1}`, from, to, kind: 'pending', path: [] };
    adjacency.get(from.roomId).push({ connection: item, other: to });
    adjacency.get(to.roomId).push({ connection: item, other: from });
    return item;
  });

  const queue = [lobby.id];
  while (queue.length) {
    const sourceId = queue.shift();
    const sourceRoom = rooms.get(sourceId);
    const sourcePlacement = placements.get(sourceId);
    for (const edge of adjacency.get(sourceId)) {
      if (placements.has(edge.other.roomId)) continue;
      const targetRoom = rooms.get(edge.other.roomId);
      const sourceEndpoint = edge.connection.from.roomId === sourceId ? edge.connection.from : edge.connection.to;
      let candidate = null;
      for (let multiplier = 1; multiplier <= 3; multiplier += 1) {
        const next = candidatePlacement(sourceRoom, sourcePlacement, sourceEndpoint.doorId, targetRoom, edge.other.doorId, multiplier);
        const rect = roomRect(targetRoom, next.x, next.z);
        if (![...placements].some(([id, placed]) => overlaps(rect, roomRect(rooms.get(id), placed.x, placed.z)))) {
          candidate = next;
          break;
        }
      }
      if (!candidate) {
        const index = placements.size;
        candidate = { x: (index % 3) * 32, z: Math.floor(index / 3) * 28 + 36, rotation: 0, forcedElevator: true };
      }
      placements.set(targetRoom.id, candidate);
      queue.push(targetRoom.id);
    }
  }

  roomList.forEach((room, index) => {
    if (!placements.has(room.id)) placements.set(room.id, { x: 48 + index * 30, z: 48, rotation: 0, forcedElevator: true });
  });

  for (const connection of connections) {
    const fromRoom = rooms.get(connection.from.roomId);
    const toRoom = rooms.get(connection.to.roomId);
    const fromPlacement = placements.get(fromRoom.id);
    const toPlacement = placements.get(toRoom.id);
    const fromPort = worldPort(fromRoom, fromPlacement, connection.from.doorId);
    const toPort = worldPort(toRoom, toPlacement, connection.to.doorId);
    const distance = endpointDistance(fromPort, toPort);
    const path = makePath(fromPort, toPort);
    const corridorHitsRoom = path.some((point) => roomList.some((room) => {
      if (room.id === fromRoom.id || room.id === toRoom.id) return false;
      const p = placements.get(room.id);
      return Math.abs(point.x - p.x) < getTemplate(room.template).width / 2 && Math.abs(point.z - p.z) < getTemplate(room.template).depth / 2;
    }));
    connection.kind = fromPlacement.forcedElevator || toPlacement.forcedElevator || distance > MAX_CORRIDOR || corridorHitsRoom
      ? 'elevator'
      : path.length === 2 && distance <= ROOM_GAP * 2.2 ? 'direct' : 'corridor';
    connection.path = connection.kind === 'elevator' ? [] : path;
    connection.distance = distance;
  }

  return { rooms, placements, connections, adjacency };
}

export { MAX_CORRIDOR, overlaps, worldPort };
