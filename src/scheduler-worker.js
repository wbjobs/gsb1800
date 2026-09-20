import { compileTimeline, getBoundaryEvents } from './timeline.js';

let timeline = null;
let events = [];
let cursor = 0;
let lastVirtualTime = 0;
let lastFrameTime = 0;
let frameCount = 0;
let droppedFrames = 0;
let totalFrameMs = 0;
let renderMs = 0;
let lastReport = 0;
let active = false;

function resetRuntime() {
  cursor = 0;
  lastVirtualTime = 0;
  lastFrameTime = 0;
  frameCount = 0;
  droppedFrames = 0;
  totalFrameMs = 0;
  renderMs = 0;
  lastReport = 0;
  active = false;
}

function emitCrossed(previous, next, playingForward) {
  if (!timeline) return;

  if (playingForward) {
    while (cursor < events.length && events[cursor].time <= next) {
      const event = events[cursor];
      if (event.time > previous || (previous === 0 && event.time === 0)) {
        self.postMessage({ kind: 'timeline-event', event, time: next });
      }
      cursor += 1;
    }
  } else {
    while (cursor > 0 && events[cursor - 1].time > next) {
      cursor -= 1;
      self.postMessage({ kind: 'timeline-event', event: events[cursor], time: next });
    }
  }
}

function syncCursor(time) {
  cursor = events.findIndex((event) => event.time > time);
  if (cursor === -1) cursor = events.length;
}

function emitRemaining() {
  while (cursor < events.length) {
    self.postMessage({ kind: 'timeline-event', event: events[cursor], time: timeline.duration });
    cursor += 1;
  }
}

function emitWrapped(next) {
  emitRemaining();
  cursor = 0;
  while (cursor < events.length && events[cursor].time <= next) {
    self.postMessage({ kind: 'timeline-event', event: events[cursor], time: next });
    cursor += 1;
  }
}

self.onmessage = (message) => {
  const data = message.data;

  try {
    if (data.kind === 'compile') {
      timeline = compileTimeline(data.timeline);
      events = getBoundaryEvents(timeline);
      resetRuntime();
      self.postMessage({
        kind: 'ready',
        duration: timeline.duration,
        clipCount: timeline.clips.length,
        eventCount: events.length
      });
      return;
    }

    if (!timeline) {
      throw new Error('Scheduler received a command before timeline compilation.');
    }

    if (data.kind === 'play') {
      active = true;
      lastVirtualTime = data.time;
      lastReport = data.now;
      lastFrameTime = 0;
      syncCursor(data.time);
      emitCrossed(data.time, data.time, true);
      return;
    }

    if (data.kind === 'pause') {
      active = false;
      lastVirtualTime = data.time;
      self.postMessage({ kind: 'paused', time: data.time });
      return;
    }

    if (data.kind === 'seek') {
      lastVirtualTime = data.time;
      syncCursor(data.time);
      self.postMessage({ kind: 'seeked', time: data.time });
      return;
    }

    if (data.kind === 'stop') {
      active = false;
      resetRuntime();
      syncCursor(0);
      self.postMessage({ kind: 'stopped' });
      return;
    }

    if (data.kind === 'frame') {
      const previous = lastVirtualTime;
      const next = data.time;
      if (active) {
        if (timeline.loop && next < previous) emitWrapped(next);
        else emitCrossed(previous, next, next >= previous);
      }
      lastVirtualTime = next;

      if (active && lastFrameTime) {
        const delta = data.now - lastFrameTime;
        frameCount += 1;
        totalFrameMs += delta;
        renderMs += data.renderMs ?? 0;
        if (delta > 24) droppedFrames += 1;
      }
      lastFrameTime = data.now;

      if (data.now - lastReport >= 500) {
        self.postMessage({
          kind: 'telemetry',
          frameCount,
          droppedFrames,
          averageFrameMs: frameCount ? totalFrameMs / frameCount : 0,
          averageRenderMs: frameCount ? renderMs / frameCount : 0,
          quality: data.quality
        });
      }
    }
  } catch (error) {
    self.postMessage({
      kind: 'error',
      message: error.message,
      code: error.code ?? 'SCHEDULER_ERROR',
      fatal: data.kind === 'compile'
    });
  }
};
