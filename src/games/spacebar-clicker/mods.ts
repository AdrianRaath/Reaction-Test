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
 * in the economy. Then each owned perk applies its effect at its level, and
 * last the isotope track's rungs in force (track.ts), so a rung that adds to a
 * rule adds to whatever a perk made of it.
 *
 * Economy functions take `mods = modsOf(state)` as an optional last argument:
 * the game never passes it, tests pass it to exercise one field directly.
 */

import {
  AUTO_TAPPERS,
  COMBO,
  COMBO_TIERS,
  ISOTOPE_BONUS,
  OFFLINE,
  PERK_DROPS,
  PERK_EFFECT,
  PERK_SLOTS,
  PERKS,
  SURGE,
  SYNC_SHARE,
  TRACK_EFFECT,
  type AutoTapperId,
  type ComboRules,
  type ComboTierDef,
  type OfflineRules,
  type PerkId,
  type PerkRarity,
  type RungId,
  type SurgeRules,
} from './config';
import type { SaveState } from './save';
import { activeRungs } from './track';

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
  /** The most that bonus can add: 0.25 is +25%. */
  momentumCap: number;
  /** Added to the Double Tap chance before the cap. */
  doubleTapBonus: number;
  /** Highest the Double Tap chance can go. */
  doubleTapCap: number;
  /** Share of the Double Tap chance a lucky press rolls again at; 0 never. */
  chainShare: number;
  /** Seconds after a surge that presses keep `afterglowMult`. */
  afterglowS: number;
  afterglowMult: number;
  /** Share of per-second income each press also pays. */
  pressPaysEps: number;

  // --- Combo -------------------------------------------------------------
  combo: Readonly<ComboRules>;
  /** Best tier first, ending in the zero tier, like COMBO_TIERS. */
  tiers: readonly ComboTierDef[];
  /** A break drops the combo by `combo.stabiliserDrop` instead of to zero. */
  stabiliser: boolean;
  /** The combo counts for nothing: every formula sees a combo of zero. */
  comboOff: boolean;

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
  /** Seconds between free copies of the best auto-tapper owned; 0 never. */
  replicateEveryS: number;

  // --- Away --------------------------------------------------------------
  offline: Readonly<OfflineRules>;

  // --- Perk rules the isotope track bends ----------------------------------
  /** Perks a run can hold. */
  perkSlots: number;
  /** Keystones a run can hold. */
  keystoneSlots: number;
  /** The level a perk not held drops at. */
  freshLevel: number;
  /** Tier odds for an ordinary drop. A surge's bonus drop keeps its own. */
  dropOdds: Readonly<Record<PerkRarity, number>>;
  /** Multiplier on how long an offer stays. */
  offerWindowMult: number;
  /** Price cut on a perk held before, in any run. */
  familiarDiscount: number;
  /** Offers a run can swap for a fresh drop. */
  rerolls: number;

  // --- Isotopes ------------------------------------------------------------
  /** What each isotope adds to every gain. */
  isotopeRate: number;
}

const ONES = Object.fromEntries(AUTO_TAPPERS.map((t) => [t.id, 1])) as Record<AutoTapperId, number>;

/** The game with nothing bought and no perks. */
export const BASE_MODS: Readonly<Mods> = Object.freeze({
  fingerPerLevel: 1,
  springPerLevel: 1.5,
  pressMult: 1,
  pressPerCombo: 0,
  momentumCap: Infinity,
  doubleTapBonus: 0,
  doubleTapCap: 0.5,
  chainShare: 0,
  afterglowS: 0,
  afterglowMult: 1,
  pressPaysEps: 0,
  combo: COMBO,
  tiers: COMBO_TIERS,
  stabiliser: false,
  comboOff: false,
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
  replicateEveryS: 0,
  offline: OFFLINE,
  perkSlots: PERK_SLOTS,
  keystoneSlots: 1,
  freshLevel: 1,
  dropOdds: PERK_DROPS.odds,
  offerWindowMult: 1,
  familiarDiscount: 0,
  rerolls: 0,
  isotopeRate: ISOTOPE_BONUS,
});

/** Mods while perks are applied: the nested rule sets are this run's own copies. */
type Draft = Omit<Mods, 'combo' | 'surge' | 'offline' | 'tapperMultById'> & {
  combo: ComboRules;
  surge: SurgeRules;
  offline: OfflineRules;
  tapperMultById: Record<AutoTapperId, number>;
};

/**
 * What each perk does at its level's value (config.ts, PERKS). Applied in
 * PERKS order, so Overtone adds its tier before Glass Rhythm scales them all.
 */
