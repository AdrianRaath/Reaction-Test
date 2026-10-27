/**
 * Spacebar Clicker — the pacing simulation (SPACEBAR-CLICKER.md §4.12, §8.1,
 * §8.3).
 *
 * Plays runs headless against the real rules: the economy, the combo tracker,
 * the perk drops and buying, the reset and the isotope track all come from the
 * pure modules. Only the game loop is restated here, as the script runs it:
 * press timing, surges and their afterglow, Self-Replicator's clock, and the
 * income meter that prices perks. pacing.test.ts holds a first run inside
 * agreed bands; career.test.ts does the same for run after run with resets.
 *
 * A run is a player (a press rhythm) and a perk policy. Every player buys
 * from the shop the way an optimal player would: the item that adds the most
 * income per energy spent, saving up for it if need be.
 */

import { ComboTracker } from './combo';
import {
  AUTO_TAPPERS,
  PERK_EFFECT,
  PRESS_UPGRADES,
  PRESTIGE_UNLOCK,
  type PerkId,
  type PerkRarity,
  type ShopTab,
} from './config';
import {
  buyTapper,
  buyUpgrade,
  doubleTapChance,
  earn,
  energyPerPress,
  energyPerSecond,
  luckyMultiplier,
  offerOn,
  perk,
  prestigeGain,
  tapperCost,
  updateReveals,
  upgradeCost,
} from './economy';
import { IncomeMeter } from './income';
import { modsOf, type Mods } from './mods';
import {
  buyPerk,
  perkLevel,
  perkTick,
  placeOffer,
  replicate,
  rerollOffer,
  rerollsLeft,
  surgeDrop,
} from './perks';
import { nextRandom } from './rng';
import { defaultSave, keepable, prestigeReset, type PerkOffer, type SaveState } from './save';
import { activeRungs, type ForkPicks } from './track';

export interface Player {
  name: string;
  /** Presses a second while tapping. */
  rate: number;
  /** Spread of press intervals, as a share of the interval: 0.1 is a steady hand. */
  jitter: number;
  /** Average seconds between short breaks (reading the shop, resting a hand). */
  pauseEveryS: number;
  pauseS: number;
  /** Presses a second in a surge, where everyone mashes. */
  surgeRate: number;
  /** An idle player presses for `burstS`, then leaves it `restS`. */
  burstS?: number;
  restS?: number;
  /**
   * How often the player looks at the shop, and how long a visit stops their
   * tapping when they buy something. A person has to look away and click, so
   * a visit that buys breaks the combo unless it is short.
   */
  shopEveryS: number;
  shopPauseS: number;
}

const HUMAN = { pauseEveryS: 40, pauseS: 1.5, shopEveryS: 10, shopPauseS: 2 };

export const PLAYERS = {
  steady: { name: 'Steady tapper', rate: 5, jitter: 0.1, surgeRate: 8, ...HUMAN },
  /** A rhythm player with a looser hand: Metronome's player. */
  sloppy: { name: 'Sloppy tapper', rate: 5, jitter: 0.2, surgeRate: 8, ...HUMAN },
  masher: { name: 'Masher', rate: 7, jitter: 0.5, surgeRate: 9, ...HUMAN },
  idler: {
    name: 'Idler',
    rate: 5,
    jitter: 0.1,
    surgeRate: 8,
    burstS: 20,
    restS: 40,
    ...HUMAN,
  },
  /** The ceiling: a steady tapper who shops every half second without missing a beat. */
  bot: {
    name: 'Perfect bot',
    rate: 5,
    jitter: 0.1,
    surgeRate: 8,
    pauseEveryS: 40,
    pauseS: 1.5,
    shopEveryS: 0.5,
    shopPauseS: 0,
  },
} as const satisfies Record<string, Player>;

/**
 * - none: ignores perks.
 * - any: buys every common and rare it is offered, when it can, and only the
 *   keystones in `keystones`: the ones that suit how this player plays.
 * - build: the perfect run for a build. Every drop, when it comes, is the
 *   build's next perk (then its upgrades), and the player buys each one.
 * - holding: starts the run already holding these perks, and no more drop. It
 *   measures what a perk is worth on its own.
 */
export type PerkPolicy =
  | { kind: 'none' }
  | { kind: 'any'; keystones: readonly PerkId[] }
  | { kind: 'build'; perks: readonly PerkId[] }
  | { kind: 'holding'; perks: readonly (readonly [PerkId, number])[] };

