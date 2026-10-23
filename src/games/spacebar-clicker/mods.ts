/**
 * Spacebar Clicker — a run's modifiers.
 *
 * Every rule a perk can bend, gathered in one object, so the economy, the
 * combo tracker and the surge scheduler read a run's rules from one place
 * instead of from the constants. With no perks, each field equals the constant
 * it stands in for, or the identity (x1, +0, off): BASE_MODS is the game as it
 * shipped, and the unit tests hold it there.
 *
 * The two one-off upgrades that change rules, the Stabiliser and
 * Synchronisation, are folded in here too, so a perk that overrides them
 * (Glass Rhythm, Full Sync) has one field to change rather than a special case
 * in the economy.
 *
 * Economy functions take `mods = modsOf(state)` as an optional last argument:
 * the game never passes it, tests pass it to exercise one field directly.
 */

import {
  AUTO_TAPPERS,
  COMBO,
  COMBO_TIERS,
  OFFLINE,
  SURGE,
  SYNC_SHARE,
  type AutoTapperId,
  type ComboRules,
  type ComboTierDef,
  type OfflineRules,
  type SurgeRules,
} from './config';
import type { SaveState } from './save';

export interface Mods {
  // --- Presses -----------------------------------------------------------
  /** Energy each Finger Strength level adds to a press. */
  fingerPerLevel: number;
  /** Multiplier each Spring Keys level applies. */
  springPerLevel: number;
  /** Flat multiplier on press value. */
  pressMult: number;
  /** Press value bonus per point of combo: 0.005 is +0.5% a point. */
  pressPerCombo: number;
  /** Added to the Double Tap chance before the cap. */
  doubleTapBonus: number;
  /** Highest the Double Tap chance can go. */
  doubleTapCap: number;
  /** Seconds after a surge that presses keep `afterglowMult`. */
  afterglowS: number;
  afterglowMult: number;

  // --- Combo -------------------------------------------------------------
  combo: Readonly<ComboRules>;
  /** Best tier first, ending in the zero tier, like COMBO_TIERS. */
  tiers: readonly ComboTierDef[];
  /** A break drops the combo by `combo.stabiliserDrop` instead of to zero. */
  stabiliser: boolean;

  // --- Surges ------------------------------------------------------------
  surge: Readonly<SurgeRules>;
  /** Surges multiply auto-tapper output as well as presses. */
  surgeHitsTappers: boolean;

  // --- Auto-tappers ------------------------------------------------------
  /** Flat multiplier on all auto-tapper output. */
  tapperMult: number;
  /** Per-tapper output multipliers. */
  tapperMultById: Readonly<Record<AutoTapperId, number>>;
  /** Output bonus per auto-tapper owned, of any kind. */
  tapperPerOwned: number;
  /** Output bonus per reactor state reached this run. */
  tapperPerState: number;
  /** Share of the Double Tap chance auto-tappers get as bonus output. */
  tapperDoubleTapShare: number;
  /** Share of the combo bonus auto-tappers get: 0 without Synchronisation. */
  syncShare: number;
  /** Auto-tapper output multiplier once play has been idle `idleBoostAfterS`. */
  idleBoostMult: number;
  idleBoostAfterS: number;
  /** Multiplier on auto-tapper prices. */
  tapperCostMult: number;

  // --- Away --------------------------------------------------------------
  offline: Readonly<OfflineRules>;
}

const ONES = Object.fromEntries(AUTO_TAPPERS.map((t) => [t.id, 1])) as Record<AutoTapperId, number>;

/** The game with nothing bought and no perks. */
export const BASE_MODS: Readonly<Mods> = Object.freeze({
  fingerPerLevel: 1,
  springPerLevel: 1.5,
  pressMult: 1,
  pressPerCombo: 0,
  doubleTapBonus: 0,
  doubleTapCap: 0.5,
  afterglowS: 0,
  afterglowMult: 1,
  combo: COMBO,
  tiers: COMBO_TIERS,
  stabiliser: false,
  surge: SURGE,
  surgeHitsTappers: false,
  tapperMult: 1,
  tapperMultById: ONES,
  tapperPerOwned: 0,
  tapperPerState: 0,
  tapperDoubleTapShare: 0,
  syncShare: 0,
  idleBoostMult: 1,
  idleBoostAfterS: 10,
  tapperCostMult: 1,
  offline: OFFLINE,
});

const cache = new Map<string, Readonly<Mods>>();

/**
 * The modifiers a run plays by. Called on every press and every frame, so
 * each distinct set is built once and reused.
 */
export function modsOf(state: SaveState): Readonly<Mods> {
  const stabiliser = state.upgrades.stabiliser > 0;
  const sync = state.upgrades.sync > 0;
  const key = `${+stabiliser}${+sync}`;
  let mods = cache.get(key);
  if (!mods) {
    mods = Object.freeze({ ...BASE_MODS, stabiliser, syncShare: sync ? SYNC_SHARE : 0 });
    cache.set(key, mods);
  }
  return mods;
}
