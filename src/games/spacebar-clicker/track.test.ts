import { describe, expect, it } from 'vitest';

import {
  COMBO,
  ISOTOPE_TRACK,
  OFFLINE,
  PERK_DROPS,
  PERK_SLOTS,
  PERKS,
  SURGE,
  TRACK_EFFECT,
  type PerkId,
  type RungId,
} from './config';
import { energyPerPress, reactorIndex } from './economy';
import { modsOf } from './mods';
import {
  buyPerk,
  keystoneSwap,
  needsSlot,
  perkLevel,
  placeOffer,
  rerollOffer,
  rerollsLeft,
  swapChoices,
} from './perks';
import { defaultSave, parseSave, prestigeReset, serializeSave, type SaveState } from './save';
import {
  activeRungs,
  cleanPicks,
  hasRung,
  nextSteps,
  stepsReached,
  unpickedForks,
  type ForkPicks,
} from './track';

const NOW = 1_700_000_000_000;
const def = (id: PerkId) => PERKS.find((p) => p.id === id)!;
const v = (id: PerkId, level = 1) => def(id).values[level - 1]!;

/** A fresh save with this many isotopes and these fork picks. */
function onTrack(isotopes: number, forks: ForkPicks = {}): SaveState {
  const s = defaultSave(NOW);
  s.isotopes = isotopes;
  s.forks = forks;
  return s;
}

/** Hold perks, found in the codex as a real save would have them. */
function hold(s: SaveState, ...perks: [PerkId, number][]): SaveState {
  s.perks.owned = perks.map(([id, level]) => ({ id, level }));
  s.perks.codex = { ...s.perks.codex, ...Object.fromEntries(perks) };
  return s;
}

/** Every fork picked on one side: the first rung, or the second. */
const FIRSTS: ForkPicks = { 3: 'sixth-slot', 6: 'reroll', 9: 'heirloom', 12: 'twin-keystones' };
const SECONDS: ForkPicks = { 3: 'prodigy', 6: 'patience', 9: 'cornerstone', 12: 'enrichment' };

// ---------------------------------------------------------------------------
// The track
// ---------------------------------------------------------------------------

