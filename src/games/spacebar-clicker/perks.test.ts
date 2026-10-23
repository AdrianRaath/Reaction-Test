import { describe, expect, it } from 'vitest';

import { ComboTracker } from './combo';
import { COMBO, PERK_DROPS, PERK_SLOTS, PERKS, type PerkId, type ShopTab } from './config';
import {
  comboTier,
  doubleTapChance,
  energyPerPress,
  energyPerSecond,
  luckyMultiplier,
  markShopTabSeen,
  offerOn,
  offlineAward,
  shopTabHasNews,
  tapperCost,
} from './economy';
import { BASE_MODS, modsOf } from './mods';
import {
  buyPerk,
  deferPerks,
  needsSlot,
  offerRemaining,
  perkDetail,
  perkDetailAllLevels,
  perkLevel,
  perkTick,
  replicate,
  surgeDrop,
  upgradeFactor,
} from './perks';
import {
  defaultSave,
  parseSave,
  prestigeReset,
  serializeSave,
  type PerkOffer,
  type SaveState,
} from './save';

const NOW = 1_700_000_000_000;
const def = (id: PerkId) => PERKS.find((p) => p.id === id)!;

/** A fresh save holding the given perks, found in the codex as a real save would have them. */
function holding(...perks: [PerkId, number][]): SaveState {
  const s = defaultSave(NOW);
  s.perks.owned = perks.map(([id, level]) => ({ id, level }));
  s.perks.codex = Object.fromEntries(perks);
  return s;
}

/** Put an offer on a perk's tab directly, as a drop would. */
function offer(s: SaveState, id: PerkId, price = 100, level = perkLevel(s, id) + 1) {
  s.perks.offers.push({
    id,
    level,
    price,
    droppedAt: s.runLifetime,
    expiresAt: s.runLifetime + 1000,
    seen: false,
    seenAffordable: false,
  });
}

// ---------------------------------------------------------------------------
// The table
// ---------------------------------------------------------------------------

describe('perk table', () => {
  it('holds 25 perks, 13 on the Upgrades tab and 12 on Auto-tappers', () => {
    expect(PERKS).toHaveLength(25);
    expect(new Set(PERKS.map((p) => p.id)).size).toBe(25);
    expect(PERKS.filter((p) => p.tab === 'press')).toHaveLength(13);
    expect(PERKS.filter((p) => p.tab === 'auto')).toHaveLength(12);
    expect(PERKS.filter((p) => p.rarity === 'keystone').map((p) => p.id)).toEqual([
      'glass-rhythm',
      'brute-force',
      'storm-front',
      'autopilot',
    ]);
  });

  it('gives every perk one value per level, each level better than the last', () => {
    for (const p of PERKS) {
      expect(p.detail.split('{v}')).toHaveLength(2);
      const [a, b, c] = p.values;
      // Self-Replicator counts down: a shorter wait is better.
      if (p.id === 'self-replicator') expect(a > b && b > c).toBe(true);
      else expect(a < b && b < c, p.id).toBe(true);
    }
  });

  it('gives every perk an effect, stronger at each level', () => {
    const base = modsOf(defaultSave(NOW));
    for (const p of PERKS) {
      const levels = [1, 2, 3].map((lvl) => modsOf(holding([p.id, lvl])));
      expect(levels[0], p.id).not.toEqual(base);
      expect(levels[1], p.id).not.toEqual(levels[0]);
      expect(levels[2], p.id).not.toEqual(levels[1]);
    }
  });

  it('reads each value in its own unit', () => {
    expect(perkDetail(def('metronome'), 2)).toBe('Rhythm tolerance widens from 25% to 50%');
    expect(perkDetail(def('momentum'), 2)).toBe(
      '+0.75% press value per point of combo, no ceiling'
    );
    expect(perkDetail(def('lightning-rod'), 2)).toBe('Surges come 2.5 times as often');
    expect(perkDetail(def('finger-memory'), 1)).toBe(
      'Each Finger Strength level adds 2 energy a press instead of 1'
    );
    expect(perkDetailAllLevels(def('night-shift'))).toBe(
      'Away progress pays 100% instead of 50%, capped at 8 h / 12 h / 24 h instead of 4 h'
    );
    expect(perkDetailAllLevels(def('overtone'))).toBe(
      'A new tier above Harmonic: 200 combo for x4 / x4.5 / x5'
    );
  });
});

