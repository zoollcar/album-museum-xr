import { desiredTier, sourceForTier, TEXTURE_LIMITS } from './texture-policy.js';

export class ProgressiveTextureManager {
  constructor({ camera, scheduler = null, isRoomActive = () => true, onError = console.warn }) {
    this.camera = camera;
    this.scheduler = scheduler;
    this.isRoomActive = isRoomActive;
    this.onError = onError;
    this.items = new Map();
    this.blobCache = new Map();
    this.lastTick = performance.now();
    this.originalOwners = new Set();
    this.tmpPosition = new THREE.Vector3();
    this.tmpDirection = new THREE.Vector3();
    this.tmpPhotoPosition = new THREE.Vector3();
    this.tmpToPhoto = new THREE.Vector3();
    this.roomPriorities = new Map();
    this.decodeActive = 0;
    this.decodeWaiters = [];
    this.disposeSequence = 0;
  }

  register({ id, roomId, plane, frame, sources }) {
    const item = {
      id, roomId, plane, frame, sources, tier: null, requestedTier: null,
      texture: null, gazeMs: 0, gazeLostMs: 0, loading: false, disposed: false, lowReady: null
    };
    this.items.set(id, item);
    item.lowReady = this.requestTier(item, 'low');
    return () => this.disposeItem(id);
  }

  setRoomPriority(roomId, priority) {
    this.roomPriorities.set(roomId, priority);
  }

  async waitForRoomLow(roomId) {
    const pending = [...this.items.values()].filter((item) => item.roomId === roomId).map((item) => item.lowReady).filter(Boolean);
    await Promise.allSettled(pending);
  }

  async fetchBlob(url) {
    if (!this.blobCache.has(url)) {
      this.blobCache.set(url, fetch(url, { mode: 'cors', credentials: 'omit' }).then((response) => {
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        return response.blob();
      }).catch((error) => {
        this.blobCache.delete(url);
        throw error;
      }));
      window.setTimeout(() => this.blobCache.delete(url), 5000);
    }
    return this.blobCache.get(url);
  }

  async createTexture(url, maxEdge) {
    const blob = await this.fetchBlob(url);
    return this.withDecodeSlot(async () => {
      let bitmap;
      if (maxEdge) {
        const probe = await createImageBitmap(blob);
        const scale = Math.min(1, maxEdge / Math.max(probe.width, probe.height));
        const width = Math.max(1, Math.round(probe.width * scale));
        const height = Math.max(1, Math.round(probe.height * scale));
        probe.close();
        bitmap = await createImageBitmap(blob, { imageOrientation: 'flipY', resizeWidth: width, resizeHeight: height, resizeQuality: 'high' });
      } else {
        bitmap = await createImageBitmap(blob, { imageOrientation: 'flipY' });
      }
      const texture = new THREE.Texture(bitmap);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.flipY = false;
      texture.needsUpdate = true;
      texture.userData.imageBitmap = bitmap;
      texture.userData.managedProgressive = true;
      return texture;
    });
  }

  async withDecodeSlot(work) {
    if (this.decodeActive >= 1) await new Promise((resolve) => this.decodeWaiters.push(resolve));
    this.decodeActive += 1;
    try {
      return await work();
    } finally {
      this.decodeActive -= 1;
      this.decodeWaiters.shift()?.();
    }
  }

  async requestTier(item, tier) {
    if (item.disposed || item.loading || item.tier === tier || item.requestedTier === tier) return;
    if (tier === 'original' && !this.originalOwners.has(item.id) && this.originalOwners.size >= TEXTURE_LIMITS.maxOriginalTextures) return;
    item.loading = true;
    item.requestedTier = tier;
    if (tier === 'original') this.originalOwners.add(item.id);
    let texture = null;
    try {
      const source = sourceForTier(item.sources, tier);
      texture = await this.createTexture(source.url, source.maxEdge);
      const commit = () => this.commitTexture(item, tier, texture);
      if (this.scheduler) {
        const task = this.scheduler.enqueue({
          id: `texture:${item.id}:${tier}:${Date.now()}`,
          owner: `texture:${item.roomId}`,
          priority: this.roomPriorities.get(item.roomId) || 'background',
          steps: [{ label: '加载预览图', run: commit }]
        });
        await task.promise;
      } else commit();
    } catch (error) {
      if (texture && item.texture !== texture) {
        texture.userData.imageBitmap?.close();
        texture.dispose();
      }
      if (tier === 'original') this.originalOwners.delete(item.id);
      if (error.name !== 'AbortError') this.onError(`照片加载失败：${item.sources[tier] || item.sources.original}`, error);
    } finally {
      item.loading = false;
      item.requestedTier = null;
    }
  }