const EFFECTS: Record<PerkId, (m: Draft, v: number) => void> = {
  metronome: (m, v) => {
    m.combo.tolerance = v;
  },
  'held-breath': (m, v) => {
    m.combo.graceMs = v * 1000;
    m.combo.restMs = m.combo.maxIntervalMs;
  },
  overtone: (m, v) => {
    m.tiers = [{ min: PERK_EFFECT.overtoneMin, multiplier: v, label: 'Overtone' }, ...m.tiers];
  },
  momentum: (m, v) => {
    m.pressPerCombo = PERK_EFFECT.momentumPerPoint;
    m.momentumCap = v;
  },
  'glass-rhythm': (m, v) => {
    m.tiers = m.tiers.map((t) => (t.min > 0 ? { ...t, multiplier: t.multiplier * v } : t));
    m.combo.missesToBreak = PERK_EFFECT.glassMissesToBreak;
    m.stabiliser = false;
  },
  'finger-memory': (m, v) => {
    m.fingerPerLevel = 1 + v;
  },
  'coiled-spring': (m, v) => {
    m.springPerLevel = v;
  },
  'brute-force': (m, v) => {
    m.comboOff = true;
    m.pressMult *= v;
  },
  'loaded-dice': (m, v) => {
    m.doubleTapBonus = v;
    m.doubleTapCap = PERK_EFFECT.loadedDiceCap;
  },
  'chain-reaction': (m, v) => {
    m.chainShare = v;
  },
  'lightning-rod': (m, v) => {
    m.surge.minGapS /= v;
    m.surge.maxGapS /= v;
  },
  afterglow: (m, v) => {
    m.afterglowS = v;
    m.afterglowMult = PERK_EFFECT.afterglowMult;
  },
  'storm-front': (m, v) => {
    m.surge.multiplier = v;
    m.surge.warningS = 0;
  },
  overtime: (m, v) => {
    m.tapperMultById.assistant = v;
    m.tapperMultById.pneumatic = v;
  },
  'assembly-line': (m, v) => {
    m.tapperPerOwned = v;
  },
  'bulk-order': (m, v) => {
    m.tapperCostMult = 1 - v;
  },
  'critical-load': (m, v) => {
    m.tapperPerState = v;
  },
  'ghost-presses': (m, v) => {
    m.tapperDoubleTapShare = v;
  },
  'full-sync': (m, v) => {
    m.syncShare = Math.max(m.syncShare, v);
  },
  'surge-lines': (m, v) => {
    m.surgeHitsTappers = true;
    m.surge.durationS = v;
  },
  'idle-hands': (m, v) => {
    m.idleBoostMult = v;
    m.idleBoostAfterS = PERK_EFFECT.idleAfterS;
  },
  'night-shift': (m, v) => {
    m.offline.rate = PERK_EFFECT.nightShiftRate;
    m.offline.capS = v * 3600;
  },
  'feedback-loop': (m, v) => {
    m.pressPaysEps = v;
  },
  'self-replicator': (m, v) => {
    m.replicateEveryS = v;
  },
  autopilot: (m, v) => {
    m.pressMult *= 0.5;
    m.tapperMult *= v;
  },
};

/**
 * What each rung of the isotope track does (config.ts, ISOTOPE_TRACK). Applied
 * after the perks, in track order, so Rich Find's odds replace Lucky Find's.
 * Head starts and kept perks happen at the reset instead (save.ts).
 */
const RUNGS: Partial<Record<RungId, (m: Draft) => void>> = {
  capacitor: (m) => {
    m.surge.durationS += TRACK_EFFECT.capacitorS;
  },
  'sixth-slot': (m) => {
    m.perkSlots = TRACK_EFFECT.sixthSlotSlots;
  },
  prodigy: (m) => {
    m.freshLevel = TRACK_EFFECT.prodigyLevel;
  },
  'night-lab': (m) => {
    // Night Shift pays more, and wins where it does.
    m.offline.rate = Math.max(m.offline.rate, TRACK_EFFECT.nightLabRate);
    m.offline.capS = Math.max(m.offline.capS, TRACK_EFFECT.nightLabCapS);
  },
  'lucky-find': (m) => {
    m.dropOdds = TRACK_EFFECT.luckyFindOdds;
  },
  reroll: (m) => {
    m.rerolls = TRACK_EFFECT.rerollsPerRun;
  },
  patience: (m) => {
    m.offerWindowMult = TRACK_EFFECT.patienceWindowMult;
  },
  familiar: (m) => {
    m.familiarDiscount = TRACK_EFFECT.familiarDiscount;
  },
  'rich-find': (m) => {
    m.dropOdds = TRACK_EFFECT.richFindOdds;
  },
  'perfect-pitch': (m) => {
    // Metronome widens it further, and wins where it does.
    m.combo.tolerance = Math.max(m.combo.tolerance, TRACK_EFFECT.perfectPitchTolerance);
  },
  'twin-keystones': (m) => {
    m.keystoneSlots = TRACK_EFFECT.twinKeystoneSlots;
  },
  enrichment: (m) => {
    m.isotopeRate = TRACK_EFFECT.enrichmentRate;
  },
};

function build(state: SaveState, rungs: readonly RungId[]): Readonly<Mods> {
  const m: Draft = {
    ...BASE_MODS,
    combo: { ...BASE_MODS.combo },
    surge: { ...BASE_MODS.surge },
    offline: { ...BASE_MODS.offline },
    tapperMultById: { ...BASE_MODS.tapperMultById },
    stabiliser: state.upgrades.stabiliser > 0,
    syncShare: state.upgrades.sync > 0 ? SYNC_SHARE : 0,
  };
  for (const def of PERKS) {
    const level = state.perks.owned.find((o) => o.id === def.id)?.level ?? 0;
    if (level > 0) EFFECTS[def.id](m, def.values[level - 1]!);
  }
  for (const id of rungs) RUNGS[id]?.(m);
  return Object.freeze(m);
}

const cache = new Map<string, Readonly<Mods>>();

/**
 * The modifiers a run plays by. Called on every press and every frame, so
 * each distinct set is built once and reused.
 */
export function modsOf(state: SaveState): Readonly<Mods> {
  const perks = state.perks.owned.map((o) => `${o.id}:${o.level}`).join(',');
  const rungs = activeRungs(state.isotopes, state.forks);
  const key = `${state.upgrades.stabiliser > 0 ? 1 : 0}${state.upgrades.sync > 0 ? 1 : 0}|${perks}|${rungs.join(',')}`;
  let mods = cache.get(key);
  if (!mods) {
    mods = build(state, rungs);
    cache.set(key, mods);
  }
  return mods;
}
