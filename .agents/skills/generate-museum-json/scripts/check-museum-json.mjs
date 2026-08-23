#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const ID = /^[a-zA-Z][a-zA-Z0-9_-]*$/;
const ENDPOINT = /^([a-zA-Z][a-zA-Z0-9_-]*)\.(door-[1-9][0-9]*)$/;
const THEMES = new Set(['classic', 'botanical', 'art-deco', 'terrazzo']);
const DOOR_STYLES = new Set(['classic-oak', 'sage-panel', 'deco-walnut', 'modern-ash']);
const ELEVATOR_STYLES = new Set(['elevator-brushed', 'elevator-bronze', 'elevator-dark']);
const TEMPLATES = new Map([
  ['lobby-atrium', { maxBlocks: 0, maxPhotos: 1, doors: 6 }],
  ['gallery-small', { maxBlocks: 2, maxPhotos: 16, doors: 2 }],
  ['gallery-medium', { maxBlocks: 3, maxPhotos: 24, doors: 3 }],
  ['gallery-large', { maxBlocks: 4, maxPhotos: 36, doors: 4 }]
]);

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function add(errors, path, message) {
  errors.push(`${path}: ${message}`);
}

function objectAt(value, path, errors) {
  if (!isObject(value)) {
    add(errors, path, 'must be an object');
    return false;
  }
  return true;
}

function arrayAt(value, path, errors) {
  if (!Array.isArray(value)) {
    add(errors, path, 'must be an array');
    return false;
  }
  return true;
}

function exactKeys(value, allowed, required, path, errors) {
  if (!objectAt(value, path, errors)) return false;
  for (const key of required) {
    if (!Object.hasOwn(value, key)) add(errors, `${path}.${key}`, 'is required');
  }
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) add(errors, `${path}.${key}`, 'is not allowed');
  }
  return true;
}

function stringAt(value, path, errors, { nonEmpty = false } = {}) {
  if (typeof value !== 'string') {
    add(errors, path, 'must be a string');
  } else if (nonEmpty && value.length === 0) {
    add(errors, path, 'must not be empty');
  }
}

function optionalString(object, key, path, errors, options) {
  if (Object.hasOwn(object, key)) stringAt(object[key], `${path}.${key}`, errors, options);
}

function optionalEnum(object, key, values, path, errors) {
  if (Object.hasOwn(object, key) && !values.has(object[key])) {
    add(errors, `${path}.${key}`, `has an invalid value: ${JSON.stringify(object[key])}`);
  }
}

function validateBackgroundMusic(value, path, errors) {
  if (!exactKeys(value, ['url', 'volume'], ['url'], path, errors)) return;
  if (Object.hasOwn(value, 'url')) stringAt(value.url, `${path}.url`, errors, { nonEmpty: true });
  if (Object.hasOwn(value, 'volume')) {
    if (typeof value.volume !== 'number' || !Number.isFinite(value.volume)) {
      add(errors, `${path}.volume`, 'must be a number');
    } else if (value.volume < 0 || value.volume > 1) {
      add(errors, `${path}.volume`, 'must be between 0 and 1');
    }
  }
}

function validateId(value, path, errors) {
  stringAt(value, path, errors);
  if (typeof value === 'string' && !ID.test(value)) {
    add(errors, path, 'must start with a letter and contain only letters, numbers, underscores, and hyphens');
  }
}

function validateImageSources(value, path, errors) {
  if (!exactKeys(value, ['original', 'medium', 'low'], ['original'], path, errors)) return;
  if (Object.hasOwn(value, 'original')) stringAt(value.original, `${path}.original`, errors, { nonEmpty: true });
  optionalString(value, 'medium', path, errors, { nonEmpty: true });
  optionalString(value, 'low', path, errors, { nonEmpty: true });
}

function validatePhoto(value, path, errors) {
  const keys = ['sources', 'title', 'location', 'date', 'description', 'alt'];
  if (!exactKeys(value, keys, ['sources'], path, errors)) return;
  if (Object.hasOwn(value, 'sources')) validateImageSources(value.sources, `${path}.sources`, errors);
  for (const key of ['title', 'location', 'date', 'description', 'alt']) {
    optionalString(value, key, path, errors);
  }
}

function validateBlock(value, path, errors) {
  if (!exactKeys(value, ['title', 'description', 'photos'], ['photos'], path, errors)) return;
  optionalString(value, 'title', path, errors);
  optionalString(value, 'description', path, errors);
  if (Object.hasOwn(value, 'photos') && arrayAt(value.photos, `${path}.photos`, errors)) {
    value.photos.forEach((photo, index) => validatePhoto(photo, `${path}.photos[${index}]`, errors));
  }
}

