import 'aframe';
import 'aframe-blink-controls';
import 'handy-work/build/handy-controls.min.js';
import 'handy-work/build/magnet-helpers.min.js';
import 'aframe-htmlmesh/build/aframe-html.js';
import './styles.css';
import { validateMuseumConfig } from './config/validate.js';
import { buildMuseumLayout } from './museum/layout.js';
import { registerMuseumComponents } from './museum/components.js';
import { MuseumScene } from './museum/scene-builder.js';
import { parseSpawnRequest } from './museum/spawn.js';
import { VrMovementModeController } from './museum/movement-mode.js';

registerMuseumComponents();

const MUSIC_MUTED_KEY = 'museum.backgroundMusic.muted';
const MUSIC_VOLUME_KEY = 'museum.backgroundMusic.volume';

function readMusicPreferences() {
  try {
    const storedVolume = Number.parseFloat(localStorage.getItem(MUSIC_VOLUME_KEY));
    return {
      muted: localStorage.getItem(MUSIC_MUTED_KEY) === 'true',
      volume: Number.isFinite(storedVolume) ? Math.min(1, Math.max(0, storedVolume)) : 1
    };
  } catch {
    return { muted: false, volume: 1 };
  }
}

function storeMusicPreference(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch { /* Storage can be unavailable in private or restricted contexts. */ }
}

class MuseumUI {
  constructor() {
    this.loading = document.getElementById('loading-screen');
    this.loadingTitle = document.getElementById('loading-title');
    this.loadingDetail = document.getElementById('loading-detail');
    this.loadingProgress = document.getElementById('loading-progress');
    this.header = document.getElementById('museum-header');
    this.museumTitle = document.getElementById('museum-title');
    this.roomTitle = document.getElementById('room-title');
    this.toastEl = document.getElementById('toast');
    this.help = document.getElementById('help-panel');
    this.settings = document.getElementById('settings-panel');
    this.helpToggle = document.getElementById('help-toggle');
    this.settingsToggle = document.getElementById('settings-toggle');
    this.musicMute = document.getElementById('music-mute');
    this.musicVolume = document.getElementById('music-volume');
    this.musicVolumeValue = document.getElementById('music-volume-value');
    this.musicPreferences = readMusicPreferences();
    this.musicMute.checked = this.musicPreferences.muted;
    this.musicVolume.value = String(Math.round(this.musicPreferences.volume * 100));
    this.updateMusicVolumeValue();
    this.toastTimer = null;
    this.helpToggle.addEventListener('click', () => this.setHelp(this.help.classList.contains('is-hidden')));
    document.getElementById('help-close').addEventListener('click', () => this.setHelp(false));
    this.settingsToggle.addEventListener('click', () => this.setSettings(this.settings.classList.contains('is-hidden')));
    document.getElementById('settings-close').addEventListener('click', () => this.setSettings(false));
    this.musicMute.addEventListener('change', () => {
      this.musicPreferences.muted = this.musicMute.checked;
      storeMusicPreference(MUSIC_MUTED_KEY, this.musicPreferences.muted);
      this.musicManager?.setMuted(this.musicPreferences.muted);
    });
    this.musicVolume.addEventListener('input', () => {
      this.musicPreferences.volume = Number(this.musicVolume.value) / 100;
      this.updateMusicVolumeValue();
      storeMusicPreference(MUSIC_VOLUME_KEY, this.musicPreferences.volume);
      this.musicManager?.setVolume(this.musicPreferences.volume);
    });
  }

  connectBackgroundMusic(manager) {
    this.musicManager = manager;
    manager.setMuted(this.musicPreferences.muted);
    manager.setVolume(this.musicPreferences.volume);
  }

  updateMusicVolumeValue() {
    this.musicVolumeValue.textContent = `${this.musicVolume.value}%`;
  }

  progress(percent, title, detail) {
    this.loadingProgress.style.width = `${percent}%`;
    if (title) this.loadingTitle.textContent = title;
    if (detail) this.loadingDetail.textContent = detail;
  }

  ready() {
    this.loading.classList.add('is-hidden');
    this.header.classList.remove('is-hidden');
    document.body.classList.add('museum-ready');
  }

  fail(errors) {
    this.loadingTitle.textContent = 'Museum configuration needs attention';
    this.loadingDetail.innerHTML = errors.map((error) => `<span style="display:block;margin:.45em 0">${escapeHtml(error)}</span>`).join('');
    this.loadingProgress.style.width = '100%';
    this.loadingProgress.style.background = '#9b4f3f';
  }

  setRoom(museum, room) {
    this.museumTitle.textContent = museum;
    this.roomTitle.textContent = room;
  }

  setHelp(open) {
    if (open) this.setSettings(false);
    this.help.classList.toggle('is-hidden', !open);
    this.helpToggle.setAttribute('aria-expanded', String(open));
    window.dispatchEvent(new Event('mobile-controls-reset'));
  }

  setSettings(open) {
    if (open) {
      this.help.classList.add('is-hidden');
      this.helpToggle.setAttribute('aria-expanded', 'false');
    }
    this.settings.classList.toggle('is-hidden', !open);
    this.settingsToggle.setAttribute('aria-expanded', String(open));
    window.dispatchEvent(new Event('mobile-controls-reset'));
  }

