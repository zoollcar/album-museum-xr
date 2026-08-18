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
    if (context.measureText(row + char).width > maxWidth && row) { rows.push(row); row = char; }
    else row += char;
  }
  if (row) rows.push(row);
  return rows;
}

self.addEventListener('message', ({ data }) => {
  try {
    const options = data.options;
    const displayWidth = options.width || 2;
    const displayHeight = options.height || 1;
    const textureHeight = options.textureHeight || 512;
    const width = options.textureWidth || Math.min(2048, Math.max(512, Math.round(textureHeight * displayWidth / displayHeight)));
    const canvas = new OffscreenCanvas(width, textureHeight);
    const context = canvas.getContext('2d');
    const style = SIGN_STYLES[options.signStyle] || SIGN_STYLES['wall-label'];
    context.clearRect(0, 0, width, textureHeight);
    if (style.background !== 'transparent') {
      context.fillStyle = style.background;
      context.fillRect(0, 0, width, textureHeight);
      if (style.border) { context.strokeStyle = style.border; context.lineWidth = 3; context.strokeRect(10, 10, width - 20, textureHeight - 20); }
    }
    const padding = options.signStyle === 'brass' ? 48 : 54;
    const x = options.align === 'center' ? width / 2 : padding;
    context.textAlign = options.align || 'left';
    context.textBaseline = 'top';
    if (options.signStyle === 'slogan' && options.align !== 'center') { context.fillStyle = style.accent; context.fillRect(padding, 34, Math.min(180, width * .14), 5); }
    if (options.signStyle === 'wall-label') { context.fillStyle = '#7b6043'; context.fillRect(22, 42, 4, Math.max(160, textureHeight - 84)); }
    if (options.title) {
      context.fillStyle = style.accent;
      context.font = `600 ${style.titleSize}px "Segoe UI", "Microsoft YaHei", sans-serif`;
      context.fillText(options.title, x, options.signStyle === 'slogan' && options.align !== 'center' ? 66 : 42);
    }
    context.fillStyle = style.color;
    context.font = `400 ${style.bodySize}px "Segoe UI", "Microsoft YaHei", sans-serif`;
    let y = options.title ? 150 : 54;
    for (const line of options.lines || []) for (const part of wrapCanvasText(context, line, width - padding * 2)) {
      context.fillText(part, x, y);
      y += style.bodySize + 16;
      if (y > textureHeight - 36) break;
    }
    const bitmap = canvas.transferToImageBitmap();
    self.postMessage({ id: data.id, bitmap }, [bitmap]);
  } catch (error) {
    self.postMessage({ id: data.id, error: error.message || String(error) });
  }
});