function validateLobby(value, path, errors) {
  const keys = ['id', 'template', 'theme', 'doorStyle', 'elevatorDoorStyle', 'backgroundMusic'];
  if (!exactKeys(value, keys, ['id', 'template'], path, errors)) return;
  if (Object.hasOwn(value, 'id')) validateId(value.id, `${path}.id`, errors);
  if (value.template !== 'lobby-atrium') add(errors, `${path}.template`, 'must be "lobby-atrium"');
  optionalEnum(value, 'theme', THEMES, path, errors);
  optionalEnum(value, 'doorStyle', DOOR_STYLES, path, errors);
  optionalEnum(value, 'elevatorDoorStyle', ELEVATOR_STYLES, path, errors);
  if (Object.hasOwn(value, 'backgroundMusic')) validateBackgroundMusic(value.backgroundMusic, `${path}.backgroundMusic`, errors);
}

function validateMuseum(value, path, errors) {
  const keys = ['title', 'subtitle', 'intro', 'heroImage', 'backgroundMusic', 'lobby'];
  if (!exactKeys(value, keys, ['title', 'lobby'], path, errors)) return;
  if (Object.hasOwn(value, 'title')) stringAt(value.title, `${path}.title`, errors, { nonEmpty: true });
  optionalString(value, 'subtitle', path, errors);
  optionalString(value, 'intro', path, errors);
  if (Object.hasOwn(value, 'heroImage')) validateImageSources(value.heroImage, `${path}.heroImage`, errors);
  if (Object.hasOwn(value, 'backgroundMusic')) validateBackgroundMusic(value.backgroundMusic, `${path}.backgroundMusic`, errors);
  if (Object.hasOwn(value, 'lobby')) validateLobby(value.lobby, `${path}.lobby`, errors);
}

function validateRoom(value, path, errors) {
  const keys = ['id', 'template', 'theme', 'doorStyle', 'elevatorDoorStyle', 'backgroundMusic', 'title', 'intro', 'blocks'];
  if (!exactKeys(value, keys, ['id', 'template', 'title', 'blocks'], path, errors)) return;
  if (Object.hasOwn(value, 'id')) validateId(value.id, `${path}.id`, errors);
  if (!['gallery-small', 'gallery-medium', 'gallery-large'].includes(value.template)) {
    add(errors, `${path}.template`, `unknown gallery template: ${JSON.stringify(value.template)}`);
  }
  optionalEnum(value, 'theme', THEMES, path, errors);
  optionalEnum(value, 'doorStyle', DOOR_STYLES, path, errors);
  optionalEnum(value, 'elevatorDoorStyle', ELEVATOR_STYLES, path, errors);
  if (Object.hasOwn(value, 'backgroundMusic')) validateBackgroundMusic(value.backgroundMusic, `${path}.backgroundMusic`, errors);
  if (Object.hasOwn(value, 'title')) stringAt(value.title, `${path}.title`, errors, { nonEmpty: true });
  optionalString(value, 'intro', path, errors);
  if (Object.hasOwn(value, 'blocks') && arrayAt(value.blocks, `${path}.blocks`, errors)) {
    value.blocks.forEach((block, index) => validateBlock(block, `${path}.blocks[${index}]`, errors));
  }
}

function validateConnection(value, path, errors) {
  if (!exactKeys(value, ['from', 'to', 'elevatorDoorStyle'], ['from', 'to'], path, errors)) return;
  for (const key of ['from', 'to']) {
    if (!Object.hasOwn(value, key)) continue;
    stringAt(value[key], `${path}.${key}`, errors);
    if (typeof value[key] === 'string' && !ENDPOINT.test(value[key])) {
      add(errors, `${path}.${key}`, 'must use the <room-id>.door-<positive integer> format');
    }
  }
  optionalEnum(value, 'elevatorDoorStyle', ELEVATOR_STYLES, path, errors);
}

