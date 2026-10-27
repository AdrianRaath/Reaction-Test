/**
 * Spacebar Clicker — perks: drops, offers and buying (SPACEBAR-CLICKER.md §8.1).
 *
 * Pure functions over a SaveState, like the economy. The rules:
 *
 * - Drops are random in time, like rune drops in Diablo II. Each gap is drawn
 *   fresh from an exponential distribution over seconds of active play
 *   (PERK_DROPS.meanGapS), so a drop can come seconds after the last or many
 *   minutes after it, and can't be timed. A hidden ceiling (maxGapS) is the
 *   only protection against a long dry spell.
 * - Surges are the boss fights: each ends with a chance of a bonus drop,
 *   weighted toward the rarer tiers (`surgeDrop`).
 * - A drop picks a tier by its odds, then a perk in that tier, for a tab with
 *   no live offer. A perk already owned can drop again as an upgrade; one at
 *   the top level can't. A drop due while both tabs hold offers is lost, not
 *   held: holding it would make the next drop predictable.
 * - A player's very first run gets one guaranteed drop, a common, at a random
 *   moment early on. Nothing else is guaranteed.
 * - Price and window are in seconds of income at the moment of the drop,
 *   because energy grows too fast for fixed amounts to mean anything for
 *   long. An upgrade costs PERK_UPGRADE_SCALE times more per level held.
 * - An offer leaves once the run has earned past its window. Energy collected
 *   for time away doesn't count: `deferPerks` moves the offers past it.
 * - Five slots, one keystone at a time. A new keystone swaps the old one; a new
 *   perk with every slot full needs one named to drop.
 * - The isotope track (track.ts) bends some of this through the run's
 *   modifiers: odds, a fresh perk's level, prices, windows, slots, keystones,
 *   and a reroll.
 *
 * Randomness comes from the seed in the save (rng.ts), so reloading the page
 * replays the same drops instead of rerolling them.
 */

import {
  PERK_DROPS,
  PERK_MAX_LEVEL,
  PERK_UPGRADE_SCALE,
  PERKS,
  type AutoTapperId,
  type PerkDef,
  type PerkId,
  type PerkRarity,
  type PerkUnit,
  type ShopTab,
} from './config';
import { bestTapper, offerOn, perk } from './economy';
import { modsOf } from './mods';
import { nextRandom } from './rng';
import type { PerkOffer, PerkState, SaveState } from './save';
import { hasRung } from './track';

const TABS: readonly ShopTab[] = ['press', 'auto'];
const TIERS: readonly PerkRarity[] = ['common', 'rare', 'keystone'];

/** The level a perk is held at this run; 0 if not held. */
export function perkLevel(state: SaveState, id: PerkId): number {
  return state.perks.owned.find((o) => o.id === id)?.level ?? 0;
}

/** How many times the base price an offer costs with `held` levels already held. */
export function upgradeFactor(held: number): number {
  return Math.pow(PERK_UPGRADE_SCALE, held);
}

// --- Text -----------------------------------------------------------------------

export function formatPerkValue(unit: PerkUnit, v: number): string {
  const n = (x: number) => String(+x.toFixed(2));
  switch (unit) {
    case 'percent':
      return `${n(v * 100)}%`;
    case 'times':
      return `x${n(v)}`;
    case 'seconds':
      return `${n(v)} s`;
    case 'hours':
      return `${n(v)} h`;
    case 'plain':
      return n(v);
  }
}

/** What a perk does at one level: "Rhythm tolerance widens from 25% to 50%". */
export function perkDetail(def: PerkDef, level: number): string {
  return def.detail.replace('{v}', formatPerkValue(def.unit, def.values[level - 1]!));
}

/** What a perk does at every level: "... from 25% to 40% / 50% / 60%". */
export function perkDetailAllLevels(def: PerkDef): string {
  const all = def.values.map((v) => formatPerkValue(def.unit, v)).join(' / ');
  return def.detail.replace('{v}', all);
}

// --- Drops ----------------------------------------------------------------------

/** How much of an offer's window is left, 1 at the drop and 0 as it leaves. */
export function offerRemaining(state: SaveState, offer: PerkOffer): number {
  const span = offer.expiresAt - offer.droppedAt;
  return Math.min(1, Math.max(0, (offer.expiresAt - state.runLifetime) / span));
}

function draw(perks: PerkState): number {
  const d = nextRandom(perks.rng);
  perks.rng = d.seed;
  return d.value;
}

