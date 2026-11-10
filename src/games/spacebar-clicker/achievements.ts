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

const CONDITIONS: Record<AchievementId, (s: SaveState, ctx: AchievementContext) => boolean> = {
  'first-press': (s) => s.totalPresses >= 1,
  'warmed-up': (s) => s.totalPresses >= 100,
  'thousand-taps': (s) => s.totalPresses >= 1000,
  'ten-thousand-taps': (s) => s.totalPresses >= 10_000,
  'steady-hands': (s, c) => Math.max(s.bestCombo, c.combo ?? 0) >= 25,
  resonance: (s, c) => Math.max(s.bestCombo, c.combo ?? 0) >= 50,
  harmonic: (s, c) => Math.max(s.bestCombo, c.combo ?? 0) >= 100,
  'fast-fingers': (s, c) => Math.max(s.bestSurgeCps, c.surgeCps ?? 0) >= 8,
  lightning: (s, c) => Math.max(s.bestSurgeCps, c.surgeCps ?? 0) >= 12,
  'staffed-up': (s) => s.tappers.assistant >= 10,
  automated: (s) => AUTO_TAPPERS.every((t) => s.tappers[t.id] > 0),
  'critical-mass': (s) => reactorIndex(s.runLifetime) >= CRITICAL_INDEX,
  'fresh-start': (s) => s.prestiges >= 1,
  veteran: (s) => s.prestiges >= 5,
  supercritical: (s) => reactorIndex(s.runLifetime) >= SUPERCRITICAL_INDEX,
  'full-track': (s) => s.isotopes >= ISOTOPE_TRACK.length,
  'big-bang': (_, c) => (c.resetGain ?? 0) >= 5,
  collector: (s) => PERKS.every((p) => p.id in s.perks.codex),
  'quick-study': (s) => s.bestMillionS !== null && s.bestMillionS < 600,
};

export function checkAchievements(state: SaveState, ctx: AchievementContext = {}): AchievementId[] {
  const earned: AchievementId[] = [];
  for (const def of ACHIEVEMENTS) {
    if (state.achievements.includes(def.id)) continue;
    if (CONDITIONS[def.id](state, ctx)) {
      state.achievements.push(def.id);
      earned.push(def.id);
    }
  }
  return earned;
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