describe('isotope track', () => {
  it('has a step for each isotope from 1 to 12, a fork every third', () => {
    expect(ISOTOPE_TRACK.map((s) => s.isotopes)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    for (const step of ISOTOPE_TRACK) {
      expect(step.rungs.length, `step ${step.isotopes}`).toBe(step.isotopes % 3 === 0 ? 2 : 1);
    }
    const ids = ISOTOPE_TRACK.flatMap((s) => s.rungs.map((r) => r.id));
    expect(new Set(ids).size).toBe(16);
  });

  it('starts a Warm Start run Warming, and leans each find rarer than the last', () => {
    expect(reactorIndex(TRACK_EFFECT.warmStartEnergy)).toBe(1);
    const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
    for (const odds of [PERK_DROPS.odds, TRACK_EFFECT.luckyFindOdds, TRACK_EFFECT.richFindOdds]) {
      expect(sum(odds)).toBeCloseTo(1, 10);
    }
    expect(TRACK_EFFECT.luckyFindOdds.keystone).toBeGreaterThan(PERK_DROPS.odds.keystone);
    expect(TRACK_EFFECT.richFindOdds.keystone).toBeGreaterThan(TRACK_EFFECT.luckyFindOdds.keystone);
    expect(TRACK_EFFECT.richFindOdds.rare).toBeGreaterThan(TRACK_EFFECT.luckyFindOdds.rare);
  });

  it('holds a rung per isotope, and a fork only once picked', () => {
    expect(activeRungs(0, {})).toEqual([]);
    expect(activeRungs(2, {})).toEqual(['warm-start', 'capacitor']);
    expect(activeRungs(5, {})).toEqual(['warm-start', 'capacitor', 'night-lab', 'lucky-find']);
    expect(activeRungs(5, { 3: 'prodigy' })).toContain('prodigy');
    expect(activeRungs(2, { 3: 'prodigy' }), 'a pick past the isotopes held').not.toContain(
      'prodigy'
    );
    expect(activeRungs(12, FIRSTS)).toHaveLength(12);
    expect(hasRung(onTrack(4, {}), 'night-lab')).toBe(true);
  });

  it('keeps only picks that belong to their fork', () => {
    expect(cleanPicks({ 3: 'prodigy', 6: 'prodigy', 4: 'night-lab', 9: 'nope', x: 1 })).toEqual({
      3: 'prodigy',
    });
    expect(cleanPicks(null)).toEqual({});
    expect(cleanPicks(['sixth-slot'])).toEqual({});
  });

  it('knows what a reset reaches, which forks need a pick, and what comes next', () => {
    expect(stepsReached(0, 1).map((s) => s.isotopes)).toEqual([1]);
    expect(stepsReached(2, 6).map((s) => s.isotopes)).toEqual([3, 4, 5, 6]);
    expect(unpickedForks(6, { 3: 'sixth-slot' }).map((s) => s.isotopes)).toEqual([6]);
    expect(unpickedForks(2, {})).toEqual([]);
    expect(nextSteps(0).map((s) => s.isotopes)).toEqual([1, 2]);
    expect(nextSteps(11).map((s) => s.isotopes)).toEqual([12]);
    expect(nextSteps(12)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The rungs
// ---------------------------------------------------------------------------

describe('track rungs', () => {
  it('leave the game as it was with no isotopes', () => {
    expect(modsOf(onTrack(0, FIRSTS))).toEqual(modsOf(defaultSave(NOW)));
  });

  it('Warm Start and Hot Start give a reset run its head start', () => {
    const first = prestigeReset(onTrack(0), 1, NOW);
    expect(first.energy).toBe(TRACK_EFFECT.warmStartEnergy);
    expect(first.runLifetime).toBe(TRACK_EFFECT.warmStartEnergy);
    expect(first.tappers.assistant).toBe(1);
    expect(first.upgrades.finger).toBe(0);

    const eighth = prestigeReset(onTrack(7), 1, NOW);
    expect(eighth.upgrades.finger).toBe(TRACK_EFFECT.hotStartFinger);
    expect(eighth.tappers).toMatchObject({ assistant: 1, pneumatic: 1 });
    expect(eighth.revealed).toContain('pneumatic');

    // With no isotopes there is no reset; and a full reset wipes the track.
    expect(defaultSave(NOW).energy).toBe(0);
  });

  it('Capacitor adds a second to a surge, on top of Surge Lines', () => {
    expect(modsOf(onTrack(2)).surge.durationS).toBe(SURGE.durationS + TRACK_EFFECT.capacitorS);
    const lines = hold(onTrack(2), ['surge-lines', 2]);
    expect(modsOf(lines).surge.durationS).toBe(v('surge-lines', 2) + TRACK_EFFECT.capacitorS);
  });

  it('Sixth Slot holds a sixth perk', () => {
    const s = hold(
      onTrack(3, { 3: 'sixth-slot' }),
      ['metronome', 1],
      ['held-breath', 1],
      ['overtone', 1],
      ['momentum', 1],
      ['finger-memory', 1]
    );
    expect(modsOf(s).perkSlots).toBe(TRACK_EFFECT.sixthSlotSlots);
    s.energy = 1000;
    placeOffer(s, def('loaded-dice'), 1);
    expect(needsSlot(s, 'press')).toBe(false);
    expect(buyPerk(s, 'press')).toBe('bought');
    expect(s.perks.owned).toHaveLength(6);

    placeOffer(s, def('afterglow'), 1);
    expect(needsSlot(s, 'press'), 'six is the most').toBe(true);
    expect(swapChoices(s, 'press')).toHaveLength(6);
  });

  it('Prodigy drops a perk not held at level II for the level I price', () => {
    const plain = onTrack(3);
    const prodigy = onTrack(3, { 3: 'prodigy' });
    const a = placeOffer(plain, def('metronome'), 10);
    const b = placeOffer(prodigy, def('metronome'), 10);
    expect(a.level).toBe(1);
    expect(b.level).toBe(TRACK_EFFECT.prodigyLevel);
    expect(b.price).toBe(a.price);

    prodigy.energy = 1e6;
    expect(buyPerk(prodigy, 'press')).toBe('bought');
    expect(perkLevel(prodigy, 'metronome')).toBe(2);
    const up = placeOffer(prodigy, def('metronome'), 10);
    expect(up.level, 'and can still go to III').toBe(3);

    // The save keeps a level II offer only for a run that has Prodigy.
    const offered = onTrack(3, { 3: 'prodigy' });
    placeOffer(offered, def('afterglow'), 10);
    expect(parseSave(serializeSave(offered), NOW).perks.offers).toHaveLength(1);
    offered.forks = {};
    expect(parseSave(serializeSave(offered), NOW).perks.offers).toHaveLength(0);
  });

  it('turns an orphaned upgrade back into a fresh perk at the fresh level', () => {
    const s = hold(
      onTrack(3, { 3: 'prodigy' }),
      ['metronome', 2],
      ['held-breath', 1],
      ['overtone', 1],
      ['momentum', 1],
      ['finger-memory', 1]
    );
    s.energy = 1e6;
    placeOffer(s, def('metronome'), 10); // level III, upgrade price
    placeOffer(s, def('overtime'), 10); // auto tab, a new perk
    expect(buyPerk(s, 'auto', 'metronome')).toBe('swapped');
    const orphan = s.perks.offers.find((o) => o.id === 'metronome')!;
    expect(orphan.level).toBe(TRACK_EFFECT.prodigyLevel);
  });

  it('Night Lab pays more for time away, and Night Shift still wins', () => {
    const lab = modsOf(onTrack(4)).offline;
    expect(lab.rate).toBe(TRACK_EFFECT.nightLabRate);
    expect(lab.capS).toBe(TRACK_EFFECT.nightLabCapS);
    expect(modsOf(onTrack(3)).offline).toEqual(OFFLINE);
    const shift = modsOf(hold(onTrack(4), ['night-shift', 1])).offline;
    expect(shift.capS).toBe(v('night-shift', 1) * 3600);
    expect(shift.rate).toBe(1);
  });

  it('Lucky Find then Rich Find lean ordinary drops rarer', () => {
    expect(modsOf(onTrack(4)).dropOdds).toEqual(PERK_DROPS.odds);
    expect(modsOf(onTrack(5)).dropOdds).toEqual(TRACK_EFFECT.luckyFindOdds);
    expect(modsOf(onTrack(10, FIRSTS)).dropOdds).toEqual(TRACK_EFFECT.richFindOdds);
  });

  it('Reroll swaps an offer once a run, for another perk on the same tab', () => {
    const s = onTrack(6, { 6: 'reroll' });
    placeOffer(s, def('metronome'), 10);
    expect(rerollsLeft(s)).toBe(1);
    const fresh = rerollOffer(s, 'press', 10)!;
    expect(fresh.id).not.toBe('metronome');
    expect(def(fresh.id).tab).toBe('press');
    expect(s.perks.offers).toEqual([fresh]);
    expect(rerollsLeft(s)).toBe(0);
    expect(rerollOffer(s, 'press', 10), 'once a run').toBeNull();

    const reset = prestigeReset(s, 0, NOW);
    expect(rerollsLeft(reset), 'a new run, a new reroll').toBe(1);

    const without = onTrack(6, { 6: 'patience' });
    placeOffer(without, def('metronome'), 10);
    expect(rerollOffer(without, 'press', 10)).toBeNull();
    expect(without.perks.offers.map((o) => o.id)).toEqual(['metronome']);
  });

  it('a reroll with nothing else to draw keeps the offer and the reroll', () => {
    const s = onTrack(6, { 6: 'reroll' });
    // Every Upgrades perk but one at the top level: nothing else can drop there.
    s.perks.owned = PERKS.filter((p) => p.tab === 'press' && p.id !== 'metronome').map((p) => ({
      id: p.id,
      level: 3,
    }));
    placeOffer(s, def('metronome'), 10);
    expect(rerollOffer(s, 'press', 10)).toBeNull();
    expect(s.perks.offers.map((o) => o.id)).toEqual(['metronome']);
    expect(rerollsLeft(s)).toBe(1);
  });

  it('Patience doubles how long an offer stays', () => {
    const span = (s: SaveState) => {
      const o = placeOffer(s, def('metronome'), 10);
      return o.expiresAt - o.droppedAt;
    };
    expect(span(onTrack(6, { 6: 'patience' }))).toBe(
      span(onTrack(6, { 6: 'reroll' })) * TRACK_EFFECT.patienceWindowMult
    );
  });

  it('Familiar takes a quarter off a perk held before, not one only seen', () => {
    const price = (isotopes: number, codexLevel: number) => {
      const s = onTrack(isotopes);
      s.perks.codex = { metronome: codexLevel };
      return placeOffer(s, def('metronome'), 100).price;
    };
    expect(price(7, 1)).toBe(Math.round(price(6, 1) * (1 - TRACK_EFFECT.familiarDiscount)));
    expect(price(7, 0), 'found, never held').toBe(price(6, 0));
  });

  it('Heirloom keeps a perk that is not a keystone, at level I', () => {
    const s = hold(onTrack(9, { 9: 'heirloom' }), ['overtone', 3], ['brute-force', 2]);
    expect(prestigeReset(s, 1, NOW, { keep: 'overtone' }).perks.owned).toEqual([
      { id: 'overtone', level: 1 },
    ]);
    expect(prestigeReset(s, 1, NOW, { keep: 'brute-force' }).perks.owned).toEqual([]);
    expect(prestigeReset(s, 1, NOW, { keep: 'metronome' }).perks.owned, 'not held').toEqual([]);
  });

  it('Cornerstone keeps the keystone instead, at level I', () => {
    const s = hold(onTrack(9, { 9: 'cornerstone' }), ['overtone', 3], ['brute-force', 2]);
    expect(prestigeReset(s, 1, NOW, { keep: 'brute-force' }).perks.owned).toEqual([
      { id: 'brute-force', level: 1 },
    ]);
    expect(prestigeReset(s, 1, NOW, { keep: 'overtone' }).perks.owned).toEqual([]);
  });

  it('keeps nothing without a keeping rung', () => {
    const s = hold(onTrack(8), ['overtone', 3]);
    expect(prestigeReset(s, 0, NOW, { keep: 'overtone' }).perks.owned).toEqual([]);
  });

  it('a reset that reaches a fork can pick it, and a keeping rung acts at once', () => {
    const s = hold(onTrack(8), ['overtone', 2]);
    const after = prestigeReset(s, 1, NOW, { forks: { 9: 'heirloom' }, keep: 'overtone' });
    expect(after.forks).toEqual({ 9: 'heirloom' });
    expect(after.perks.owned).toEqual([{ id: 'overtone', level: 1 }]);
    const later = prestigeReset(after, 1, NOW, { forks: { 9: 'cornerstone', 4: 'night-lab' } });
    expect(later.forks, 'picks change at a reset; junk is dropped').toEqual({ 9: 'cornerstone' });
  });

  it('Perfect Pitch widens the rhythm window, and Metronome still wins', () => {
    expect(modsOf(onTrack(10, FIRSTS)).combo.tolerance).toBe(COMBO.tolerance);
    expect(modsOf(onTrack(11, FIRSTS)).combo.tolerance).toBe(TRACK_EFFECT.perfectPitchTolerance);
    expect(modsOf(hold(onTrack(11, FIRSTS), ['metronome', 1])).combo.tolerance).toBe(
      v('metronome', 1)
    );
  });

  it('Twin Keystones holds two keystones, and a third asks which to replace', () => {
    const s = hold(onTrack(12, FIRSTS), ['brute-force', 1], ['overtone', 1]);
    s.energy = 1e6;
    placeOffer(s, def('autopilot'), 10);
    expect(keystoneSwap(s, 'auto'), 'a second keystone takes a slot').toBeNull();
    expect(needsSlot(s, 'auto')).toBe(false);
    expect(buyPerk(s, 'auto')).toBe('bought');
    expect(s.perks.owned.map((o) => o.id)).toEqual(['brute-force', 'overtone', 'autopilot']);

    placeOffer(s, def('storm-front'), 10);
    expect(keystoneSwap(s, 'press')).toBeNull();
    expect(swapChoices(s, 'press')).toEqual(['brute-force', 'autopilot']);
    expect(buyPerk(s, 'press'), 'without a name').toBe('needs-slot');
    expect(buyPerk(s, 'press', 'overtone'), 'not a keystone').toBe('needs-slot');
    expect(buyPerk(s, 'press', 'autopilot')).toBe('swapped');
    expect(s.perks.owned.map((o) => o.id)).toEqual(['brute-force', 'overtone', 'storm-front']);

    // The save keeps two keystones only with the rung.
    expect(parseSave(serializeSave(s), NOW).perks.owned).toHaveLength(3);
    s.forks = { ...FIRSTS, 12: 'enrichment' };
    expect(parseSave(serializeSave(s), NOW).perks.owned.map((o) => o.id)).toEqual([
      'brute-force',
      'overtone',
    ]);
  });

  it('without Twin Keystones a new keystone still swaps the one held', () => {
    const s = hold(onTrack(12, SECONDS), ['brute-force', 1]);
    s.energy = 1e6;
    placeOffer(s, def('autopilot'), 10);
    expect(keystoneSwap(s, 'auto')).toBe('brute-force');
    expect(buyPerk(s, 'auto')).toBe('swapped');
  });

  it('Enrichment makes each isotope worth 15% instead of 10%', () => {
    const plain = energyPerPress(onTrack(12, FIRSTS));
    const enriched = energyPerPress(onTrack(12, SECONDS));
    const rate = (r: number) => 1 + 12 * r;
    expect(enriched / plain).toBeCloseTo(rate(TRACK_EFFECT.enrichmentRate) / rate(0.1), 10);
  });
});

// ---------------------------------------------------------------------------
// The save
// ---------------------------------------------------------------------------

describe('track in the save', () => {
  it('round-trips the picks and the run’s rerolls, and drops junk', () => {
    const s = onTrack(6, { 3: 'prodigy', 6: 'reroll' });
    s.perks.rerollsUsed = 1;
    const back = parseSave(serializeSave(s), NOW);
    expect(back.forks).toEqual({ 3: 'prodigy', 6: 'reroll' });
    expect(back.perks.rerollsUsed).toBe(1);

    const junk = JSON.parse(serializeSave(s));
    junk.forks = { 3: 'enrichment', 6: 7, banana: 'reroll' };
    junk.perks.rerollsUsed = -4;
    const cleaned = parseSave(JSON.stringify(junk), NOW);
    expect(cleaned.forks).toEqual({});
    expect(cleaned.perks.rerollsUsed).toBe(0);
  });

  it('reads an old save, with no track, as having no picks', () => {
    const old = JSON.parse(serializeSave(onTrack(4)));
    delete old.forks;
    delete old.perks.rerollsUsed;
    const back = parseSave(JSON.stringify(old), NOW);
    expect(back.forks).toEqual({});
    expect(back.perks.rerollsUsed).toBe(0);
    expect(modsOf(back).perkSlots).toBe(PERK_SLOTS);
  });

  it('rebuilds the modifiers when the picks change', () => {
    const s = onTrack(3, { 3: 'sixth-slot' });
    expect(modsOf(s).perkSlots).toBe(6);
    s.forks = { 3: 'prodigy' };
    expect(modsOf(s).perkSlots).toBe(PERK_SLOTS);
    expect(modsOf(s).freshLevel).toBe(2);
  });
});

/** Every rung has a test above: keep this list in step with the track. */
const COVERED: RungId[] = [
  'warm-start',
  'capacitor',
  'sixth-slot',
  'prodigy',
  'night-lab',
  'lucky-find',
  'reroll',
  'patience',
  'familiar',
  'hot-start',
  'heirloom',
  'cornerstone',
  'rich-find',
  'perfect-pitch',
  'twin-keystones',
  'enrichment',
];

it('covers every rung on the track', () => {
  expect(new Set(COVERED)).toEqual(new Set(ISOTOPE_TRACK.flatMap((s) => s.rungs.map((r) => r.id))));
});
