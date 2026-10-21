/**
 * Spacebar Clicker — the economy.
 *
 * Pure functions over a SaveState. Spec §3:
 *
 *   EPP = (1 + Finger Strength) × 1.5^Spring Keys × combo × surge × milestone × isotope
 *
 * Double Tap is a per-press roll, applied by the caller with `doubleTapChance`
 * so the formula here stays deterministic and testable.
 */

import {
  AUTO_TAPPERS,
  COMBO_TIERS,
  ISOTOPE_BONUS,
  MILESTONE_BONUS,
  OFFLINE,
  PRESS_UPGRADES,
  PRESTIGE_UNLOCK,
  REACTOR_STATES,
  REVEAL_FRACTION,
  SURGE,
  type AutoTapperDef,
  type AutoTapperId,
  type ComboTierDef,
  type PressUpgradeDef,
  type PressUpgradeId,
  type ReactorStateDef,
} from './config';
import type { SaveState } from './save';

const upgradeById = new Map(PRESS_UPGRADES.map((u) => [u.id, u]));
const tapperById = new Map(AUTO_TAPPERS.map((t) => [t.id, t]));

export function pressUpgrade(id: PressUpgradeId): PressUpgradeDef {
  return upgradeById.get(id)!;
}

export function autoTapper(id: AutoTapperId): AutoTapperDef {
  return tapperById.get(id)!;
}

/** Spec §6: base × scaling ^ owned, rounded to a whole number. */
export function scaledCost(baseCost: number, scale: number, owned: number): number {
  return Math.round(baseCost * Math.pow(scale, owned));
}

export function upgradeCost(state: SaveState, id: PressUpgradeId): number {
  const def = pressUpgrade(id);
  return scaledCost(def.baseCost, def.scale, state.upgrades[id]);
}

export function tapperCost(state: SaveState, id: AutoTapperId): number {
  const def = autoTapper(id);
  return scaledCost(def.baseCost, def.scale, state.tappers[id]);
}

export function comboTier(combo: number): ComboTierDef {
  return COMBO_TIERS.find((t) => combo >= t.min) ?? COMBO_TIERS[COMBO_TIERS.length - 1]!;
}

/** The tier above the current combo, or null at the top. */
export function nextComboTier(combo: number): ComboTierDef | null {
  const ascending = [...COMBO_TIERS].reverse();
  return ascending.find((t) => t.min > combo) ?? null;
}

/**
 * How far the run is through its current reactor state, 0..1. Linear between
 * thresholds, so with rising income the arc speeds up toward each state. 1 at
 * Supercritical, which has nothing above it.
 */
export function reactorProgress(runLifetime: number): number {
  const i = reactorIndex(runLifetime);
  const current = REACTOR_STATES[i]!;
  const next = REACTOR_STATES[i + 1];
  if (!next) return 1;
  const span = next.threshold - current.threshold;
  return Math.min(1, Math.max(0, (runLifetime - current.threshold) / span));
}

/** Index into REACTOR_STATES for a run's lifetime energy. */
export function reactorIndex(runLifetime: number): number {
  let index = 0;
  REACTOR_STATES.forEach((s, i) => {
    if (runLifetime >= s.threshold) index = i;
  });
  return index;
}

export function reactorState(runLifetime: number): ReactorStateDef {
  return REACTOR_STATES[reactorIndex(runLifetime)]!;
}

/** +5% per state past Dormant, additive (spec §8): up to +30%. */
export function milestoneBonus(runLifetime: number): number {
  return 1 + MILESTONE_BONUS * reactorIndex(runLifetime);
}

/** +10% per isotope, additive (spec §9). */
export function isotopeBonus(isotopes: number): number {
  return 1 + ISOTOPE_BONUS * isotopes;
}

/** Energy one press is worth before the Double Tap roll. */
export function energyPerPress(state: SaveState, comboMultiplier = 1, surging = false): number {
  const base = 1 + state.upgrades.finger;
  const spring = Math.pow(1.5, state.upgrades.spring);
  const surge = surging ? SURGE.multiplier : 1;
  return (
    base *
    spring *
    comboMultiplier *
    surge *
    milestoneBonus(state.runLifetime) *
    isotopeBonus(state.isotopes)
  );
}

