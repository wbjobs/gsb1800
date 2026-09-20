import { compileEasing } from './easing.js';
import { interpolate } from './interpolate.js';

export class TimelineError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'TimelineError';
    Object.assign(this, details);
  }
}

const META_KEYS = new Set(['at', 'offset', 'easing']);

function assertFinite(value, name) {
  if (!Number.isFinite(value)) {
    throw new TimelineError(`${name} must be a finite number.`, { code: 'INVALID_TIME' });
  }
}

function keyframeValue(keyframe) {
  const value = {};
  for (const [key, item] of Object.entries(keyframe)) {
    if (!META_KEYS.has(key)) value[key] = item;
  }
  if (Object.keys(value).length === 0) {
    throw new TimelineError('Each keyframe must contain at least one animated property.', {
      code: 'EMPTY_KEYFRAME'
    });
  }
 return value;
}

function hasProperty(value, property) {
  return Object.prototype.hasOwnProperty.call(value, property);
}

function compileKeyframes(clip, clipEasing) {
  const duration = clip.duration;
  const source = clip.keyframes;
  if (!Array.isArray(source) || source.length === 0) {
    throw new TimelineError(`Clip "${clip.id}" requires keyframes.`, { code: 'MISSING_KEYFRAMES' });
  }

  const frames = source.map((raw, index) => {
    if (!raw || typeof raw !== 'object') {
      throw new TimelineError(`Keyframe ${index} in "${clip.id}" must be an object.`, {
        code: 'INVALID_KEYFRAME'
      });
    }
    let time;
    if (raw.at !== undefined) {
      time = raw.at;
    } else if (raw.offset !== undefined) {
      time = raw.offset * duration;
    } else if (source.length === 1) {
      time = 0;
    } else {
      time = (index / (source.length - 1)) * duration;
    }
    assertFinite(time, `Keyframe time in "${clip.id}"`);
    if (time < 0 || time > duration) {
      throw new TimelineError(`Keyframe time in "${clip.id}" is outside clip duration.`, {
        code: 'KEYFRAME_OUT_OF_RANGE'
      });
    }
    return { time, value: keyframeValue(raw), easing: compileEasing(raw.easing ?? clipEasing ?? 'linear') };
  }).sort((a, b) => a.time - b.time);

  const properties = [...new Set(frames.map((frame) => Object.keys(frame.value)).flat())];
  for (const property of properties) {
    let previousIndex = -1;
    for (let index = 0; index < frames.length; index += 1) {
      if (hasProperty(frames[index].value, property)) {
        if (previousIndex === -1) {
          for (let fillIndex = 0; fillIndex < index; fillIndex += 1) {
            frames[fillIndex].value[property] = frames[index].value[property];
          }
        }
        previousIndex = index;
        continue;
      }

      let nextIndex = index + 1;
      while (nextIndex < frames.length && !hasProperty(frames[nextIndex].value, property)) {
        nextIndex += 1;
      }

      if (nextIndex >= frames.length) {
        frames[index].value[property] = frames[previousIndex].value[property];
      } else if (previousIndex === -1) {
        frames[index].value[property] = frames[nextIndex].value[property];
      } else {
        const span = frames[nextIndex].time - frames[previousIndex].time;
        const progress = span === 0 ? 0 : (frames[index].time - frames[previousIndex].time) / span;
        frames[index].value[property] = interpolate(
          frames[previousIndex].value[property],
          frames[nextIndex].value[property],
          progress
        );
      }
    }
  }

  for (let index = 1; index < frames.length; index += 1) {
    if (frames[index].time === frames[index - 1].time) {
      throw new TimelineError(`Duplicate keyframe times in "${clip.id}".`, { code: 'DUPLICATE_KEYFRAME' });
    }
  }

  const segments = [];
  for (let index = 1; index < frames.length; index += 1) {
    const from = frames[index - 1];
    const to = frames[index];
    interpolate(from.value, to.value, 0);
    interpolate(from.value, to.value, 1);
    segments.push({ start: from.time, end: to.time, from: from.value, to: to.value, easing: to.easing });
  }

  return { frames, segments };
}

function validateConflicts(clips) {
  for (let i = 0; i < clips.length; i += 1) {
    for (let j = i + 1; j < clips.length; j += 1) {
      const a = clips[i];
      const b = clips[j];
      if (a.target !== b.target || a.start >= b.end || b.start >= a.end) continue;

      const shared = a.properties.filter((property) => b.properties.includes(property));
      if (shared.length > 0) {
        throw new TimelineError(
          `Concurrent clips "${a.id}" and "${b.id}" both animate ${a.target}.${shared.join(', ')}.`,
          { code: 'PROPERTY_CONFLICT', properties: shared }
        );
      }
    }
  }
}

