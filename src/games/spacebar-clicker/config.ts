/**
 * Spacebar Clicker — the rulebook.
 *
 * Every number the game runs on lives here, and the long-form copy below the
 * game quotes these same tables. Change a cost here and the page's shop
 * table changes with it; there is no second copy to drift.
 *
 * The shop values are NOT the ones in SPACEBAR-CLICKER-DESIGN.md. A pacing
 * simulation (2026-10-21, greedy buyer at 5 presses/s with a realistic combo)
 * ran the spec's table about five times too fast: first prestige landed at
 * ten minutes against a 45–60 minute target. This table came out of a grid
 * search against the spec's own pacing targets, with first prestige held as
 * the anchor at ~24 minutes. Tune base costs first, scaling second (spec §12).
 *
 * That simulator lived outside the repo, and by the real rules its table ran
 * about twice as fast as it said: 14 minutes, not 24. Its replacement, sim.ts,
 * plays the real rules. On 2026-10-23 the press upgrades' base costs went up
 * four to five times and the auto-tappers' stayed put, which puts first
 * prestige back at about 24 minutes for a steady 5-a-second tapper who shops
 * like a person, and about 38 for a masher. Raising every price alike was
 * tried first and rejected: auto-tappers fell to a few percent of income for
 * the first half hour, because a press's combo, surge and Finger Strength
 * value don't get dearer, and the game stopped feeling idle. pacing.test.ts
 * holds the results in bands (SPACEBAR-CLICKER.md §4.12).
 *
 * Pure data, no DOM. Imported by the pure logic modules, their tests, the
 * page (to render the shop skeleton server-side) and the content.
 */

export type PressUpgradeId = 'finger' | 'double' | 'spring' | 'stabiliser' | 'sync';
export type AutoTapperId = 'assistant' | 'pneumatic' | 'arm' | 'quantum' | 'collider';
/** Anything the shop sells. Each one gets its own glyph (ShopIcon.astro). */
export type ShopItemId = PressUpgradeId | AutoTapperId;
/** The shop's two tabs. */
export type ShopTab = 'press' | 'auto';
export type PerkId =
  | 'metronome'
  | 'held-breath'
  | 'overtone'
  | 'momentum'
  | 'glass-rhythm'
  | 'finger-memory'
  | 'coiled-spring'
  | 'brute-force'
  | 'loaded-dice'
  | 'chain-reaction'
  | 'lightning-rod'
  | 'afterglow'
  | 'storm-front'
  | 'overtime'
  | 'assembly-line'
  | 'bulk-order'
  | 'critical-load'
  | 'ghost-presses'
  | 'full-sync'
  | 'surge-lines'
  | 'idle-hands'
  | 'night-shift'
  | 'feedback-loop'
  | 'self-replicator'
  | 'autopilot';
/** A perk's family sets its color (SPACEBAR-CLICKER.md §8.1). */
export type PerkFamily = 'rhythm' | 'press' | 'luck' | 'surge' | 'machines';
export type PerkRarity = 'common' | 'rare' | 'keystone';
/** How a perk's value reads: 0.4 as "40%", 2 as "x2", 10 as "10 s"... */
export type PerkUnit = 'percent' | 'times' | 'seconds' | 'hours' | 'plain';
export type ReactorStateId =
  'dormant' | 'warming' | 'stable' | 'charged' | 'unstable' | 'critical' | 'supercritical';
export type AchievementId =
  | 'first-press'
  | 'warmed-up'
  | 'thousand-taps'
  | 'ten-thousand-taps'
  | 'steady-hands'
  | 'resonance'
  | 'harmonic'
  | 'fast-fingers'
  | 'lightning'
  | 'staffed-up'
  | 'automated'
  | 'critical-mass'
  | 'fresh-start'
  | 'veteran';

export interface PressUpgradeDef {
  id: PressUpgradeId;
  name: string;
  /** One line, shown in the shop and the rulebook table. */
  detail: string;
  baseCost: number;
  /** Cost multiplier per level owned. 1 for one-off upgrades. */
  scale: number;
  max: number;
}

