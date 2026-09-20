function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function mixNumber(a, b, t) {
  return a + (b - a) * t;
}

function parseHexColor(value) {
  const hex = value.replace('#', '');
  if (!/^[0-9a-f]+$/i.test(hex)) return null;

  if (hex.length === 3 || hex.length === 4) {
    const digits = hex.split('').map((char) => parseInt(char + char, 16));
    const [r, g, b, alpha = 255] = digits;
    return [r, g, b, alpha / 255];
  }

  if (hex.length === 6 || hex.length === 8) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const alpha = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
    return [r, g, b, alpha];
  }

  return null;
}

function hueToChannel(p, q, hue) {
  let h = hue;
  if (h < 0) h += 1;
  if (h > 1) h -= 1;
  if (h < 1 / 6) return p + (q - p) * 6 * h;
  if (h < 1 / 2) return q;
  if (h < 2 / 3) return p + (q - p) * (2 / 3 - h) * 6;
  return p;
}

function hslToRgb(h, s, l, alpha = 1) {
  const hue = (((h % 360) + 360) % 360) / 360;
  if (s === 0) {
    const gray = Math.round(l * 255);
    return [gray, gray, gray, alpha];
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hueToChannel(p, q, hue + 1 / 3) * 255),
    Math.round(hueToChannel(p, q, hue) * 255),
    Math.round(hueToChannel(p, q, hue - 1 / 3) * 255),
    alpha
  ];
}

function parseColor(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim().toLowerCase();
  const hex = parseHexColor(text);
  if (hex) return hex;

  const rgbMatch = text.match(/^rgba?\(\s*([^)]+)\)$/);
  if (rgbMatch) {
    const parts = rgbMatch[1].split(',').map((part) => part.trim());
    if (parts.length < 3 || parts.length > 4) return null;
    const channels = parts.slice(0, 3).map((part) => {
      if (part.endsWith('%')) return Number(part.slice(0, -1)) * 2.55;
      return Number(part);
    });
    const alphaPart = parts[3] ?? '1';
    const alpha = alphaPart.endsWith('%')
      ? Number(alphaPart.slice(0, -1)) / 100
      : Number(alphaPart);
    return [...channels, alpha];
  }

  const hslMatch = text.match(/^hsla?\(\s*([^)]+)\)$/);
  if (hslMatch) {
    const parts = hslMatch[1].split(',').map((part) => part.trim());
    if (parts.length < 3 || parts.length > 4) return null;
    const h = Number(parts[0]);
    const s = parts[1].endsWith('%') ? Number(parts[1].slice(0, -1)) / 100 : Number(parts[1]);
    const l = parts[2].endsWith('%') ? Number(parts[2].slice(0, -1)) / 100 : Number(parts[2]);
    const alphaPart = parts[3] ?? '1';
    const alpha = alphaPart.endsWith('%')
      ? Number(alphaPart.slice(0, -1)) / 100
      : Number(alphaPart);
    return hslToRgb(h, s, l, alpha);
  }

  return null;
}

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function mixColor(from, to, amount) {
  const ca = parseColor(from);
  const cb = parseColor(to);
  if (!ca || !cb) return null;

  const r = Math.round(mixNumber(ca[0], cb[0], amount));
  const g = Math.round(mixNumber(ca[1], cb[1], amount));
  const blue = Math.round(mixNumber(ca[2], cb[2], amount));
  const alpha = Math.round(mixNumber(ca[3], cb[3], amount) * 1000) / 1000;
  return `rgba(${r}, ${g}, ${blue}, ${alpha})`;
}

function mixUnit(a, b, t) {
  const matchA = String(a).match(/^(-?\d*\.?\d+)([a-z%]*)$/i);
  const matchB = String(b).match(/^(-?\d*\.?\d+)([a-z%]*)$/i);
  if (!matchA || !matchB || matchA[2] !== matchB[2]) return null;
  return `${mixNumber(Number(matchA[1]), Number(matchB[1]), t).toFixed(3)}${matchA[2]}`;
}

function mixFormattedString(a, b, t) {
  const pattern = /-?\d*\.?\d+|[^\d.-]+/g;
  const tokensA = a.match(pattern);
  const tokensB = b.match(pattern);
  if (!tokensA || !tokensB || tokensA.length !== tokensB.length) return null;

  const mixed = tokensA.map((token, index) => {
    const numeric = /^-?\d*\.?\d+$/.test(token);
    const left = Number(token);
    const right = Number(tokensB[index]);
    if (numeric && /^-?\d*\.?\d+$/.test(tokensB[index])) {
      return mixNumber(left, right, t).toFixed(3).replace(/\.000$/, '');
    }
    return token === tokensB[index] ? token : null;
  });
  if (mixed.includes(null)) return null;
  return mixed.join('');
}

export function interpolate(a, b, t) {
  const amount = clamp01(t);
  if (typeof a === 'number' && typeof b === 'number') {
    return mixNumber(a, b, amount);
  }

  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
    return a.map((item, index) => interpolate(item, b[index], amount));
  }

  if (isPlainObject(a) && isPlainObject(b)) {
    return Object.fromEntries(
      Object.keys(a).map((key) => [key, interpolate(a[key], b[key], amount)])
    );
  }

  if (typeof a === 'string' && typeof b === 'string') {
    const color = mixColor(a, b, amount);
    if (color) return color;
    const unit = mixUnit(a, b, amount);
    if (unit) return unit;
    const formatted = mixFormattedString(a, b, amount);
    if (formatted) return formatted;
  }

  throw new TypeError(`Cannot interpolate ${String(a)} and ${String(b)}.`);
}

export { parseColor };