/**
 * The builds from SPACEBAR-CLICKER.md §8.1.3, each with the player it suits,
 * strongest perk first: a perfect run gets them in this order.
 */
export const BUILDS = {
  rhythm: { player: 'steady', perks: ['glass-rhythm', 'full-sync', 'momentum', 'overtone'] },
  surge: {
    player: 'steady',
    perks: ['storm-front', 'lightning-rod', 'surge-lines', 'afterglow'],
  },
  luck: { player: 'steady', perks: ['loaded-dice', 'chain-reaction', 'ghost-presses'] },
  masher: { player: 'masher', perks: ['brute-force', 'coiled-spring', 'finger-memory'] },
  // Night Shift belongs here too, but the simulation has no time away.
  idle: { player: 'idler', perks: ['autopilot', 'idle-hands', 'self-replicator', 'bulk-order'] },
} as const satisfies Record<string, { player: keyof typeof PLAYERS; perks: readonly PerkId[] }>;

export interface RunResult {
  /** Seconds to the run's goal (1M energy, the first prestige, by default), or null if it never got there. */
  firstPrestigeS: number | null;
  /** Seconds to 1M energy this run, or null if it never got there. */
  millionS: number | null;
  drops: number;
  perksBought: number;
  /** Perks held at the end, with levels. */
  held: string[];
  /** Seconds into the run each shop item was first bought. */
  firstBought: Partial<Record<string, number>>;
  /** Where the run's energy came from. */
  earned: { presses: number; surges: number; tappers: number };
  /** The same, minute by minute. */
  byMinute: { presses: number; surges: number; tappers: number }[];
  /** The save as the run ended, to reset from. */
  state: SaveState;
}

const TABS: readonly ShopTab[] = ['press', 'auto'];
const RANK: Record<PerkRarity, number> = { common: 0, rare: 1, keystone: 2 };
const STEP_S = 0.1;
const SUMMARY_S = 4;

/** A seeded stream for the player's hands, apart from the save's drop seed. */
class Hands {
  constructor(private seed: number) {}
  next = (): number => {
    const d = nextRandom(this.seed);
    this.seed = d.seed;
    return d.value;
  };
  /** A standard normal draw (Box-Muller). */
  gauss(): number {
    return Math.sqrt(-2 * Math.log(1 - this.next())) * Math.cos(2 * Math.PI * this.next());
  }
}

/** The average of `luckyMultiplier`: x1, or x2 / x4 / x8 down the chain. */
function expectedLuck(state: SaveState, mods: Mods): number {
  const c = doubleTapChance(state, mods);
  const q = Math.min(PERK_EFFECT.chainAgainMax, c * mods.chainShare);
  return 1 - c + c * (2 * (1 - q) + 4 * q * (1 - q) + 8 * q * q);
}

/**
 * Play one run until it has earned `goal` this run (first prestige by
 * default), or `maxS` seconds pass. A first run starts from a new save; pass
 * `from`, a save just reset, to play a later one.
 */