export function compileTimeline(rawTimeline) {
  if (!rawTimeline || !Array.isArray(rawTimeline.clips)) {
    throw new TimelineError('Timeline requires a clips array.', { code: 'INVALID_TIMELINE' });
  }

  const clips = rawTimeline.clips.map((rawClip, index) => {
    if (!rawClip || typeof rawClip !== 'object') {
      throw new TimelineError(`Clip ${index} must be an object.`, { code: 'INVALID_CLIP' });
    }

    const id = rawClip.id ?? `clip-${index}`;
    const start = rawClip.start ?? 0;
    const duration = rawClip.duration;
    assertFinite(start, `Start in "${id}"`);
    assertFinite(duration, `Duration in "${id}"`);
    if (start < 0) throw new TimelineError(`Clip "${id}" cannot start before 0.`, { code: 'INVALID_START' });
    if (duration < 0) throw new TimelineError(`Clip "${id}" duration cannot be negative.`, { code: 'INVALID_DURATION' });

    const fill = rawClip.fill ?? 'both';
    if (!['none', 'forwards', 'backwards', 'both'].includes(fill)) {
      throw new TimelineError(`Unsupported fill mode in "${id}".`, { code: 'INVALID_FILL' });
    }

    const { frames, segments } = compileKeyframes(rawClip, rawClip.easing);
    return {
      id,
      target: rawClip.target,
      start,
      end: start + duration,
      duration,
      fill,
      frames,
      segments,
      properties: Object.keys(frames[0].value),
      raw: rawClip
    };
  });

  validateConflicts(clips);
  const duration = rawTimeline.duration ?? clips.reduce((max, clip) => Math.max(max, clip.end), 0);
  assertFinite(duration, 'Timeline duration');

  return {
    name: rawTimeline.name ?? 'timeline',
    duration,
    clips,
    loop: rawTimeline.loop ?? false
  };
}

function findSegment(segments, localTime) {
  let low = 0;
  let high = segments.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const segment = segments[middle];
    if (localTime < segment.start) high = middle - 1;
    else if (localTime >= segment.end) low = middle + 1;
    else return segment;
  }
  return null;
}

export function sampleClipAt(clip, time) {
  const localTime = time - clip.start;
  const first = clip.frames[0];
  const last = clip.frames[clip.frames.length - 1];

  if (localTime < 0) {
    return clip.fill === 'backwards' || clip.fill === 'both' ? first.value : null;
  }
  if (localTime > clip.duration) {
    return clip.fill === 'forwards' || clip.fill === 'both' ? last.value : null;
  }
  if (localTime === clip.duration) return last.value;
  if (localTime <= first.time) return first.value;
  if (localTime >= last.time || clip.segments.length === 0) return last.value;

  const segment = findSegment(clip.segments, localTime);
  if (!segment) return last.value;
  const segmentDuration = segment.end - segment.start;
  const progress = segmentDuration === 0 ? 1 : (localTime - segment.start) / segmentDuration;
  return interpolate(segment.from, segment.to, segment.easing(progress));
}

export function isClipActive(clip, time) {
  if (time >= clip.start && time <= clip.end) return true;
  if (time < clip.start && (clip.fill === 'backwards' || clip.fill === 'both')) return true;
  return time > clip.end && (clip.fill === 'forwards' || clip.fill === 'both');
}

export function sampleTimelineInto(timeline, time, states = new Map(), options = {}) {
  const shouldSample = options.shouldSample ?? (() => true);
  states.clear();
  let elapsed = time;
  if (timeline.loop && timeline.duration > 0) elapsed %= timeline.duration;
  if (elapsed < 0) elapsed = 0;

  const applyClip = (clip) => {
    if (!shouldSample(clip.target)) return;
    const value = sampleClipAt(clip, elapsed);
    if (!value) return;
    const state = states.get(clip.target) ?? {};
    Object.assign(state, value);
    states.set(clip.target, state);
  };

  for (const clip of timeline.clips) {
    if (elapsed >= clip.start && elapsed < clip.end) applyClip(clip);
  }

  const activeProperties = new Set();
  for (const clip of timeline.clips) {
    if (elapsed < clip.start || elapsed >= clip.end) continue;
    for (const property of clip.properties) activeProperties.add(`${clip.target}.${property}`);
  }

  for (const clip of timeline.clips) {
    const inActiveRange = elapsed >= clip.start && elapsed < clip.end;
    const isForwardFill = elapsed > clip.end && (clip.fill === 'forwards' || clip.fill === 'both');
    const isBackwardFill = elapsed < clip.start && (clip.fill === 'backwards' || clip.fill === 'both');
    if (inActiveRange || isForwardFill || !isBackwardFill) continue;
    if (clip.properties.some((property) => activeProperties.has(`${clip.target}.${property}`))) continue;
    applyClip(clip);
  }

  for (const clip of timeline.clips) {
    const inActiveRange = elapsed >= clip.start && elapsed < clip.end;
    const isForwardFill = elapsed > clip.end && (clip.fill === 'forwards' || clip.fill === 'both');
    if (inActiveRange || !isForwardFill) continue;
    applyClip(clip);
  }

  return states;
}

export function getBoundaryEvents(timeline) {
  const events = [];
  for (const clip of timeline.clips) {
    events.push({ time: clip.start, type: 'start', clip: clip.id, target: clip.target });
    events.push({ time: clip.end, type: 'end', clip: clip.id, target: clip.target });
  }
  return events.sort((a, b) => a.time - b.time || a.type.localeCompare(b.type));
}
