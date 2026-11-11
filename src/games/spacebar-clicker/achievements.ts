/**
 * Spacebar Clicker — achievements (spec §10).
 *
 * Cosmetic badges. `checkAchievements` compares the save against every
 * condition and appends whatever is newly earned, returning those ids so the
 * UI can announce them. Idempotent: calling it twice awards nothing twice.
 *
 * And the records past the isotope track (SPACEBAR-CLICKER.md §8.5.16): the
 * fastest run to a million, and the biggest run.
 */

import { ACHIEVEMENTS, AUTO_TAPPERS, ISOTOPE_TRACK, PERKS, type AchievementId } from './config';
import { reactorIndex } from './economy';
import type { SaveState } from './save';

export interface AchievementContext {
  /** Current combo, if the caller has one in hand. */
  combo?: number;
  /** Presses per second of a surge that just ended. */
  surgeCps?: number;
  /** Isotopes a reset just paid. */
  resetGain?: number;
}

const CRITICAL_INDEX = 5; // REACTOR_STATES[5] is Critical
const SUPERCRITICAL_INDEX = 6;

/**
 * The badges with a count to reach: what the save has, and what the badge
 * needs. The Achievements tab shows the way there (SPACEBAR-CLICKER.md
 * §8.5.18), and the badge is earned when the count gets there.
 */
const COUNTS: Partial<
  Record<AchievementId, { need: number; have: (s: SaveState, ctx: AchievementContext) => number }>
> = {
  'first-press': { need: 1, have: (s) => s.totalPresses },
  'warmed-up': { need: 100, have: (s) => s.totalPresses },
  'thousand-taps': { need: 1000, have: (s) => s.totalPresses },
  'ten-thousand-taps': { need: 10_000, have: (s) => s.totalPresses },
  'steady-hands': { need: 25, have: (s, c) => Math.max(s.bestCombo, c.combo ?? 0) },
  resonance: { need: 50, have: (s, c) => Math.max(s.bestCombo, c.combo ?? 0) },
  harmonic: { need: 100, have: (s, c) => Math.max(s.bestCombo, c.combo ?? 0) },
  'fast-fingers': { need: 8, have: (s, c) => Math.max(s.bestSurgeCps, c.surgeCps ?? 0) },
  lightning: { need: 12, have: (s, c) => Math.max(s.bestSurgeCps, c.surgeCps ?? 0) },
  'staffed-up': { need: 10, have: (s) => s.tappers.assistant },
  automated: {
    need: AUTO_TAPPERS.length,
    have: (s) => AUTO_TAPPERS.filter((t) => s.tappers[t.id] > 0).length,
  },
  'fresh-start': { need: 1, have: (s) => s.prestiges },
  veteran: { need: 5, have: (s) => s.prestiges },
  'full-track': { need: ISOTOPE_TRACK.length, have: (s) => s.isotopes },
  collector: { need: PERKS.length, have: (s) => PERKS.filter((p) => p.id in s.perks.codex).length },
};

/** The badges earned by a moment rather than a count. */
const MOMENTS: Partial<Record<AchievementId, (s: SaveState, ctx: AchievementContext) => boolean>> =
  {
    'critical-mass': (s) => reactorIndex(s.runLifetime) >= CRITICAL_INDEX,
    supercritical: (s) => reactorIndex(s.runLifetime) >= SUPERCRITICAL_INDEX,
    'big-bang': (_, c) => (c.resetGain ?? 0) >= 5,
    'quick-study': (s) => s.bestMillionS !== null && s.bestMillionS < 600,
  };

function earned(id: AchievementId, state: SaveState, ctx: AchievementContext): boolean {
  const count = COUNTS[id];
  if (count) return count.have(state, ctx) >= count.need;
  return MOMENTS[id]?.(state, ctx) ?? false;
}

/**
 * How far along a badge is: what the save has toward what it needs, never
 * more than the need. Null for a badge with nothing to count: one earned by
 * a moment, or by doing a thing once.
 */
export function achievementProgress(
  state: SaveState,
  id: AchievementId
): { have: number; need: number } | null {
  const count = COUNTS[id];
  if (!count || count.need <= 1) return null;
  return { have: Math.min(count.have(state, {}), count.need), need: count.need };
}

export function checkAchievements(state: SaveState, ctx: AchievementContext = {}): AchievementId[] {
  const won: AchievementId[] = [];
  for (const def of ACHIEVEMENTS) {
    if (state.achievements.includes(def.id)) continue;
    if (earned(def.id, state, ctx)) {
      state.achievements.push(def.id);
      won.push(def.id);
    }
  }
  return won;
}

/** A run reaching a million: how long it took, and whether that beat the fastest. */
export interface MillionRecord {
  seconds: number;
  best: boolean;
  /** The fastest before this run, or null if there wasn't one. */
  previous: number | null;
}

/**
 * Note a run reaching a million: the seconds since it began, kept if they
 * beat the fastest. Call it once, as the run first gets there. A run begun
 * before records were kept has no start, and notes nothing.
 */
export function recordMillion(state: SaveState, now: number): MillionRecord | null {
  if (state.runStartedAt === null) return null;
  const seconds = Math.max(0, (now - state.runStartedAt) / 1000);
  const previous = state.bestMillionS;
  const best = previous === null || seconds < previous;
  if (best) state.bestMillionS = seconds;
  return { seconds, best, previous };
}

/** The most energy in one run, the run under way included. */
export function bestRun(state: SaveState): number {
  return Math.max(state.bestRunEnergy, state.runLifetime);
}