export function simulateRun(
  player: Player,
  policy: PerkPolicy,
  seed: number,
  {
    maxS = 3 * 3600,
    goal = PRESTIGE_UNLOCK,
    from,
  }: { maxS?: number; goal?: number; from?: SaveState } = {}
): RunResult {
  const state = from ?? defaultSave(0);
  if (!from) state.perks.rng = seed >>> 0;
  const hands = new Hands((seed ^ 0x9e3779b9) >>> 0);
  const usesPerks = policy.kind === 'any' || policy.kind === 'build';
  if (policy.kind === 'holding') {
    state.perks.owned = policy.perks.map(([id, level]) => ({ id, level }));
  }
  let mods = modsOf(state);
  const combo = new ComboTracker(
    () => mods.stabiliser,
    () => mods.combo
  );
  const income = new IncomeMeter();
  const cycle = (player.burstS ?? 0) + (player.restS ?? 0);
  const tapRate = cycle ? (player.rate * player.burstS!) / cycle : player.rate;

  let t = 0;
  let nextPress = 0;
  let lastPress = -Infinity;
  let activeS = 0;
  let comboAvg = 0;
  let replicateClock = 0;
  let nextShop = 0;
  let drops = 0;
  let perksBought = 0;
  let millionS: number | null = null;
  const firstBought: Partial<Record<string, number>> = {};
  const earned = { presses: 0, surges: 0, tappers: 0 };
  const byMinute: RunResult['byMinute'] = [];
  const minute = (at: number) =>
    (byMinute[Math.floor(at / 60)] ??= { presses: 0, surges: 0, tappers: 0 });

  type Phase = 'idle' | 'warning' | 'active' | 'summary';
  let phase: Phase = 'idle';
  let phaseEnds = 0;
  let surgeDuration = 0;
  let afterglowUntil = -1;
  const gap = () => {
    const { minGapS, maxGapS } = mods.surge;
    return minGapS + hands.next() * (maxGapS - minGapS);
  };
  let surgeDue = gap();

  /** When the press after one at `at` comes: a beat, a break, or the idler's rest. */
  function after(at: number): number {
    if (phase === 'active') {
      return at + Math.max(1 / 30, (1 / player.surgeRate) * (1 + 0.3 * hands.gauss()));
    }
    let next = at + Math.max(1 / 30, (1 / player.rate) * (1 + player.jitter * hands.gauss()));
    if (hands.next() < 1 / player.rate / player.pauseEveryS) next += player.pauseS;
    if (cycle && next % cycle >= player.burstS!) next = Math.ceil(next / cycle) * cycle;
    return next;
  }

  function press(at: number): void {
    const r = combo.press(at * 1000);
    const surging = phase === 'active';
    const play = { combo: r.combo, surging, afterglow: at < afterglowUntil };
    const value = energyPerPress(state, play, mods) * luckyMultiplier(state, hands.next, mods);
    earn(state, value);
    earned[surging ? 'surges' : 'presses'] += value;
    minute(at)[surging ? 'surges' : 'presses'] += value;
    state.totalPresses++;
    // The meter reads the player's own pace, without a surge's or an afterglow's boost.
    const boost = (surging ? mods.surge.multiplier : 1) * (play.afterglow ? mods.afterglowMult : 1);
    income.add(at * 1000, value / boost);
    lastPress = at;
    comboAvg += (r.combo - comboAvg) * 0.01;
  }

  /** A dream run swaps each drop for the build's next perk. */
  function stage(dropped: PerkOffer[]): void {
    if (policy.kind !== 'build') return;
    for (const offer of dropped) {
      state.perks.offers = state.perks.offers.filter((o) => o !== offer);
      const open = policy.perks.filter(
        (id) => perkLevel(state, id) < 3 && !state.perks.offers.some((o) => o.id === id)
      );
      const next =
        open.find((id) => perkLevel(state, id) === 0) ??
        [...open].sort((a, b) => perkLevel(state, a) - perkLevel(state, b))[0];
      if (next && !offerOn(state, perk(next).tab)) {
        placeOffer(state, perk(next), income.rate(t * 1000));
      }
    }
  }

  /** Income a second at the player's usual combo, for valuing purchases. */
  function worth(): number {
    const m = modsOf(state);
    const play = { combo: comboAvg };
    return (
      tapRate * energyPerPress(state, play, m) * expectedLuck(state, m) +
      energyPerSecond(state, play, m)
    );
  }

  function wants(offer: PerkOffer): boolean {
    if (policy.kind === 'build') return policy.perks.includes(offer.id);
    if (policy.kind !== 'any') return false;
    return perk(offer.id).rarity !== 'keystone' || policy.keystones.includes(offer.id);
  }

  /** True when the player would buy this offer, given the energy: wanted, with a slot for it. */
  function takes(offer: PerkOffer): boolean {
    if (!wants(offer)) return false;
    if (perkLevel(state, offer.id) > 0 || perk(offer.id).rarity === 'keystone') return true;
    return state.perks.owned.length < mods.perkSlots || slotFor(offer) !== undefined;
  }

  /** For `any`: the slot a new perk takes when all are full, the least rare one, if rarer. */
  function slotFor(offer: PerkOffer): PerkId | undefined {
    const weakest = [...state.perks.owned].sort(
      (a, b) => RANK[perk(a.id).rarity] - RANK[perk(b.id).rarity]
    )[0];
    if (!weakest) return undefined;
    return RANK[perk(weakest.id).rarity] <= RANK[perk(offer.id).rarity] ? weakest.id : undefined;
  }

  /** One look at the shop. Returns true if anything was bought. */
  function shop(): boolean {
    // Perks first: a wanted offer is bought on sight, or saved for.
    let any = false;
    let saving = false;
    for (const tab of TABS) {
      let offer = offerOn(state, tab);
      // The Reroll rung: swap an offer the player won't buy for a fresh one.
      if (offer && !takes(offer) && rerollsLeft(state) > 0) {
        if (rerollOffer(state, tab, income.rate(t * 1000))) drops++;
        offer = offerOn(state, tab);
      }
      if (!offer || !wants(offer)) continue;
      if (state.energy >= offer.price) {
        const result = buyPerk(state, tab, slotFor(offer));
        if (result === 'needs-slot') continue;
        perksBought++;
        any = true;
      } else {
        saving = true;
      }
    }
    if (saving) return any;

    for (let bought = 0; bought < 8; bought++) {
      const base = worth();
      let best: (() => boolean) | null = null;
      let bestCost = 0;
      let bestRatio = 0;
      for (const u of PRESS_UPGRADES) {
        if (state.upgrades[u.id] >= u.max) continue;
        const cost = upgradeCost(state, u.id);
        state.upgrades[u.id]++;
        let gain = worth() - base;
        state.upgrades[u.id]--;
        // A Stabiliser keeps combos alive rather than raising a formula.
        if (u.id === 'stabiliser' && mods.stabiliser === false && mods.combo.missesToBreak > 1) {
          gain = base * 0.1;
        }
        if (gain / cost > bestRatio) {
          bestRatio = gain / cost;
          bestCost = cost;
          best = () => buyUpgrade(state, u.id) && (firstBought[u.id] ??= t) >= 0;
        }
      }
      for (const tp of AUTO_TAPPERS) {
        if (!state.revealed.includes(tp.id)) continue;
        const cost = tapperCost(state, tp.id);
        state.tappers[tp.id]++;
        const gain = worth() - base;
        state.tappers[tp.id]--;
        if (gain / cost > bestRatio) {
          bestRatio = gain / cost;
          bestCost = cost;
          best = () => buyTapper(state, tp.id) && (firstBought[tp.id] ??= t) >= 0;
        }
      }
      if (!best || state.energy < bestCost || !best()) return any;
      any = true;
    }
    return any;
  }

  while (t < maxS) {
    mods = modsOf(state);
    const end = t + STEP_S;
    while (nextPress < end) {
      const at = Math.max(nextPress, t);
      press(at);
      nextPress = after(at);
    }

    combo.tick(end * 1000);
    const idleS = end - lastPress;
    const active = idleS < mods.surge.idleAfterS;
    const activeDt = active ? STEP_S : 0;
    activeS += activeDt;

    const surging = phase === 'active';
    const eps = energyPerSecond(state, { combo: combo.combo, surging, idleS }, mods);
    earn(state, eps * STEP_S);
    earned.tappers += eps * STEP_S;
    minute(t).tappers += eps * STEP_S;
    const boosted = surging && mods.surgeHitsTappers ? mods.surge.multiplier : 1;
    income.add(end * 1000, (eps * STEP_S) / boosted);

    // Surges, as the script runs them: countdown, overdrive, results card.
    if (phase === 'idle' && active && activeS >= surgeDue) {
      surgeDuration = mods.surge.durationS;
      phase = mods.surge.warningS > 0 ? 'warning' : 'active';
      phaseEnds = end + (phase === 'warning' ? mods.surge.warningS : surgeDuration);
      if (phase === 'active') nextPress = end;
    } else if (phase === 'warning' && end >= phaseEnds) {
      phase = 'active';
      phaseEnds = end + surgeDuration;
      nextPress = end;
    } else if (phase === 'active' && end >= phaseEnds) {
      phase = 'summary';
      phaseEnds = end + SUMMARY_S;
      afterglowUntil = end + mods.afterglowS;
      if (usesPerks) {
        const offer = surgeDrop(state, income.rate(end * 1000));
        if (offer) {
          drops++;
          stage([offer]);
        }
      }
    } else if (phase === 'summary' && end >= phaseEnds) {
      phase = 'idle';
      surgeDue = activeS + gap();
    }

    if (mods.replicateEveryS > 0) {
      replicateClock += activeDt;
      if (replicateClock >= mods.replicateEveryS) {
        replicateClock -= mods.replicateEveryS;
        replicate(state);
      }
    }

    if (usesPerks) {
      const events = perkTick(state, income.rate(end * 1000), activeDt);
      drops += events.dropped.length;
      stage(events.dropped);
    }
    updateReveals(state);

    t = end;
    if (millionS === null && state.runLifetime >= PRESTIGE_UNLOCK) millionS = t;
    if (state.runLifetime >= goal) {
      const firstPrestigeS = t;
      return {
        firstPrestigeS,
        millionS,
        drops,
        perksBought,
        held: heldList(state),
        firstBought,
        earned,
        byMinute,
        state,
      };
    }
    if (t >= nextShop) {
      // Buying means looking away from the key: the next press waits.
      if (shop() && player.shopPauseS > 0) nextPress = Math.max(nextPress, t + player.shopPauseS);
      nextShop = t + player.shopEveryS;
    }
  }
  return {
    firstPrestigeS: null,
    millionS,
    drops,
    perksBought,
    held: heldList(state),
    firstBought,
    earned,
    byMinute,
    state,
  };
}

