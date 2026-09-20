'use strict';
/* 引擎：MasterClock + Scheduler + FPS 监控 + 自适应降级 + WAAPI 桥接 */

// 主时钟：暂停期间不计时，恢复后动画从断点继续
class MasterClock {
  constructor() {
    this.paused = false;
    this._elapsed = 0;
    this._start = performance.now();
  }
  now() {
    return this.paused ? this._elapsed : this._elapsed + (performance.now() - this._start);
  }
  pause() {
    if (this.paused) return;
    this._elapsed += performance.now() - this._start;
    this.paused = true;
  }
  resume() {
    if (!this.paused) return;
    this._start = performance.now();
    this.paused = false;
  }
}

// FPS 监控 + 自适应降级：持续超预算则逐级降级，恢复后回升
class PerformanceGuard {
  constructor({ onLevelChange } = {}) {
    this.samples = [];
    this.level = 0;          // 0=满血 1=减粒子 2=关特效
    this.maxLevel = 2;
    this.onLevelChange = onLevelChange || (() => {});
    this._cooldown = 0;
  }
  record(frameMs) {
    this.samples.push(frameMs);
    if (this.samples.length > 60) this.samples.shift();
    if (this._cooldown > 0) { this._cooldown--; return; }
    if (this.samples.length < 60) return;
    const avg = this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
    if (avg > 17.5 && this.level < this.maxLevel) { // 60fps 预算 16.7ms
      this.level++;
      this._cooldown = 60;
      this.onLevelChange(this.level, avg);
    } else if (avg < 14 && this.level > 0) {
      this.level--;
      this._cooldown = 120;
      this.onLevelChange(this.level, avg);
    }
  }
  get fps() {
    if (!this.samples.length) return 0;
    const avg = this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
    return avg > 0 ? Math.round(1000 / avg) : 0;
  }
}

// WAAPI 桥接：DOM 动画走 Web Animations API，与主时钟同步暂停/恢复
class WaapiBridge {
  constructor(clock) {
    this.clock = clock;
    this.supported = typeof Element !== 'undefined' &&
                     typeof Element.prototype.animate === 'function';
    this.animations = [];
  }
  // keyframes: WAAPI 格式；返回 Animation 或 null（不支持时调用方降级）
  play(element, keyframes, options) {
    if (!this.supported) return null;
    try {
      const anim = element.animate(keyframes, options);
      if (this.clock.paused) anim.pause();
      this.animations.push(anim);
      anim.finished.catch(() => {}).finally(() => {
        const i = this.animations.indexOf(anim);
        if (i >= 0) this.animations.splice(i, 1);
      });
      return anim;
    } catch (err) {
      console.warn('[WAAPI] animate 失败，降级为 JS 插值', err);
      return null;
    }
  }
  pauseAll()  { this.animations.forEach(a => { try { a.pause(); } catch (_) {} }); }
  resumeAll() { this.animations.forEach(a => { try { a.play(); } catch (_) {} }); }
}

// 调度器：rAF 主循环，驱动所有时间线 + 渲染回调
class Scheduler {
  constructor() {
    this.clock = new MasterClock();
    this.timelines = new Set();
    this.renderCallbacks = new Set();
    this.guard = new PerformanceGuard();
    this._rafId = null;
    this._lastTick = 0;
    this._running = false;
    this.onFrame = null; // (dt, fps) => void
  }

  add(timeline)    { this.timelines.add(timeline); timeline.play(); return timeline; }
  remove(timeline) { this.timelines.delete(timeline); }
  onRender(cb)     { this.renderCallbacks.add(cb); return () => this.renderCallbacks.delete(cb); }

  start() {
    if (this._running) return;
    this._running = true;
    this._lastTick = this.clock.now();
    const loop = () => {
      if (!this._running) return;
      const now = this.clock.now();
      const dt = Math.min(now - this._lastTick, 100); // 切后台回来限制最大步长，防跳变
      this._lastTick = now;
      if (!this.clock.paused && dt > 0) {
        for (const tl of this.timelines) {
          try { tl.tick(dt); }
          catch (err) { console.warn(`[Scheduler] 时间线 ${tl.id} 异常，已移除`, err); this.timelines.delete(tl); }
          if (tl.state === 'finished') this.timelines.delete(tl);
        }
        for (const cb of this.renderCallbacks) {
          try { cb(dt); } catch (err) { console.warn('[Scheduler] 渲染回调异常', err); }
        }
      }
      const frameMs = performance.now() - (this._frameStart || 0);
      this._rafId = requestAnimationFrame(loop);
      this._frameStart = performance.now();
      this.guard.record(frameMs);
      if (this.onFrame) this.onFrame(dt, this.guard.fps);
    };
    this._frameStart = performance.now();
    this._rafId = requestAnimationFrame(loop);
  }

  pause() {
    this.clock.pause();
  }
  resume() {
    this.clock.resume();
    this._lastTick = this.clock.now(); // 防止恢复瞬间 dt 突跳
  }
  get paused() { return this.clock.paused; }
}