// ---------------------------------------------------------------------------
// Effects, one perk at a time, at level I unless it says otherwise
// ---------------------------------------------------------------------------

describe('perk effects on presses and the combo', () => {
  it('Metronome widens the rhythm tolerance', () => {
    expect(modsOf(holding(['metronome', 2])).combo.tolerance).toBe(0.5);
  });

  it('Held Breath lengthens the grace and lets a pause rest', () => {
    const rules = modsOf(holding(['held-breath', 1])).combo;
    expect(rules.graceMs).toBe(2000);
    const c = new ComboTracker(undefined, () => rules);
    let t = 0;
    for (let i = 0; i < 15; i++) c.press((t += 200));
    expect(c.tick(t + 1500)).toBe(false);
    const rest = c.press((t += 1500));
    expect(rest.kept).toBe(false);
    expect(rest.broke).toBe(false);
    // The beat picks up where it left off: the pause stayed out of the mean.
    for (let i = 0; i < 5; i++) expect(c.press((t += 200)).kept).toBe(true);
    expect(c.combo).toBe(20);
  });

  it('without Held Breath the same pause sours the beat', () => {
    const c = new ComboTracker(undefined, () => ({ ...COMBO, graceMs: 2000 }));
    let t = 0;
    for (let i = 0; i < 15; i++) c.press((t += 200));
    c.press((t += 1500));
    const after = [1, 2].map(() => c.press((t += 200)).kept);
    expect(after).toContain(false);
  });

  it('Overtone adds a tier above Harmonic', () => {
    const { tiers } = modsOf(holding(['overtone', 1]));
    expect(comboTier(199, tiers).label).toBe('Harmonic');
    expect(comboTier(200, tiers)).toMatchObject({ label: 'Overtone', multiplier: 4 });
  });

  it('Momentum pays a little more for every point of combo', () => {
    const s = holding(['momentum', 1]);
    expect(energyPerPress(s, { combo: 100 })).toBeCloseTo(3 * 1.5);
  });

  it('Glass Rhythm multiplies every tier, breaks on one miss, and switches off the Stabiliser', () => {
    const s = holding(['glass-rhythm', 1]);
    s.upgrades.stabiliser = 1;
    const m = modsOf(s);
    expect(comboTier(10, m.tiers).multiplier).toBe(3);
    expect(comboTier(100, m.tiers).multiplier).toBe(6);
    expect(comboTier(0, m.tiers).multiplier).toBe(1);
    expect(m.combo.missesToBreak).toBe(1);
    expect(m.stabiliser).toBe(false);
  });

  it('Glass Rhythm scales the Overtone tier too', () => {
    const { tiers } = modsOf(holding(['overtone', 1], ['glass-rhythm', 1]));
    expect(comboTier(200, tiers).multiplier).toBe(8);
  });

  it('Finger Memory and Coiled Spring strengthen their upgrades', () => {
    const s = holding(['finger-memory', 1], ['coiled-spring', 1]);
    s.upgrades.finger = 4;
    s.upgrades.spring = 2;
    expect(energyPerPress(s)).toBeCloseTo((1 + 4 * 2) * 2 * 2);
  });

  it('Brute Force removes the combo and triples the press', () => {
    const s = holding(['brute-force', 1], ['full-sync', 1]);
    s.tappers.pneumatic = 2;
    expect(energyPerPress(s, { combo: 100 })).toBe(3);
    expect(energyPerSecond(s, { combo: 100 }), 'nothing for Full Sync to share').toBe(6);
  });

  it('Loaded Dice raises the Double Tap chance and its cap', () => {
    const s = holding(['loaded-dice', 1]);
    expect(doubleTapChance(s)).toBeCloseTo(0.15);
    s.upgrades.double = 10;
    expect(doubleTapChance(s)).toBeCloseTo(0.65);
    s.perks.owned = [{ id: 'loaded-dice', level: 3 }];
    expect(doubleTapChance(s)).toBe(0.75);
  });

  it('Lightning Rod brings surges sooner; Storm Front makes them harder and silent', () => {
    expect(modsOf(holding(['lightning-rod', 1])).surge).toMatchObject({ minGapS: 45, maxGapS: 90 });
    const storm = modsOf(holding(['storm-front', 1])).surge;
    expect(storm).toMatchObject({ multiplier: 25, warningS: 0 });
    expect(energyPerPress(holding(['storm-front', 1]), { surging: true })).toBe(25);
  });

  it('Afterglow keeps presses at x3 for a while after a surge', () => {
    const s = holding(['afterglow', 2]);
    expect(modsOf(s).afterglowS).toBe(15);
    expect(energyPerPress(s, { afterglow: true })).toBe(3);
    expect(energyPerPress(s)).toBe(1);
  });
});

