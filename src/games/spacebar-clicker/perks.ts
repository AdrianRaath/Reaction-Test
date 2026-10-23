/**
 * Spacebar Clicker — perks: drops, offers and buying (SPACEBAR-CLICKER.md §8.1).
 *
 * Pure functions over a SaveState, like the economy. The rules:
 *
 * - Rolls come on a schedule in the run's energy, every PERK_DROPS.rollEveryS
 *   seconds of income, and whenever the reactor reaches a new state. A run's
 *   first roll always drops, and a common, so every run meets the system
 *   early. After that a roll drops at baseChance, plus pityStep for each miss
 *   in a row.
 * - A drop goes to a tab with no live offer, weighted by rarity. A perk
 *   already owned can drop again as an upgrade; one at the top level can't.
 * - Price and window are in seconds of income at the moment of the drop,
 *   because energy grows too fast for fixed amounts to mean anything for
 *   long. An upgrade costs PERK_UPGRADE_SCALE times more per level held.
 * - An offer leaves once the run has earned past its window. Energy collected
 *   for time away doesn't count: `deferPerks` moves the offers and the roll
 *   schedule past it.
 * - Five slots, one keystone at a time. A new keystone swaps the old one; a new
 *   perk with every slot full needs one named to drop.
 *
 * Randomness comes from the seed in the save (rng.ts), so reloading the page
 * replays the same drops instead of rerolling them.
 */

import {
  PERK_DROPS,
  PERK_MAX_LEVEL,
  PERK_SLOTS,
  PERK_UPGRADE_SCALE,
  PERKS,
  type AutoTapperId,
  type PerkDef,
  type PerkId,
  type PerkUnit,
  type ShopTab,
} from './config';
import { cheapestTapper, offerOn, perk, reactorIndex } from './economy';
import { nextRandom } from './rng';
import type { PerkOffer, PerkState, SaveState } from './save';

const TABS: readonly ShopTab[] = ['press', 'auto'];

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

/** One roll. Returns the offer it dropped, if any. */
function roll(state: SaveState, income: number): PerkOffer | null {
  const perks = state.perks;
  const open = TABS.filter((tab) => !offerOn(state, tab));
  const first = perks.drops === 0;
  const pool = PERKS.filter(
    (def) =>
      open.includes(def.tab) &&
      perkLevel(state, def.id) < PERK_MAX_LEVEL &&
      (!first || def.rarity === 'common')
  );
  // Nowhere to put a drop isn't a miss: the pity odds don't climb for it.
  if (pool.length === 0) return null;

  const chance = first
    ? 1
    : Math.min(1, PERK_DROPS.baseChance + PERK_DROPS.pityStep * perks.misses);
  if (draw(perks) >= chance) {
    perks.misses++;
    return null;
  }

  const total = pool.reduce((sum, def) => sum + PERK_DROPS.weight[def.rarity], 0);
  let pick = draw(perks) * total;
  let def = pool[pool.length - 1]!;
  for (const candidate of pool) {
    pick -= PERK_DROPS.weight[candidate.rarity];
    if (pick < 0) {
      def = candidate;
      break;
    }
  }

  const held = perkLevel(state, def.id);
  const offer: PerkOffer = {
    id: def.id,
    level: held + 1,
    price: Math.max(1, Math.round(PERK_DROPS.priceS[def.rarity] * income * upgradeFactor(held))),
    droppedAt: state.runLifetime,
    expiresAt: state.runLifetime + PERK_DROPS.windowS[def.rarity] * income,
    seen: false,
    seenAffordable: false,
  };
  perks.offers.push(offer);
  perks.drops++;
  perks.misses = 0;
  perks.codex[def.id] ??= 0;
  return offer;
}

export interface PerkEvents {
  dropped: PerkOffer[];
  expired: PerkOffer[];
}

/**
 * Advance the drops: retire offers whose window has passed, then roll if the
 * schedule has come round or the reactor has reached a new state. Call it as
 * the run earns. `income` is energy per second actually being earned
 * (income.ts); it prices any drop.
 */
