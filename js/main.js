'use strict';
/* Demo 编排：
 * - Canvas：Worker 驱动的粒子场 + 时间线驱动的图形编排
 * - DOM：WAAPI 卡片入场编排（不支持时降级 JS 时间线）
 * - 控制：暂停/恢复、并发爆发、粒子数、seek
 */

const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d');
const hud = {
  fps: document.getElementById('fps'),
  mode: document.getElementById('mode'),
  level: document.getElementById('level'),
  timelines: document.getElementById('tl-count'),
};
const btnToggle = document.getElementById('btn-toggle');
const btnBurst = document.getElementById('btn-burst');
const seekBar = document.getElementById('seek');
const statusEl = document.getElementById('status');

function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.classList.toggle('error', isError);
}

// ---------- 尺寸 ----------
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = canvas.clientWidth * dpr;
  canvas.height = canvas.clientHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize);
resize();

// ---------- 调度器 ----------
const scheduler = new Scheduler();
const waapi = new WaapiBridge(scheduler.clock);

// ---------- 粒子系统（Worker 优先，失败降级主线程） ----------
const PARTICLE_LEVELS = [2000, 1000, 400]; // 降级档位
const pointer = { x: 0, y: 0, active: false };

class ParticleSystem {
  constructor() {
    this.count = PARTICLE_LEVELS[0];
    this.positions = null; // Float32Array [x,y,hue]*
    this.worker = null;
    this.useWorker = false;
    this._pending = false;
    // 主线程降级用的本地状态
    this._local = null;
    this._initWorker();
  }
  _initWorker() {
    try {
      this.worker = new Worker('js/particle-worker.js');
      this.worker.onmessage = (e) => {
        const msg = e.data;
        if (msg.type === 'frame') {
          this.positions = new Float32Array(msg.positions);
          this._pending = false;
        } else if (msg.type === 'error') {
          this._fallback('Worker 运行错误：' + msg.message);
        }
      };
      this.worker.onerror = (err) => this._fallback('Worker 加载失败');
      this.worker.postMessage({
        type: 'init', count: this.count,
        width: canvas.clientWidth, height: canvas.clientHeight,
      });
      this.useWorker = true;
      setStatus('粒子计算：Web Worker（主线程零负担）');
    } catch (err) {
      this._fallback('Worker 不可用：' + err.message);
    }
  }
  _fallback(reason) {
    if (this.worker) { try { this.worker.terminate(); } catch (_) {} this.worker = null; }
    this.useWorker = false;
    if (!this._local) {
      this._local = new Float32Array(this.count * 5);
      for (let i = 0; i < this.count; i++) {
        const o = i * 5;
        this._local[o] = Math.random() * canvas.clientWidth;
        this._local[o + 1] = Math.random() * canvas.clientHeight;
        this._local[o + 2] = (Math.random() - 0.5) * 0.1;
        this._local[o + 3] = (Math.random() - 0.5) * 0.1;
        this._local[o + 4] = Math.random() * 360;
      }
    }
    setStatus('已降级：粒子计算在主线程执行（' + reason + '）', true);
  }
  setLevel(level) {
    this.count = PARTICLE_LEVELS[Math.min(level, PARTICLE_LEVELS.length - 1)];
    if (this.useWorker) this.worker.postMessage({ type: 'setCount', count: this.count });
  }
  step(dt) {
    if (this.useWorker) {
      if (!this._pending) {
        this._pending = true;
        this.worker.postMessage({ type: 'step', dt, pointer });
      }
      return;
    }
    // 主线程降级积分
    const p = this._local, n = this.count;
    const out = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const o = i * 5;
      let vx = p[o + 2], vy = p[o + 3];
      if (pointer.active) {
        const dx = pointer.x - p[o], dy = pointer.y - p[o + 1];
        const d2 = dx * dx + dy * dy + 100;
        const f = 4000 / d2;
        vx += dx * f * 0.000001 * dt; vy += dy * f * 0.000001 * dt;
      }
      vx *= 0.995; vy *= 0.995;
      p[o] += vx * dt; p[o + 1] += vy * dt;
      p[o + 2] = vx; p[o + 3] = vy;
      const q = i * 3;
      out[q] = p[o]; out[q + 1] = p[o + 1]; out[q + 2] = p[o + 4];
    }
    this.positions = out;
  }
  draw(ctx) {
    if (!this.positions) return;
    const pos = this.positions;
    for (let i = 0; i < pos.length; i += 3) {
      ctx.fillStyle = `hsla(${pos[i + 2]}, 80%, 65%, 0.7)`;
      ctx.fillRect(pos[i], pos[i + 1], 2, 2);
    }
  }
}