function heldList(state: SaveState): string[] {
  return state.perks.owned.map((o) => `${o.id} ${'I'.repeat(o.level)}`);
}

export interface Summary {
  /** First-prestige minutes across seeds. */
  p10: number;
  median: number;
  p90: number;
  /** Average drops and perks bought per run. */
  drops: number;
  bought: number;
}

/** Run one player and policy over several seeds. */
export function summarize(player: Player, policy: PerkPolicy, seeds: readonly number[]): Summary {
  const runs = seeds.map((seed) => simulateRun(player, policy, seed));
  const minutes = runs.map((r) => (r.firstPrestigeS ?? Infinity) / 60).sort((a, b) => a - b);
  const at = (q: number) => minutes[Math.round(q * (minutes.length - 1))]!;
  const mean = (f: (r: RunResult) => number) => runs.reduce((a, r) => a + f(r), 0) / runs.length;
  return {
    p10: at(0.1),
    median: at(0.5),
    p90: at(0.9),
    drops: mean((r) => r.drops),
    bought: mean((r) => r.perksBought),
  };
}

// --- Careers (the isotope track, §8.3) ----------------------------------------------

/**
 * When a player resets: as soon as a reset pays `isotopes`. One resets at a
 * million; two waits for 4M; three waits for 9M.
 */
