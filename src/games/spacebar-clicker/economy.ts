/**
 * Spacebar Clicker — the economy.
 *
 * Pure functions over a SaveState. Spec §3:
 *
 *   EPP = (1 + Finger Strength) × 1.5^Spring Keys × combo × surge × milestone × isotope
 *
 * Double Tap is a per-press roll, applied by the caller with `doubleTapChance`
 * so the formula here stays deterministic and testable.
 *
 * Every rule a perk can bend is read from the run's modifiers (mods.ts), not
 * from the constants. Functions that need them take `mods = modsOf(state)`
 * last; the game never passes it, tests do.
 */

import {
  AUTO_TAPPERS,
  COMBO_TIERS,
  ISOTOPE_BONUS,
  MILESTONE_BONUS,
  PERK_EFFECT,
  PERKS,
  PRESS_UPGRADES,
  PRESTIGE_UNLOCK,
  REACTOR_STATES,
  REVEAL_FRACTION,
  type AutoTapperDef,
  type AutoTapperId,
  type ComboTierDef,
  type PerkDef,
  type PerkId,
  type PressUpgradeDef,
  type PressUpgradeId,
  type ReactorStateDef,
  type ShopItemId,
  type ShopTab,
} from './config';
import { modsOf } from './mods';
import type { PerkOffer, SaveState } from './save';

/** What is happening in play at the moment a gain is worked out. */
export interface PlayContext {
  /** The current combo count. */
  combo?: number;
  /** A surge is in overdrive. */
  surging?: boolean;
  /** Presses are inside a surge's afterglow. */
  afterglow?: boolean;
  /** Seconds since the last press. */
  idleS?: number;
}

const upgradeById = new Map(PRESS_UPGRADES.map((u) => [u.id, u]));
const tapperById = new Map(AUTO_TAPPERS.map((t) => [t.id, t]));
const perkById = new Map(PERKS.map((p) => [p.id, p]));

export function pressUpgrade(id: PressUpgradeId): PressUpgradeDef {
  return upgradeById.get(id)!;
}

export function autoTapper(id: AutoTapperId): AutoTapperDef {
  return tapperById.get(id)!;
}

export function perk(id: PerkId): PerkDef {
  return perkById.get(id)!;
}

/** Spec §6: base × scaling ^ owned, rounded to a whole number. */
export function scaledCost(baseCost: number, scale: number, owned: number): number {
  return Math.round(baseCost * Math.pow(scale, owned));
}

export function upgradeCost(state: SaveState, id: PressUpgradeId): number {
  const def = pressUpgrade(id);
  return scaledCost(def.baseCost, def.scale, state.upgrades[id]);
}

export function tapperCost(state: SaveState, id: AutoTapperId, mods = modsOf(state)): number {
  const def = autoTapper(id);
  return Math.round(scaledCost(def.baseCost, def.scale, state.tappers[id]) * mods.tapperCostMult);
}

/** The tier a combo sits in. Pass a run's `mods.tiers` when perks may have changed them. */
export function comboTier(
  combo: number,
  tiers: readonly ComboTierDef[] = COMBO_TIERS
): ComboTierDef {
  return tiers.find((t) => combo >= t.min) ?? tiers[tiers.length - 1]!;
}

