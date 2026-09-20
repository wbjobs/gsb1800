export const DOM_TARGETS = new Set(['title', 'card', 'badge']);

function cssKeyframes(clip, timelineDuration) {
  const frames = clip.raw.keyframes.map((keyframe) => {
    const normalized = { ...keyframe };
    if (normalized.at !== undefined) {
      normalized.offset = timelineOffset(clip, normalized.at, timelineDuration);
      delete normalized.at;
    }
    return normalized;
  });

  const firstOffset = clip.start === 0 ? 0 : clip.start / timelineDuration;
  if (frames[0].offset !== 0) frames.unshift({ ...frames[0], offset: 0 });
  if (firstOffset > 0 && frames[1]?.offset !== firstOffset) {
    frames.splice(1, 0, { ...frames[0], offset: firstOffset });
  }
  if (frames[frames.length - 1].offset !== 1) {
    frames.push({ ...frames[frames.length - 1], offset: 1 });
  }

  return frames;
}

function timelineOffset(clip, localTime, timelineDuration) {
  if (clip.duration === 0) return clip.start === 0 ? 0 : 1;
  return Math.min(1, Math.max(0, (clip.start + localTime) / timelineDuration));
}

export class WaapiLayer {
  constructor(timeline, elements, onStatus = () => {}) {
    this.timeline = timeline;
    this.elements = elements;
    this.onStatus = onStatus;
    this.animations = [];
    this.available = typeof Element !== 'undefined' && typeof Element.prototype.animate === 'function';

    if (!this.available) {
      this.onStatus({
        level: 'warning',
        code: 'WAAPI_UNAVAILABLE',
        message: 'Web Animations API unavailable; using rAF style fallback.'
      });
      return;
    }

    for (const clip of timeline.clips.filter((item) => DOM_TARGETS.has(item.target))) {
      const element = elements[clip.target];
      if (!element) {
        throw new Error(`Missing DOM element for animation target "${clip.target}".`);
      }

      try {
        const animation = element.animate(cssKeyframes(clip, timeline.duration), {
          duration: timeline.duration,
          fill: 'both',
          iterations: 1,
          composite: 'replace'
        });
        animation.pause();
        animation.currentTime = 0;
        this.animations.push({ animation, clip });
      } catch (error) {
        this.available = false;
        this.cancel();
        this.onStatus({
          level: 'warning',
          code: 'WAAPI_INIT_FAILED',
          message: `WAAPI initialization failed: ${error.message}`
        });
        break;
      }
    }
  }

  forEachAnimation(callback) {
    for (const item of this.animations) {
      try {
        callback(item.animation, item.clip);
      } catch (error) {
        this.available = false;
        this.onStatus({
          level: 'warning',
          code: 'WAAPI_SYNC_FAILED',
          message: error.message
        });
        return false;
      }
    }
    return true;
  }

  play(time) {
    if (!this.available || this.animations.length === 0) return;
    const timelineTime = document.timeline.currentTime ?? performance.now();
    const startTime = timelineTime - time;
    const ok = this.forEachAnimation((animation) => {
      if (animation.playState === 'finished') {
        animation.pause();
        animation.currentTime = 0;
        animation.startTime = startTime;
      } else {
        animation.startTime = startTime;
      }
      animation.play();
    });
    if (!ok) this.cancel();
  }

  pause() {
    if (!this.available) return;
    this.forEachAnimation((animation) => animation.pause());
  }

  seek(time, running) {
    if (!this.available) return;
    if (running) {
      const startTime = (document.timeline.currentTime ?? performance.now()) - time;
      this.forEachAnimation((animation) => {
        animation.startTime = startTime;
      });
    } else {
      this.forEachAnimation((animation, clip) => {
        animation.currentTime = time;
      });
    }
  }

  stop() {
    if (!this.available) return;
    this.forEachAnimation((animation, clip) => {
      animation.pause();
      animation.currentTime = 0;
    });
  }

  cancel() {
    for (const { animation } of this.animations) {
      try {
        animation.cancel();
      } catch {
        // Animation cleanup is best-effort.
      }
    }
    this.animations = [];
    this.available = false;
  }

  applyFallback(states) {
    for (const target of DOM_TARGETS) {
      const state = states.get(target);
      const element = this.elements[target];
      if (!state || !element) continue;

      if (state.opacity !== undefined) element.style.opacity = state.opacity;
      if (state.transform !== undefined) element.style.transform = state.transform;
      if (state.color !== undefined) element.style.color = state.color;
      if (state.background !== undefined) element.style.background = state.background;
    }
  }
}
