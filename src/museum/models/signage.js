import { entity } from './primitives.js';

const SIGN_STYLES = {
  slogan: { background: 'transparent', color: '#3b3027', accent: '#73583b', titleSize: 132, bodySize: 64, border: null },
  'wall-label': { background: 'transparent', color: '#342d27', accent: '#342d27', titleSize: 76, bodySize: 50, border: null },
  brass: { background: '#5f4933', color: '#f6efe5', accent: '#f6efe5', titleSize: 88, bodySize: 44, border: '#a98960' },
  section: { background: 'transparent', color: '#3a312a', accent: '#765b3d', titleSize: 66, bodySize: 42, border: null }
};

function wrapCanvasText(context, text, maxWidth) {
  if (!text) return [];
  const rows = [];
  let row = '';
  for (const char of [...String(text)]) {
    if (context.measureText(row + char).width > maxWidth && row) {
      rows.push(row);
      row = char;
    } else row += char;
  }
  if (row) rows.push(row);
  return rows;
}

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
  if (title) {
    context.fillStyle = style.accent;
    context.font = `600 ${style.titleSize}px "Segoe UI", "Microsoft YaHei", sans-serif`;
    context.fillText(title, x, signStyle === 'slogan' && align !== 'center' ? 66 : 42);
  }
  context.fillStyle = style.color;
  context.font = `400 ${style.bodySize}px "Segoe UI", "Microsoft YaHei", sans-serif`;
  let y = title ? 150 : 54;
  for (const line of lines) {
    for (const part of wrapCanvasText(context, line, width - padding * 2)) {
      context.fillText(part, x, y);
      y += style.bodySize + 16;
      if (y > height - 36) break;
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export function textPlane(parent, options) {
  const plane = entity('a-entity', { position: options.position, rotation: options.rotation }, parent);
  const texture = makeTextCanvas(options);
  const material = new THREE.MeshBasicMaterial({
    map: texture, transparent: true, side: THREE.DoubleSide, toneMapped: false,
    depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2
  });
  plane.setObject3D('mesh', new THREE.Mesh(new THREE.PlaneGeometry(options.width, options.height), material));
  plane.dataset.canvasTexture = 'true';
  plane.dataset.signStyle = options.signStyle || 'wall-label';
  return plane;
}