  toast(message, duration = 2800) {
    clearTimeout(this.toastTimer);
    this.toastEl.textContent = message;
    this.toastEl.classList.remove('is-hidden');
    this.toastTimer = setTimeout(() => this.toastEl.classList.add('is-hidden'), duration);
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

function waitForScene(scene) {
  if (scene.hasLoaded) return Promise.resolve();
  return new Promise((resolve) => scene.addEventListener('loaded', resolve, { once: true }));
}

async function loadMuseumConfig(configUrl) {
  const response = await fetch(configUrl, { credentials: 'omit' });
  if (!response.ok) throw new Error(`Could not load configuration ${configUrl} (${response.status})`);
  return response.json();
}

async function startMuseum(configUrl, { revokeConfigUrl = false } = {}) {
  const ui = new MuseumUI();
  try {
    ui.progress(16, 'Preparing the museum', 'Reading the JSON configuration…');
    const params = new URLSearchParams(window.location.search);
    const spawnRequest = parseSpawnRequest(params, window.location.hostname);
    let config;
    try {
      config = await loadMuseumConfig(configUrl);
    } finally {
      if (revokeConfigUrl) URL.revokeObjectURL(configUrl);
    }
    const validation = validateMuseumConfig(config);
    if (!validation.valid) {
      ui.fail(validation.errors);
      return;
    }

    ui.progress(38, 'Planning your route', 'Placing rooms, corridors, and elevators…');
    const layout = buildMuseumLayout(config);
    const scene = document.getElementById('museum-scene');
    await waitForScene(scene);
    const movementMode = new VrMovementModeController({
      scene,
      rig: document.getElementById('camera-rig'),
      teleporters: [document.getElementById('left-ray'), document.getElementById('right-ray')],
      inputs: document.querySelectorAll('[data-vr-movement]')
    });
    ui.progress(58, 'Setting up the lobby', 'Preparing lighting, gallery walls, and the welcome exhibit…');
    const app = new MuseumScene({
      scene,
      root: document.getElementById('museum-root'),
      rig: document.getElementById('camera-rig'),
      head: document.getElementById('head'),
      config,
      layout,
      ui,
      spawnRequest
    });
    window.museumApp = app;
    await app.initialize();
    ui.progress(100, 'The museum is open', 'Enjoy your visit.');
    window.setTimeout(() => ui.ready(), 420);

    scene.addEventListener('enter-vr', () => {
      ui.setHelp(false);
      ui.setSettings(false);
      document.body.classList.add('is-vr');
      document.getElementById('crosshair').classList.add('is-hidden');
    });
    scene.addEventListener('exit-vr', () => {
      document.body.classList.remove('is-vr');
      document.getElementById('crosshair').classList.remove('is-hidden');
    });
    scene.addEventListener('remove', () => {
      movementMode.dispose();
      app.dispose();
    }, { once: true });
  } catch (error) {
    console.error(error);
    ui.fail([error.message || 'Unknown error']);
  }
}

function createMuseumCard(museum, onSelect) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'museum-card';
  button.innerHTML = `<span class="museum-card-mark" aria-hidden="true"></span><span><strong>${escapeHtml(museum.title)}</strong><small>${escapeHtml(museum.description || 'Enter the museum and explore at your own pace')}</small></span><span class="museum-card-arrow" aria-hidden="true">→</span>`;
  button.addEventListener('click', () => onSelect(museum.config));
  return button;
}

async function setupWelcome() {
  const welcome = document.getElementById('welcome-screen');
  const list = document.getElementById('museum-list');
  const count = document.getElementById('museum-count');
  const status = document.getElementById('welcome-status');
  const importer = document.getElementById('tour-import');
  const start = (configUrl, options) => {
    welcome.classList.add('is-hidden');
    startMuseum(configUrl, options);
  };

  try {
    const manifest = await loadMuseumConfig('/museums/index.json');
    const museums = Array.isArray(manifest.museums) ? manifest.museums : [];
    count.textContent = `${museums.length} museum${museums.length === 1 ? '' : 's'}`;
    if (!museums.length) {
      list.textContent = 'There are no museums to visit yet.';
    } else {
      museums.forEach((museum) => list.appendChild(createMuseumCard(museum, start)));
    }
  } catch (error) {
    count.textContent = 'Could not load museums';
    status.textContent = 'The local museum catalog is unavailable, but you can still import a JSON tour.';
    console.error(error);
  }

  importer.addEventListener('change', async () => {
    const file = importer.files?.[0];
    if (!file) return;
    status.textContent = 'Checking the imported tour…';
    try {
      const config = JSON.parse(await file.text());
      const validation = validateMuseumConfig(config);
      if (!validation.valid) throw new Error(validation.errors[0]);
      const configUrl = URL.createObjectURL(new Blob([JSON.stringify(config)], { type: 'application/json' }));
      start(configUrl, { revokeConfigUrl: true });
    } catch (error) {
      status.textContent = `Could not import: ${error.message || 'Invalid JSON'}`;
      importer.value = '';
    }
  });
}

const params = new URLSearchParams(window.location.search);
if (params.get('config')) {
  document.getElementById('welcome-screen').classList.add('is-hidden');
  startMuseum(params.get('config'));
} else {
  setupWelcome();
}
