import { performance } from 'node:perf_hooks';
import { compileTimeline, sampleTimelineInto } from '../src/timeline.js';

const clips = Array.from({ length: 240 }, (_, index) => {
  const start = (index * 37) % 8000;
  const duration = 700 + (index % 12) * 90;
  return {
    id: `clip-${index}`,
    target: `target-${index % 80}`,
    start,
    duration,
    keyframes: [
      { at: 0, x: index * 0.1, y: index % 10, opacity: 0.1, color: '#0f172a' },
      { at: duration * 0.45, x: index * 0.35, y: (index % 10) + 4, opacity: 0.8 },
      { at: duration, x: index * 0.7, y: (index % 10) + 8, opacity: 1, color: '#e0f2fe' }
    ]
  };
});

const timeline = compileTimeline({ duration: 9000, loop: true, clips });
const states = new Map();
const started = performance.now();

for (let frame = 0; frame < 5400; frame += 1) {
  const time = (frame * 1000) / 60;
  sampleTimelineInto(timeline, time, states);
}

const elapsed = performance.now() - started;
const average = elapsed / 5400;

console.log(JSON.stringify({
  clips: clips.length,
  frames: 5400,
  totalMs: elapsed.toFixed(2),
  averageSampleMs: average.toFixed(4),
  frameBudgetMs: 16.67,
  passed: average < 4
}, null, 2));

if (average >= 4) process.exit(1);
