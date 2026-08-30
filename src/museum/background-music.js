const DEFAULT_VOLUME = 0.35;

export function backgroundMusicForRoom(config, roomId) {
  const lobby = config.museum.lobby;
  const room = roomId === lobby.id ? lobby : config.rooms.find((item) => item.id === roomId);
  return room?.backgroundMusic || config.museum.backgroundMusic || null;
}

export class BackgroundMusicManager {
  constructor({
    audioFactory = () => new Audio(),
    unlockTargets = typeof window === 'undefined' ? [] : [window],
    onError = () => {}
  } = {}) {
    this.audio = audioFactory();
    this.audio.loop = true;
    this.audio.preload = 'auto';
    this.onError = onError;
    this.currentUrl = null;
    this.trackVolume = DEFAULT_VOLUME;
    this.volume = 1;
    this.muted = false;
    this.blocked = false;
    this.revision = 0;
    this.unlockTargets = unlockTargets;
    this.unlockEvents = ['pointerdown', 'touchstart', 'keydown', 'selectstart', 'enter-vr'];
    this.resume = this.resume.bind(this);
    for (const target of this.unlockTargets) {
      for (const event of this.unlockEvents) target?.addEventListener?.(event, this.resume);
    }
  }

  setTrack(track) {
    const url = track?.url || null;
    this.trackVolume = track?.volume ?? DEFAULT_VOLUME;
    if (url === this.currentUrl) {
      this.applyPreferences();
      if (url && this.audio.paused) this.tryPlay();
      return;
    }

    this.revision += 1;
    this.audio.pause();
    this.currentUrl = url;
    this.blocked = false;
    if (!url) {
      this.audio.removeAttribute?.('src');
      this.audio.load?.();
      return;
    }

    this.audio.src = url;
    this.applyPreferences();
    this.audio.load?.();
    this.tryPlay();
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    this.applyPreferences();
  }

  setVolume(volume) {
    const parsed = Number(volume);
    if (!Number.isFinite(parsed)) return;
    this.volume = Math.min(1, Math.max(0, parsed));
    this.applyPreferences();
  }

  applyPreferences() {
    this.audio.muted = this.muted;
    this.audio.volume = this.trackVolume * this.volume;
  }

  async tryPlay() {
    if (!this.currentUrl) return;
    const revision = this.revision;
    try {
      await this.audio.play();
      if (revision === this.revision) this.blocked = false;
    } catch (error) {
      if (revision !== this.revision) return;
      if (error?.name === 'NotAllowedError') {
        this.blocked = true;
        return;
      }
      this.onError(`Could not play background music: ${error?.message || this.currentUrl}`);
    }
  }

  resume() {
    if (this.currentUrl && (this.blocked || this.audio.paused)) this.tryPlay();
  }

  dispose() {
    this.revision += 1;
    this.audio.pause();
    this.audio.removeAttribute?.('src');
    this.audio.load?.();
    for (const target of this.unlockTargets) {
      for (const event of this.unlockEvents) target?.removeEventListener?.(event, this.resume);
    }
  }
}

export { DEFAULT_VOLUME };