  commitTexture(item, tier, texture) {
    if (item.disposed || item.requestedTier !== tier) {
      texture.userData.imageBitmap?.close();
      texture.dispose();
      return;
    }
    const mesh = item.plane.getObject3D('mesh');
    if (!mesh) throw new Error('照片平面尚未创建。');
    const oldTexture = item.texture;
    mesh.material.map = texture;
    mesh.material.color.set('#ffffff');
    mesh.material.needsUpdate = true;
    this.fitFrame(item, texture.image.width, texture.image.height);
    item.texture = texture;
    item.tier = tier;
    if (tier !== 'original') this.originalOwners.delete(item.id);
    if (oldTexture) this.disposeTexture(oldTexture);
  }

  disposeTexture(texture, { immediate = false, owner = 'texture:cleanup' } = {}) {
    const dispose = () => {
      texture.userData.imageBitmap?.close();
      texture.dispose();
    };
    if (!immediate && this.scheduler) {
      const task = this.scheduler.enqueue({ id: `texture-dispose:${++this.disposeSequence}`, owner, priority: 'cleanup', steps: [dispose] });
      task.promise.catch((error) => { if (error.name !== 'AbortError') this.onError('纹理释放失败。', error); });
    } else dispose();
  }

  fitFrame(item, width, height) {
    const maxWidth = Number(item.plane.dataset.maxWidth || 2.2);
    const maxHeight = Number(item.plane.dataset.maxHeight || 1.55);
    const scale = Math.min(maxWidth / width, maxHeight / height);
    const fittedWidth = width * scale;
    const fittedHeight = height * scale;
    item.plane.setAttribute('geometry', `primitive: plane; width: ${fittedWidth}; height: ${fittedHeight}`);
    if (item.frame) item.frame.setAttribute('geometry', `primitive: box; width: ${fittedWidth + 0.12}; height: ${fittedHeight + 0.12}; depth: 0.055`);
  }

  tick(now = performance.now()) {
    if (!this.camera) return;
    const delta = Math.min(1000, now - this.lastTick);
    this.lastTick = now;
    const cameraPosition = this.camera.getWorldPosition(this.tmpPosition);
    const cameraDirection = this.camera.getWorldDirection(this.tmpDirection);
    for (const item of this.items.values()) {
      if (item.disposed || !this.isRoomActive(item.roomId) || !item.plane.object3D.visible) continue;
      item.plane.object3D.getWorldPosition(this.tmpPhotoPosition);
      this.tmpToPhoto.copy(this.tmpPhotoPosition).sub(cameraPosition);
      const distance = this.tmpToPhoto.length();
      const angleDegrees = THREE.MathUtils.radToDeg(cameraDirection.angleTo(this.tmpToPhoto.normalize()));
      const gazing = distance <= TEXTURE_LIMITS.originalDistance && angleDegrees <= TEXTURE_LIMITS.gazeAngleDegrees;
      item.gazeMs = gazing ? item.gazeMs + delta : 0;
      item.gazeLostMs = gazing ? 0 : item.gazeLostMs + delta;
      const tier = desiredTier({
        distance, angleDegrees, gazeMs: item.gazeMs,
        isOriginal: item.tier === 'original', gazeLostMs: item.gazeLostMs
      });
      this.requestTier(item, tier);
    }
  }

  disposeRoom(roomId) {
    this.scheduler?.cancelOwner(`texture:${roomId}`);
    for (const item of [...this.items.values()]) if (item.roomId === roomId) this.disposeItem(item.id);
    this.roomPriorities.delete(roomId);
  }

  disposeItem(id, { immediate = false } = {}) {
    const item = this.items.get(id);
    if (!item) return;
    item.disposed = true;
    if (item.texture) this.disposeTexture(item.texture, { immediate, owner: `texture:${item.roomId}` });
    this.originalOwners.delete(id);
    this.items.delete(id);
  }

  dispose() {
    for (const id of [...this.items.keys()]) this.disposeItem(id, { immediate: true });
    this.blobCache.clear();
  }
}