export function perkTick(state: SaveState, income: number): PerkEvents {
  const perks = state.perks;
  const events: PerkEvents = { dropped: [], expired: [] };

  perks.offers = perks.offers.filter((offer) => {
    if (state.runLifetime < offer.expiresAt) return true;
    events.expired.push(offer);
    return false;
  });

  const stage = reactorIndex(state.runLifetime);
  const stageUp = stage > perks.stage;
  if (stageUp) perks.stage = stage;
  const due = state.runLifetime >= perks.nextRollAt;
  if (!stageUp && !due) return events;

  const pace = Math.max(income, PERK_DROPS.minIncome);
  if (due) perks.nextRollAt = state.runLifetime + PERK_DROPS.rollEveryS * pace;
  const offer = roll(state, pace);
  if (offer) events.dropped.push(offer);
  return events;
}

/**
 * Energy credited for time away (or a silent short gap) moves every window and
 * the roll schedule past itself, so being away never runs an offer down.
 * Call after crediting it.
 */
export function deferPerks(state: SaveState, amount: number): void {
  if (!(amount > 0)) return;
  for (const offer of state.perks.offers) {
    offer.droppedAt += amount;
    offer.expiresAt += amount;
  }
  state.perks.nextRollAt += amount;
}

// --- Buying ---------------------------------------------------------------------

export type BuyPerkResult =
  'bought' | 'upgraded' | 'swapped' | 'needs-slot' | 'unaffordable' | 'no-offer';

/** True when buying the tab's offer would need a perk named to drop. */
export function needsSlot(state: SaveState, tab: ShopTab): boolean {
  const offer = offerOn(state, tab);
  if (!offer || perkLevel(state, offer.id) > 0) return false;
  if (perk(offer.id).rarity === 'keystone' && heldKeystone(state)) return false;
  return state.perks.owned.length >= PERK_SLOTS;
}

function heldKeystone(state: SaveState): boolean {
  return state.perks.owned.some((o) => perk(o.id).rarity === 'keystone');
}

/**
 * Buy the offer on a tab. An owned perk goes up a level; a new keystone swaps
 * out the one held; a new perk takes a free slot, or the slot of `replace`
 * when all five are full. Changes nothing unless it succeeds.
 */
export function buyPerk(state: SaveState, tab: ShopTab, replace?: PerkId): BuyPerkResult {
  const perks = state.perks;
  const offer = offerOn(state, tab);
  if (!offer) return 'no-offer';
  if (state.energy < offer.price) return 'unaffordable';

  const owned = perks.owned.find((o) => o.id === offer.id);
  let result: BuyPerkResult;
  let dropped: PerkId | null = null;
  if (owned) {
    owned.level = offer.level;
    result = 'upgraded';
  } else {
    const slot = { id: offer.id, level: 1 };
    const keystoneAt =
      perk(offer.id).rarity === 'keystone'
        ? perks.owned.findIndex((o) => perk(o.id).rarity === 'keystone')
        : -1;
    const at =
      keystoneAt >= 0
        ? keystoneAt
        : perks.owned.length < PERK_SLOTS
          ? perks.owned.length
          : perks.owned.findIndex((o) => o.id === replace);
    if (at < 0) return 'needs-slot';
    dropped = perks.owned[at]?.id ?? null;
    perks.owned[at] = slot;
    result = dropped ? 'swapped' : 'bought';
  }

  state.energy -= offer.price;
  perks.offers = perks.offers.filter((o) => o !== offer);
  perks.codex[offer.id] = Math.max(perks.codex[offer.id] ?? 0, offer.level);
  // An upgrade on offer for the perk just dropped becomes a fresh perk again.
  const orphan = dropped && perks.offers.find((o) => o.id === dropped);
  if (orphan) {
    orphan.price = Math.max(1, Math.round(orphan.price / upgradeFactor(orphan.level - 1)));
    orphan.level = 1;
  }
  return result;
}

/** Self-Replicator: a free copy of the cheapest revealed auto-tapper. */
export function replicate(state: SaveState): AutoTapperId | null {
  const id = cheapestTapper(state);
  if (id) state.tappers[id] += 1;
  return id;
}
