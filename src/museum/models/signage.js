import { entity } from './primitives.js';
import { planSignage } from '../signage-layout.js';

const SIGN_STYLES = {
  slogan: { background: 'transparent', color: '#3b3027', accent: '#73583b', titleSize: 132, bodySize: 64, border: null },
  'wall-label': { background: 'transparent', color: '#342d27', accent: '#342d27', titleSize: 76, bodySize: 50, border: null },
  brass: { background: '#5f4933', color: '#f6efe5', accent: '#f6efe5', titleSize: 88, bodySize: 44, border: '#a98960' },
  section: { background: 'transparent', color: '#3a312a', accent: '#765b3d', titleSize: 66, bodySize: 42, border: null }
};

let signageWorker = null;
let signageRequestId = 0;
const workerRequests = new Map();
const pendingByRoom = new Map();

function makeTextCanvas({
  title = '', lines = [], width: displayWidth = 2, height: displayHeight = 1,
  textureWidth = null, textureHeight = 512, align = 'left', signStyle = 'wall-label'
}) {
  const style = SIGN_STYLES[signStyle] || SIGN_STYLES['wall-label'];
  const canvas = document.createElement('canvas');
  const width = textureWidth || Math.min(2048, Math.max(512, Math.round(textureHeight * displayWidth / displayHeight)));
  const height = textureHeight;
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, width, height);
  if (style.background !== 'transparent') {
    context.fillStyle = style.background;
    context.fillRect(0, 0, width, height);
    if (style.border) {
      context.strokeStyle = style.border;
      context.lineWidth = 3;
      context.strokeRect(10, 10, width - 20, height - 20);
    }
  }
  const padding = signStyle === 'brass' ? 48 : 54;
  const x = align === 'center' ? width / 2 : padding;
  context.textAlign = align;
  context.textBaseline = 'top';
  if (signStyle === 'slogan' && align !== 'center') {
    context.fillStyle = style.accent;
    context.fillRect(padding, 34, Math.min(180, width * .14), 5);
  }
  if (signStyle === 'wall-label') {
    context.fillStyle = '#7b6043';
    context.fillRect(22, 42, 4, Math.max(160, height - 84));
  }
  const textPlan = planSignage({ title, lines, width: displayWidth, height: displayHeight, textureWidth: width, textureHeight, signStyle,
    measureText: (text, size) => { context.font = `400 ${size}px "Segoe UI", sans-serif`; return context.measureText(text).width; } });
  if (textPlan.title) {
    context.fillStyle = style.accent;
    context.font = `600 ${textPlan.titleSize}px "Segoe UI", sans-serif`;
    context.fillText(textPlan.title, x, textPlan.titleTop);
  }
  context.fillStyle = style.color;
  context.font = `400 ${textPlan.bodySize}px "Segoe UI", sans-serif`;
  textPlan.rows.forEach((row, index) => context.fillText(row, x, textPlan.bodyTop + index * (textPlan.bodySize + textPlan.lineGap)));
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function roomIdFor(parent) {
  return parent.closest?.('[data-room-id]')?.dataset.roomId || null;
}

function trackRoomPromise(roomId, promise) {
  if (!roomId) return;
  if (!pendingByRoom.has(roomId)) pendingByRoom.set(roomId, new Set());
  pendingByRoom.get(roomId).add(promise);
  promise.finally(() => {
    const pending = pendingByRoom.get(roomId);
    pending?.delete(promise);
    if (!pending?.size) pendingByRoom.delete(roomId);
  });
}

