import { describe, expect, it } from 'vitest';

import { checkAchievements } from './achievements';
import { ComboTracker } from './combo';
import {
  AUTO_TAPPERS,
  COMBO,
  COMBO_TIERS,
  OFFLINE,
  PRESS_UPGRADES,
  REACTOR_STATES,
  SURGE,
  type ComboTierDef,
} from './config';
import {
  buyTapper,
  buyUpgrade,
  comboTier,
  doubleTapChance,
  earn,
  energyPerPress,
  energyPerSecond,
  isotopeProgress,
  markShopTabSeen,
  milestoneBonus,
  nextComboTier,
  nextIsotopeAt,
  offlineAward,
  prestigeGain,
  reactorProgress,
  reactorState,
  shopTabHasNews,
  tapperCost,
  updateReveals,
  upgradeCost,
} from './economy';
import { formatDuration, formatEnergy, formatMultiplier, formatRate } from './format';
import { IncomeMeter } from './income';
import { BASE_MODS, modsOf, type Mods } from './mods';
import { newSeed, nextRandom } from './rng';
import { defaultSave, parseSave, prestigeReset, serializeSave } from './save';

const NOW = 1_700_000_000_000;

// ---------------------------------------------------------------------------
// Config sanity — the tables the copy quotes must stay well-formed.
// ---------------------------------------------------------------------------

describe('config', () => {
  it('lists auto-tappers in ascending cost and output', () => {
    for (let i = 1; i < AUTO_TAPPERS.length; i++) {
      expect(AUTO_TAPPERS[i]!.baseCost).toBeGreaterThan(AUTO_TAPPERS[i - 1]!.baseCost);
      expect(AUTO_TAPPERS[i]!.eps).toBeGreaterThan(AUTO_TAPPERS[i - 1]!.eps);
    }
  });

  it('makes the first upgrade affordable within 15 seconds of steady tapping (spec §12)', () => {
    // Five presses a second on a steady beat, the combo building from zero.
    const s = defaultSave(NOW);
    let presses = 0;
    let energy = 0;
    while (energy < PRESS_UPGRADES[0]!.baseCost) energy += energyPerPress(s, { combo: presses++ });
    expect(presses).toBeLessThanOrEqual(15 * 5);
  });

  it('orders reactor states by rising threshold from zero', () => {
    expect(REACTOR_STATES[0]!.threshold).toBe(0);
    for (let i = 1; i < REACTOR_STATES.length; i++) {
      expect(REACTOR_STATES[i]!.threshold).toBeGreaterThan(REACTOR_STATES[i - 1]!.threshold);
    }
  });
});

// ---------------------------------------------------------------------------
// Economy
// ---------------------------------------------------------------------------

describe('costs', () => {
  it('scales by the multiplier per level owned and rounds to whole energy', () => {
    const s = defaultSave(NOW);
    expect(upgradeCost(s, 'finger')).toBe(75);
    s.upgrades.finger = 1;
    expect(upgradeCost(s, 'finger')).toBe(135); // 75 × 1.8
    s.upgrades.finger = 3;
    expect(upgradeCost(s, 'finger')).toBe(437); // 75 × 5.832 = 437.4
  });

  it('keeps one-off upgrades at a fixed price', () => {
    const s = defaultSave(NOW);
    expect(upgradeCost(s, 'stabiliser')).toBe(20_000);
  });

  it('prices the Nth auto-tapper from the count owned', () => {
    const s = defaultSave(NOW);
    s.tappers.assistant = 3;
    expect(tapperCost(s, 'assistant')).toBe(Math.round(75 * 1.2 ** 3));
  });
});