export interface AutoTapperDef {
  id: AutoTapperId;
  name: string;
  detail: string;
  /** Energy per second, each. */
  eps: number;
  baseCost: number;
  scale: number;
}

export interface ComboTierDef {
  /** Combo count that enters the tier. */
  min: number;
  multiplier: number;
  label: string;
}

export interface ReactorStateDef {
  id: ReactorStateId;
  name: string;
  /** Lifetime energy earned this run. */
  threshold: number;
}

/** The rhythm rules a run plays by (spec §4). Perks may bend a run's copy. */
export interface ComboRules {
  /** Fraction of the rolling mean interval a press may miss by. */
  tolerance: number;
  /** Intervals in the rolling mean. */
  window: number;
  /** An interval at or above this is never rhythmic. */
  maxIntervalMs: number;
  /** A pause longer than this breaks the combo. */
  graceMs: number;
  /** Presses after a break that count regardless, so a combo can start. */
  freeStarts: number;
  /** Consecutive off-rhythm presses that break the combo. */
  missesToBreak: number;
  /** Combo lost on a break with the Stabiliser owned. */
  stabiliserDrop: number;
  /**
   * A gap longer than this, but inside the grace, is a rest: it neither keeps
   * nor misses, and stays out of the rolling mean, so the beat picks up where
   * it left off. Infinity (no rests) unless a perk allows them.
   */
  restMs: number;
}

/** Surge timing and strength (spec §5). Perks may bend a run's copy. */
export interface SurgeRules {
  minGapS: number;
  maxGapS: number;
  /** Countdown before the surge. Zero means it strikes without warning. */
  warningS: number;
  durationS: number;
  multiplier: number;
  /** Seconds since the last press before play counts as idle. */
  idleAfterS: number;
}

/** Away progress (spec §7). Perks may bend a run's copy. */
export interface OfflineRules {
  capS: number;
  rate: number;
  minAwayS: number;
}

export interface PerkDef {
  id: PerkId;
  name: string;
  /** The shop tab it drops into. */
  tab: ShopTab;
  family: PerkFamily;
  rarity: PerkRarity;
  /** The perk's number at levels I, II and III. */
  values: readonly [number, number, number];
  /** What it does, with {v} standing for the level's value. */
  detail: string;
  unit: PerkUnit;
}

export interface AchievementDef {
  id: AchievementId;
  name: string;
  detail: string;
}

/** Spec §6a. Effects are applied in economy.ts. */
export const PRESS_UPGRADES: readonly PressUpgradeDef[] = [
  {
    id: 'finger',
    name: 'Finger Strength',
    detail: '+1 energy per press, each level',
    baseCost: 75,
    scale: 1.8,
    max: 20,
  },
  {
    id: 'double',
    name: 'Double Tap',
    detail: '+5% chance a press counts twice, each level',
    baseCost: 1500,
    scale: 2.5,
    max: 10,
  },
  {
    id: 'spring',
    name: 'Spring Keys',
    detail: 'Press value x1.5, each level',
    baseCost: 25_000,
    scale: 6,
    max: 5,
  },
  {
    id: 'stabiliser',
    name: 'Stabiliser',
    detail: 'A broken combo drops by 10 instead of resetting',
    baseCost: 20_000,
    scale: 1,
    max: 1,
  },
  {
    id: 'sync',
    name: 'Synchronisation',
    detail: 'Auto-tappers get half your combo multiplier',
    baseCost: 100_000,
    scale: 1,
    max: 1,
  },
];

/** Spec §6b. Costs are three times the spec's, scaling 1.2 (see header). */
export const AUTO_TAPPERS: readonly AutoTapperDef[] = [
  {
    id: 'assistant',
    name: 'Lab Assistant',
    detail: 'An intern tapping the key',
    eps: 0.5,
    baseCost: 75,
    scale: 1.2,
  },
  {
    id: 'pneumatic',
    name: 'Pneumatic Key',
    detail: 'A piston on a timer',
    eps: 3,
    baseCost: 750,
    scale: 1.2,
  },
  {
    id: 'arm',
    name: 'Robot Arm',
    detail: 'Industrial precision',
    eps: 15,
    baseCost: 7500,
    scale: 1.2,
  },
  {
    id: 'quantum',
    name: 'Quantum Keyboard',
    detail: 'Presses in several states at once',
    eps: 80,
    baseCost: 75_000,
    scale: 1.2,
  },
  {
    id: 'collider',
    name: 'Particle Collider',
    detail: 'Not technically a keyboard',
    eps: 200,
    baseCost: 150_000,
    scale: 1.2,
  },
];

