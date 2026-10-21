/**
 * Spacebar Clicker — achievements (spec §10).
 *
 * Cosmetic badges. `checkAchievements` compares the save against every
 * condition and appends whatever is newly earned, returning those ids so the
 * UI can announce them. Idempotent: calling it twice awards nothing twice.
 */

import { ACHIEVEMENTS, AUTO_TAPPERS, type AchievementId } from './config';
import { reactorIndex } from './economy';
import type { SaveState } from './save';

export interface AchievementContext {
  /** Current combo, if the caller has one in hand. */
  combo?: number;
  /** Presses per second of a surge that just ended. */
  surgeCps?: number;
}

const CRITICAL_INDEX = 5; // REACTOR_STATES[5] is Critical

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