const particles = new ParticleSystem();

// ---------- 时间线驱动的图形编排 ----------
const W = () => canvas.clientWidth;
const H = () => canvas.clientHeight;

// 编排对象：由时间线写入属性，渲染器读取
const orbs = [];
function makeOrb(i, total) {
  const orb = { x: 0, y: 0, r: 20, alpha: 0, hue: (i * 360) / total, rot: 0 };
  const cx = W() / 2, cy = H() / 2;
  const radius = Math.min(W(), H()) * 0.3;
  const angle = (i / total) * Math.PI * 2;
  const tl = new Timeline({ id: `orb_${i}`, loop: true, delay: i * 120 });
  tl.addTrack(new Track(orb, 'x', [
    { time: 0, value: cx + Math.cos(angle) * radius },
    { time: 3000, value: cx + Math.cos(angle + Math.PI) * radius, easing: 'easeInOutSine' },
    { time: 6000, value: cx + Math.cos(angle + Math.PI * 2) * radius, easing: 'easeInOutSine' },
  ]));
  tl.addTrack(new Track(orb, 'y', [
    { time: 0, value: cy + Math.sin(angle) * radius },
    { time: 3000, value: cy + Math.sin(angle + Math.PI) * radius, easing: 'easeInOutSine' },
    { time: 6000, value: cy + Math.sin(angle + Math.PI * 2) * radius, easing: 'easeInOutSine' },
  ]));
  tl.addTrack(new Track(orb, 'r', [
    { time: 0, value: 12 },
    { time: 1500, value: 28, easing: 'easeInOutQuad' },
    { time: 3000, value: 12, easing: 'easeInOutQuad' },
  ]));
  tl.addTrack(new Track(orb, 'alpha', [
    { time: 0, value: 0 },
    { time: 400, value: 1, easing: 'easeOutQuad' },
  ]));
  tl.addTrack(new Track(orb, 'rot', [
    { time: 0, value: 0 },
    { time: 6000, value: Math.PI * 2 },
  ]));
  scheduler.add(tl);
  orbs.push(orb);
  return tl;
}
const ORB_COUNT = 8;
const orbTimelines = [];
function buildOrbs() {
  orbs.length = 0;
  for (let i = 0; i < ORB_COUNT; i++) orbTimelines.push(makeOrb(i, ORB_COUNT));
}
buildOrbs();

// 并发爆发：点击后叠加一组 additive 冲击波时间线，不干扰主编排
const bursts = [];
function spawnBurst(x, y) {
  const burst = { x, y, r: 0, alpha: 1 };
  const tl = new Timeline({ id: `burst_${Date.now()}` });
  tl.addTrack(new Track(burst, 'r', [
    { time: 0, value: 0 },
    { time: 700, value: 180, easing: 'easeOutCubic' },
  ]));
  tl.addTrack(new Track(burst, 'alpha', [
    { time: 0, value: 0.9 },
    { time: 700, value: 0, easing: 'easeInQuad' },
  ]));
  tl.onFinish = () => {
    const i = bursts.indexOf(burst);
    if (i >= 0) bursts.splice(i, 1);
  };
  scheduler.add(tl);
  bursts.push(burst);
}