describe('the luck roll', () => {
  /** A random source that plays back fixed draws. */
  const draws = (...values: number[]) => {
    let i = 0;
    return () => values[i++] ?? 0.99;
  };

  it('is x1 without Double Tap', () => {
    expect(luckyMultiplier(defaultSave(NOW), draws(0))).toBe(1);
  });

  it('doubles a lucky press', () => {
    const s = defaultSave(NOW);
    s.upgrades.double = 10; // 50%
    expect(luckyMultiplier(s, draws(0.4))).toBe(2);
    expect(luckyMultiplier(s, draws(0.6))).toBe(1);
  });

  it('chains with Chain Reaction, up to x8', () => {
    const s = holding(['chain-reaction', 3]);
    s.upgrades.double = 10; // 50%, rolled again at 50%
    expect(luckyMultiplier(s, draws(0.1, 0.9))).toBe(2);
    expect(luckyMultiplier(s, draws(0.1, 0.1, 0.9))).toBe(4);
    expect(luckyMultiplier(s, draws(0.1, 0.1, 0.1, 0.1, 0.1))).toBe(8);
  });

  it('rolls again at only a share of the chance below level III', () => {
    const s = holding(['chain-reaction', 1]);
    s.upgrades.double = 10; // again at 25%
    expect(luckyMultiplier(s, draws(0.1, 0.3))).toBe(2);
    expect(luckyMultiplier(s, draws(0.1, 0.2, 0.9))).toBe(4);
  });
});

