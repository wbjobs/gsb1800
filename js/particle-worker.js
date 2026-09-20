'use strict';
/* Web Worker：粒子物理积分，主线程零负担。
 * 协议：
 *   收 {type:'init', count, width, height, buffer}  buffer 为 SharedArrayBuffer 不可用时的普通 ArrayBuffer
 *   收 {type:'step', dt, pointer:{x,y,active}}      回传 positions（Transferable）
 *   收 {type:'setCount', count}                     性能降级时减粒子
 */
let particles = null; // Float32Array: [x, y, vx, vy, hue] * count
let count = 0;
let W = 0, H = 0;

function rand(a, b) { return a + Math.random() * (b - a); }

function spawn(i) {
  const o = i * 5;
  particles[o] = rand(0, W);
  particles[o + 1] = rand(0, H);
  particles[o + 2] = rand(-0.05, 0.05);
  particles[o + 3] = rand(-0.05, 0.05);
  particles[o + 4] = rand(0, 360);
}

self.onmessage = (e) => {
  const msg = e.data;
  try {
    switch (msg.type) {
      case 'init': {
        W = msg.width; H = msg.height;
        count = msg.count;
        particles = new Float32Array(count * 5);
        for (let i = 0; i < count; i++) spawn(i);
        self.postMessage({ type: 'ready' });
        break;
      }
      case 'setCount': {
        const next = Math.min(msg.count, 4000);
        if (next > count) {
          const grown = new Float32Array(next * 5);
          grown.set(particles.subarray(0, count * 5));
          particles = grown;
          for (let i = count; i < next; i++) spawn(i);
        }
        count = next;
        break;
      }
      case 'step': {
        if (!particles) return;
        const dt = Math.min(msg.dt, 50);
        const p = msg.pointer;
        const out = new Float32Array(count * 3); // x, y, hue
        for (let i = 0; i < count; i++) {
          const o = i * 5;
          let x = particles[o], y = particles[o + 1];
          let vx = particles[o + 2], vy = particles[o + 3];
          if (p && p.active) {
            const dx = p.x - x, dy = p.y - y;
            const d2 = dx * dx + dy * dy + 100;
            const f = 4000 / d2;
            vx += dx * f * 0.000001 * dt;
            vy += dy * f * 0.000001 * dt;
          }
          vx *= 0.995; vy *= 0.995;
          x += vx * dt; y += vy * dt;
          if (x < 0) { x = 0; vx = -vx; } else if (x > W) { x = W; vx = -vx; }
          if (y < 0) { y = 0; vy = -vy; } else if (y > H) { y = H; vy = -vy; }
          particles[o] = x; particles[o + 1] = y;
          particles[o + 2] = vx; particles[o + 3] = vy;
          const q = i * 3;
          out[q] = x; out[q + 1] = y; out[q + 2] = particles[o + 4];
        }
        self.postMessage({ type: 'frame', positions: out.buffer }, [out.buffer]);
        break;
      }
    }
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err && err.message || err) });
  }
};
