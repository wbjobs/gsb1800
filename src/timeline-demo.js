export const demoTimeline = {
  name: 'Orbital Launch',
  duration: 9000,
  loop: true,
  clips: [
    {
      id: 'sky-cycle',
      target: 'sky',
      start: 0,
      duration: 9000,
      keyframes: [
        { at: 0, hue: 225, glow: 0.16 },
        { at: 2800, hue: 282, glow: 0.42, easing: 'ease-out' },
        { at: 6100, hue: 198, glow: 0.22, easing: 'cubic-bezier(.2,.8,.2,1)' },
        { at: 9000, hue: 225, glow: 0.16 }
      ]
    },
    {
      id: 'starfield-drift',
      target: 'field',
      start: 0,
      duration: 9000,
      keyframes: [
        { at: 0, drift: -3, starAlpha: 0.62 },
        { at: 4200, drift: 2.4, starAlpha: 0.95 },
        { at: 9000, drift: 8, starAlpha: 0.62 }
      ]
    },
    {
      id: 'core-pulse',
      target: 'core',
      start: 300,
      duration: 2600,
      keyframes: [
        { at: 0, radius: 0.075, pulse: 0.9, x: 0.5, y: 0.55, rotation: 0 },
        { at: 1250, radius: 0.125, pulse: 1.12, x: 0.47, y: 0.48, rotation: 0.35, easing: 'ease-out' },
        { at: 2600, radius: 0.09, pulse: 1, x: 0.5, y: 0.52, rotation: 0.7 }
      ]
    },
    {
      id: 'core-stabilize',
      target: 'core',
      start: 2900,
      duration: 2600,
      keyframes: [
        { at: 0, radius: 0.09, pulse: 1, x: 0.5, y: 0.52, rotation: 0.7 },
        { at: 1300, radius: 0.135, pulse: 1.16, x: 0.55, y: 0.45, rotation: 1.2, easing: 'ease-in-out' },
        { at: 2600, radius: 0.085, pulse: 0.96, x: 0.5, y: 0.53, rotation: 1.8 }
      ]
    },
    {
      id: 'core-reset',
      target: 'core',
      start: 5500,
      duration: 3500,
      keyframes: [
        { at: 0, radius: 0.085, pulse: 0.96, x: 0.5, y: 0.53, rotation: 1.8 },
        { at: 1800, radius: 0.13, pulse: 1.1, x: 0.46, y: 0.47, rotation: 2.4, easing: 'cubic-bezier(.15,.85,.25,1)' },
        { at: 3500, radius: 0.075, pulse: 0.9, x: 0.5, y: 0.55, rotation: 3.14159 }
      ]
    },
    {
      id: 'ring-rotation',
      target: 'ring',
      start: 400,
      duration: 8600,
      keyframes: [
        { at: 0, radius: 0.15, lineWidth: 0.005, rotation: 0 },
        { at: 4200, radius: 0.23, lineWidth: 0.008, rotation: 2.2, easing: 'ease-in-out' },
        { at: 8600, radius: 0.15, lineWidth: 0.005, rotation: 4.4 }
      ]
    },
    {
      id: 'ring-opacity',
      target: 'ring',
      start: 900,
      duration: 7200,
      keyframes: [
        { at: 0, opacity: 0.12 },
        { at: 2200, opacity: 0.82, easing: 'ease-out' },
        { at: 5000, opacity: 0.72 },
        { at: 7200, opacity: 0.2 }
      ]
    },
    {
      id: 'comet-bridge',
      target: 'comet',
      start: 1800,
      duration: 4200,
      keyframes: [
        { at: 0, x: 0.12, y: 0.82, size: 0.018, angle: -0.72, alpha: 0 },
        { at: 500, alpha: 0.96, easing: 'ease-out' },
        { at: 3300, x: 0.86, y: 0.2, size: 0.032, angle: -0.48 },
        { at: 4200, x: 0.98, y: 0.12, size: 0.02, alpha: 0, easing: 'ease-in' }
      ]
    },
    {
      id: 'title-enter',
      target: 'title',
      start: 200,
      duration: 1800,
      keyframes: [
        { at: 0, opacity: 0, transform: 'translate3d(0px, 24px, 0px) scale(0.96)', color: 'rgb(186, 230, 253)' },
        { at: 850, opacity: 1, transform: 'translate3d(0px, 0px, 0px) scale(1.02)', color: 'rgb(255, 255, 255)', easing: 'cubic-bezier(.16,1,.3,1)' },
        { at: 1800, opacity: 1, transform: 'translate3d(0px, 0px, 0px) scale(1)', color: 'rgb(224, 242, 254)' }
      ]
    },
    {
      id: 'card-enter',
      target: 'card',
      start: 1200,
      duration: 2200,
      keyframes: [
        { at: 0, opacity: 0, transform: 'translate3d(-28px, 0px, 0px) scale(1)', background: 'rgba(15,23,42,.18)' },
        { at: 900, opacity: 1, transform: 'translate3d(4px, 0px, 0px) scale(1)', background: 'rgba(30,64,175,.38)', easing: 'ease-out' },
        { at: 2200, opacity: 1, transform: 'translate3d(0px, 0px, 0px) scale(1)', background: 'rgba(15,23,42,.58)' }
      ]
    },
    {
      id: 'card-glow',
      target: 'card',
      start: 3400,
      duration: 3200,
      keyframes: [
        { at: 0, opacity: 1, transform: 'translate3d(0px, 0px, 0px) scale(1)', background: 'rgba(15,23,42,.58)' },
        { at: 1600, opacity: 0.94, transform: 'translate3d(0px, -6px, 0px) scale(1.025)', background: 'rgba(49,46,129,.62)', easing: 'ease-in-out' },
        { at: 3200, opacity: 1, transform: 'translate3d(0px, 0px, 0px) scale(1)', background: 'rgba(15,23,42,.58)' }
      ]
    },
    {
      id: 'badge-pulse',
      target: 'badge',
      start: 2000,
      duration: 5000,
      keyframes: [
        { at: 0, opacity: 0.25, transform: 'translate3d(0px, 0px, 0px) scale(0.8)', color: 'rgb(125, 211, 252)' },
        { at: 700, opacity: 1, transform: 'translate3d(0px, 0px, 0px) scale(1.1)', color: 'rgb(255, 255, 255)', easing: 'ease-out' },
        { at: 2500, opacity: 0.8, transform: 'translate3d(0px, 0px, 0px) scale(0.96)', color: 'rgb(165, 243, 252)' },
        { at: 3500, opacity: 1, transform: 'translate3d(0px, 0px, 0px) scale(1.08)', color: 'rgb(255, 255, 255)' },
        { at: 5000, opacity: 0.55, transform: 'translate3d(0px, 0px, 0px) scale(0.9)', color: 'rgb(125, 211, 252)' }
      ]
    }
  ]
};