/** Seconds of active play to the next drop: exponential, under the ceiling. */
function nextGap(perks: PerkState): number {
  return Math.min(-Math.log(1 - draw(perks)) * PERK_DROPS.meanGapS, PERK_DROPS.maxGapS);
}

/** A player's very first run: nothing has ever dropped. */
function firstEver(state: SaveState): boolean {
  return Object.keys(state.perks.codex).length === 0;
}

interface DropOptions {
  /** A player's first drop ever: commons, while any are left. */
  commonOnly?: boolean;
  /** One tab only, leaving one perk out: a reroll. */
  only?: { tab: ShopTab; not: PerkId };
  /**
   * The run's own odds, which Lucky Find and Rich Find lean: mark the offer
   * `lifted` when the same roll at the usual odds lands a tier lower.
   */
  credit?: boolean;
}

/** The tier a roll in [0, 1) lands on, among `tiers`, at these odds. */
function tierAt(
  roll: number,
  tiers: readonly PerkRarity[],
  odds: Readonly<Record<PerkRarity, number>>
): PerkRarity {
  let pick = roll * tiers.reduce((sum, t) => sum + odds[t], 0);
  return tiers.find((t) => (pick -= odds[t]) < 0) ?? tiers[tiers.length - 1]!;
}

/**
 * Put a perk on offer in a tab with no live one: a tier by its odds (among
 * tiers with anything left to drop), then a perk in that tier. Null when both
 * tabs are taken or nothing is left.
 */
function dropPerk(
  state: SaveState,
  income: number,
  odds: Readonly<Record<PerkRarity, number>>,
  { commonOnly = false, only, credit = false }: DropOptions = {}
): PerkOffer | null {
  const perks = state.perks;
  const open = only ? [only.tab] : TABS.filter((tab) => !offerOn(state, tab));
  const available = PERKS.filter(
    (def) =>
      open.includes(def.tab) && def.id !== only?.not && perkLevel(state, def.id) < PERK_MAX_LEVEL
  );
  const commons = available.filter((def) => def.rarity === 'common');
  const pool = commonOnly && commons.length > 0 ? commons : available;
  if (pool.length === 0) return null;

  const tiers = TIERS.filter((t) => pool.some((def) => def.rarity === t));
  const roll = draw(perks);
  const tier = tierAt(roll, tiers, odds);
  const inTier = pool.filter((def) => def.rarity === tier);
  const def = inTier[Math.floor(draw(perks) * inTier.length)]!;
  const offer = placeOffer(state, def, income);
  const usual = tierAt(roll, tiers, PERK_DROPS.odds);
  if (credit && TIERS.indexOf(tier) > TIERS.indexOf(usual)) offer.lifted = true;
  return offer;
}

/**
 * Put one perk on offer, priced and timed in seconds of `income`, as a drop
 * does once it has picked the perk. The pacing simulation calls it directly
 * to stage a build's perfect run.
 */
export function placeOffer(state: SaveState, def: PerkDef, income: number): PerkOffer {
  const mods = modsOf(state);
  const pace = Math.max(income, PERK_DROPS.minIncome);
  const held = perkLevel(state, def.id);
  // Familiar: a perk held before, in any run, costs less.
  const familiar = (state.perks.codex[def.id] ?? 0) > 0 ? 1 - mods.familiarDiscount : 1;
  const base = PERK_DROPS.priceS[def.rarity] * pace * familiar;
  const offer: PerkOffer = {
    id: def.id,
    // Prodigy: a perk not held drops at level II, still at the level I price.
    level: held > 0 ? held + 1 : mods.freshLevel,
    price: Math.max(1, Math.round(base * upgradeFactor(held))),
    droppedAt: state.runLifetime,
    expiresAt: state.runLifetime + PERK_DROPS.windowS[def.rarity] * pace * mods.offerWindowMult,
    seen: false,
    seenAffordable: false,
  };
  state.perks.offers.push(offer);
  state.perks.codex[def.id] ??= 0;
  return offer;
}

export interface PerkEvents {
  dropped: PerkOffer[];
  expired: PerkOffer[];
}

/**
 * Advance the drops: retire offers whose window has passed, add `activeDt`
 * seconds of active play (page visible, a press within the last minute, as
 * for surges), and drop a perk if its moment has come. Call it every frame.
 * `income` is energy per second actually being earned (income.ts); it prices
 * any drop.
 */
