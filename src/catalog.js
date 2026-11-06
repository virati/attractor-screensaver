// Every system the screensaver knows, in named sets. `classic` is Reusser's
// collection; `lie` holds the Lie brackets of dysts pairs that
// tools/lie_pairs.py has built; `all` is both.

import { ATTRACTORS } from './attractors.js';
import { LIE_ATTRACTORS } from './lie-attractors.js';

export const SETS = {
  classic: ATTRACTORS,
  lie: LIE_ATTRACTORS,
  all: [...ATTRACTORS, ...LIE_ATTRACTORS]
};

// An unknown or empty set falls back to the classics rather than a blank screen.
export const catalog = set => (SETS[set] && SETS[set].length ? SETS[set] : ATTRACTORS);

export const byName = name => SETS.all.find(a => a.name === name);
