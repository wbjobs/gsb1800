const QUALITY = {
  high: { dpr: 1, stars: 220, shadow: true },
  medium: { dpr: 0.75, stars: 140, shadow: true },
  low: { dpr: 0.5, stars: 80, shadow: false }
};

const DEFAULTS = {
  sky: { hue: 225, glow: 0.18 },
  field: { drift: 0, starAlpha: 0.72 },
  core: { x: 0.5, y: 0.52, radius: 0.1, pulse: 1, rotation: 0 },
  ring: { radius: 0.18, lineWidth: 0.006, rotation: 0, opacity: 0.62 },
  comet: { x: 0.16, y: 0.78, size: 0.028, angle: -0.65, alpha: 0 }
};

function makeStars(count) {
  let seed = 1337;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  return Array.from({ length: count }, () => ({
    x: random(),
    y: random(),
    radius: 0.5 + random() * 1.6,
    phase: random() * Math.PI * 2,
    depth: 0.35 + random() * 0.65
  }));
}

export class CanvasRenderer {
  constructor(canvas, onStatus = () => {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    if (!this.ctx) throw new Error('Canvas 2D context is unavailable.');

    this.onStatus = onStatus;
    this.quality = 'high';
    this.config = QUALITY.high;
    this.stars = makeStars(this.config.stars);
    this.states = new Map();
    this.resolved = {
      sky: { ...DEFAULTS.sky },
      field: { ...DEFAULTS.field },
      core: { ...DEFAULTS.core },
      ring: { ...DEFAULTS.ring },
      comet: { ...DEFAULTS.comet }
    };
    this.lastRenderMs = 0;
    this.renderErrors = 0;
    this.contextLost = false;
    this.width = 0;
    this.height = 0;

    canvas.addEventListener('contextlost', (event) => {
      event.preventDefault();
      this.contextLost = true;
      this.onStatus({ level: 'warning', code: 'CANVAS_CONTEXT_LOST', message: 'Canvas context lost; rendering paused.' });
    });
    canvas.addEventListener('contextrestored', () => {
      this.contextLost = false;
      this.renderErrors = 0;
      this.onStatus({ level: 'info', code: 'CANVAS_CONTEXT_RESTORED', message: 'Canvas context restored.' });
    });
  }

  setQuality(quality) {
    if (!QUALITY[quality] || quality === this.quality) return;
    this.quality = quality;
    this.config = QUALITY[quality];
    this.stars = makeStars(this.config.stars);
    this.canvas.width = 0;
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 2) * this.config.dpr;
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.width = rect.width;
    this.height = rect.height;
    return { width, height, dpr };
  }

  state(target) {
    const state = this.resolved[target];
    Object.assign(state, DEFAULTS[target], this.states.get(target) ?? {});
    return state;
  }

  drawSky(sky) {
    const { ctx, width, height } = this;
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, `hsl(${sky.hue}, 72%, ${8 + sky.glow * 14}%)`);
    gradient.addColorStop(0.55, `hsl(${sky.hue + 28}, 64%, ${14 + sky.glow * 18}%)`);
    gradient.addColorStop(1, `hsl(${sky.hue + 58}, 70%, ${20 + sky.glow * 22}%)`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  drawStars(field, time) {
    const { ctx, width, height, config } = this;
    const minDimension = Math.min(width, height);
    ctx.save();
    ctx.globalAlpha = field.starAlpha;
    for (let index = 0; index < config.stars; index += 1) {
      const star = this.stars[index];
      const twinkle = 0.55 + Math.sin(time * 0.002 + star.phase) * 0.35;
      const x = ((star.x + field.drift * star.depth * 0.05) % 1) * width;
      const y = ((star.y + Math.sin(field.drift + star.phase) * 0.004 * star.depth) % 1) * height;
      ctx.fillStyle = `rgba(255,255,255,${twinkle * star.depth})`;
      ctx.beginPath();
      ctx.arc(x, y, star.radius * (minDimension / 700), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawOrbital(core, ring) {
    const { ctx, width, height, config } = this;
    const minDimension = Math.min(width, height);
    const x = core.x * width;
    const y = core.y * height;
    const radius = core.radius * minDimension * core.pulse;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ring.rotation);
    ctx.strokeStyle = `rgba(155, 220, 255, ${ring.opacity})`;
    ctx.lineWidth = Math.max(1, ring.lineWidth * minDimension);
    ctx.beginPath();
    ctx.ellipse(0, 0, ring.radius * minDimension, ring.radius * 0.58 * minDimension, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(core.rotation);
    if (config.shadow) {
      ctx.shadowColor = 'rgba(90,190,255,.85)';
      ctx.shadowBlur = radius * 0.75;
    }
    const coreGradient = ctx.createRadialGradient(-radius * 0.3, -radius * 0.3, radius * 0.1, 0, 0, radius);
    coreGradient.addColorStop(0, '#ecfeff');
    coreGradient.addColorStop(0.36, '#67e8f9');
    coreGradient.addColorStop(1, '#2563eb');
    ctx.fillStyle = coreGradient;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawComet(comet) {
    const { ctx, width, height, config } = this;
    if (comet.alpha <= 0.01) return;

    const x = comet.x * width;
    const y = comet.y * height;
    const size = comet.size * Math.min(width, height);

    ctx.save();
    ctx.globalAlpha = comet.alpha;
    ctx.translate(x, y);
    ctx.rotate(comet.angle);
    if (config.shadow) {
      ctx.shadowColor = 'rgba(255,255,255,.8)';
      ctx.shadowBlur = size * 0.5;
    }
    const tailGradient = ctx.createLinearGradient(-size * 5, 0, size, 0);
    tailGradient.addColorStop(0, 'rgba(125,211,252,0)');
    tailGradient.addColorStop(1, 'rgba(255,255,255,.95)');
    ctx.fillStyle = tailGradient;
    ctx.beginPath();
    ctx.moveTo(-size * 5, -size * 0.38);
    ctx.quadraticCurveTo(-size * 1.8, 0, 0, 0);
    ctx.quadraticCurveTo(-size * 1.8, size * 0.25, -size * 5, size * 0.38);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  render(states, time) {
    if (this.contextLost || this.renderErrors > 2) return 0;
    const started = performance.now();

    try {
      this.states = states;
      const { dpr } = this.resize();
      const ctx = this.ctx;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const sky = this.state('sky');
      const field = this.state('field');
      const core = this.state('core');
      const ring = this.state('ring');
      const comet = this.state('comet');

      this.drawSky(sky);
      this.drawStars(field, time);
      this.drawOrbital(core, ring);
      this.drawComet(comet);
      this.renderErrors = 0;
    } catch (error) {
      this.renderErrors += 1;
      this.onStatus({
        level: this.renderErrors > 2 ? 'error' : 'warning',
        code: 'CANVAS_RENDER_ERROR',
        message: error.message
      });
      if (this.renderErrors > 2) throw error;
    }

    this.lastRenderMs = performance.now() - started;
    return this.lastRenderMs;
  }
}