export function perkTick(state: SaveState, income: number, activeDt: number): PerkEvents {
  const perks = state.perks;
  const events: PerkEvents = { dropped: [], expired: [] };

  perks.offers = perks.offers.filter((offer) => {
    if (state.runLifetime < offer.expiresAt) return true;
    events.expired.push(offer);
    return false;
  });

  perks.activeS += Math.max(0, activeDt);
  if (perks.nextDropAtS === null) {
    const [lo, hi] = PERK_DROPS.firstEverS;
    perks.nextDropAtS =
      perks.activeS + (firstEver(state) ? lo + draw(perks) * (hi - lo) : nextGap(perks));
  }
  if (perks.activeS < perks.nextDropAtS) return events;

  const offer = dropPerk(state, income, modsOf(state).dropOdds, {
    commonOnly: firstEver(state),
    credit: true,
  });
  perks.nextDropAtS = perks.activeS + nextGap(perks);
  if (offer) events.dropped.push(offer);
  return events;
}

/**
 * Surges are the boss fights: call this as a surge ends. It drops a bonus perk
 * at PERK_DROPS.surgeChance, on the surge's own tier odds, and leaves the
 * ordinary drops' timing alone.
 */
export function surgeDrop(state: SaveState, income: number): PerkOffer | null {
  if (draw(state.perks) >= PERK_DROPS.surgeChance) return null;
  return dropPerk(state, income, PERK_DROPS.surgeOdds);
}

/**
 * Energy credited for time away (or a silent short gap) moves every offer's
 * window past itself, so being away never runs an offer down. Call after
 * crediting it. Drops need active play, so being away never brings one.
 */
export function deferPerks(state: SaveState, amount: number): void {
  if (!(amount > 0)) return;
  for (const offer of state.perks.offers) {
    offer.droppedAt += amount;
    offer.expiresAt += amount;
  }
}

// --- Buying ---------------------------------------------------------------------

export type BuyPerkResult =
  'bought' | 'upgraded' | 'swapped' | 'needs-slot' | 'unaffordable' | 'no-offer';

/** The keystones held this run, in slot order. */
function keystonesHeld(state: SaveState): PerkId[] {
  return state.perks.owned.filter((o) => perk(o.id).rarity === 'keystone').map((o) => o.id);
}

/** The tab's offer, when it is a perk not held: a buy that needs a slot. */
function newPerkOn(state: SaveState, tab: ShopTab): PerkOffer | null {
  const offer = offerOn(state, tab);
  return offer && perkLevel(state, offer.id) === 0 ? offer : null;
}

/** True when a new keystone on the tab would pass the run's keystone limit. */
function overKeystones(state: SaveState, offer: PerkOffer): boolean {
  return (
    perk(offer.id).rarity === 'keystone' &&
    keystonesHeld(state).length >= modsOf(state).keystoneSlots
  );
}

/**
 * The perks a buy of the tab's offer needs the player to name one of, to drop:
 * every perk held when the slots are full, or the keystones held when a new
 * keystone would pass a limit of two (Twin Keystones). Empty when nothing
 * needs naming, including a lone keystone's swap, which keystoneSwap covers.
 */
export function swapChoices(state: SaveState, tab: ShopTab): PerkId[] {
  const offer = newPerkOn(state, tab);
  if (!offer) return [];
  if (overKeystones(state, offer)) {
    return modsOf(state).keystoneSlots > 1 ? keystonesHeld(state) : [];
  }
  return state.perks.owned.length >= modsOf(state).perkSlots
    ? state.perks.owned.map((o) => o.id)
    : [];
}

/** True when buying the tab's offer needs a perk named to drop. */
export function needsSlot(state: SaveState, tab: ShopTab): boolean {
  return swapChoices(state, tab).length > 0;
}

/**
 * The keystone that buying the tab's offer would swap out: the offer is a new
 * keystone and the run holds as many as it may, which is one. Null otherwise.
 * The shop asks first.
 */
export function keystoneSwap(state: SaveState, tab: ShopTab): PerkId | null {
  const offer = newPerkOn(state, tab);
  if (!offer || !overKeystones(state, offer) || modsOf(state).keystoneSlots > 1) return null;
  return keystonesHeld(state)[0] ?? null;
}

/**
 * Buy the offer on a tab. An owned perk goes up a level; a new keystone past
 * the limit swaps out the one held, or the one named in `replace` when there
 * are two; any other new perk takes a free slot, or the slot of `replace`
 * when all are full. Changes nothing unless it succeeds.
 */