// ---------- 渲染 ----------
let showGlow = true;
scheduler.guard.onLevelChange = (level, avg) => {
  particles.setLevel(level);
  showGlow = level < 2;
  hud.level.textContent = ['满血', '降级 L1（减粒子）', '降级 L2（关特效）'][level];
  setStatus(`性能自适应：帧均 ${avg.toFixed(1)}ms → 档位 L${level}`, level > 0);
};

scheduler.onRender((dt) => {
  particles.step(dt);
  ctx.clearRect(0, 0, W(), H());
  particles.draw(ctx);
  // 爆发冲击波
  for (const b of bursts) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(120, 200, 255, ${b.alpha})`;
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  // 编排球体
  for (const orb of orbs) {
    ctx.save();
    ctx.globalAlpha = orb.alpha;
    if (showGlow) { ctx.shadowBlur = 24; ctx.shadowColor = `hsl(${orb.hue}, 90%, 60%)`; }
    ctx.fillStyle = `hsl(${orb.hue}, 90%, 60%)`;
    ctx.beginPath();
    ctx.arc(orb.x, orb.y, orb.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
});

// ---------- DOM 卡片：WAAPI 编排（降级 JS 时间线） ----------
function animateCards() {
  const cards = document.querySelectorAll('.card');
  cards.forEach((card, i) => {
    const anim = waapi.play(card, [
      { transform: 'translateY(40px)', opacity: 0 },
      { transform: 'translateY(0)', opacity: 1 },
    ], { duration: 600, delay: i * 150, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both' });
    if (!anim) {
      // 降级：用 JS 时间线驱动同样的效果
      const proxy = { t: 0 };
      const tl = new Timeline({ id: `card_${i}`, delay: i * 150 });
      tl.addTrack(new Track(proxy, 't', [{ time: 0, value: 0 }, { time: 600, value: 1, easing: 'easeOutCubic' }]));
      const apply = () => {
        card.style.opacity = proxy.t;
        card.style.transform = `translateY(${(1 - proxy.t) * 40}px)`;
      };
      tl.apply = function () { Timeline.prototype.apply.call(this); apply(); };
      scheduler.add(tl);
    }
  });
}
animateCards();

// ---------- 交互 ----------
btnToggle.addEventListener('click', () => {
  if (scheduler.paused) {
    scheduler.resume();
    waapi.resumeAll();
    btnToggle.textContent = '⏸ 暂停';
  } else {
    scheduler.pause();
    waapi.pauseAll();
    btnToggle.textContent = '▶ 恢复';
  }
});

btnBurst.addEventListener('click', () => {
  for (let i = 0; i < 5; i++) {
    setTimeout(() => spawnBurst(Math.random() * W(), Math.random() * H()), i * 80);
  }
});

canvas.addEventListener('pointermove', (e) => {
  const rect = canvas.getBoundingClientRect();
  pointer.x = e.clientX - rect.left;
  pointer.y = e.clientY - rect.top;
  pointer.active = true;
});
canvas.addEventListener('pointerleave', () => { pointer.active = false; });
canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect();
  spawnBurst(e.clientX - rect.left, e.clientY - rect.top);
});

// seek：拖动控制编排进度（暂停时也可预览）
seekBar.addEventListener('input', () => {
  const t = (seekBar.value / 1000) * 6000;
  orbTimelines.forEach(tl => { tl.seek(t); tl.apply(); });
});

// 全局异常兜底：任何未捕获错误都不应让动画死循环崩溃
window.addEventListener('error', (e) => setStatus('异常已捕获：' + e.message, true));

// HUD 刷新
setInterval(() => {
  hud.fps.textContent = scheduler.guard.fps;
  hud.timelines.textContent = scheduler.timelines.size;
  hud.mode.textContent = scheduler.paused ? '已暂停' : '运行中';
}, 250);

scheduler.start();
