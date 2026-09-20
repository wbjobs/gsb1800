export class PlaybackEngine {
  constructor(timeline, now = globalThis.performance?.now?.bind(globalThis.performance) ?? Date.now) {
    this.timeline = timeline;
    this.now = now;
    this.state = 'idle';
    this.virtualTime = 0;
    this.anchorTime = 0;
    this.listeners = new Set();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event) {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error('Animation event listener failed:', error);
      }
    }
  }

  getTime(realNow = this.now()) {
    if (this.state !== 'running') return this.virtualTime;
    const rawTime = this.virtualTime + (realNow - this.anchorTime);
    if (this.timeline.loop && this.timeline.duration > 0) {
      return rawTime % this.timeline.duration;
    }
    return Math.min(this.timeline.duration, rawTime);
  }

  play(realNow = this.now()) {
    if (this.state === 'running') return this.virtualTime;
    if (this.virtualTime >= this.timeline.duration && !this.timeline.loop) {
      this.virtualTime = 0;
    }
    this.anchorTime = realNow;
    this.state = 'running';
    this.emit({ type: 'play', time: this.virtualTime });
    return this.virtualTime;
  }

  pause(realNow = this.now()) {
    if (this.state !== 'running') return this.virtualTime;
    this.virtualTime = this.getTime(realNow);
    this.state = 'paused';
    this.emit({ type: 'pause', time: this.virtualTime });
    return this.virtualTime;
  }

  seek(time) {
    const next = Math.min(this.timeline.duration, Math.max(0, time));
    this.virtualTime = next;
    this.anchorTime = this.now();
    this.emit({ type: 'seek', time: next });
    return next;
  }

  stop() {
    this.virtualTime = 0;
    this.anchorTime = this.now();
    this.state = 'paused';
    this.emit({ type: 'stop', time: 0 });
    return 0;
  }

  tick(realNow = this.now()) {
    if (this.state === 'running' && this.timeline.loop && this.timeline.duration > 0) {
      const rawTime = this.virtualTime + (realNow - this.anchorTime);
      if (rawTime >= this.timeline.duration) {
        this.virtualTime = rawTime % this.timeline.duration;
        this.anchorTime = realNow;
      }
      return this.virtualTime;
    }

    const time = this.getTime(realNow);
    if (this.state === 'running' && time >= this.timeline.duration) {
      this.virtualTime = this.timeline.duration;
      this.state = 'finished';
      this.emit({ type: 'finish', time: this.virtualTime });
    }
    return time;
  }
}
