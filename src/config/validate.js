import Ajv from 'ajv';
import { museumSchema } from './schema.js';
import { getTemplate, roomPhotoCount } from '../museum/templates.js';

const ajv = new Ajv({ allErrors: true, strict: false });
const validateSchema = ajv.compile(museumSchema);

function parseEndpoint(value) {
  const marker = value.lastIndexOf('.');
  return { roomId: value.slice(0, marker), doorId: value.slice(marker + 1) };
}

export function validateMuseumConfig(config) {
  const errors = [];
  if (!validateSchema(config)) {
    errors.push(...validateSchema.errors.map((error) => `${error.instancePath || '/'} ${error.message}`));
    return { valid: false, errors };
  }

  const rooms = new Map();
  const lobby = { ...config.museum.lobby, title: config.museum.title, blocks: [] };
  for (const room of [lobby, ...config.rooms]) {
    if (rooms.has(room.id)) errors.push(`Room ID “${room.id}” is duplicated.`);
    rooms.set(room.id, room);
    const template = getTemplate(room.template);
    if (!template) continue;
    if ((room.blocks || []).length > template.maxBlocks) {
      errors.push(`Room “${room.id}” exceeds the ${template.maxBlocks}-section limit for ${room.template}.`);
    }
    const photos = roomPhotoCount(room);
    if (photos > template.maxPhotos) {
      errors.push(`Room “${room.id}” has ${photos} photos, exceeding the ${template.maxPhotos}-photo limit for ${room.template}.`);
    }
  }

  const usedEndpoints = new Set();
  const graph = new Map([...rooms.keys()].map((id) => [id, []]));
  for (const [index, connection] of config.connections.entries()) {
    const from = parseEndpoint(connection.from);
    const to = parseEndpoint(connection.to);
    if (connection.from === connection.to) errors.push(`Connection ${index + 1} cannot use the same endpoint twice.`);
    for (const endpoint of [from, to]) {
      const room = rooms.get(endpoint.roomId);
      if (!room) {
        errors.push(`Connection ${index + 1} references missing room “${endpoint.roomId}”.`);
        continue;
      }
      const template = getTemplate(room.template);
      if (!template.doors.some((door) => door.id === endpoint.doorId)) {
        errors.push(`Room “${endpoint.roomId}” uses ${room.template}, which has no ${endpoint.doorId}.`);
      }
      const key = `${endpoint.roomId}.${endpoint.doorId}`;
      if (usedEndpoints.has(key)) errors.push(`Door “${key}” is connected more than once.`);
      usedEndpoints.add(key);
    }
    if (rooms.has(from.roomId) && rooms.has(to.roomId)) {
      graph.get(from.roomId).push(to.roomId);
      graph.get(to.roomId).push(from.roomId);
    }
  }

  const visited = new Set();
  const queue = [lobby.id];
  while (queue.length) {
    const id = queue.shift();
    if (visited.has(id)) continue;
    visited.add(id);
    queue.push(...(graph.get(id) || []));
  }
  for (const room of config.rooms) if (!visited.has(room.id)) errors.push(`Room “${room.id}” cannot be reached from the lobby.`);

  return { valid: errors.length === 0, errors };
}

export { parseEndpoint };