function validateSemantics(config, errors) {
  if (!isObject(config.museum) || !isObject(config.museum.lobby) || !Array.isArray(config.rooms)) return;
  const roomList = [config.museum.lobby, ...config.rooms];
  const rooms = new Map();
  for (const [index, room] of roomList.entries()) {
    if (!isObject(room) || typeof room.id !== 'string') continue;
    if (rooms.has(room.id)) add(errors, index === 0 ? '$.museum.lobby.id' : `$.rooms[${index - 1}].id`, `room ID “${room.id}” is duplicated`);
    rooms.set(room.id, room);
    const template = TEMPLATES.get(room.template);
    if (!template || !Array.isArray(room.blocks)) continue;
    if (room.blocks.length > template.maxBlocks) {
      add(errors, index === 0 ? '$.museum.lobby' : `$.rooms[${index - 1}]`, `exceeds the ${template.maxBlocks}-section limit for ${room.template}`);
    }
    const photoCount = room.blocks.reduce((total, block) => total + (Array.isArray(block?.photos) ? block.photos.length : 0), 0);
    if (photoCount > template.maxPhotos) {
      add(errors, index === 0 ? '$.museum.lobby' : `$.rooms[${index - 1}]`, `has ${photoCount} photos, exceeding the ${template.maxPhotos}-photo limit for ${room.template}`);
    }
  }

  if (!Array.isArray(config.connections)) return;
  const usedEndpoints = new Set();
  const graph = new Map([...rooms.keys()].map((id) => [id, []]));
  config.connections.forEach((connection, index) => {
    if (!isObject(connection)) return;
    const from = typeof connection.from === 'string' ? connection.from.match(ENDPOINT) : null;
    const to = typeof connection.to === 'string' ? connection.to.match(ENDPOINT) : null;
    if (!from || !to) return;
    if (connection.from === connection.to) add(errors, `$.connections[${index}]`, 'connection cannot use the same endpoint twice');
    for (const [endpoint, match] of [[connection.from, from], [connection.to, to]]) {
      const [, roomId, doorId] = match;
      const room = rooms.get(roomId);
      if (!room) {
        add(errors, `$.connections[${index}]`, `references missing room “${roomId}”`);
      } else {
        const template = TEMPLATES.get(room.template);
        const doorNumber = Number(doorId.slice(5));
        if (template && doorNumber > template.doors) {
          add(errors, `$.connections[${index}]`, `room “${roomId}” uses ${room.template}, which has no ${doorId}`);
        }
      }
      if (usedEndpoints.has(endpoint)) add(errors, `$.connections[${index}]`, `door “${endpoint}” is connected more than once`);
      usedEndpoints.add(endpoint);
    }
    if (rooms.has(from[1]) && rooms.has(to[1])) {
      graph.get(from[1]).push(to[1]);
      graph.get(to[1]).push(from[1]);
    }
  });

  const lobbyId = config.museum.lobby.id;
  if (typeof lobbyId !== 'string' || !graph.has(lobbyId)) return;
  const visited = new Set();
  const queue = [lobbyId];
  while (queue.length) {
    const id = queue.shift();
    if (visited.has(id)) continue;
    visited.add(id);
    queue.push(...(graph.get(id) || []));
  }
  config.rooms.forEach((room, index) => {
    if (isObject(room) && typeof room.id === 'string' && !visited.has(room.id)) {
      add(errors, `$.rooms[${index}].id`, `room “${room.id}” cannot be reached from the lobby`);
    }
  });
}

function validateConfig(config) {
  const errors = [];
  if (!exactKeys(config, ['version', 'museum', 'rooms', 'connections'], ['version', 'museum', 'rooms', 'connections'], '$', errors)) return errors;
  if (Object.hasOwn(config, 'version') && config.version !== 1) add(errors, '$.version', 'must be the number 1');
  if (Object.hasOwn(config, 'museum')) validateMuseum(config.museum, '$.museum', errors);
  if (Object.hasOwn(config, 'rooms') && arrayAt(config.rooms, '$.rooms', errors)) {
    config.rooms.forEach((room, index) => validateRoom(room, `$.rooms[${index}]`, errors));
  }
  if (Object.hasOwn(config, 'connections') && arrayAt(config.connections, '$.connections', errors)) {
    config.connections.forEach((connection, index) => validateConnection(connection, `$.connections[${index}]`, errors));
  }
  validateSemantics(config, errors);
  return errors;
}

async function readInput(input) {
  if (input === '-') {
    process.stdin.setEncoding('utf8');
    let text = '';
    for await (const chunk of process.stdin) text += chunk;
    return { label: '<stdin>', text };
  }
  const filename = resolve(input);
  return { label: filename, text: await readFile(filename, 'utf8') };
}

async function check(input) {
  let source;
  try {
    source = await readInput(input);
  } catch (error) {
    console.error(`Could not read: ${input}\n- ${error.message}`);
    return false;
  }
  let config;
  try {
    config = JSON.parse(source.text.replace(/^\uFEFF/, ''));
  } catch (error) {
    console.error(`Could not parse JSON: ${source.label}\n- ${error.message}`);
    return false;
  }
  const errors = validateConfig(config);
  if (errors.length) {
    console.error(`Museum JSON validation failed: ${source.label}`);
    errors.forEach((error) => console.error(`- ${error}`));
    return false;
  }
  console.log(`Museum JSON is valid: ${source.label}`);
  return true;
}

const inputs = process.argv.slice(2);
if (inputs.includes('--help') || inputs.includes('-h')) {
  console.log('Usage: node check-museum-json.mjs [museum.json ...]\nWithout paths, checks public/museums/project-showcase.json; use - to read from stdin.');
  process.exit(0);
}
const targets = inputs.length ? inputs : ['public/museums/project-showcase.json'];
const results = [];
for (const target of targets) results.push(await check(target));
if (results.some((valid) => !valid)) process.exitCode = 1;
