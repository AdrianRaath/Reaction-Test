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
 * the anchor: ~24 minutes for an optimal buyer, ~48 for a masher with no
 * combo, slower for a human who buys what looks fun. Tune base costs first,
 * scaling second (spec §12).
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
    baseCost: 15,
    scale: 1.8,
    max: 20,
  },
  {
    id: 'double',
    name: 'Double Tap',
    detail: '+5% chance a press counts twice, each level',
    baseCost: 300,
    scale: 2.5,
    max: 10,
  },
  {
    id: 'spring',
    name: 'Spring Keys',
    detail: 'Press value x1.5, each level',
    baseCost: 5000,
    scale: 6,
    max: 5,
  },
  {
    id: 'stabiliser',
    name: 'Stabiliser',
    detail: 'A broken combo drops by 10 instead of resetting',
    baseCost: 5000,
    scale: 1,
    max: 1,
  },
  {
    id: 'sync',
    name: 'Synchronisation',
    detail: 'Auto-tappers get half your combo multiplier',
    baseCost: 25000,
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
    baseCost: 75000,
    scale: 1.2,
  },
  {
    id: 'collider',
    name: 'Particle Collider',
    detail: 'Not technically a keyboard',
    eps: 200,
    baseCost: 150000,
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