describe('energy per press', () => {
  it('is 1 on a fresh save', () => {
    expect(energyPerPress(defaultSave(NOW))).toBe(1);
  });

  it('multiplies every term of the spec formula', () => {
    const s = defaultSave(NOW);
    s.upgrades.finger = 4; // base 5
    s.upgrades.spring = 2; // × 2.25
    s.runLifetime = 10_000; // Stable: 2 states past Dormant → × 1.10
    s.isotopes = 3; // × 1.3
    const expected = 5 * 2.25 * 2 * 10 * 1.1 * 1.3; // combo x2, surging
    expect(energyPerPress(s, { combo: 25, surging: true })).toBeCloseTo(expected, 6);
  });

  it('caps the Double Tap chance at 50%', () => {
    const s = defaultSave(NOW);
    s.upgrades.double = 10;
    expect(doubleTapChance(s)).toBe(0.5);
    s.upgrades.double = 3;
    expect(doubleTapChance(s)).toBeCloseTo(0.15);
  });
});

describe('energy per second', () => {
  it('sums auto-tapper output and ignores combo without Synchronisation', () => {
    const s = defaultSave(NOW);
    s.tappers.assistant = 4; // 2
    s.tappers.pneumatic = 1; // 3
    expect(energyPerSecond(s, { combo: 100 })).toBe(5);
  });

  it('gives auto-tappers half the combo multiplier with Synchronisation', () => {
    const s = defaultSave(NOW);
    s.tappers.pneumatic = 2; // 6
    s.upgrades.sync = 1;
    expect(energyPerSecond(s, { combo: 100 })).toBe(6 * 2); // 1 + (3 - 1) / 2
  });
});

describe('combo tiers', () => {
  it('maps counts to the spec table', () => {
    expect(comboTier(0).multiplier).toBe(1);
    expect(comboTier(9).multiplier).toBe(1);
    expect(comboTier(10).multiplier).toBe(1.5);
    expect(comboTier(25).multiplier).toBe(2);
    expect(comboTier(50).multiplier).toBe(2.5);
    expect(comboTier(100).multiplier).toBe(3);
    expect(comboTier(5000).label).toBe('Harmonic');
  });
});

describe('combo targets', () => {
  it('names the next tier, or nothing at the top', () => {
    expect(nextComboTier(0)).toMatchObject({ min: 10, label: 'Steady' });
    expect(nextComboTier(10)).toMatchObject({ min: 25 });
    expect(nextComboTier(99)).toMatchObject({ min: 100, label: 'Harmonic' });
    expect(nextComboTier(100)).toBeNull();
  });
});

describe('shop tab notices', () => {
  it('flags a closed tab when an auto-tapper is revealed, until it is opened', () => {
    const s = defaultSave(NOW);
    expect(shopTabHasNews(s, 'auto')).toBe(false);
    s.runLifetime = 400;
    updateReveals(s); // Pneumatic Key appears, not yet affordable
    expect(shopTabHasNews(s, 'auto')).toBe(true);
    expect(markShopTabSeen(s, 'auto')).toBe(true);
    expect(shopTabHasNews(s, 'auto')).toBe(false);
    expect(markShopTabSeen(s, 'auto')).toBe(false);
  });

  it('flags an item that becomes affordable at a price not seen before', () => {
    const s = defaultSave(NOW);
    s.energy = 80; // Finger Strength costs 75
    expect(shopTabHasNews(s, 'press')).toBe(true);
    markShopTabSeen(s, 'press');
    expect(shopTabHasNews(s, 'press')).toBe(false);

    // Dipping below the price and earning it back is not news.
    s.energy = 0;
    expect(shopTabHasNews(s, 'press')).toBe(false);
    s.energy = 80;
    expect(shopTabHasNews(s, 'press')).toBe(false);

    // The next level is a new price, so it is news once affordable.
    buyUpgrade(s, 'finger'); // 5 left, next level costs 135
    expect(shopTabHasNews(s, 'press')).toBe(false);
    s.energy = 140;
    expect(shopTabHasNews(s, 'press')).toBe(true);
  });

  it('ignores maxed upgrades and auto-tappers the shop has not shown', () => {
    const s = defaultSave(NOW);
    for (const u of PRESS_UPGRADES) s.upgrades[u.id] = u.max;
    s.energy = 1e9;
    expect(shopTabHasNews(s, 'press')).toBe(false);

    markShopTabSeen(s, 'auto'); // Lab Assistant is affordable and now seen
    expect(shopTabHasNews(s, 'auto')).toBe(false); // the collider is still hidden
    s.revealed.push('collider');
    s.seen.push('collider');
    expect(shopTabHasNews(s, 'auto')).toBe(true); // shown and affordable
  });
});