/** Spec §4, best tier first so a lookup can take the first match. */
export const COMBO_TIERS: readonly ComboTierDef[] = [
  { min: 100, multiplier: 3, label: 'Harmonic' },
  { min: 50, multiplier: 2.5, label: 'Resonance' },
  { min: 25, multiplier: 2, label: 'Locked in' },
  { min: 10, multiplier: 1.5, label: 'Steady' },
  { min: 0, multiplier: 1, label: '' },
];

/**
 * Spec §4 rhythm rules. The 25% tolerance was checked by simulation: a tapper
 * whose intervals vary by 10% (steady) never breaks on rhythm, one at 20%
 * (sloppy) breaks about three times a minute, and a 20% tolerance would have
 * punished ordinary players. Pauses, not jitter, are what end most combos.
 */
export const COMBO: Readonly<ComboRules> = {
  tolerance: 0.25,
  window: 5,
  maxIntervalMs: 600,
  graceMs: 800,
  freeStarts: 5,
  missesToBreak: 3,
  stabiliserDrop: 10,
  restMs: Infinity,
};

/** Spec §5. */
export const SURGE: Readonly<SurgeRules> = {
  minGapS: 90,
  maxGapS: 180,
  warningS: 3,
  durationS: 5,
  multiplier: 10,
  idleAfterS: 60,
};

/** Spec §8. Each state past Dormant adds MILESTONE_BONUS to every gain. */
export const REACTOR_STATES: readonly ReactorStateDef[] = [
  { id: 'dormant', name: 'Dormant', threshold: 0 },
  { id: 'warming', name: 'Warming', threshold: 500 },
  { id: 'stable', name: 'Stable', threshold: 10_000 },
  { id: 'charged', name: 'Charged', threshold: 100_000 },
  { id: 'unstable', name: 'Unstable', threshold: 1_000_000 },
  { id: 'critical', name: 'Critical', threshold: 10_000_000 },
  { id: 'supercritical', name: 'Supercritical', threshold: 100_000_000 },
];
export const MILESTONE_BONUS = 0.05;

/** Spec §6a: Synchronisation gives auto-tappers this share of the combo bonus. */
export const SYNC_SHARE = 0.5;

/** Spec §9. */
export const PRESTIGE_UNLOCK = 1_000_000;
export const ISOTOPE_BONUS = 0.1;

/** Spec §7. */
export const OFFLINE: Readonly<OfflineRules> = {
  capS: 4 * 3600,
  rate: 0.5,
  minAwayS: 60,
};

/** Spec §2. Presses closer together than this are discarded. */
export const PRESS_CAP_PER_S = 30;
export const MIN_PRESS_GAP_MS = 1000 / PRESS_CAP_PER_S;

/** Spec §6: the next unrevealed auto-tapper appears at this share of its cost. */
export const REVEAL_FRACTION = 0.5;

/** Spec §13. */
export const SAVE_INTERVAL_MS = 5000;
export const SAVE_VERSION = 1;

/**
 * Perks (SPACEBAR-CLICKER.md §8.1), phase 1. Random drops into the shop that
 * last the run. Values are starting points; the pacing simulation tunes them.
 * The effects are applied in mods.ts, the drops and buying live in perks.ts.
 */
