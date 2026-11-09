/**
 * Spacebar Clicker — the run-down (SPACEBAR-CLICKER.md §8.5).
 *
 * A reactor left alone runs down. For a while after the last press or
 * purchase it gives full output; then the output falls in a straight line to
 * nothing, and the reactor faults as it gets there. A faulted reactor earns
 * nothing until it is restarted with presses on a beat (RestartTracker in
 * combo.ts).
 *
 * One clock covers every case: the tab in view, hidden or closed. In view the
 * frame loop scales its output by `outputShare`; hidden or closed, the time
 * away is credited on return with `untendedAward`. Either way an absence pays
 * at most `fullS + fallS / 2` seconds of output, however long it lasts.
 *
 * The run-down only slows earning. Nothing here takes anything away.
 */

import type { RundownRules } from './config';
import { energyPerSecond } from './economy';
import { modsOf } from './mods';
import type { SaveState } from './save';

/** Share of full output `untendedS` seconds after the reactor was last tended: 1, falling to 0. */
export function outputShare(untendedS: number, rules: Readonly<RundownRules>): number {
  if (untendedS <= rules.fullS) return 1;
  return Math.max(0, 1 - (untendedS - rules.fullS) / rules.fallS);
}

/** Seconds of full output given between `fromS` and `toS` seconds untended: the area under `outputShare`. */
export function fullOutputSeconds(
  fromS: number,
  toS: number,
  rules: Readonly<RundownRules>
): number {
  const area = (u: number) => {
    if (u <= rules.fullS) return u;
    const fall = Math.min(u - rules.fullS, rules.fallS);
    return rules.fullS + fall - fall ** 2 / (2 * rules.fallS);
  };
  return toS > fromS ? area(Math.max(0, toS)) - area(Math.max(0, fromS)) : 0;
}

/** Seconds untended at which the reactor faults. */
export function faultAtS(rules: Readonly<RundownRules>): number {
  return rules.fullS + rules.fallS;
}

/** Seconds since the reactor was last tended. */
export function untendedS(state: SaveState, now: number): number {
  return Math.max(0, (now - state.tendedAt) / 1000);
}

export function isFaulted(state: SaveState, now: number, mods = modsOf(state)): boolean {
  return untendedS(state, now) >= faultAtS(mods.rundown);
}

/**
 * A press or a purchase tends the reactor, and one that has partly run down
 * recovers at once. A faulted one doesn't: only a restart brings it back.
 * Returns whether the reactor was tended.
 */
export function tend(state: SaveState, now: number, mods = modsOf(state)): boolean {
  if (isFaulted(state, now, mods)) return false;
  state.tendedAt = now;
  return true;
}

/** The restart's last press: the reactor is tended again, at full output. */
export function restartReactor(state: SaveState, now: number): void {
  state.tendedAt = now;
}

/** Full output a second for a reactor left alone: auto-tappers, no combo, Idle Hands at work. */
export function untendedRate(state: SaveState, mods = modsOf(state)): number {
  return energyPerSecond(state, { idleS: Infinity }, mods);
}

export interface UntendedAward {
  /** Seconds the page was hidden or closed. */
  awayS: number;
  /** Energy the reactor earned meanwhile, after the run-down. */
  energy: number;
}

/**
 * What the reactor earned while the page was hidden or closed, from the last
 * save to `now`. The run-down's clock started at the last press or purchase,
 * which may be before the page went away, so the stretch is measured on it.
 */
export function untendedAward(state: SaveState, now: number, mods = modsOf(state)): UntendedAward {
  const awayS = Math.max(0, (now - state.lastSeen) / 1000);
  const fromS = Math.max(0, (state.lastSeen - state.tendedAt) / 1000);
  const seconds = fullOutputSeconds(fromS, fromS + awayS, mods.rundown);
  return { awayS, energy: untendedRate(state, mods) * seconds };
}