describe('reactor', () => {
  it('reports progress through the current state as 0..1', () => {
    expect(reactorProgress(0)).toBe(0);
    expect(reactorProgress(250)).toBe(0.5);
    expect(reactorProgress(500)).toBe(0); // just entered Warming
    expect(reactorProgress(5250)).toBeCloseTo(0.5);
    expect(reactorProgress(1e8)).toBe(1);
    expect(reactorProgress(5e8)).toBe(1);
  });

  it('names the state for a run lifetime and stacks +5% per state', () => {
    expect(reactorState(0).id).toBe('dormant');
    expect(reactorState(499).id).toBe('dormant');
    expect(reactorState(500).id).toBe('warming');
    expect(reactorState(1e8).id).toBe('supercritical');
    expect(milestoneBonus(0)).toBe(1);
    expect(milestoneBonus(1e8)).toBeCloseTo(1.3);
  });
});

describe('prestige', () => {
  it('reproduces the spec examples', () => {
    expect(prestigeGain(999_999)).toBe(0);
    expect(prestigeGain(1e6)).toBe(1);
    expect(prestigeGain(4e6)).toBe(2);
    expect(prestigeGain(25e6)).toBe(5);
    expect(prestigeGain(100e6)).toBe(10);
  });

  it('knows where the next isotope comes, and how far along the run is', () => {
    expect(nextIsotopeAt(0)).toBe(1e6);
    expect(nextIsotopeAt(999_999)).toBe(1e6);
    expect(nextIsotopeAt(1e6)).toBe(4e6);
    expect(nextIsotopeAt(3_999_999)).toBe(4e6);
    expect(nextIsotopeAt(4e6)).toBe(9e6);
    expect(isotopeProgress(0)).toBe(0);
    expect(isotopeProgress(250_000)).toBe(0.25);
    expect(isotopeProgress(1e6)).toBe(0);
    expect(isotopeProgress(2.5e6)).toBe(0.5);
    expect(isotopeProgress(4e6)).toBe(0);
    expect(isotopeProgress(8e6)).toBe(0.8);
  });

  it('wipes the run and keeps what the spec says survives', () => {
    const s = defaultSave(NOW);
    earn(s, 4e6);
    s.energy = 1234;
    s.upgrades.finger = 7;
    s.tappers.collider = 2;
    s.revealed = AUTO_TAPPERS.map((t) => t.id);
    s.totalPresses = 9000;
    s.bestCombo = 120;
    s.bestSurgeCps = 9.4;
    s.achievements = ['first-press'];

    const after = prestigeReset(s, prestigeGain(s.runLifetime), NOW + 1);
    expect(after.energy).toBe(0);
    expect(after.runLifetime).toBe(0);
    expect(after.upgrades.finger).toBe(0);
    expect(after.tappers.collider).toBe(0);
    expect(after.isotopes).toBe(2);
    expect(after.prestiges).toBe(1);
    expect(after.totalLifetime).toBe(4e6);
    expect(after.totalPresses).toBe(9000);
    expect(after.bestCombo).toBe(120);
    expect(after.bestSurgeCps).toBe(9.4);
    expect(after.achievements).toEqual(['first-press']);
    expect(after.revealed).toHaveLength(AUTO_TAPPERS.length);
    expect(after.announced).toEqual({});
  });
});

