import { desiredTier, sourceForTier, TEXTURE_LIMITS } from './texture-policy.js';

export class ProgressiveTextureManager {
  constructor({ camera, onError = console.warn }) {
    this.camera = camera;
    this.onError = onError;
    this.items = new Map();
    this.blobCache = new Map();
    this.lastTick = performance.now();
    this.originalOwners = new Set();
    this.tmpPosition = new THREE.Vector3();
    this.tmpDirection = new THREE.Vector3();
  }

  register({ id, roomId, plane, frame, sources }) {
    const item = {
      id, roomId, plane, frame, sources, tier: null, requestedTier: null,
      texture: null, gazeMs: 0, gazeLostMs: 0, loading: false, disposed: false
    };
    this.items.set(id, item);
    this.requestTier(item, 'low');
    return () => this.disposeItem(id);
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
    return texture;
  }

  async requestTier(item, tier) {
    if (item.disposed || item.loading || item.tier === tier || item.requestedTier === tier) return;
    if (tier === 'original' && !this.originalOwners.has(item.id) && this.originalOwners.size >= TEXTURE_LIMITS.maxOriginalTextures) return;
    item.loading = true;
    item.requestedTier = tier;
    if (tier === 'original') this.originalOwners.add(item.id);
    try {
      const source = sourceForTier(item.sources, tier);
      const texture = await this.createTexture(source.url, source.maxEdge);
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
      if (oldTexture) {
        oldTexture.userData.imageBitmap?.close();
        oldTexture.dispose();
      }
    } catch (error) {
      if (tier === 'original') this.originalOwners.delete(item.id);
      this.onError(`照片加载失败：${item.sources[tier] || item.sources.original}`, error);
    } finally {
      item.loading = false;
      item.requestedTier = null;
    }
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
      if (item.disposed || !item.plane.object3D.visible) continue;
      const photoPosition = item.plane.object3D.getWorldPosition(new THREE.Vector3());
      const toPhoto = photoPosition.clone().sub(cameraPosition);
      const distance = toPhoto.length();
      const angleDegrees = THREE.MathUtils.radToDeg(cameraDirection.angleTo(toPhoto.normalize()));
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
    for (const item of [...this.items.values()]) if (item.roomId === roomId) this.disposeItem(item.id);
  }

  disposeItem(id) {
    const item = this.items.get(id);
    if (!item) return;
    item.disposed = true;
    item.texture?.userData.imageBitmap?.close();
    item.texture?.dispose();
    this.originalOwners.delete(id);
    this.items.delete(id);
  }

  dispose() {
    for (const id of [...this.items.keys()]) this.disposeItem(id);
    this.blobCache.clear();
  }
}