describe('perk effects on auto-tappers and time away', () => {
  it('Overtime multiplies Lab Assistants only', () => {
    const s = holding(['overtime', 1]);
    s.tappers.assistant = 10; // 5
    s.tappers.pneumatic = 1; // 3
    expect(energyPerSecond(s)).toBeCloseTo(20 + 3);
  });

  it('Assembly Line and Critical Load grow with the run', () => {
    const s = holding(['assembly-line', 1], ['critical-load', 1]);
    s.tappers.assistant = 10;
    s.runLifetime = 10_000; // Stable: state 2, milestone x1.1
    expect(energyPerSecond(s)).toBeCloseTo(5 * 1.1 * 1.2 * 1.1);
  });

  it('Bulk Order discounts auto-tappers', () => {
    expect(tapperCost(holding(['bulk-order', 1]), 'assistant')).toBe(60);
    expect(tapperCost(holding(['bulk-order', 3]), 'assistant')).toBe(45);
  });

  it('Ghost Presses turn the Double Tap chance into output', () => {
    const s = holding(['ghost-presses', 2]);
    s.tappers.pneumatic = 2;
    s.upgrades.double = 4; // 20%, x1.5 of it
    expect(energyPerSecond(s)).toBeCloseTo(6 * 1.3);
  });

  it('Full Sync shares the whole combo bonus, and beats Synchronisation', () => {
    const s = holding(['full-sync', 1]);
    s.tappers.pneumatic = 2;
    s.upgrades.sync = 1;
    expect(energyPerSecond(s, { combo: 100 })).toBeCloseTo(18);
  });

  it('Surge Lines lets surges reach auto-tappers and lengthens them', () => {
    const s = holding(['surge-lines', 2]);
    s.tappers.pneumatic = 2;
    expect(energyPerSecond(s, { surging: true })).toBe(60);
    expect(modsOf(s).surge.durationS).toBe(7);
  });

  it('Idle Hands boosts auto-tappers after ten seconds without a press', () => {
    const s = holding(['idle-hands', 1]);
    s.tappers.pneumatic = 2;
    expect(energyPerSecond(s, { idleS: 5 })).toBe(6);
    expect(energyPerSecond(s, { idleS: 10 })).toBe(15);
  });

  it('Night Shift pays all of away time, for longer', () => {
    const s = holding(['night-shift', 1]);
    s.tappers.pneumatic = 2;
    expect(offlineAward(s, 600)).toEqual({ seconds: 600, energy: 3600 });
    expect(offlineAward(s, 24 * 3600)!.seconds).toBe(8 * 3600);
  });

  it('Feedback Loop pays a share of per-second income on every press', () => {
    const s = holding(['feedback-loop', 1]);
    s.tappers.pneumatic = 2; // 6 a second
    expect(energyPerPress(s)).toBeCloseTo(1 + 0.3);
  });

  it('Self-Replicator copies the cheapest revealed auto-tapper', () => {
    const s = holding(['self-replicator', 1]);
    expect(modsOf(s).replicateEveryS).toBe(60);
    s.revealed = ['assistant', 'pneumatic'];
    s.tappers.assistant = 20; // dearer than a first Pneumatic Key now
    expect(replicate(s)).toBe('pneumatic');
    expect(s.tappers.pneumatic).toBe(1);
  });

  it('Autopilot halves presses and multiplies auto-tappers', () => {
    const s = holding(['autopilot', 1]);
    s.tappers.pneumatic = 2;
    expect(energyPerPress(s)).toBe(0.5);
    expect(energyPerSecond(s)).toBe(24);
  });
});

// ---------------------------------------------------------------------------
// Drops
// ---------------------------------------------------------------------------

/** Make this not the player's first run: something has dropped before. */
function veteran(s: SaveState): SaveState {
  s.perks.codex = { afterglow: 0 };
  return s;
}

/**
 * Play `seconds` of active play in one-second ticks at a steady income,
 * collecting drops. `keepOpen` clears offers after each tick, so every drop
 * that comes due has a tab to land in.
 */
function play(s: SaveState, seconds: number, { income = 10, keepOpen = true } = {}) {
  const drops: { t: number; offer: PerkOffer }[] = [];
  for (let i = 0; i < seconds; i++) {
    s.runLifetime += income;
    for (const o of perkTick(s, income, 1).dropped) drops.push({ t: s.perks.activeS, offer: o });
    if (keepOpen) s.perks.offers = [];
  }
  return drops;
}

const gaps = (drops: { t: number }[]) => drops.slice(1).map((d, i) => d.t - drops[i]!.t);

