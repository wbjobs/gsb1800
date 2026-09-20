import { compileTimeline, sampleTimelineInto } from './timeline.js';
import { PlaybackEngine } from './playback-engine.js';
import { CanvasRenderer } from './canvas-renderer.js';
import { DOM_TARGETS, WaapiLayer } from './waapi-layer.js';
import { FallbackScheduler } from './scheduler-fallback.js';
import { demoTimeline } from './timeline-demo.js';

const canvas = document.querySelector('#stage');
const playButton = document.querySelector('#play');
const resetButton = document.querySelector('#reset');
const seekInput = document.querySelector('#seek');
const timeLabel = document.querySelector('#time-label');
const fpsLabel = document.querySelector('#fps');
const qualityLabel = document.querySelector('#quality');
const statusLabel = document.querySelector('#status');
const eventLog = document.querySelector('#events');
const errorPanel = document.querySelector('#error-panel');
const elements = {
  title: document.querySelector('#title'),
  card: document.querySelector('#card'),
  badge: document.querySelector('#badge')
};

const statuses = [];
const stats = {
  frame: 0,
  dropped: 0,
  emaDelta: 16.67,
  emaRender: 0,
  worker: 'checking',
  quality: 'high',
  events: 0,
  lastQualityChange: 0
};

function reportStatus(level, code, message) {
  statuses.push({ level, code, message, at: new Date().toLocaleTimeString() });
  if (statuses.length > 4) statuses.shift();
  statusLabel.textContent = message;
  statusLabel.dataset.level = level;
  statusLabel.title = statuses.map((item) => `[${item.at}] ${item.code}: ${item.message}`).join('\n');
}

function showFatal(error) {
  errorPanel.hidden = false;
  errorPanel.textContent = `动画初始化失败：${error.message}`;
  reportStatus('error', error.code ?? 'FATAL', error.message);
}

let timeline;
try {
  timeline = compileTimeline(demoTimeline);
} catch (error) {
  showFatal(error);
  throw error;
}

seekInput.max = String(timeline.duration);

let renderer;
try {
  renderer = new CanvasRenderer(canvas, (status) => reportStatus(status.level, status.code, status.message));
} catch (error) {
  showFatal(error);
  throw error;
}

let waapi;
try {
  waapi = new WaapiLayer(timeline, elements, (status) => reportStatus(status.level, status.code, status.message));
} catch (error) {
  reportStatus('warning', 'WAAPI_LAYER_FAILED', error.message);
}

const engine = new PlaybackEngine(timeline);
const stateMap = new Map();
const schedulerListeners = new Set();

function createFallbackScheduler(reason) {
  stats.worker = 'fallback';
  reportStatus('warning', 'WORKER_FALLBACK', reason);
  return new FallbackScheduler(timeline);
}

function handleSchedulerMessage(event) {
  const data = event.data;
  if (data.kind === 'ready') {
    workerReady = true;
    window.clearTimeout(workerTimer);
    stats.worker = 'active';
    reportStatus('info', 'WORKER_READY', `Worker 调度 ${data.eventCount} 个边界事件。`);
    return;
  }

  if (data.kind === 'error') {
    reportStatus('warning', data.code, data.message);
    return;
  }

  if (data.kind === 'timeline-event') {
    stats.events += 1;
    const row = document.createElement('li');
    row.textContent = `${data.event.type} ${data.event.clip}`;
    eventLog.prepend(row);
    while (eventLog.children.length > 5) eventLog.lastElementChild.remove();
    for (const listener of schedulerListeners) listener(data.event);
    return;
  }

  if (data.kind === 'telemetry') {
    stats.dropped = data.droppedFrames;
    const fps = data.averageFrameMs ? 1000 / data.averageFrameMs : 0;
    fpsLabel.textContent = `${fps.toFixed(0)} fps · 丢帧 ${stats.dropped}`;
  }
}

let workerReady = false;
let workerTimer = 0;
let scheduler;

function bindScheduler(nextScheduler) {
  scheduler = nextScheduler;
  scheduler.addEventListener('message', handleSchedulerMessage);
}

if (!('Worker' in window)) {
  bindScheduler(createFallbackScheduler('Web Worker 不可用，已切换主线程调度。'));
} else {
  bindScheduler(new Worker('./scheduler-worker.js', { type: 'module' }));
  workerTimer = window.setTimeout(() => {
    if (workerReady) return;
    workerReady = true;
    scheduler.terminate();
    bindScheduler(createFallbackScheduler('Worker 初始化超时，已切换主线程调度。'));
  }, 1200);

  scheduler.addEventListener('error', () => {
    if (stats.worker !== 'checking') return;
    scheduler.terminate();
    workerReady = true;
    bindScheduler(createFallbackScheduler('Worker 加载失败，已切换主线程调度。'));
  });

  scheduler.postMessage({ kind: 'compile', timeline: demoTimeline });
}