export function buyPerk(state: SaveState, tab: ShopTab, replace?: PerkId): BuyPerkResult {
  const perks = state.perks;
  const offer = offerOn(state, tab);
  if (!offer) return 'no-offer';
  if (state.energy < offer.price) return 'unaffordable';

  const mods = modsOf(state);
  const owned = perks.owned.find((o) => o.id === offer.id);
  let result: BuyPerkResult;
  let dropped: PerkId | null = null;
  if (owned) {
    owned.level = offer.level;
    result = 'upgraded';
  } else {
    const slot = { id: offer.id, level: offer.level };
    const keystones = keystonesHeld(state);
    const swapOut = overKeystones(state, offer)
      ? mods.keystoneSlots > 1
        ? keystones.find((id) => id === replace)
        : keystones[0]
      : perks.owned.length < mods.perkSlots
        ? null
        : replace;
    const at =
      swapOut === null ? perks.owned.length : perks.owned.findIndex((o) => o.id === swapOut);
    if (at < 0) return 'needs-slot';
    dropped = perks.owned[at]?.id ?? null;
    perks.owned[at] = slot;
    result = dropped ? 'swapped' : 'bought';
  }

  state.energy -= offer.price;
  perks.offers = perks.offers.filter((o) => o !== offer);
  perks.codex[offer.id] = Math.max(perks.codex[offer.id] ?? 0, offer.level);
  // An upgrade on offer for the perk just dropped becomes a fresh perk again,
  // at a fresh perk's level and price.
  const orphan = dropped && perks.offers.find((o) => o.id === dropped);
  if (orphan) {
    orphan.price = Math.max(1, Math.round(orphan.price / upgradeFactor(orphan.level - 1)));
    orphan.level = mods.freshLevel;
  }
  return result;
}

// --- Reroll (the isotope track) ---------------------------------------------------

/** Rerolls this run still has: none without the Reroll rung. */
export function rerollsLeft(state: SaveState): number {
  return Math.max(0, modsOf(state).rerolls - state.perks.rerollsUsed);
}

/**
 * Reroll: swap the tab's offer for a fresh drop on the run's odds, priced and
 * timed at `income` now, never the perk it replaces. Uses a reroll only when a
 * new perk comes; with none left, or nothing else to draw, it changes nothing
 * and returns null.
 */
export function rerollOffer(state: SaveState, tab: ShopTab, income: number): PerkOffer | null {
  const old = offerOn(state, tab);
  if (!old || rerollsLeft(state) <= 0) return null;
  const perks = state.perks;
  const others = perks.offers.filter((o) => o !== old);
  perks.offers = others;
  const offer = dropPerk(state, income, modsOf(state).dropOdds, {
    only: { tab, not: old.id },
    credit: true,
  });
  if (!offer) {
    perks.offers = [...others, old];
    return null;
  }
  perks.rerollsUsed += 1;
  return offer;
}

// --- Credits (the isotope track) ---------------------------------------------------

/** Rungs that shape an offer, which the shop credits on its row. */
export type OfferCredit = 'prodigy' | 'lucky-find' | 'rich-find' | 'patience' | 'familiar';

/**
 * What the isotope track did for this offer, for the shop to credit where it
 * acts: Prodigy dropped a perk not held at its higher level; Lucky Find or
 * Rich Find raised its tier; Patience is keeping it past the window it would
 * otherwise have had; Familiar took its discount off the price.
 */
export function offerCredits(state: SaveState, offer: PerkOffer): OfferCredit[] {
  const mods = modsOf(state);
  const credits: OfferCredit[] = [];
  if (perkLevel(state, offer.id) === 0 && offer.level > 1) credits.push('prodigy');
  if (offer.lifted) credits.push(hasRung(state, 'rich-find') ? 'rich-find' : 'lucky-find');
  const usualEnd = offer.droppedAt + (offer.expiresAt - offer.droppedAt) / mods.offerWindowMult;
  if (mods.offerWindowMult > 1 && state.runLifetime >= usualEnd) credits.push('patience');
  if (mods.familiarDiscount > 0 && (state.perks.codex[offer.id] ?? 0) > 0) {
    credits.push('familiar');
  }
  return credits;
}

/** Self-Replicator: a free copy of the best auto-tapper owned. */
export function replicate(state: SaveState): AutoTapperId | null {
  const id = bestTapper(state);
  if (id) state.tappers[id] += 1;
  return id;
}