describe('perk drops', () => {
  it('need active play: idle time never brings one', () => {
    const s = veteran(defaultSave(NOW));
    for (let i = 0; i < 5000; i++) {
      s.runLifetime += 100;
      expect(perkTick(s, 100, 0).dropped).toEqual([]);
    }
    expect(s.perks.activeS).toBe(0);
  });

  it('give a player’s very first run one common, at a random moment early on', () => {
    const times: number[] = [];
    for (let seed = 0; seed < 300; seed++) {
      const s = defaultSave(NOW);
      s.perks.rng = seed;
      const [first] = play(s, 200);
      expect(first, `seed ${seed}`).toBeDefined();
      expect(def(first!.offer.id).rarity).toBe('common');
      times.push(first!.t);
    }
    expect(Math.min(...times)).toBeGreaterThanOrEqual(60);
    expect(Math.max(...times)).toBeLessThanOrEqual(181);
    expect(Math.min(...times), 'spread across the range').toBeLessThan(70);
    expect(Math.max(...times)).toBeGreaterThan(170);
  });

  it('come at random intervals: clustered sometimes, long apart others, never past the ceiling', () => {
    const s = veteran(defaultSave(NOW));
    const g = gaps(play(s, 300_000));
    const mean = g.reduce((a, b) => a + b, 0) / g.length;
    const spread = Math.sqrt(g.reduce((a, b) => a + (b - mean) ** 2, 0) / g.length) / mean;
    // An exponential with a 6-minute mean, cut at 10 minutes, averages 292 s.
    expect(mean).toBeGreaterThan(280);
    expect(mean).toBeLessThan(305);
    expect(spread, 'far from clockwork').toBeGreaterThan(0.6);
    expect(Math.max(...g)).toBeLessThanOrEqual(601);
    expect(g.filter((x) => x <= 30).length / g.length).toBeGreaterThan(0.05);
    expect(g.filter((x) => x >= 480).length / g.length).toBeGreaterThan(0.15);
  });

  it('drop commons, rares and keystones at 65%, 30% and 5%', () => {
    const s = veteran(defaultSave(NOW));
    const seen = { common: 0, rare: 0, keystone: 0 };
    const drops = play(s, 2_000_000);
    for (const d of drops) seen[def(d.offer.id).rarity]++;
    expect(seen.common / drops.length).toBeCloseTo(0.65, 1);
    expect(seen.rare / drops.length).toBeCloseTo(0.3, 1);
    expect(seen.keystone / drops.length).toBeCloseTo(0.05, 1);
    expect(seen.keystone).toBeGreaterThan(0);
  });

  it('fall back to the tiers that have anything left', () => {
    const s = holding(
      ...PERKS.filter((p) => p.rarity !== 'keystone').map((p): [PerkId, number] => [p.id, 3])
    );
    const drops = play(s, 20_000);
    expect(drops.length).toBeGreaterThan(20);
    for (const d of drops) expect(def(d.offer.id).rarity).toBe('keystone');
  });

  it('lose a drop that comes while both tabs hold offers, and draw a fresh moment', () => {
    const s = veteran(defaultSave(NOW));
    s.perks.nextDropAtS = 1;
    offer(s, 'metronome');
    offer(s, 'overtime');
    expect(perkTick(s, 10, 1).dropped).toEqual([]);
    expect(s.perks.offers).toHaveLength(2);
    expect(s.perks.nextDropAtS).toBeGreaterThan(s.perks.activeS);
  });

  it('price and time an offer in seconds of income', () => {
    const s = veteran(defaultSave(NOW));
    s.perks.nextDropAtS = 0;
    s.runLifetime = 5000;
    const [o] = perkTick(s, 10, 1).dropped;
    const rarity = def(o!.id).rarity;
    expect(o!.price).toBe(PERK_DROPS.priceS[rarity] * 10);
    expect(o!.droppedAt).toBe(5000);
    expect(o!.expiresAt - o!.droppedAt).toBe(PERK_DROPS.windowS[rarity] * 10);
  });

  it('offer an owned perk again as an upgrade, dearer per level held', () => {
    // Everything maxed but Metronome at II: the only perk left to drop is
    // Metronome's upgrade.
    const s = holding(...PERKS.map((p): [PerkId, number] => [p.id, p.id === 'metronome' ? 2 : 3]));
    s.perks.nextDropAtS = 0;
    const [o] = perkTick(s, 10, 1).dropped;
    expect(o).toMatchObject({ id: 'metronome', level: 3, price: Math.round(90 * 10 * 2.25) });
    expect(upgradeFactor(2)).toBe(2.25);
  });

  it('never offer a perk at the top level', () => {
    const s = veteran(holding(['metronome', 3], ['overtime', 3]));
    s.perks.codex = { metronome: 3, overtime: 3 };
    const drops = play(s, 100_000);
    expect(drops.length).toBeGreaterThan(100);
    for (const d of drops) expect(['metronome', 'overtime']).not.toContain(d.offer.id);
  });

  it('retire an offer once the run earns past its window', () => {
    const s = veteran(defaultSave(NOW));
    s.perks.nextDropAtS = 0;
    s.runLifetime = 1000;
    const [o] = perkTick(s, 10, 1).dropped;
    const span = o!.expiresAt - o!.droppedAt;
    s.runLifetime += span / 2;
    expect(offerRemaining(s, o!)).toBeCloseTo(0.5);
    s.runLifetime = o!.expiresAt;
    expect(perkTick(s, 10, 0).expired).toEqual([o]);
    expect(s.perks.offers).toEqual([]);
  });

  it('move offers past energy collected for time away', () => {
    const s = veteran(defaultSave(NOW));
    offer(s, 'metronome');
    const next = s.perks.nextDropAtS;
    s.runLifetime += 5000; // collected
    deferPerks(s, 5000);
    expect(s.perks.offers[0]).toMatchObject({ droppedAt: 5000, expiresAt: 6000 });
    expect(s.perks.nextDropAtS).toBe(next);
    expect(perkTick(s, 10, 0).expired).toEqual([]);
  });

  it('replay the same drops from the same seed, through a save and reload', () => {
    const ids = (drops: { offer: PerkOffer }[]) => drops.map((d) => d.offer.id);
    const a = defaultSave(NOW);
    const b = defaultSave(NOW);
    const whole = ids(play(a, 20_000));
    const first = ids(play(b, 10_000));
    const reloaded = parseSave(serializeSave(b), NOW);
    expect([...first, ...ids(play(reloaded, 10_000))]).toEqual(whole);
    expect(whole.length).toBeGreaterThan(30);
  });
});