describe('offline progress', () => {
  it('awards nothing without an auto-tapper or under a minute away', () => {
    const s = defaultSave(NOW);
    expect(offlineAward(s, 3600)).toBeNull();
    s.tappers.assistant = 1;
    expect(offlineAward(s, 60)).toBeNull();
  });

  it('pays half EPS for the time away, capped at four hours', () => {
    const s = defaultSave(NOW);
    s.tappers.pneumatic = 2; // 6 EPS
    expect(offlineAward(s, 600)).toEqual({ seconds: 600, energy: 6 * 600 * 0.5 });
    expect(offlineAward(s, 10 * 3600)!.seconds).toBe(4 * 3600);
  });
});

describe('buying', () => {
  it('refuses what cannot be afforded and leaves the save untouched', () => {
    const s = defaultSave(NOW);
    s.energy = 10;
    expect(buyUpgrade(s, 'finger')).toBe(false);
    expect(s.energy).toBe(10);
    expect(s.upgrades.finger).toBe(0);
  });

  it('charges the current price and raises the level', () => {
    const s = defaultSave(NOW);
    s.energy = 200;
    expect(buyUpgrade(s, 'finger')).toBe(true);
    expect(s.energy).toBe(125);
    expect(buyTapper(s, 'assistant')).toBe(true);
    expect(s.energy).toBe(50);
    expect(s.tappers.assistant).toBe(1);
  });

  it('stops at the level cap', () => {
    const s = defaultSave(NOW);
    s.energy = Number.MAX_SAFE_INTEGER;
    s.upgrades.stabiliser = 1;
    expect(buyUpgrade(s, 'stabiliser')).toBe(false);
  });
});

describe('shop reveals', () => {
  it('reveals the next auto-tapper at half its base cost earned', () => {
    const s = defaultSave(NOW);
    expect(s.revealed).toEqual(['assistant']);
    s.runLifetime = 374;
    expect(updateReveals(s)).toEqual([]);
    s.runLifetime = 375;
    expect(updateReveals(s)).toEqual(['pneumatic']);
    expect(updateReveals(s)).toEqual([]); // not twice
  });

  it('always reveals an owned auto-tapper', () => {
    const s = defaultSave(NOW);
    s.tappers.arm = 1;
    expect(updateReveals(s)).toEqual(['arm']);
  });
});

// ---------------------------------------------------------------------------
// Combo tracker — the rhythm rules, press by press.
// ---------------------------------------------------------------------------

/** Press at a fixed cadence from `start`, returning the final result. */
function cadence(tracker: ComboTracker, start: number, intervalMs: number, count: number) {
  let t = start;
  let result = tracker.press(t);
  for (let i = 1; i < count; i++) {
    t += intervalMs;
    result = tracker.press(t);
  }
  return { result, t };
}