/** The tier above the current combo, or null at the top. */
export function nextComboTier(
  combo: number,
  tiers: readonly ComboTierDef[] = COMBO_TIERS
): ComboTierDef | null {
  const ascending = [...tiers].reverse();
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

/** The combo the formulas see: none at all when a perk switches it off. */
function comboOf(ctx: PlayContext, mods: ReturnType<typeof modsOf>): number {
  return mods.comboOff ? 0 : (ctx.combo ?? 0);
}

/** Energy one press is worth before the Double Tap roll. */
export function energyPerPress(
  state: SaveState,
  ctx: PlayContext = {},
  mods = modsOf(state)
): number {
  const combo = comboOf(ctx, mods);
  const base = 1 + state.upgrades.finger * mods.fingerPerLevel;
  const spring = Math.pow(mods.springPerLevel, state.upgrades.spring);
  const tier = comboTier(combo, mods.tiers).multiplier;
  const momentum = 1 + Math.min(mods.momentumCap, mods.pressPerCombo * combo);
  const surge = ctx.surging ? mods.surge.multiplier : 1;
  const afterglow = ctx.afterglow ? mods.afterglowMult : 1;
  const press =
    base *
    spring *
    tier *
    momentum *
    mods.pressMult *
    surge *
    afterglow *
    milestoneBonus(state.runLifetime) *
    isotopeBonus(state.isotopes);
  // Feedback Loop: each press also pays a share of a second's income.
  const feedback =
    mods.pressPaysEps > 0 ? mods.pressPaysEps * energyPerSecond(state, ctx, mods) : 0;
  return press + feedback;
}

/** Probability a press counts twice: 5% per Double Tap level, capped at 50%. */
export function doubleTapChance(state: SaveState, mods = modsOf(state)): number {
  return Math.min(mods.doubleTapCap, 0.05 * state.upgrades.double + mods.doubleTapBonus);
}

/**
 * A press's luck, rolled once per press: x1, or x2 on a Double Tap. With
 * Chain Reaction a Double Tap rolls again at a share of the chance (never past
 * chainAgainMax), doubling each time, up to x8. The cap keeps the expected value finite: at a 75%
 * chance an uncapped chain would pay out without limit.
 */
export function luckyMultiplier(
  state: SaveState,
  random: () => number = Math.random,
  mods = modsOf(state)
): number {
  const chance = doubleTapChance(state, mods);
  if (random() >= chance) return 1;
  const again = Math.min(PERK_EFFECT.chainAgainMax, chance * mods.chainShare);
  let mult = 2;
  while (mult < PERK_EFFECT.chainMax && random() < again) mult *= 2;
  return mult;
}

/**
 * Auto-tapper output per second. Combo only matters here once
 * Synchronisation is owned, and then at half strength (spec §4, §6a).
 */
export function energyPerSecond(
  state: SaveState,
  ctx: PlayContext = {},
  mods = modsOf(state)
): number {
  let owned = 0;
  let raw = 0;
  for (const t of AUTO_TAPPERS) {
    owned += state.tappers[t.id];
    raw += t.eps * state.tappers[t.id] * mods.tapperMultById[t.id];
  }
  const comboBonus = comboTier(comboOf(ctx, mods), mods.tiers).multiplier - 1;
  const idle = (ctx.idleS ?? 0) >= mods.idleBoostAfterS ? mods.idleBoostMult : 1;
  const surge = ctx.surging && mods.surgeHitsTappers ? mods.surge.multiplier : 1;
  return (
    raw *
    (1 + mods.tapperPerOwned * owned) *
    (1 + mods.tapperPerState * reactorIndex(state.runLifetime)) *
    (1 + mods.tapperDoubleTapShare * doubleTapChance(state, mods)) *
    (1 + comboBonus * mods.syncShare) *
    mods.tapperMult *
    idle *
    surge *
    milestoneBonus(state.runLifetime) *
    isotopeBonus(state.isotopes)
  );
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
export function offlineAward(
  state: SaveState,
  awayS: number,
  mods = modsOf(state)
): OfflineAward | null {
  const owned = AUTO_TAPPERS.some((t) => state.tappers[t.id] > 0);
  if (!owned || awayS <= mods.offline.minAwayS) return null;
  const seconds = Math.min(awayS, mods.offline.capS);
  return { seconds, energy: energyPerSecond(state, {}, mods) * seconds * mods.offline.rate };
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

/** The owned auto-tapper with the most output each (Self-Replicator). */
export function bestTapper(state: SaveState): AutoTapperId | null {
  let best: AutoTapperId | null = null;
  for (const t of AUTO_TAPPERS) if (state.tappers[t.id] > 0) best = t.id;
  return best;
}

/**
 * Shop-tab notices (DESIGN.md, the Shop-Signal Exception). A tab has news
 * when it holds something the player has not looked at: an auto-tapper newly
 * revealed, or any item affordable at a price the player has not yet seen it
 * affordable at. The open tab is always "looked at". Remembering the level,
 * not a yes/no, means spending energy elsewhere and earning it back never
 * re-announces the same item at the same price.
 *
 * A perk offer is news when it drops, and again the first time it is
 * affordable, until its tab is looked at.
 */
interface ShopRow {
  id: ShopItemId;
  level: number;
  affordable: boolean;
}

function shopRows(state: SaveState, tab: ShopTab): ShopRow[] {
  if (tab === 'press') {
    return PRESS_UPGRADES.map((u) => ({
      id: u.id,
      level: state.upgrades[u.id],
      affordable: canBuyUpgrade(state, u.id),
    }));
  }
  return AUTO_TAPPERS.filter((t) => state.revealed.includes(t.id)).map((t) => ({
    id: t.id,
    level: state.tappers[t.id],
    affordable: canBuyTapper(state, t.id),
  }));
}

function isNews(state: SaveState, row: ShopRow): boolean {
  return row.affordable && state.announced[row.id] !== row.level;
}

/** The perk on offer in a tab, if any. */
export function offerOn(state: SaveState, tab: ShopTab): PerkOffer | undefined {
  return state.perks.offers.find((o) => perk(o.id).tab === tab);
}

function offerIsNews(state: SaveState, offer: PerkOffer | undefined): boolean {
  if (!offer) return false;
  return !offer.seen || (state.energy >= offer.price && !offer.seenAffordable);
}

export function shopTabHasNews(state: SaveState, tab: ShopTab): boolean {
  if (tab === 'auto' && state.revealed.some((id) => !state.seen.includes(id))) return true;
  if (offerIsNews(state, offerOn(state, tab))) return true;
  return shopRows(state, tab).some((row) => isNews(state, row));
}

/** Record everything on the tab as looked at. Returns true if anything changed. */
export function markShopTabSeen(state: SaveState, tab: ShopTab): boolean {
  let changed = false;
  if (tab === 'auto') {
    for (const id of state.revealed) {
      if (!state.seen.includes(id)) {
        state.seen.push(id);
        changed = true;
      }
    }
  }
  for (const row of shopRows(state, tab)) {
    if (isNews(state, row)) {
      state.announced[row.id] = row.level;
      changed = true;
    }
  }
  const offer = offerOn(state, tab);
  if (offer && offerIsNews(state, offer)) {
    offer.seen = true;
    if (state.energy >= offer.price) offer.seenAffordable = true;
    changed = true;
  }
  return changed;
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