export const PERKS: readonly PerkDef[] = [
  // --- Upgrades tab --------------------------------------------------------
  {
    id: 'metronome',
    name: 'Metronome',
    tab: 'press',
    family: 'rhythm',
    rarity: 'common',
    values: [0.4, 0.55, 0.7],
    detail: 'Rhythm tolerance widens from 25% to {v}',
    unit: 'percent',
  },
  {
    id: 'held-breath',
    name: 'Held Breath',
    tab: 'press',
    family: 'rhythm',
    rarity: 'common',
    values: [2.5, 4, 6],
    detail: 'A pause of up to {v} keeps the combo, up from 0.8 s',
    unit: 'seconds',
  },
  {
    id: 'overtone',
    name: 'Overtone',
    tab: 'press',
    family: 'rhythm',
    rarity: 'rare',
    values: [3.5, 3.75, 4],
    detail: 'A new tier above Harmonic: 200 combo for {v}',
    unit: 'times',
  },
  {
    id: 'momentum',
    name: 'Momentum',
    tab: 'press',
    family: 'rhythm',
    rarity: 'rare',
    values: [0.25, 0.4, 0.6],
    detail: '+0.25% press value per point of combo, up to +{v}',
    unit: 'percent',
  },
  {
    id: 'glass-rhythm',
    name: 'Glass Rhythm',
    tab: 'press',
    family: 'rhythm',
    rarity: 'keystone',
    values: [2, 2.5, 3],
    detail:
      'Combo multipliers {v}, but two off-beat presses in a row break the combo and the Stabiliser stops working',
    unit: 'times',
  },
  {
    id: 'finger-memory',
    name: 'Finger Memory',
    tab: 'press',
    family: 'press',
    rarity: 'common',
    values: [0.1, 0.2, 0.3],
    detail: 'Finger Strength gives {v} more energy a level',
    unit: 'percent',
  },
  {
    id: 'coiled-spring',
    name: 'Coiled Spring',
    tab: 'press',
    family: 'press',
    rarity: 'rare',
    values: [1.7, 1.8, 1.9],
    detail: 'Spring Keys give {v} a level instead of x1.5',
    unit: 'times',
  },
  {
    id: 'brute-force',
    name: 'Brute Force',
    tab: 'press',
    family: 'press',
    rarity: 'keystone',
    values: [1.8, 2, 2.2],
    detail: 'No combo at all, but press value {v}',
    unit: 'times',
  },
  {
    id: 'loaded-dice',
    name: 'Loaded Dice',
    tab: 'press',
    family: 'luck',
    rarity: 'common',
    values: [0.15, 0.25, 0.35],
    detail: 'Double Tap +{v}, and its cap rises from 50% to 75%',
    unit: 'percent',
  },
  {
    id: 'chain-reaction',
    name: 'Chain Reaction',
    tab: 'press',
    family: 'luck',
    rarity: 'rare',
    values: [1.5, 2, 3],
    detail: 'A Double Tap rolls again at {v} of your Double Tap chance (at most 60%), up to x8',
    unit: 'percent',
  },
  {
    id: 'lightning-rod',
    name: 'Lightning Rod',
    tab: 'press',
    family: 'surge',
    rarity: 'rare',
    values: [1.75, 2, 2.5],
    detail: 'Surges come {v} times as often',
    unit: 'plain',
  },
  {
    id: 'afterglow',
    name: 'Afterglow',
    tab: 'press',
    family: 'surge',
    rarity: 'common',
    values: [10, 15, 20],
    detail: 'Presses keep x3 for {v} after a surge',
    unit: 'seconds',
  },
  {
    id: 'storm-front',
    name: 'Storm Front',
    tab: 'press',
    family: 'surge',
    rarity: 'keystone',
    values: [20, 25, 32],
    detail: 'Surges hit {v} but strike with no warning',
    unit: 'times',
  },

  // --- Auto-tappers tab -----------------------------------------------------
  {
    id: 'overtime',
    name: 'Overtime',
    tab: 'auto',
    family: 'machines',
    rarity: 'common',
    values: [1.75, 2.5, 3.25],
    detail: 'Lab Assistants and Pneumatic Keys produce {v}',
    unit: 'times',
  },
  {
    id: 'assembly-line',
    name: 'Assembly Line',
    tab: 'auto',
    family: 'machines',
    rarity: 'common',
    values: [0.01, 0.015, 0.02],
    detail: '+{v} auto-tapper output per auto-tapper owned',
    unit: 'percent',
  },
  {
    id: 'bulk-order',
    name: 'Bulk Order',
    tab: 'auto',
    family: 'machines',
    rarity: 'common',
    values: [0.2, 0.3, 0.4],
    detail: 'Auto-tappers cost {v} less',
    unit: 'percent',
  },
  {
    id: 'critical-load',
    name: 'Critical Load',
    tab: 'auto',
    family: 'machines',
    rarity: 'common',
    values: [0.1, 0.15, 0.2],
    detail: '+{v} auto-tapper output per reactor state reached',
    unit: 'percent',
  },
  {
    id: 'ghost-presses',
    name: 'Ghost Presses',
    tab: 'auto',
    family: 'luck',
    rarity: 'common',
    values: [1, 1.5, 2],
    detail: 'Auto-tappers add {v} of your Double Tap chance to their output',
    unit: 'percent',
  },
  {
    id: 'full-sync',
    name: 'Full Sync',
    tab: 'auto',
    family: 'rhythm',
    rarity: 'rare',
    values: [0.75, 0.9, 1.05],
    detail: 'Auto-tappers get {v} of your combo bonus, no Synchronisation needed',
    unit: 'percent',
  },
  {
    id: 'surge-lines',
    name: 'Surge Lines',
    tab: 'auto',
    family: 'surge',
    rarity: 'rare',
    values: [5, 7, 9],
    detail: 'Surges multiply auto-tappers too, and last {v}',
    unit: 'seconds',
  },
  {
    id: 'idle-hands',
    name: 'Idle Hands',
    tab: 'auto',
    family: 'machines',
    rarity: 'rare',
    values: [1.4, 1.7, 2],
    detail: 'Auto-tappers {v} after 10 s without a press',
    unit: 'times',
  },
  {
    id: 'night-shift',
    name: 'Night Shift',
    tab: 'auto',
    family: 'machines',
    rarity: 'rare',
    values: [8, 12, 24],
    detail: 'Away progress pays 100% instead of 50%, capped at {v} instead of 4 h',
    unit: 'hours',
  },
  {
    id: 'feedback-loop',
    name: 'Feedback Loop',
    tab: 'auto',
    family: 'machines',
    rarity: 'rare',
    values: [0.08, 0.12, 0.16],
    detail: 'Each press also pays {v} of your per-second income',
    unit: 'percent',
  },
  {
    id: 'self-replicator',
    name: 'Self-Replicator',
    tab: 'auto',
    family: 'machines',
    rarity: 'rare',
    values: [180, 130, 90],
    detail: 'A free copy of your best auto-tapper every {v}',
    unit: 'seconds',
  },
  {
    id: 'autopilot',
    name: 'Autopilot',
    tab: 'auto',
    family: 'machines',
    rarity: 'keystone',
    values: [1.7, 1.95, 2.2],
    detail: 'Presses earn half, but auto-tappers {v}',
    unit: 'times',
  },
];