/** Probability a press counts twice: 5% per Double Tap level, capped at 50%. */
export function doubleTapChance(state: SaveState): number {
  return Math.min(0.5, 0.05 * state.upgrades.double);
}

/**
 * Auto-tapper output per second. Combo only matters here once
 * Synchronisation is owned, and then at half strength (spec §4, §6a).
 */
export function energyPerSecond(state: SaveState, comboMultiplier = 1): number {
  const raw = AUTO_TAPPERS.reduce((sum, t) => sum + t.eps * state.tappers[t.id], 0);
  const sync = state.upgrades.sync > 0 ? 1 + (comboMultiplier - 1) * 0.5 : 1;
  return raw * sync * milestoneBonus(state.runLifetime) * isotopeBonus(state.isotopes);
}

/** Spec §9: floor(sqrt(run lifetime / 1M)); zero below the unlock. */
export function prestigeGain(runLifetime: number): number {
  if (runLifetime < PRESTIGE_UNLOCK) return 0;
  return Math.floor(Math.sqrt(runLifetime / PRESTIGE_UNLOCK));
}

export function prestigeUnlocked(state: SaveState): boolean {
  return state.runLifetime >= PRESTIGE_UNLOCK;
}

export interface OfflineAward {
  /** Seconds credited, after the cap. */
  seconds: number;
  energy: number;
}

/**
 * Spec §7: half EPS for the time away, capped at four hours, only with at
 * least one auto-tapper and more than a minute away. Null means nothing to
 * show.
 */
export function offlineAward(state: SaveState, awayS: number): OfflineAward | null {
  const owned = AUTO_TAPPERS.some((t) => state.tappers[t.id] > 0);
  if (!owned || awayS <= OFFLINE.minAwayS) return null;
  const seconds = Math.min(awayS, OFFLINE.capS);
  return { seconds, energy: energyPerSecond(state) * seconds * OFFLINE.rate };
}

/** Credit energy to the run. The one place both lifetime counters move. */
export function earn(state: SaveState, amount: number): void {
  state.energy += amount;
  state.runLifetime += amount;
  state.totalLifetime += amount;
}

export function canBuyUpgrade(state: SaveState, id: PressUpgradeId): boolean {
  const def = pressUpgrade(id);
  return state.upgrades[id] < def.max && state.energy >= upgradeCost(state, id);
}

export function canBuyTapper(state: SaveState, id: AutoTapperId): boolean {
  return state.energy >= tapperCost(state, id);
}

/** Buy one level. Returns false (and changes nothing) if it cannot be afforded. */
export function buyUpgrade(state: SaveState, id: PressUpgradeId): boolean {
  if (!canBuyUpgrade(state, id)) return false;
  state.energy -= upgradeCost(state, id);
  state.upgrades[id] += 1;
  return true;
}

export function buyTapper(state: SaveState, id: AutoTapperId): boolean {
  if (!canBuyTapper(state, id)) return false;
  state.energy -= tapperCost(state, id);
  state.tappers[id] += 1;
  return true;
}

/** Mark every revealed auto-tapper as looked at. Returns true if anything changed. */
export function markTappersSeen(state: SaveState): boolean {
  let changed = false;
  for (const id of state.revealed) {
    if (!state.seen.includes(id)) {
      state.seen.push(id);
      changed = true;
    }
  }
  return changed;
}

/** Revealed auto-tappers the player has not looked at yet. */
export function unseenTappers(state: SaveState): AutoTapperId[] {
  return state.revealed.filter((id) => !state.seen.includes(id));
}

/**
 * Spec §6: the next unrevealed auto-tapper stays hidden until the run has
 * earned half its base cost. Adds to `state.revealed` and returns the ids
 * revealed by this call so the UI can introduce them.
 */
export function updateReveals(state: SaveState): AutoTapperId[] {
  const added: AutoTapperId[] = [];
  for (const t of AUTO_TAPPERS) {
    if (state.revealed.includes(t.id)) continue;
    if (state.tappers[t.id] > 0 || state.runLifetime >= t.baseCost * REVEAL_FRACTION) {
      state.revealed.push(t.id);
      added.push(t.id);
    }
  }
  return added;
}