function postScheduler(message) {
  try {
    scheduler.postMessage(message);
  } catch (error) {
    bindScheduler(createFallbackScheduler('Worker 通信失败，已切换主线程调度。'));
    scheduler.postMessage(message);
  }
}

function setQuality(quality) {
  if (quality === stats.quality) return;
  stats.quality = quality;
  qualityLabel.textContent = quality === 'high' ? '高' : quality === 'medium' ? '中' : '低';
  renderer.setQuality(quality);
  stats.lastQualityChange = stats.frame;
  reportStatus('info', 'QUALITY_CHANGED', `渲染质量已调整为${qualityLabel.textContent}。`);
}

function formatTime(ms) {
  return `${(ms / 1000).toFixed(2)}s`;
}

function updateFpsHud() {
  if (stats.worker === 'active') return;
  const fps = Math.min(60, 1000 / Math.max(1, stats.emaDelta));
  fpsLabel.textContent = `${fps.toFixed(0)} fps · 丢帧 ${stats.dropped}`;
}

function renderFrame(now, frameDelta) {
  const previousTime = engine.state === 'running' ? engine.getTime(now) : engine.virtualTime;
  const time = engine.tick(now);
  if (timeline.loop && time < previousTime - 100) {
    waapi?.play(time);
  }
  sampleTimelineInto(timeline, time, stateMap, {
    shouldSample: (target) => !DOM_TARGETS.has(target)
  });
  let renderMs = 0;
  try {
    renderMs = renderer.render(stateMap, time);
  } catch (error) {
    reportStatus('error', 'CANVAS_DISABLED', error.message);
  }

  if (!waapi?.available) {
    sampleTimelineInto(timeline, time, stateMap);
    waapi?.applyFallback(stateMap);
  }

  seekInput.value = String(time);
  timeLabel.textContent = `${formatTime(time)} / ${formatTime(timeline.duration)}`;

  stats.frame += 1;
  stats.emaRender = stats.emaRender * 0.92 + renderMs * 0.08;
  if (frameDelta) {
    stats.emaDelta = stats.emaDelta * 0.92 + frameDelta * 0.08;
    if (frameDelta > 24) stats.dropped += 1;
  }

  if (stats.quality === 'high' && (stats.emaRender > 11 || stats.emaDelta > 22)) setQuality('medium');
  else if (stats.quality === 'medium' && (stats.emaRender > 14 || stats.emaDelta > 28)) setQuality('low');
  else if (
    stats.quality === 'medium' &&
    stats.frame - stats.lastQualityChange > 180 &&
    stats.emaRender < 7 &&
    stats.emaDelta < 17.5
  ) setQuality('high');
  else if (
    stats.quality === 'low' &&
    stats.frame - stats.lastQualityChange > 180 &&
    stats.emaRender < 5 &&
    stats.emaDelta < 17
  ) setQuality('medium');

  if (stats.frame % 30 === 0) updateFpsHud();

  postScheduler({ kind: 'frame', time, now, renderMs, quality: stats.quality });
  return time;
}

let lastFrameAt = performance.now();
renderFrame(lastFrameAt, 0);
waapi?.seek(0, false);

function loop(now) {
  const frameDelta = now - lastFrameAt;
  lastFrameAt = now;
  const time = renderFrame(now, frameDelta);

  if (engine.state === 'finished') {
    playButton.textContent = '重播';
    fpsLabel.textContent = `${Math.min(60, 1000 / Math.max(1, stats.emaDelta)).toFixed(0)} fps · 丢帧 ${stats.dropped}`;
  }

  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

playButton.addEventListener('click', () => {
  const now = performance.now();
  if (engine.state === 'running') {
    const time = engine.pause(now);
    waapi?.pause();
    waapi?.seek(time, false);
    postScheduler({ kind: 'pause', time, now });
    playButton.textContent = '播放';
  } else {
    const time = engine.play(now);
    waapi?.play(time);
    postScheduler({ kind: 'play', time, now });
    playButton.textContent = '暂停';
  }
});

resetButton.addEventListener('click', () => {
  const now = performance.now();
  engine.stop();
  waapi?.stop();
  postScheduler({ kind: 'stop', now });
  renderFrame(now, 0);
  playButton.textContent = '播放';
});

seekInput.addEventListener('input', () => {
  const now = performance.now();
  const wasRunning = engine.state === 'running';
  const time = engine.seek(Number(seekInput.value));
  waapi?.seek(time, wasRunning);
  postScheduler({ kind: 'seek', time, now });
  renderFrame(now, 0);
});

window.addEventListener('keydown', (event) => {
  if (event.code === 'Space' && event.target.tagName !== 'INPUT') {
    event.preventDefault();
    playButton.click();
  }
});
