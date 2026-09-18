// Colour schemes. `color1` → `color2` is the gradient across trajectories;
// `border` is the ink that separates overlapping strands.

import { hexToRgb } from './glutil.js';

const raw = [
  // --- dark ---------------------------------------------------------------
  { name: 'Ink',        dark: true, bg: '#07090e', c1: '#2f6ad0', c2: '#8de2a7', border: '#02030a', grid: '#5f7fb8' },
  { name: 'Ember',      dark: true, bg: '#0b0605', c1: '#a8204c', c2: '#ffb347', border: '#1a0503', grid: '#a8674a' },
  { name: 'Viridian',   dark: true, bg: '#05100d', c1: '#12786f', c2: '#c8f169', border: '#01100c', grid: '#4fae8f' },
  { name: 'Magenta Ice',dark: true, bg: '#0a0713', c1: '#6c2ecb', c2: '#ff85d8', border: '#05020d', grid: '#8a6bc9' },
  { name: 'Copper',     dark: true, bg: '#0d0a07', c1: '#7d4520', c2: '#f0a868', border: '#170d05', grid: '#9c7550' },
  { name: 'Cyanotype',  dark: true, bg: '#04101c', c1: '#1566ba', c2: '#9ee8ff', border: '#010a14', grid: '#4d8fc4' },
  { name: 'Sodium',     dark: true, bg: '#0c0a04', c1: '#a8760a', c2: '#ffe9a8', border: '#150f02', grid: '#a08f55' },
  { name: 'Absinthe',   dark: true, bg: '#080d06', c1: '#4c860e', c2: '#e8ff7a', border: '#040802', grid: '#7fa84f' },
  { name: 'Deep Sea',   dark: true, bg: '#03080f', c1: '#12568f', c2: '#46d5c8', border: '#01050b', grid: '#3d7d9c' },
  { name: 'Ultraviolet',dark: true, bg: '#07040f', c1: '#4a32d8', c2: '#c4a7ff', border: '#030109', grid: '#7060c0' },
  { name: 'Rust Bloom', dark: true, bg: '#0f0709', c1: '#c04a2c', c2: '#ffd9a0', border: '#1c0806', grid: '#b0705e' },
  { name: 'Aurora',     dark: true, bg: '#040a0c', c1: '#1a7ba6', c2: '#a7ffcf', border: '#010607', grid: '#48a0a8' },
  // --- paper --------------------------------------------------------------
  { name: 'Notebook',   dark: false, bg: '#ffffff', c1: '#2f6ad0', c2: '#8de2a7', border: '#492727', grid: '#000000' },
  { name: 'Blueprint',  dark: false, bg: '#eef3fa', c1: '#123a73', c2: '#5fb0d8', border: '#12243d', grid: '#20406b' },
  { name: 'Risograph',  dark: false, bg: '#f7f1e6', c1: '#d0245c', c2: '#2a4fc4', border: '#3a2018', grid: '#6b5a48' }
];

function mix(a, b, t) { return a.map((v, i) => v + (b[i] - v) * t); }

export const PALETTES = raw.map(p => {
  const background = hexToRgb(p.bg);
  const color1 = hexToRgb(p.c1);
  const color2 = hexToRgb(p.c2);
  return {
    name: p.name,
    dark: p.dark,
    background,
    color1,
    color2,
    borderColor: hexToRgb(p.border),
    gridColor: hexToRgb(p.grid),
    gridOpacity: p.dark ? 0.32 : 0.25,
    // On dark grounds a literal shadow is invisible, so the floor catches a
    // dim tint of the trails instead.
    shadowColor: p.dark ? mix(background, color1, 0.42) : mix(background, [0, 0, 0], 0.09),
    css: {
      background: p.bg,
      foreground: p.dark ? '#e8edf5' : '#1a1a1a',
      accent: p.c2
    }
  };
});

// Black is free on an OLED: a pixel driven to zero draws no current, while the
// near-blacks these palettes were designed around still light every pixel on the
// panel. The background is almost the whole screen almost all of the time, so
// dropping it to true black is the one change that matters for power.
//
// Paper palettes are returned untouched. Their ink is dark, so a black ground
// would leave nothing visible — a light scheme cannot be made frugal, only
// avoided, which is what the palette pool does by default.
export function oledSafe(palette) {
  if (!palette.dark) return palette;
  const background = [0, 0, 0];
  return {
    ...palette,
    background,
    shadowColor: mix(background, palette.color1, 0.42),
    // The grid room is background too, and the largest lit area after the
    // trails themselves, so it is dimmed rather than left alone.
    gridOpacity: palette.gridOpacity * 0.55,
    css: { ...palette.css, background: '#000000' }
  };
}

export const pick = (rng = Math.random, filter = () => true) => {
  const pool = PALETTES.filter(filter);
  return pool[Math.floor(rng() * pool.length)];
};
