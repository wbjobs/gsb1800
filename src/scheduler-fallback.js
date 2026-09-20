import { getBoundaryEvents } from './timeline.js';

export class FallbackScheduler {
  constructor(timeline) {
    this.events = getBoundaryEvents(timeline);
    this.duration = timeline.duration;
    this.loop = timeline.loop;
    this.cursor = 0;
    this.lastTime = 0;
    this.active = false;
    this.listeners = new Set();
    this.telemetry = null;
  }

  syncCursor(time) {
    this.cursor = this.events.findIndex((event) => event.time > time);
    if (this.cursor === -1) this.cursor = this.events.length;
  }

  play(time) {
    this.active = true;
    this.lastTime = time;
    this.syncCursor(time);
    while (this.cursor < this.events.length && this.events[this.cursor].time <= time) {
      this.dispatch({ kind: 'timeline-event', event: this.events[this.cursor], time });
      this.cursor += 1;
    }
  }

  pause() {}

  seek(time) {
    this.lastTime = time;
    this.syncCursor(time);
  }

  stop() {
    this.active = false;
    this.lastTime = 0;
    this.syncCursor(0);
  }

  frame(time) {
    if (!this.active) return;
    const previous = this.lastTime ?? 0;
    this.lastTime = time;

    if (this.loop && time < previous) {
      while (this.cursor < this.events.length) {
        this.dispatch({ kind: 'timeline-event', event: this.events[this.cursor], time: this.duration });
        this.cursor += 1;
      }
      this.cursor = 0;
      while (this.cursor < this.events.length && this.events[this.cursor].time <= time) {
        this.dispatch({ kind: 'timeline-event', event: this.events[this.cursor], time });
        this.cursor += 1;
      }
      return;
    }

    while (this.cursor < this.events.length && this.events[this.cursor].time <= time) {
      const event = this.events[this.cursor];
      if (event.time > previous || (previous === 0 && event.time === 0)) {
        this.dispatch({ kind: 'timeline-event', event, time });
      }
      this.cursor += 1;
    }
  }

  dispatch(payload) {
    for (const listener of this.listeners) listener(payload);
  }

  postMessage(message) {
    if (message.kind === 'play') this.play(message.time);
    else if (message.kind === 'pause') this.pause();
    else if (message.kind === 'seek') this.seek(message.time);
    else if (message.kind === 'stop') this.stop();
    else if (message.kind === 'frame') this.frame(message.time);
  }

  addEventListener(type, listener) {
    if (type === 'message') this.subscribe((event) => listener({ data: event }));
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  terminate() {
    this.listeners.clear();
  }
}
