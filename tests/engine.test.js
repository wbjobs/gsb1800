import test from 'node:test';
import assert from 'node:assert/strict';
import { compileEasing } from '../src/easing.js';
import { interpolate } from '../src/interpolate.js';
import {
  compileTimeline,
  sampleClipAt,
  sampleTimelineInto
} from '../src/timeline.js';
import { PlaybackEngine } from '../src/playback-engine.js';

const timeline = {
  duration: 1000,
  clips: [
    {
      id: 'a',
      target: 'orb',
      start: 0,
      duration: 500,
      keyframes: [
        { at: 0, x: 0, opacity: 0, color: '#000000' },
        { at: 500, x: 100, opacity: 1, color: '#ffffff' }
      ]
    },
    {
      id: 'b',
      target: 'orb',
      start: 500,
      duration: 500,
      keyframes: [
        { at: 0, x: 100 },
        { at: 500, x: 200 }
      ]
    },
    {
      id: 'parallel',
      target: 'ring',
      start: 100,
      duration: 700,
      keyframes: [
        { at: 0, scale: 1 },
        { at: 700, scale: 2 }
      ]
    }
  ]
};

test('easing maps endpoints and applies named curves', () => {
  const ease = compileEasing('ease-in-out');
  assert.equal(ease(0), 0);
  assert.equal(ease(1), 1);
  assert.ok(ease(0.5) > 0.48 && ease(0.5) < 0.52);
});

test('interpolates numbers, nested values and colors', () => {
  assert.equal(interpolate(10, 20, 0.25), 12.5);
  assert.deepEqual(interpolate({ a: [0, 2] }, { a: [10, 4] }, 0.5), { a: [5, 3] });
  assert.equal(interpolate('rgb(0, 0, 0, 0)', 'rgb(100, 200, 255, 1)', 0.5), 'rgba(50, 100, 128, 0.5)');
  assert.equal(
    interpolate('translate3d(0px, 0px, 0px) scale(0.8)', 'translate3d(20px, 40px, 0px) scale(1.2)', 0.5),
    'translate3d(10px, 20px, 0px) scale(1)'
  );
});

test('allows same target chained clips and different target concurrent clips', () => {
  const compiled = compileTimeline(timeline);
  assert.equal(compiled.clips.length, 3);
  assert.equal(sampleClipAt(compiled.clips[0], 250).x, 50);
});

test('rejects overlapping clips writing the same target property', () => {
  assert.throws(
    () => compileTimeline({
      clips: [
        { id: 'one', target: 'x', start: 0, duration: 100, keyframes: [{ at: 0, v: 0 }, { at: 100, v: 1 }] },
        { id: 'two', target: 'x', start: 50, duration: 100, keyframes: [{ at: 0, v: 1 }, { at: 100, v: 2 }] }
      ]
    }),
    /PROPERTY_CONFLICT|Concurrent clips/
  );
});

test('samples concurrently animated independent targets', () => {
  const compiled = compileTimeline(timeline);
  const states = sampleTimelineInto(compiled, 500, new Map());
  assert.equal(states.get('orb').x, 100);
  assert.ok(Math.abs(states.get('ring').scale - (1 + 400 / 700)) < 0.000001);
});

test('pause freezes virtual time and resume continues from same point', () => {
  const compiled = compileTimeline({ ...timeline, loop: false, duration: 2000 });
  const engine = new PlaybackEngine(compiled, () => clock);
  let clock = 0;

  engine.play(0);
  clock = 240;
  assert.equal(engine.pause(240), 240);
  clock = 100000;
  assert.equal(engine.getTime(clock), 240);

  engine.play(clock);
  clock += 360;
  assert.equal(engine.getTime(clock), 600);
});

test('looping timeline wraps sampled time', () => {
  const compiled = compileTimeline({ ...timeline, loop: true, duration: 1000 });
  const states = sampleTimelineInto(compiled, 1250, new Map());
  assert.equal(states.get('orb').x, 50);
});

test('fills omitted keyframe properties without repeating values', () => {
  const compiled = compileTimeline({
    clips: [
      {
        id: 'partial',
        target: 'orb',
        start: 0,
        duration: 100,
        keyframes: [
          { at: 0, x: 0, y: 0 },
          { at: 50, x: 50 },
          { at: 100, x: 100, y: 20 }
        ]
      }
    ]
  });
  assert.deepEqual(sampleClipAt(compiled.clips[0], 50), { x: 50, y: 10 });
});

test('active clip wins over retained forwards fill of another clip', () => {
  const compiled = compileTimeline({
    loop: true,
    duration: 100,
    clips: [
      { id: 'first', target: 'orb', start: 0, duration: 50, keyframes: [{ at: 0, x: 0 }, { at: 50, x: 50 }] },
      { id: 'second', target: 'orb', start: 50, duration: 50, keyframes: [{ at: 0, x: 50 }, { at: 50, x: 100 }] }
    ]
  });
  const states = sampleTimelineInto(compiled, 125, new Map());
  assert.equal(states.get('orb').x, 25);
});
