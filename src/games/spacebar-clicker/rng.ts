/**
 * Spacebar Clicker — a seeded random generator.
 *
 * Perk drops must not reroll when the page is reloaded, so their randomness
 * comes from a seed kept in the save rather than from Math.random. The
 * generator is mulberry32: one 32-bit number of state, fast, and plenty for a
 * game. Pure: each draw takes the state and hands back the value with the next
 * state, so the save holds a single number and tests can replay a sequence.
 */

export interface Draw {
  /** Uniform in [0, 1). */
  value: number;
  /** The state to draw from next. */
  seed: number;
}

export function nextRandom(seed: number): Draw {
  const next = (seed + 0x6d2b79f5) >>> 0;
  let t = Math.imul(next ^ (next >>> 15), next | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, seed: next };
}

/** A fresh seed for a new save or a new run. */
export function newSeed(random: () => number = Math.random): number {
  return Math.floor(random() * 4294967296) >>> 0;
}