/** Rarity and family in words, so a perk's hue never stands alone. The game and the page share them. */
export const PERK_RARITY_NAMES: Readonly<Record<PerkRarity, string>> = {
  common: 'Common',
  rare: 'Rare',
  keystone: 'Keystone',
};

export const PERK_FAMILY_NAMES: Readonly<Record<PerkFamily, string>> = {
  rhythm: 'Rhythm',
  press: 'Press power',
  luck: 'Luck',
  surge: 'Surge',
  machines: 'Machines',
};

/** Fixed parts of some perks' effects, quoted in their `detail`. */
export const PERK_EFFECT = {
  /** Loaded Dice's raised Double Tap cap. */
  loadedDiceCap: 0.75,
  /** Chain Reaction's highest multiplier: x2, x4, x8. */
  chainMax: 8,
  /** Chain Reaction's chance to roll again never passes this. */
  chainAgainMax: 0.6,
  /** Glass Rhythm breaks the combo on this many off-beat presses in a row. */
  glassMissesToBreak: 2,
  /** Momentum's bonus per point of combo, up to the level's cap. */
  momentumPerPoint: 0.0025,
  /** Afterglow's press multiplier. */
  afterglowMult: 3,
  /** Idle Hands' seconds without a press. */
  idleAfterS: 10,
  /** Night Shift's away rate. */
  nightShiftRate: 1,
  /** Overtone's tier. */
  overtoneMin: 200,
} as const;