describe('surge drops', () => {
  it('come at the end of about one surge in eight, leaning to the rarer tiers', () => {
    const s = veteran(defaultSave(NOW));
    const seen = { common: 0, rare: 0, keystone: 0 };
    let dropped = 0;
    for (let i = 0; i < 80_000; i++) {
      const o = surgeDrop(s, 10);
      if (o) {
        dropped++;
        seen[def(o.id).rarity]++;
      }
      s.perks.offers = [];
    }
    expect(dropped / 80_000).toBeCloseTo(1 / 8, 2);
    expect(seen.common / dropped).toBeCloseTo(0.45, 1);
    expect(seen.rare / dropped).toBeCloseTo(0.45, 1);
    expect(seen.keystone / dropped).toBeCloseTo(0.1, 1);
  });

  it('leave the ordinary drops’ timing alone', () => {
    const s = veteran(defaultSave(NOW));
    s.perks.nextDropAtS = 123;
    for (let i = 0; i < 100; i++) surgeDrop(s, 10);
    expect(s.perks.nextDropAtS).toBe(123);
  });
});

// ---------------------------------------------------------------------------
// Buying
// ---------------------------------------------------------------------------

describe('buying perks', () => {
  it('takes a free slot, charges the price, and records the perk', () => {
    const s = defaultSave(NOW);
    s.energy = 500;
    offer(s, 'metronome', 300);
    expect(buyPerk(s, 'press')).toBe('bought');
    expect(s.energy).toBe(200);
    expect(s.perks.owned).toEqual([{ id: 'metronome', level: 1 }]);
    expect(s.perks.offers).toEqual([]);
    expect(s.perks.codex.metronome).toBe(1);
  });

  it('changes nothing when unaffordable or when nothing is on offer', () => {
    const s = defaultSave(NOW);
    s.energy = 100;
    expect(buyPerk(s, 'press')).toBe('no-offer');
    offer(s, 'metronome', 300);
    expect(buyPerk(s, 'press')).toBe('unaffordable');
    expect(s.energy).toBe(100);
    expect(s.perks.owned).toEqual([]);
  });

  it('upgrades a perk already held, without taking a slot', () => {
    const s = holding(['metronome', 1]);
    s.energy = 1000;
    offer(s, 'metronome');
    expect(buyPerk(s, 'press')).toBe('upgraded');
    expect(s.perks.owned).toEqual([{ id: 'metronome', level: 2 }]);
    expect(s.perks.codex.metronome).toBe(2);
  });

  it('asks which perk to drop when every slot is full, then takes its slot', () => {
    const s = holding(
      ['metronome', 1],
      ['held-breath', 1],
      ['overtone', 1],
      ['momentum', 1],
      ['overtime', 2]
    );
    expect(s.perks.owned).toHaveLength(PERK_SLOTS);
    s.energy = 1000;
    offer(s, 'loaded-dice');
    expect(needsSlot(s, 'press')).toBe(true);
    expect(buyPerk(s, 'press')).toBe('needs-slot');
    expect(buyPerk(s, 'press', 'afterglow')).toBe('needs-slot'); // not held
    expect(s.energy).toBe(1000);
    expect(buyPerk(s, 'press', 'overtone')).toBe('swapped');
    expect(s.perks.owned[2]).toEqual({ id: 'loaded-dice', level: 1 });
    expect(s.perks.owned).toHaveLength(PERK_SLOTS);
  });

  it('swaps a new keystone for the one held, full slots or not', () => {
    const s = holding(['brute-force', 2], ['metronome', 1]);
    s.energy = 1000;
    offer(s, 'autopilot');
    expect(needsSlot(s, 'auto')).toBe(false);
    expect(buyPerk(s, 'auto')).toBe('swapped');
    expect(s.perks.owned).toEqual([
      { id: 'autopilot', level: 1 },
      { id: 'metronome', level: 1 },
    ]);
  });

  it('turns an upgrade on offer for a dropped perk back into a fresh perk', () => {
    const s = holding(['brute-force', 1]);
    s.energy = 10_000;
    offer(s, 'brute-force', 150); // level II at 1.5x a base of 100
    offer(s, 'autopilot', 100);
    buyPerk(s, 'auto');
    expect(offerOn(s, 'press')).toMatchObject({ id: 'brute-force', level: 1, price: 100 });
  });
});