describe('combo tracker', () => {
  it('counts a steady cadence press for press', () => {
    const c = new ComboTracker();
    const { result } = cadence(c, 0, 200, 30);
    expect(result.combo).toBe(30);
    expect(result.kept).toBe(true);
  });

  it('counts the first five presses regardless of rhythm', () => {
    const c = new ComboTracker();
    c.press(0);
    c.press(100);
    c.press(550);
    c.press(600);
    const r = c.press(1100);
    expect(r.combo).toBe(5);
  });

  it('forgives two off-rhythm presses and breaks on the third', () => {
    const c = new ComboTracker();
    const { t } = cadence(c, 0, 200, 20);
    // Three presses far off a 200 ms rhythm but inside the grace window.
    expect(c.press(t + 500).kept).toBe(false);
    expect(c.combo).toBe(20);
    expect(c.press(t + 500 + 120).kept).toBe(false);
    expect(c.combo).toBe(20);
    const third = c.press(t + 500 + 120 + 500);
    expect(third.broke).toBe(true);
    expect(c.combo).toBe(0);
  });

  it('accepts jitter inside the 25% window', () => {
    const c = new ComboTracker();
    const { t } = cadence(c, 0, 200, 10);
    expect(c.press(t + 245).kept).toBe(true); // +22.5%
    expect(c.press(t + 245 + 160).kept).toBe(true); // −20% of the new mean, roughly
  });

  it('breaks on a pause past the grace window, from tick or the next press', () => {
    const c = new ComboTracker();
    const { t } = cadence(c, 0, 200, 15);
    expect(c.tick(t + 800)).toBe(false);
    expect(c.tick(t + 801)).toBe(true);
    expect(c.combo).toBe(0);

    const d = new ComboTracker();
    const run = cadence(d, 0, 200, 15);
    const r = d.press(run.t + 2000);
    expect(r.broke).toBe(true);
    expect(r.combo).toBe(1); // the press itself starts the next combo
  });

  it('drops by ten instead of resetting with the Stabiliser', () => {
    const c = new ComboTracker(() => true);
    const { t } = cadence(c, 0, 200, 40);
    c.tick(t + 1000);
    expect(c.combo).toBe(30);
  });

  it('reports the draining grace window', () => {
    const c = new ComboTracker();
    c.press(1000);
    expect(c.graceRemaining(1000)).toBe(1);
    expect(c.graceRemaining(1400)).toBeCloseTo(0.5);
    expect(c.graceRemaining(1000 + COMBO.graceMs)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Achievements
// ---------------------------------------------------------------------------

describe('achievements', () => {
  it('awards each badge once, from the save and the live context', () => {
    const s = defaultSave(NOW);
    s.totalPresses = 1;
    expect(checkAchievements(s)).toEqual(['first-press']);
    expect(checkAchievements(s)).toEqual([]);

    expect(checkAchievements(s, { combo: 60 })).toEqual(['steady-hands', 'resonance']);
    expect(checkAchievements(s, { surgeCps: 12.2 })).toEqual(['fast-fingers', 'lightning']);

    for (const t of AUTO_TAPPERS) s.tappers[t.id] = 1;
    s.tappers.assistant = 10;
    expect(checkAchievements(s)).toEqual(['staffed-up', 'automated']);

    s.runLifetime = 1e7;
    s.prestiges = 5;
    expect(checkAchievements(s)).toEqual(['critical-mass', 'fresh-start', 'veteran']);
  });
});

// ---------------------------------------------------------------------------
// Save — round trip and hostile input.
// ---------------------------------------------------------------------------

describe('save', () => {
  it('round-trips through JSON', () => {
    const s = defaultSave(NOW);
    earn(s, 12345.6);
    s.upgrades.finger = 3;
    s.tappers.quantum = 2;
    s.achievements = ['first-press', 'warmed-up'];
    const back = parseSave(serializeSave(s), NOW + 5000);
    expect(back).toEqual({
      ...s,
      revealed: ['assistant', 'quantum'],
      seen: ['assistant', 'quantum'],
    });
  });

  it('starts fresh on nothing, garbage, or the wrong shape', () => {
    expect(parseSave(null, NOW)).toEqual(defaultSave(NOW));
    expect(parseSave('{not json', NOW)).toEqual(defaultSave(NOW));
    expect(parseSave('[1,2,3]', NOW)).toEqual(defaultSave(NOW));
  });

  it('keeps usable fields from a partial or hand-edited save', () => {
    const s = parseSave(
      JSON.stringify({
        energy: 42,
        upgrades: { finger: 999, bogus: 4 },
        tappers: { arm: 2, assistant: -5 },
        isotopes: 'lots',
        achievements: ['first-press', 'made-up', 'first-press'],
        lastSeen: NOW + 1e9,
        announced: { finger: 3, bogus: 1, double: -1, spring: 1.5 },
      }),
      NOW
    );
    expect(s.energy).toBe(42);
    expect(s.upgrades.finger).toBe(20); // clamped to the cap
    expect(s.tappers.arm).toBe(2);
    expect(s.tappers.assistant).toBe(0);
    expect(s.isotopes).toBe(0);
    expect(s.achievements).toEqual(['first-press']);
    expect(s.revealed).toEqual(['assistant', 'arm']);
    expect(s.lastSeen).toBe(NOW); // never in the future
    expect(s.announced).toEqual({ finger: 3 });
  });
});

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

describe('format', () => {
  it('formats energy with separators under 100K and three significant figures above', () => {
    expect(formatEnergy(0)).toBe('0');
    expect(formatEnergy(999.9)).toBe('999');
    expect(formatEnergy(9999)).toBe('9,999');
    expect(formatEnergy(75_000)).toBe('75,000');
    expect(formatEnergy(99_999)).toBe('99,999');
    expect(formatEnergy(100_000)).toBe('100K');
    expect(formatEnergy(123_456)).toBe('123K');
    expect(formatEnergy(1_234_567)).toBe('1.23M');
    expect(formatEnergy(2.5e9)).toBe('2.50B');
  });

  it('formats rates and multipliers', () => {
    expect(formatRate(0.5)).toBe('0.5');
    expect(formatRate(12345)).toBe('12,345');
    expect(formatRate(1_234_567)).toBe('1.23M');
    expect(formatMultiplier(1)).toBe('x1');
    expect(formatMultiplier(2.5)).toBe('x2.5');
  });

  it('formats durations', () => {
    expect(formatDuration(45)).toBe('45s');
    expect(formatDuration(725)).toBe('12m 05s');
    expect(formatDuration(15_120)).toBe('4h 12m');
  });
});

// ---------------------------------------------------------------------------
// Run modifiers: the layer perks will bend. With no perks it must be the game
// exactly as it shipped.
// ---------------------------------------------------------------------------

/** A fresh run's modifiers with some fields bent, as a perk would. */
function bent(patch: Partial<Mods>): Mods {
  return { ...modsOf(defaultSave(NOW)), ...patch };
}

describe('run modifiers', () => {
  it('are the shipped rules with nothing bought', () => {
    expect(modsOf(defaultSave(NOW))).toEqual(BASE_MODS);
    expect(BASE_MODS.combo).toBe(COMBO);
    expect(BASE_MODS.surge).toBe(SURGE);
    expect(BASE_MODS.offline).toBe(OFFLINE);
    expect(BASE_MODS.tiers).toBe(COMBO_TIERS);
  });

  it('fold in the Stabiliser and Synchronisation', () => {
    const s = defaultSave(NOW);
    expect(modsOf(s).stabiliser).toBe(false);
    expect(modsOf(s).syncShare).toBe(0);
    s.upgrades.stabiliser = 1;
    s.upgrades.sync = 1;
    expect(modsOf(s).stabiliser).toBe(true);
    expect(modsOf(s).syncShare).toBe(0.5);
  });

  it('are built once per distinct set', () => {
    expect(modsOf(defaultSave(NOW))).toBe(modsOf(defaultSave(NOW + 1)));
  });

  it('bend each term of a press', () => {
    const s = defaultSave(NOW);
    s.upgrades.finger = 4;
    s.upgrades.spring = 2;
    expect(energyPerPress(s, {}, bent({ fingerPerLevel: 2 }))).toBeCloseTo(9 * 2.25);
    expect(energyPerPress(s, {}, bent({ springPerLevel: 2 }))).toBeCloseTo(5 * 4);
    expect(energyPerPress(s, {}, bent({ pressMult: 3 }))).toBeCloseTo(5 * 2.25 * 3);
    // +0.5% a point of combo on top of Harmonic's x3.
    expect(energyPerPress(s, { combo: 100 }, bent({ pressPerCombo: 0.005 }))).toBeCloseTo(
      5 * 2.25 * 3 * 1.5
    );
    expect(energyPerPress(s, { afterglow: true }, bent({ afterglowMult: 3 }))).toBeCloseTo(
      5 * 2.25 * 3
    );
    const storm = bent({ surge: { ...SURGE, multiplier: 25 } });
    expect(energyPerPress(s, { surging: true }, storm)).toBeCloseTo(5 * 2.25 * 25);
  });

  it('let a run carry its own combo tiers', () => {
    const tiers: ComboTierDef[] = [{ min: 200, multiplier: 4, label: 'Overtone' }, ...COMBO_TIERS];
    expect(comboTier(200, tiers).label).toBe('Overtone');
    expect(nextComboTier(150, tiers)).toMatchObject({ min: 200 });
    expect(energyPerPress(defaultSave(NOW), { combo: 250 }, bent({ tiers }))).toBe(4);
  });

  it('bend the Double Tap chance and its cap', () => {
    const s = defaultSave(NOW);
    s.upgrades.double = 10;
    const dice = bent({ doubleTapBonus: 0.15, doubleTapCap: 0.75 });
    expect(doubleTapChance(s, dice)).toBeCloseTo(0.65);
    expect(doubleTapChance(s, { ...dice, doubleTapBonus: 0.35 })).toBe(0.75);
  });

  it('bend auto-tapper output', () => {
    const s = defaultSave(NOW);
    s.tappers.assistant = 10; // 5 a second
    const byId = { ...BASE_MODS.tapperMultById, assistant: 4 };
    expect(energyPerSecond(s, {}, bent({ tapperMultById: byId }))).toBeCloseTo(20);
    expect(energyPerSecond(s, {}, bent({ tapperMult: 4 }))).toBeCloseTo(20);
    expect(energyPerSecond(s, {}, bent({ tapperPerOwned: 0.01 }))).toBeCloseTo(5 * 1.1);
    s.upgrades.double = 4; // 20%
    expect(energyPerSecond(s, {}, bent({ tapperDoubleTapShare: 1 }))).toBeCloseTo(5 * 1.2);
  });

  it('scale auto-tappers by reactor state on top of the milestone bonus', () => {
    const s = defaultSave(NOW);
    s.tappers.assistant = 10;
    s.runLifetime = 10_000; // Stable, index 2
    expect(energyPerSecond(s, {}, bent({ tapperPerState: 0.1 }))).toBeCloseTo(5 * 1.2 * 1.1);
  });

  it('give auto-tappers any share of the combo bonus', () => {
    const s = defaultSave(NOW);
    s.tappers.pneumatic = 2; // 6
    expect(energyPerSecond(s, { combo: 100 }, bent({ syncShare: 1 }))).toBeCloseTo(18);
    expect(energyPerSecond(s, { combo: 100 }, bent({ syncShare: 1.5 }))).toBeCloseTo(24);
  });

  it('boost auto-tappers once play goes idle', () => {
    const s = defaultSave(NOW);
    s.tappers.pneumatic = 2;
    const idle = bent({ idleBoostMult: 2.5, idleBoostAfterS: 10 });
    expect(energyPerSecond(s, { idleS: 9.9 }, idle)).toBeCloseTo(6);
    expect(energyPerSecond(s, { idleS: 10 }, idle)).toBeCloseTo(15);
  });

  it('let surges reach auto-tappers only when bent to', () => {
    const s = defaultSave(NOW);
    s.tappers.pneumatic = 2;
    expect(energyPerSecond(s, { surging: true })).toBe(6);
    expect(energyPerSecond(s, { surging: true }, bent({ surgeHitsTappers: true }))).toBe(60);
  });

  it('discount auto-tappers, rounded to a whole price', () => {
    const s = defaultSave(NOW);
    expect(tapperCost(s, 'assistant', bent({ tapperCostMult: 0.8 }))).toBe(60);
    s.tappers.assistant = 1; // 90
    expect(tapperCost(s, 'assistant', bent({ tapperCostMult: 0.7 }))).toBe(63);
  });

  it('bend away progress', () => {
    const s = defaultSave(NOW);
    s.tappers.pneumatic = 2; // 6
    const night = bent({ offline: { ...OFFLINE, rate: 1, capS: 8 * 3600 } });
    expect(offlineAward(s, 600, night)).toEqual({ seconds: 600, energy: 3600 });
    expect(offlineAward(s, 10 * 3600, night)!.seconds).toBe(8 * 3600);
  });
});

describe('combo tracker with per-run rules', () => {
  it('keeps a press a wider tolerance allows', () => {
    const strict = new ComboTracker();
    const loose = new ComboTracker(undefined, () => ({ ...COMBO, tolerance: 0.4 }));
    const a = cadence(strict, 0, 200, 10);
    const b = cadence(loose, 0, 200, 10);
    expect(strict.press(a.t + 270).kept).toBe(false); // +35%
    expect(loose.press(b.t + 270).kept).toBe(true);
  });

  it('holds through a longer pause with a longer grace', () => {
    const c = new ComboTracker(undefined, () => ({ ...COMBO, graceMs: 2000 }));
    const { t } = cadence(c, 0, 200, 15);
    expect(c.tick(t + 1500)).toBe(false);
    expect(c.combo).toBe(15);
    expect(c.graceRemaining(t + 1000)).toBeCloseTo(0.5);
  });

  it('breaks on the first miss when allowed none', () => {
    const c = new ComboTracker(undefined, () => ({ ...COMBO, missesToBreak: 1 }));
    const { t } = cadence(c, 0, 200, 20);
    expect(c.press(t + 500).broke).toBe(true);
    expect(c.combo).toBe(0);
  });

  it('reads the rules on every press, so a change applies at once', () => {
    let tolerance = 0.25;
    const c = new ComboTracker(undefined, () => ({ ...COMBO, tolerance }));
    const { t } = cadence(c, 0, 200, 10);
    tolerance = 0.4;
    expect(c.press(t + 270).kept).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Seeded random generator
// ---------------------------------------------------------------------------

describe('seeded random', () => {
  it('replays the same sequence from the same seed', () => {
    const run = (seed: number) => {
      const out: number[] = [];
      for (let i = 0; i < 5; i++) {
        const d = nextRandom(seed);
        out.push(d.value);
        seed = d.seed;
      }
      return out;
    };
    expect(run(42)).toEqual(run(42));
    expect(run(42)).not.toEqual(run(43));
  });

  it('draws uniformly in [0, 1) and keeps a 32-bit state', () => {
    let seed = 7;
    let sum = 0;
    const bins = new Array<number>(10).fill(0);
    for (let i = 0; i < 20_000; i++) {
      const d = nextRandom(seed);
      expect(d.value).toBeGreaterThanOrEqual(0);
      expect(d.value).toBeLessThan(1);
      expect(Number.isInteger(d.seed) && d.seed >= 0 && d.seed < 2 ** 32).toBe(true);
      sum += d.value;
      bins[Math.floor(d.value * 10)]!++;
      seed = d.seed;
    }
    expect(sum / 20_000).toBeCloseTo(0.5, 1);
    for (const n of bins) expect(Math.abs(n - 2000)).toBeLessThan(200);
  });

  it('makes whole 32-bit seeds', () => {
    expect(newSeed(() => 0)).toBe(0);
    expect(newSeed(() => 0.999999999)).toBe(4294967291);
  });
});

// ---------------------------------------------------------------------------
// Income meter
// ---------------------------------------------------------------------------

describe('income meter', () => {
  it('reads zero before anything is earned', () => {
    expect(new IncomeMeter().rate(5000)).toBe(0);
  });

  it('measures a steady income over its window', () => {
    const m = new IncomeMeter(10);
    for (let t = 0; t < 30_000; t += 100) m.add(t, 10); // 100 a second
    expect(m.rate(29_999)).toBeCloseTo(100, 0);
  });

  it('averages a fresh run over the time it has run, not the whole window', () => {
    const m = new IncomeMeter(10);
    for (let t = 0; t < 2000; t += 100) m.add(t, 10);
    expect(m.rate(1999)).toBeCloseTo(100, 0);
  });

  it('forgets gains older than its window', () => {
    const m = new IncomeMeter(10);
    for (let t = 0; t < 5000; t += 100) m.add(t, 10);
    expect(m.rate(20_000)).toBe(0);
    m.add(20_000, 50);
    expect(m.rate(20_000)).toBe(5);
  });

  it('starts over on reset', () => {
    const m = new IncomeMeter(10);
    m.add(0, 100);
    m.reset();
    expect(m.rate(0)).toBe(0);
  });
});
