import 'aframe';
import 'aframe-blink-controls';
import './styles.css';
import { validateMuseumConfig } from './config/validate.js';
import { buildMuseumLayout } from './museum/layout.js';
import { registerMuseumComponents } from './museum/components.js';
import { MuseumScene } from './museum/scene-builder.js';
import { parseSpawnRequest } from './museum/spawn.js';

registerMuseumComponents();

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
    this.helpToggle = document.getElementById('help-toggle');
    this.toastTimer = null;
    this.helpToggle.addEventListener('click', () => this.setHelp(this.help.classList.contains('is-hidden')));
    document.getElementById('help-close').addEventListener('click', () => this.setHelp(false));
  }

  progress(percent, title, detail) {
    this.loadingProgress.style.width = `${percent}%`;
    if (title) this.loadingTitle.textContent = title;
    if (detail) this.loadingDetail.textContent = detail;
  }

  ready() {
    this.loading.classList.add('is-hidden');
    this.header.classList.remove('is-hidden');
  }

  fail(errors) {
    this.loadingTitle.textContent = '展馆配置需要修改';
    this.loadingDetail.innerHTML = errors.map((error) => `<span style="display:block;margin:.45em 0">${escapeHtml(error)}</span>`).join('');
    this.loadingProgress.style.width = '100%';
    this.loadingProgress.style.background = '#9b4f3f';
  }

  setRoom(museum, room) {
    this.museumTitle.textContent = museum;
    this.roomTitle.textContent = room;
  }

  setHelp(open) {
    this.help.classList.toggle('is-hidden', !open);
    this.helpToggle.setAttribute('aria-expanded', String(open));
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

async function bootstrap() {
  const ui = new MuseumUI();
  try {
    ui.progress(16, '正在准备博物馆', '读取 JSON 配置…');
    const params = new URLSearchParams(window.location.search);
    const spawnRequest = parseSpawnRequest(params, window.location.hostname);
    const configUrl = params.get('config') || '/museum.json';
    const response = await fetch(configUrl, { credentials: 'omit' });
    if (!response.ok) throw new Error(`无法读取配置 ${configUrl}（${response.status}）`);
    const config = await response.json();
    const validation = validateMuseumConfig(config);
    if (!validation.valid) {
      ui.fail(validation.errors);
      return;
    }

    ui.progress(38, '正在计算参观路线', '布置房间、走廊与电梯…');
    const layout = buildMuseumLayout(config);
    const scene = document.getElementById('museum-scene');
    await waitForScene(scene);
    ui.progress(58, '正在布置大厅', '准备灯光、展墙和欢迎展品…');
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
    ui.progress(100, '博物馆已经开放', '祝你参观愉快。');
    window.setTimeout(() => ui.ready(), 420);

    scene.addEventListener('enter-vr', () => {
      ui.setHelp(false);
      document.body.classList.add('is-vr');
      document.getElementById('crosshair').classList.add('is-hidden');
    });
    scene.addEventListener('exit-vr', () => {
      document.body.classList.remove('is-vr');
      document.getElementById('crosshair').classList.remove('is-hidden');
    });
  } catch (error) {
    console.error(error);
    ui.fail([error.message || '未知错误']);
  }
}

bootstrap();
