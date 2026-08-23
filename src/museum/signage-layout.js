const SIGN_STYLES = {
  slogan: { titleSize: 132, bodySize: 64, titleMin: 56, bodyMin: 38, lineGap: 16 },
  'wall-label': { titleSize: 76, bodySize: 50, titleMin: 48, bodyMin: 32, lineGap: 14 },
  brass: { titleSize: 88, bodySize: 44, titleMin: 52, bodyMin: 28, lineGap: 12 },
  section: { titleSize: 66, bodySize: 42, titleMin: 42, bodyMin: 28, lineGap: 12 }
};

// This intentionally conservative metric makes the layout testable in Node.
// Canvas callers provide their own measure function, so the rendered result uses
// the browser's real font metrics while retaining the same line-breaking rules.
export function estimateTextWidth(text, fontSize) {
  return [...String(text || '')].reduce((width, char) => width + fontSize * (/[\u0000-\u00ff]/.test(char) ? .56 : 1), 0);
}

export function wrapText(text, maxWidth, measure = estimateTextWidth) {
  if (!text) return [];
  const rows = [];
  let row = '';
  for (const char of [...String(text)]) {
    if (measure(row + char) > maxWidth && row) {
      rows.push(row);
      row = char;
    } else row += char;
  }
  if (row) rows.push(row);
  return rows;
}

function truncate(text, maxWidth, measure) {
  const ellipsis = '…';
  if (measure(text) <= maxWidth) return text;
  let result = '';
  for (const char of [...String(text)]) {
    if (measure(result + char + ellipsis) > maxWidth) break;
    result += char;
  }
  return `${result}${ellipsis}`;
}

export function planSignage({ title = '', lines = [], width = 2, height = 1, textureWidth = null, textureHeight = 512, signStyle = 'wall-label', measureText = null }) {
  const style = SIGN_STYLES[signStyle] || SIGN_STYLES['wall-label'];
  const canvasWidth = textureWidth || Math.min(2048, Math.max(512, Math.round(textureHeight * width / height)));
  const padding = signStyle === 'brass' ? 48 : 54;
  const availableWidth = canvasWidth - padding * 2;
  const titleTop = signStyle === 'slogan' ? 66 : 42;
  const bodyTop = title ? 150 : 54;
  const maxBottom = textureHeight - 36;
  let titleSize = style.titleSize;
  let bodySize = style.bodySize;
  let rows = [];
  let overflow = false;

  for (;;) {
    const measure = (text, size = bodySize) => measureText ? measureText(text, size) : estimateTextWidth(text, size);
    const candidate = lines.flatMap((line) => wrapText(line, availableWidth, (text) => measure(text)));
    const usedHeight = bodyTop + candidate.length * (bodySize + style.lineGap);
    const titleFits = !title || measure(title, titleSize) <= availableWidth;
    if ((titleFits && usedHeight <= maxBottom) || (titleSize <= style.titleMin && bodySize <= style.bodyMin)) {
      rows = candidate;
      overflow = !titleFits || usedHeight > maxBottom;
      if (overflow) {
        const maxRows = Math.max(0, Math.floor((maxBottom - bodyTop) / (bodySize + style.lineGap)));
        rows = rows.slice(0, maxRows);
        if (rows.length) rows[rows.length - 1] = truncate(rows[rows.length - 1], availableWidth, (text) => measure(text));
      }
      return { canvasWidth, textureHeight, padding, titleSize, bodySize, lineGap: style.lineGap, title: truncate(title, availableWidth, (text) => measure(text, titleSize)), rows, titleTop, bodyTop, overflow };
    }
    titleSize = Math.max(style.titleMin, titleSize - 4);
    bodySize = Math.max(style.bodyMin, bodySize - 3);
  }
}
