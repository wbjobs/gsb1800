const DEFAULT_CUBIC_SAMPLES = 11;

const PRESETS = {
  linear: [0, 0, 1, 1],
  ease: [0.25, 0.1, 0.25, 1],
  'ease-in': [0.42, 0, 1, 1],
  'ease-out': [0, 0, 0.58, 1],
  'ease-in-out': [0.42, 0, 0.58, 1]
};

function cubic(a, b, t) {
  const inverse = 1 - t;
  return 3 * inverse * inverse * t * a + 3 * inverse * t * t * b + t * t * t;
}

function cubicBezier(x1, y1, x2, y2) {
  if ([x1, y1, x2, y2].some((value) => !Number.isFinite(value))) {
    throw new TypeError('Cubic bezier control points must be finite numbers.');
  }

  return (t) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;

    let low = 0;
    let high = 1;
    let guess = t;

    for (let i = 0; i < 12; i += 1) {
      const x = cubic(x1, x2, guess) - t;
      if (Math.abs(x) < 0.000001) {
        return cubic(y1, y2, guess);
      }
      if (x < 0) low = guess;
      else high = guess;
      guess = (low + high) / 2;
    }

    return cubic(y1, y2, guess);
  };
}

export function compileEasing(input = 'linear') {
  if (typeof input === 'function') return input;
  if (input === 'linear' || input.trim().toLowerCase() === 'linear') return (t) => t;
  if (typeof input !== 'string') {
    throw new TypeError(`Unsupported easing: ${String(input)}`);
  }

  const name = input.trim().toLowerCase();
  if (PRESETS[name]) {
    const [x1, y1, x2, y2] = PRESETS[name];
    return cubicBezier(x1, y1, x2, y2);
  }

  const match = name.match(/^cubic-bezier\(\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^)]+)\)$/);
  if (!match) {
    throw new TypeError(`Unsupported easing: ${input}`);
  }

  const points = match.slice(1).map(Number);
  return cubicBezier(...points);
}

export function buildCubicSamples(x1, y1, x2, y2, samples = DEFAULT_CUBIC_SAMPLES) {
  const easing = cubicBezier(x1, y1, x2, y2);
  return Array.from({ length: samples }, (_, index) => easing(index / (samples - 1)));
}
