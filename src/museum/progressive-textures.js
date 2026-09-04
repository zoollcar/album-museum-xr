import { desiredTier, sourceForTier, TEXTURE_LIMITS } from './texture-policy.js';

const DEFAULT_RETRY_DELAYS = [1000, 5000];
const MAX_BLOB_CACHE_ENTRIES = 256;

export class ProgressiveTextureManager {
  constructor({
    camera,
    scheduler = null,
    isRoomActive = () => true,
    onError = console.warn,
    now = () => performance.now(),
    retryDelays = DEFAULT_RETRY_DELAYS
  }) {
    this.camera = camera;
    this.scheduler = scheduler;
    this.isRoomActive = isRoomActive;
    this.onError = onError;
    this.now = now;
    this.retryDelays = retryDelays;
    this.items = new Map();
    this.blobCache = new Map();
    this.failedSources = new Map();
    this.sourceOwners = new Map();
    this.countedFailures = new WeakSet();
    this.reportedFailures = new WeakSet();
    this.lastTick = this.now();
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

  register({ id, roomId, plane, frame, sources, label = id }) {
    const item = {
      id, roomId, plane, frame, sources, label, tier: null, requestedTier: null,
      texture: null, gazeMs: 0, gazeLostMs: 0, loading: false, disposed: false, lowReady: null,
      sourceUrls: [...new Set(Object.values(sources).filter(Boolean))]
    };
    this.items.set(id, item);
    this.retainSources(item);
    item.lowReady = this.requestTier(item, 'low');
    return () => this.disposeItem(id);
  }

  retainSources(item) {
    for (const url of item.sourceUrls) {
      const owners = this.sourceOwners.get(url) || new Map();
      owners.set(item.roomId, (owners.get(item.roomId) || 0) + 1);
      this.sourceOwners.set(url, owners);
    }
  }

  releaseSources(item) {
    for (const url of item.sourceUrls || []) {
      const owners = this.sourceOwners.get(url);
      if (!owners) continue;
      const remaining = (owners.get(item.roomId) || 0) - 1;
      if (remaining > 0) owners.set(item.roomId, remaining);
      else owners.delete(item.roomId);
      if (owners.size) continue;
      this.sourceOwners.delete(url);
      this.blobCache.delete(url);
      this.failedSources.delete(url);
    }
  }

  setRoomPriority(roomId, priority) {
    this.roomPriorities.set(roomId, priority);
  }

  async waitForRoomLow(roomId, onProgress = null) {
    const items = [...this.items.values()].filter((item) => item.roomId === roomId && item.lowReady);
    const waiting = items.filter((item) => !item.tier);
    const settled = new Set(items.filter((item) => item.tier));
    const report = (lastItem = null) => {
      const next = waiting.find((item) => !settled.has(item));
      const completed = settled.size;
      onProgress?.({
        roomId,
        label: next?.label || lastItem?.label || '',
        completed,
        total: items.length,
        progress: items.length ? completed / items.length : 1
      });
    };
    report();
    await Promise.allSettled(waiting.map(async (item) => {
      try {
        await item.lowReady;
      } finally {
        settled.add(item);
        report(item);
      }
    }));
  }

  async fetchBlob(url) {
    let request = this.blobCache.get(url);
    if (request) {
      this.blobCache.delete(url);
      this.blobCache.set(url, request);
      return request;
    }
    request = fetch(url, { mode: 'cors', credentials: 'omit' }).then((response) => {
      if (!response.ok) {
        const error = new Error(`${response.status} ${response.statusText}`);
        error.retryable = response.status === 408 || response.status === 429 || response.status >= 500;
        throw error;
      }
      return response.blob();
    }).catch((error) => {
      if (error.retryable === undefined && error instanceof TypeError) error.retryable = true;
      if (this.blobCache.get(url) === request) this.blobCache.delete(url);
      throw error;
    });
    this.blobCache.set(url, request);
    while (this.blobCache.size > MAX_BLOB_CACHE_ENTRIES) {
      this.blobCache.delete(this.blobCache.keys().next().value);
    }
    window.setTimeout(() => {
      if (this.blobCache.get(url) === request) this.blobCache.delete(url);
    }, 5000);
    return request;
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
    const source = sourceForTier(item.sources, tier);
    if (!this.canRequestSource(source.url)) return;
    item.loading = true;
    item.requestedTier = tier;
    if (tier === 'original') this.originalOwners.add(item.id);
    let texture = null;
    try {
      texture = await this.createTexture(source.url, source.maxEdge);
      this.failedSources.delete(source.url);
      const commit = () => this.commitTexture(item, tier, texture);
      if (this.scheduler) {
        const task = this.scheduler.enqueue({
          id: `texture:${item.id}:${tier}:${Date.now()}`,
          owner: `texture:${item.roomId}`,
          priority: this.roomPriorities.get(item.roomId) || 'background',
          steps: [{ label: 'Loading previews', run: commit }]
        });
        await task.promise;
      } else commit();
    } catch (error) {
      if (texture && item.texture !== texture) {
        texture.userData.imageBitmap?.close();
        texture.dispose();
      }
      if (tier === 'original') this.originalOwners.delete(item.id);
      if (!item.disposed && error.name !== 'AbortError') {
        const failure = this.recordFailure(source.url, error);
        if (!this.reportedFailures.has(error)) {
          this.reportedFailures.add(error);
          const suffix = failure.exhausted
            ? '; automatic retries have stopped.'
            : `; retrying later (${failure.attempts}/${this.retryDelays.length + 1}).`;
          this.onError(`Could not load photo: ${source.url}${suffix}`, error);
        }
      }
    } finally {
      item.loading = false;
      item.requestedTier = null;
    }
  }

  canRequestSource(url) {
    const failure = this.failedSources.get(url);
    return !failure || (!failure.exhausted && this.now() >= failure.nextRetryAt);
  }

  recordFailure(url, error) {
    const previous = this.failedSources.get(url) || { attempts: 0 };
    if (this.countedFailures.has(error)) return previous;
    this.countedFailures.add(error);
    const attempts = previous.attempts + 1;
    const retryable = error.retryable === true;
    const exhausted = !retryable || attempts > this.retryDelays.length;
    const nextRetryAt = exhausted ? Number.POSITIVE_INFINITY : this.now() + this.retryDelays[attempts - 1];
    const failure = { attempts, exhausted, nextRetryAt };
    this.failedSources.set(url, failure);
    return failure;
  }

  commitTexture(item, tier, texture) {
    if (item.disposed || item.requestedTier !== tier) {
      texture.userData.imageBitmap?.close();
      texture.dispose();
      return;
    }
    const mesh = item.plane.getObject3D('mesh');
    if (!mesh) throw new Error('Photo plane has not been created yet.');
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
      task.promise.catch((error) => { if (error.name !== 'AbortError') this.onError('Could not release texture.', error); });
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

  tick(now = this.now()) {
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
    this.releaseSources(item);
    this.items.delete(id);
  }

  dispose() {
    for (const id of [...this.items.keys()]) this.disposeItem(id, { immediate: true });
    this.blobCache.clear();
    this.failedSources.clear();
    this.sourceOwners.clear();
  }
}
