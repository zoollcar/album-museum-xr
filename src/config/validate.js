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
    if (rooms.has(room.id)) errors.push(`房间 ID “${room.id}” 重复。`);
    rooms.set(room.id, room);
    const template = getTemplate(room.template);
    if (!template) continue;
    if ((room.blocks || []).length > template.maxBlocks) {
      errors.push(`房间 “${room.id}” 超过 ${room.template} 的 ${template.maxBlocks} 个板块上限。`);
    }
    const photos = roomPhotoCount(room);
    if (photos > template.maxPhotos) {
      errors.push(`房间 “${room.id}” 有 ${photos} 张照片，超过 ${room.template} 的 ${template.maxPhotos} 张上限。`);
    }
  }

  const usedEndpoints = new Set();
  const graph = new Map([...rooms.keys()].map((id) => [id, []]));
  for (const [index, connection] of config.connections.entries()) {
    const from = parseEndpoint(connection.from);
    const to = parseEndpoint(connection.to);
    if (connection.from === connection.to) errors.push(`连接 ${index + 1} 的两端不能相同。`);
    for (const endpoint of [from, to]) {
      const room = rooms.get(endpoint.roomId);
      if (!room) {
        errors.push(`连接 ${index + 1} 引用了不存在的房间 “${endpoint.roomId}”。`);
        continue;
      }
      const template = getTemplate(room.template);
      if (!template.doors.some((door) => door.id === endpoint.doorId)) {
        errors.push(`房间 “${endpoint.roomId}” 的模板 ${room.template} 没有 ${endpoint.doorId}。`);
      }
      const key = `${endpoint.roomId}.${endpoint.doorId}`;
      if (usedEndpoints.has(key)) errors.push(`门 “${key}” 被重复连接。`);
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
  for (const room of config.rooms) if (!visited.has(room.id)) errors.push(`房间 “${room.id}” 无法从大厅到达。`);

  return { valid: errors.length === 0, errors };
}

export { parseEndpoint };