export const HABITS = { eager: 1, patient: 2, saver: 3 } as const;
export type Habit = keyof typeof HABITS;

export interface CareerRun {
  /** Isotopes held through the run. */
  isotopes: number;
  /** Minutes to the reset, and to the run's first million. */
  minutes: number;
  millionMinutes: number;
}

export interface CareerResult {
  runs: CareerRun[];
  /** Total minutes of play when the career first held each isotope count. */
  reachedAt: Partial<Record<number, number>>;
  /** False if a run never reached its reset. */
  finished: boolean;
}

/**
 * The perk a keeping rung carries through the reset: Cornerstone's keystone,
 * or Heirloom's best other perk, as the reset dialog offers them first.
 */
export function keepAtReset(state: SaveState): PerkId | undefined {
  return keepable(state.perks.owned, activeRungs(state.isotopes, state.forks))[0]?.id;
}

/**
 * Play run after run from a new save, resetting on `habit` with these fork
 * picks, until the career holds `until` isotopes. The picks are made at the
 * first reset that reaches each fork, as the reset dialog asks for them, and
 * the keeping rung carries a perk from the run being reset.
 */
export function simulateCareer(
  player: Player,
  policy: PerkPolicy,
  seed: number,
  habit: Habit,
  picks: ForkPicks,
  until = 15
): CareerResult {
  const runs: CareerRun[] = [];
  const reachedAt: Partial<Record<number, number>> = {};
  const goal = PRESTIGE_UNLOCK * HABITS[habit] ** 2;
  let from: SaveState | undefined;
  let totalS = 0;
  while (!from || from.isotopes < until) {
    const isotopes = from?.isotopes ?? 0;
    const r = simulateRun(player, policy, seed + runs.length * 7919, { goal, from });
    if (r.firstPrestigeS === null) return { runs, reachedAt, finished: false };
    totalS += r.firstPrestigeS;
    runs.push({ isotopes, minutes: r.firstPrestigeS / 60, millionMinutes: r.millionS! / 60 });

    const gain = prestigeGain(r.state.runLifetime);
    // Keeping reads the rungs the reset reaches, so it uses the picks too.
    const reached = {
      ...r.state,
      isotopes: isotopes + gain,
      forks: { ...r.state.forks, ...picks },
    };
    from = prestigeReset(r.state, gain, totalS * 1000, {
      forks: picks,
      keep: keepAtReset(reached),
    });
    for (let i = isotopes + 1; i <= from.isotopes; i++) reachedAt[i] = totalS / 60;
  }
  return { runs, reachedAt, finished: true };
}
