'use strict';
/* 时间线核心：Keyframe / Track / Timeline
 * - Track 对单个目标的单个属性做关键帧插值
 * - Timeline 聚合多条 Track，由 MasterClock 驱动
 * - 支持 delay / loop / yoyo / 时间缩放
 */

class Keyframe {
  constructor(time, value, easing = 'linear') {
    this.time = time;
    this.value = value;
    this.easing = resolveEasing(easing);
  }
}

class Track {
  constructor(target, property, keyframes, { priority = 0, additive = false } = {}) {
    this.target = target;
    this.property = property;
    this.priority = priority;
    this.additive = additive; // additive 轨道叠加到已有值上，用于并发不冲突的合成
    this.keyframes = keyframes
      .map(k => (k instanceof Keyframe ? k : new Keyframe(k.time, k.value, k.easing)))
      .sort((a, b) => a.time - b.time);
    if (this.keyframes.length === 0) throw new Error('Track 至少需要一个关键帧');
  }

  get endTime() { return this.keyframes[this.keyframes.length - 1].time; }

  // 二分查找所在区间并插值
  sample(time) {
    const kfs = this.keyframes;
    if (time <= kfs[0].time) return kfs[0].value;
    const last = kfs[kfs.length - 1];
    if (time >= last.time) return last.value;
    let lo = 0, hi = kfs.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (kfs[mid].time <= time) lo = mid; else hi = mid;
    }
    const a = kfs[lo], b = kfs[hi];
    const span = b.time - a.time;
    const t = span === 0 ? 1 : (time - a.time) / span;
    const p = b.easing(t);
    if (typeof a.value === 'number') return a.value + (b.value - a.value) * p;
    if (Array.isArray(a.value)) { // 颜色 [r,g,b] 等向量插值
      return a.value.map((v, i) => v + (b.value[i] - v) * p);
    }
    return p < 1 ? a.value : b.value; // 不可插值类型：阶跃
  }
}

class Timeline {
  constructor({ id, delay = 0, loop = false, yoyo = false, timeScale = 1 } = {}) {
    this.id = id || `tl_${Math.random().toString(36).slice(2, 8)}`;
    this.tracks = [];
    this.delay = delay;
    this.loop = loop;
    this.yoyo = yoyo;
    this.timeScale = timeScale;
    this.localTime = 0;     // 时间线本地时间（ms）
    this.state = 'idle';    // idle | running | paused | finished
    this.onFinish = null;
    this._lastApplied = new Map(); // property -> value，用于 additive 合成
  }

  addTrack(track) { this.tracks.push(track); return this; }

  get duration() {
    return this.tracks.reduce((m, t) => Math.max(m, t.endTime), 0);
  }

  play()  { if (this.state !== 'running') this.state = 'running'; }
  pause() { if (this.state === 'running') this.state = 'paused'; }
  seek(timeMs) {
    this.localTime = Math.max(0, Math.min(timeMs, this.duration));
    if (this.state === 'finished') this.state = 'paused';
  }

  // 由引擎每帧调用，dt 为主时钟增量（已含暂停剔除）
  tick(dt) {
    if (this.state !== 'running') return;
    if (this.delay > 0) { this.delay -= dt; return; }
    this.localTime += dt * this.timeScale;
    const dur = this.duration;
    if (this.localTime >= dur) {
      if (this.loop) {
        this.localTime = dur === 0 ? 0 : this.localTime % dur;
        if (this.yoyo) this.timeScale = -this.timeScale;
      } else if (this.yoyo && this.timeScale > 0) {
        this.timeScale = -this.timeScale;
        this.localTime = dur;
      } else {
        this.localTime = dur;
        this.state = 'finished';
        this.apply();
        if (this.onFinish) this.onFinish(this);
        return;
      }
    }
    if (this.localTime < 0) { // yoyo 回放到起点
      this.timeScale = -this.timeScale;
      this.localTime = 0;
      if (!this.loop) { this.state = 'finished'; if (this.onFinish) this.onFinish(this); }
    }
    this.apply();
  }

  // 将采样值写入目标；同属性并发时高优先级覆盖，additive 叠加
  apply() {
    const byProp = new Map();
    for (const tr of this.tracks) {
      const key = tr.property;
      const prev = byProp.get(key);
      if (!prev || tr.priority >= prev.priority) byProp.set(key, tr);
    }
    for (const tr of byProp.values()) {
      const v = tr.sample(this.localTime);
      try {
        if (tr.additive && typeof v === 'number') {
          tr.target[tr.property] = (tr.target[tr.property] || 0) + v - (this._lastApplied.get(tr) || 0);
          this._lastApplied.set(tr, v);
        } else {
          tr.target[tr.property] = v;
        }
      } catch (err) {
        console.warn(`[Timeline] 写入 ${tr.property} 失败，已跳过`, err);
      }
    }
  }
}