function getSignageWorker() {
  if (signageWorker || typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') return signageWorker;
  signageWorker = new Worker(new URL('./signage-worker.js', import.meta.url), { type: 'module' });
  signageWorker.addEventListener('message', ({ data }) => {
    const request = workerRequests.get(data.id);
    if (!request) return;
    workerRequests.delete(data.id);
    if (data.error) request.reject(new Error(data.error));
    else request.resolve(data.bitmap);
  });
  signageWorker.addEventListener('error', (error) => {
    for (const request of workerRequests.values()) request.reject(error);
    workerRequests.clear();
    signageWorker?.terminate();
    signageWorker = null;
  });
  return signageWorker;
}

function renderInWorker(options) {
  const worker = getSignageWorker();
  if (!worker) return null;
  const id = ++signageRequestId;
  const promise = new Promise((resolve, reject) => workerRequests.set(id, { resolve, reject }));
  worker.postMessage({ id, options });
  return promise;
}

export async function waitForRoomSignage(roomId) {
  while (pendingByRoom.get(roomId)?.size) await Promise.allSettled([...pendingByRoom.get(roomId)]);
}

export async function installWorkerBitmap({ bitmap, plane, material, roomId, scheduler, taskId }) {
  let pendingBitmap = bitmap;
  const commit = () => {
    if (!plane.isConnected) {
      pendingBitmap?.close?.();
      pendingBitmap = null;
      return;
    }
    const nextTexture = new THREE.Texture(pendingBitmap);
    nextTexture.colorSpace = THREE.SRGBColorSpace;
    nextTexture.flipY = false;
    nextTexture.needsUpdate = true;
    nextTexture.userData.imageBitmap = pendingBitmap;
    material.map = nextTexture;
    material.color.set('#ffffff');
    material.needsUpdate = true;
    pendingBitmap = null;
  };
  try {
    if (scheduler) await scheduler.enqueue({
      id: taskId,
      owner: `room:${roomId || 'shared'}`,
      priority: 'background',
      steps: [{ label: 'Creating signage', run: commit }]
    }).promise;
    else commit();
  } catch (error) {
    pendingBitmap?.close?.();
    pendingBitmap = null;
    throw error;
  }
}

export function textPlane(parent, options) {
  const plane = entity('a-entity', { position: options.position, rotation: options.rotation }, parent);
  const workerRender = renderInWorker(options);
  const texture = workerRender ? null : makeTextCanvas(options);
  const material = new THREE.MeshBasicMaterial({
    map: texture, color: texture ? '#ffffff' : '#000000', transparent: true, side: THREE.DoubleSide, toneMapped: false,
    depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2
  });
  plane.setObject3D('mesh', new THREE.Mesh(new THREE.PlaneGeometry(options.width, options.height), material));
  plane.dataset.canvasTexture = 'true';
  plane.dataset.signStyle = options.signStyle || 'wall-label';
  if (workerRender) {
    const roomId = roomIdFor(parent);
    const complete = (async () => {
      try {
        const bitmap = await workerRender;
        await installWorkerBitmap({
          bitmap,
          plane,
          material,
          roomId,
          scheduler: window.museumApp?.scheduler,
          taskId: `signage:${roomId || 'shared'}:${signageRequestId++}`
        });
      } catch (error) {
        if (error.name === 'AbortError') return;
        console.warn('Background text texture generation failed; falling back to the main thread.', error);
        const fallback = () => {
          if (!plane.isConnected) return;
          const fallbackTexture = makeTextCanvas(options);
          material.map = fallbackTexture;
          material.color.set('#ffffff');
          material.needsUpdate = true;
        };
        const scheduler = window.museumApp?.scheduler;
        try {
          if (scheduler) await scheduler.enqueue({
            id: `signage-fallback:${roomId || 'shared'}:${signageRequestId++}`,
            owner: `room:${roomId || 'shared'}`,
            priority: 'background',
            steps: [{ label: 'Creating signage', run: fallback }]
          }).promise;
          else fallback();
        } catch (fallbackError) {
          if (fallbackError.name !== 'AbortError') console.warn('Main-thread text texture fallback failed.', fallbackError);
        }
      }
    })();
    trackRoomPromise(roomId, complete);
  }
  return plane;
}