/** Slots, levels and upgrade pricing (SPACEBAR-CLICKER.md §8.1.2). */
export const PERK_SLOTS = 5;
export const PERK_MAX_LEVEL = 3;
/** An upgrade costs this many times more for each level already held. */
export const PERK_UPGRADE_SCALE = 1.5;

/**
 * Drops, prices and windows (SPACEBAR-CLICKER.md §8.1.2). Drops are meant to
 * feel like rune drops in Diablo II: random, so they can't be timed, and rare
 * enough that a high tier is an event. Each gap between drops is drawn fresh
 * from an exponential distribution over active play, so a drop can come 20
 * seconds after the last or eight minutes after it. Surges are the boss
 * fights: each ends with a chance of a bonus drop, weighted to the rarer
 * tiers. Simulated: about 7 drops in a 30-minute run, keystones in about a
 * third of runs.
 *
 * Prices and windows are in seconds of the run's income at the moment a perk
 * drops, so they mean the same early and late.
 */
export const PERK_DROPS = {
  /** Average seconds of active play between drops, before the ceiling. */
  meanGapS: 360,
  /** The hidden ceiling: never longer than this without a drop. */
  maxGapS: 600,
  /** A player's very first run: its first drop comes at a random moment in this range, and is a common. */
  firstEverS: [60, 180] as readonly [number, number],
  /** Chance a surge ends with a bonus drop. */
  surgeChance: 1 / 8,
  /** Tier odds for a drop, and for a surge's bonus drop. */
  odds: { common: 0.65, rare: 0.3, keystone: 0.05 } as Readonly<Record<PerkRarity, number>>,
  surgeOdds: { common: 0.45, rare: 0.45, keystone: 0.1 } as Readonly<Record<PerkRarity, number>>,
  /** Income below this counts as this, so prices and windows never collapse to zero. */
  minIncome: 1,
  priceS: { common: 15, rare: 30, keystone: 60 } as Readonly<Record<PerkRarity, number>>,
  windowS: { common: 60, rare: 90, keystone: 150 } as Readonly<Record<PerkRarity, number>>,
} as const;

/** Spec §10. Cosmetic; the checks live in achievements.ts. */
export const ACHIEVEMENTS: readonly AchievementDef[] = [
  { id: 'first-press', name: 'First Press', detail: 'Press the spacebar once' },
  { id: 'warmed-up', name: 'Warmed Up', detail: '100 presses' },
  { id: 'thousand-taps', name: 'Thousand Taps', detail: '1,000 presses' },
  { id: 'ten-thousand-taps', name: 'Ten Thousand Taps', detail: '10,000 presses' },
  { id: 'steady-hands', name: 'Steady Hands', detail: 'Reach a 25 combo' },
  { id: 'resonance', name: 'Resonance', detail: 'Reach a 50 combo' },
  { id: 'harmonic', name: 'Harmonic', detail: 'Reach a 100 combo' },
  { id: 'fast-fingers', name: 'Fast Fingers', detail: '8 or more presses per second in a surge' },
  { id: 'lightning', name: 'Lightning', detail: '12 or more presses per second in a surge' },
  { id: 'staffed-up', name: 'Staffed Up', detail: 'Own 10 Lab Assistants' },
  { id: 'automated', name: 'Automated', detail: 'Own at least one of every auto-tapper' },
  { id: 'critical-mass', name: 'Critical Mass', detail: 'Reach the Critical reactor state' },
  { id: 'fresh-start', name: 'Fresh Start', detail: 'Reset the experiment once' },
  { id: 'veteran', name: 'Veteran', detail: 'Reset the experiment five times' },
];