describe('perk offers and the "New" tag', () => {
  it('is news on its tab until the tab is looked at, then again once affordable', () => {
    const s = defaultSave(NOW);
    const tab: ShopTab = 'auto';
    offer(s, 'overtime', 500);
    markShopTabSeen(s, 'press');
    expect(shopTabHasNews(s, tab)).toBe(true);
    markShopTabSeen(s, tab);
    expect(shopTabHasNews(s, tab)).toBe(false);
    s.energy = 500;
    expect(shopTabHasNews(s, tab)).toBe(true);
    markShopTabSeen(s, tab);
    expect(shopTabHasNews(s, tab)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The save
// ---------------------------------------------------------------------------

describe('perks in the save', () => {
  it('start empty, with the first drop not yet drawn', () => {
    const p = defaultSave(NOW).perks;
    expect(p).toMatchObject({ owned: [], offers: [], activeS: 0, nextDropAtS: null, codex: {} });
  });

  it('survive a round trip', () => {
    const s = holding(['metronome', 2], ['autopilot', 1]);
    offer(s, 'overtime');
    s.perks.codex = { metronome: 2, autopilot: 1, overtime: 0, afterglow: 3 };
    expect(parseSave(serializeSave(s), NOW).perks).toEqual(s.perks);
  });

  it('come back fresh from a save made before perks existed', () => {
    const old = JSON.parse(serializeSave(defaultSave(NOW)));
    delete old.perks;
    expect(parseSave(JSON.stringify(old), NOW).perks).toEqual(defaultSave(NOW).perks);
  });

  it('tolerate anything, keeping the slot cap and one keystone', () => {
    const raw = JSON.stringify({
      perks: {
        owned: [
          { id: 'metronome', level: 9 },
          { id: 'nope', level: 1 },
          { id: 'overtone', level: 2 },
          { id: 'overtone', level: 1 },
          { id: 'brute-force', level: 1 },
          { id: 'autopilot', level: 1 },
          { id: 'momentum', level: 1 },
          'junk',
          { id: 'afterglow', level: 1 },
          { id: 'overtime', level: 1 },
          { id: 'bulk-order', level: 1 },
        ],
        offers: [
          { id: 'overtone', level: 1, price: 10, droppedAt: 0, expiresAt: 10 },
          { id: 'momentum', level: 2, price: 10, droppedAt: 0, expiresAt: 10 },
          { id: 'held-breath', level: 1, price: 10, droppedAt: 0, expiresAt: 10 },
          { id: 'bulk-order', level: 1, price: 0, droppedAt: 0, expiresAt: 10 },
          { id: 'critical-load', level: 1, price: 10, droppedAt: 5, expiresAt: 5 },
          { id: 'ghost-presses', level: 1, price: 10, droppedAt: 0, expiresAt: 10, seen: 'yes' },
        ],
        rng: -4,
        activeS: 'lots',
        nextDropAtS: -5,
        codex: { metronome: 7, afterglow: 2, nope: 1 },
      },
    });
    const p = parseSave(raw, NOW).perks;
    expect(p.owned).toEqual([
      { id: 'overtone', level: 2 },
      { id: 'brute-force', level: 1 },
      { id: 'momentum', level: 1 },
      { id: 'afterglow', level: 1 },
      { id: 'overtime', level: 1 },
    ]);
    expect(p.offers.map((o) => o.id)).toEqual(['momentum', 'ghost-presses']);
    expect(p.offers[1]!.seen).toBe(false);
    expect(p.rng).toBe(NOW >>> 0);
    expect(p.activeS).toBe(0);
    expect(p.nextDropAtS).toBeNull();
    expect(p.codex).toEqual({
      afterglow: 2,
      overtone: 2,
      'brute-force': 1,
      momentum: 1,
      overtime: 1,
      'ghost-presses': 0,
    });
  });

  it('clear with the run on prestige, keeping the codex and the generator', () => {
    const s = holding(['metronome', 2]);
    offer(s, 'overtime');
    s.perks.rng = 1234;
    s.perks.activeS = 900;
    s.perks.nextDropAtS = 1100;
    s.perks.codex = { metronome: 2, overtime: 0 };
    const after = prestigeReset(s, 1, NOW).perks;
    expect(after).toEqual({
      owned: [],
      offers: [],
      rng: 1234,
      activeS: 0,
      nextDropAtS: null,
      codex: { metronome: 2, overtime: 0 },
    });
  });
});

describe('modifiers with perks', () => {
  it('are rebuilt when a perk changes level, and cached otherwise', () => {
    const s = holding(['metronome', 1]);
    const one = modsOf(s);
    expect(modsOf(holding(['metronome', 1]))).toBe(one);
    s.perks.owned[0]!.level = 2;
    expect(modsOf(s)).not.toBe(one);
    expect(modsOf(s).combo.tolerance).toBe(0.5);
  });

  it('never touch the shipped rules', () => {
    modsOf(holding(['metronome', 3], ['storm-front', 3], ['night-shift', 3]));
    expect(BASE_MODS.combo).toBe(COMBO);
    expect(COMBO.tolerance).toBe(0.25);
    expect(BASE_MODS.surge.multiplier).toBe(10);
    expect(BASE_MODS.offline.rate).toBe(0.5);
  });
});
