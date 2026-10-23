/**
 * Spacebar Clicker — the save.
 *
 * One JSON blob under `reflexlab:spacebar-clicker:save`, versioned (spec §13).
 * Everything read from storage is untrusted: each field is coerced to a sane
 * value or falls back, so a hand-edited or truncated save degrades to a
 * playable state instead of a crash.
 */

import {
  ACHIEVEMENTS,
  AUTO_TAPPERS,
  PERK_DROPS,
  PERK_MAX_LEVEL,
  PERK_SLOTS,
  PERKS,
  PRESS_UPGRADES,
  SAVE_VERSION,
  type AchievementId,
  type AutoTapperId,
  type PerkId,
  type PressUpgradeId,
  type ShopItemId,
} from './config';

export interface OwnedPerk {
  id: PerkId;
  /** 1 to PERK_MAX_LEVEL. */
  level: number;
}

/** A perk on sale in its shop tab, for a limited window of the run's energy. */
export interface PerkOffer {
  id: PerkId;
  /** The level buying it gives: 1 for a new perk, higher for an upgrade. */
  level: number;
  /** Fixed when it drops. */
  price: number;
  /** Run energy when it dropped, and the run energy at which it leaves. */
  droppedAt: number;
  expiresAt: number;
  /** The player has looked at its tab since it dropped. */
  seen: boolean;
  /** The player has looked at its tab while it was affordable. */
  seenAffordable: boolean;
}

export interface PerkState {
  /** Active perks in slot order. Wiped by prestige. */
  owned: OwnedPerk[];
  /** At most one per shop tab. Wiped by prestige. */
  offers: PerkOffer[];
  /** The drop generator's state (rng.ts), so a reload can't reroll a drop. */
  rng: number;
  /** Run energy at which the next scheduled roll comes. */
  nextRollAt: number;
  /** Rolls in a row that dropped nothing, for the pity odds. */
  misses: number;
  /** Perks dropped this run. The first always drops. */
  drops: number;
  /** The reactor state the drop logic last saw; a higher one rolls. */
  stage: number;
  /**
   * Every perk ever dropped, with the best level ever held (0 if only seen).
   * Survives prestige; only the full reset clears it.
   */
  codex: Partial<Record<PerkId, number>>;
}

export interface SaveState {
  v: number;
  /** Spendable energy. */
  energy: number;
  /** Energy earned this run — drives reactor state and prestige. */
  runLifetime: number;
  /** Energy earned across every run. */
  totalLifetime: number;
  totalPresses: number;
  upgrades: Record<PressUpgradeId, number>;
  tappers: Record<AutoTapperId, number>;
  /** Auto-tappers the shop has shown. Survives prestige. */
  revealed: AutoTapperId[];
  /** Revealed auto-tappers the player has looked at. */
  seen: AutoTapperId[];
  /**
   * The level each item was at when the player last saw it affordable. An
   * item affordable at any other level is news for its shop tab.
   */
  announced: Partial<Record<ShopItemId, number>>;
  isotopes: number;
  prestiges: number;
  bestCombo: number;
  bestSurgeCps: number;
  surges: number;
  achievements: AchievementId[];
  /** Seconds with the page visible. */
  playedS: number;
  /** Epoch ms of the last save — offline progress is measured from it. */
  lastSeen: number;
  createdAt: number;
  perks: PerkState;
}

const UPGRADE_IDS = PRESS_UPGRADES.map((u) => u.id);
const TAPPER_IDS = AUTO_TAPPERS.map((t) => t.id);
const ACHIEVEMENT_IDS = new Set<string>(ACHIEVEMENTS.map((a) => a.id));

const PERK_BY_ID = new Map(PERKS.map((p) => [p.id, p]));

function zeroed<K extends string>(ids: readonly K[]): Record<K, number> {
  return Object.fromEntries(ids.map((id) => [id, 0])) as Record<K, number>;
}

/** A run's perks before anything has dropped. */
function freshRun(perks: Pick<PerkState, 'rng' | 'codex'>): PerkState {
  return {
    owned: [],
    offers: [],
    rng: perks.rng,
    nextRollAt: PERK_DROPS.firstRollAt,
    misses: 0,
    drops: 0,
    stage: 0,
    codex: { ...perks.codex },
  };
}

/** A 32-bit seed from the clock, so a new save's drops differ from the last one's. */
function seedFrom(now: number): number {
  return Math.floor(now) >>> 0;
}

export function defaultSave(now: number): SaveState {
  return {
    v: SAVE_VERSION,
    energy: 0,
    runLifetime: 0,
    totalLifetime: 0,
    totalPresses: 0,
    upgrades: zeroed(UPGRADE_IDS),
    tappers: zeroed(TAPPER_IDS),
    revealed: ['assistant'],
    seen: ['assistant'],
    announced: {},
    isotopes: 0,
    prestiges: 0,
    bestCombo: 0,
    bestSurgeCps: 0,
    surges: 0,
    achievements: [],
    playedS: 0,
    lastSeen: now,
    createdAt: now,
    perks: freshRun({ rng: seedFrom(now), codex: {} }),
  };
}

/** A finite number at or above `min`, else the fallback. */
function num(value: unknown, fallback: number, min = 0): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min ? value : fallback;
}

function counts<K extends string>(value: unknown, ids: readonly K[], max?: (id: K) => number) {
  const out = zeroed(ids);
  if (value && typeof value === 'object') {
    for (const id of ids) {
      const n = Math.floor(num((value as Record<string, unknown>)[id], 0));
      out[id] = max ? Math.min(n, max(id)) : n;
    }
  }
  return out;
}

function idList<T extends string>(value: unknown, valid: (id: string) => boolean): T[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((v): v is T => typeof v === 'string' && valid(v)))];
}

/** Whole, non-negative levels keyed by known shop ids; anything else dropped. */
function levels(value: unknown): Partial<Record<ShopItemId, number>> {
  const out: Partial<Record<ShopItemId, number>> = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
  for (const id of [...UPGRADE_IDS, ...TAPPER_IDS]) {
    const n = (value as Record<string, unknown>)[id];
    if (typeof n === 'number' && Number.isInteger(n) && n >= 0) out[id] = n;
  }
  return out;
}

function isPerkId(id: unknown): id is PerkId {
  return typeof id === 'string' && PERK_BY_ID.has(id as PerkId);
}

/** A whole number in [min, max], else null. */
function whole(value: unknown, min: number, max: number): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
    ? value
    : null;
}

/**
 * The perks block, tolerating anything. Owned perks keep the slot cap and the
 * one-keystone rule; an offer survives only if it is consistent with what is
 * owned, one per tab.
 */
function parsePerks(value: unknown, now: number): PerkState {
  const d = (value && typeof value === 'object' && !Array.isArray(value) ? value : {}) as Record<
    string,
    unknown
  >;

  const owned: OwnedPerk[] = [];
  let keystone = false;
  for (const raw of Array.isArray(d.owned) ? d.owned : []) {
    if (owned.length >= PERK_SLOTS || !raw || typeof raw !== 'object') continue;
    const { id, level } = raw as Record<string, unknown>;
    const lvl = whole(level, 1, PERK_MAX_LEVEL);
    if (!isPerkId(id) || lvl === null || owned.some((o) => o.id === id)) continue;
    if (PERK_BY_ID.get(id)!.rarity === 'keystone') {
      if (keystone) continue;
      keystone = true;
    }
    owned.push({ id, level: lvl });
  }

  const offers: PerkOffer[] = [];
  for (const raw of Array.isArray(d.offers) ? d.offers : []) {
    if (!raw || typeof raw !== 'object') continue;
    const o = raw as Record<string, unknown>;
    if (!isPerkId(o.id)) continue;
    const id = o.id;
    const held = owned.find((p) => p.id === id)?.level ?? 0;
    const tab = PERK_BY_ID.get(id)!.tab;
    const price = num(o.price, -1);
    const droppedAt = num(o.droppedAt, -1);
    const expiresAt = num(o.expiresAt, -1);
    if (
      o.level !== held + 1 ||
      held >= PERK_MAX_LEVEL ||
      price <= 0 ||
      droppedAt < 0 ||
      expiresAt <= droppedAt ||
      offers.some((x) => PERK_BY_ID.get(x.id)!.tab === tab)
    ) {
      continue;
    }
    offers.push({
      id,
      level: held + 1,
      price,
      droppedAt,
      expiresAt,
      seen: o.seen === true,
      seenAffordable: o.seenAffordable === true,
    });
  }

  const codex: Partial<Record<PerkId, number>> = {};
  if (d.codex && typeof d.codex === 'object' && !Array.isArray(d.codex)) {
    for (const [id, level] of Object.entries(d.codex)) {
      const lvl = whole(level, 0, PERK_MAX_LEVEL);
      if (isPerkId(id) && lvl !== null) codex[id] = lvl;
    }
  }
  // Anything owned or on offer has been found.
  for (const o of owned) codex[o.id] = Math.max(codex[o.id] ?? 0, o.level);
  for (const o of offers) codex[o.id] ??= 0;

  return {
    owned,
    offers,
    rng: whole(d.rng, 0, 2 ** 32 - 1) ?? seedFrom(now),
    nextRollAt: num(d.nextRollAt, PERK_DROPS.firstRollAt),
    misses: whole(d.misses, 0, Number.MAX_SAFE_INTEGER) ?? 0,
    drops: whole(d.drops, 0, Number.MAX_SAFE_INTEGER) ?? 0,
    stage: whole(d.stage, 0, Number.MAX_SAFE_INTEGER) ?? 0,
    codex,
  };
}

/**
 * Read a save, tolerating anything. `null` (nothing stored) and garbage both
 * yield a fresh game; a partial object keeps whatever fields are usable.
 */
export function parseSave(raw: string | null, now: number): SaveState {
  const fresh = defaultSave(now);
  if (raw === null) return fresh;

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return fresh;
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return fresh;
  const d = data as Record<string, unknown>;

  const upgrades = counts(
    d.upgrades,
    UPGRADE_IDS,
    (id) => PRESS_UPGRADES.find((u) => u.id === id)!.max
  );
  const tappers = counts(d.tappers, TAPPER_IDS);
  const revealed = idList<AutoTapperId>(d.revealed, (id) => (TAPPER_IDS as string[]).includes(id));
  // Anything owned is visible whatever the list says; the first is always visible.
  for (const id of TAPPER_IDS) if (tappers[id] > 0 && !revealed.includes(id)) revealed.push(id);
  if (!revealed.includes('assistant')) revealed.unshift('assistant');
  // Owning something counts as having seen it; the first row is always seen.
  const seen = idList<AutoTapperId>(d.seen, (id) => (revealed as string[]).includes(id));
  for (const id of TAPPER_IDS) if (tappers[id] > 0 && !seen.includes(id)) seen.push(id);
  if (!seen.includes('assistant')) seen.unshift('assistant');

  const runLifetime = num(d.runLifetime, 0);
  return {
    v: SAVE_VERSION,
    energy: num(d.energy, 0),
    runLifetime,
    totalLifetime: Math.max(num(d.totalLifetime, 0), runLifetime),
    totalPresses: Math.floor(num(d.totalPresses, 0)),
    upgrades,
    tappers,
    revealed,
    seen,
    announced: levels(d.announced),
    isotopes: Math.floor(num(d.isotopes, 0)),
    prestiges: Math.floor(num(d.prestiges, 0)),
    bestCombo: Math.floor(num(d.bestCombo, 0)),
    bestSurgeCps: num(d.bestSurgeCps, 0),
    surges: Math.floor(num(d.surges, 0)),
    achievements: idList<AchievementId>(d.achievements, (id) => ACHIEVEMENT_IDS.has(id)),
    playedS: num(d.playedS, 0),
    // A lastSeen in the future (clock change) must not mint negative time.
    lastSeen: Math.min(num(d.lastSeen, now, 1), now),
    createdAt: Math.min(num(d.createdAt, now, 1), now),
    perks: parsePerks(d.perks, now),
  };
}

export function serializeSave(state: SaveState): string {
  return JSON.stringify(state);
}

/**
 * Prestige (spec §9). Wipes the run — energy, shop, reactor state, perks and
 * offers — and keeps isotopes, achievements, lifetime stats and best records.
 * The shop's revealed list survives too: a player on their second run knows
 * the shop. So do the perk codex and the drop generator's state.
 */
export function prestigeReset(state: SaveState, isotopesGained: number, now: number): SaveState {
  return {
    ...state,
    energy: 0,
    runLifetime: 0,
    // Every price is back at level zero, so every item can be news again.
    announced: {},
    upgrades: zeroed(UPGRADE_IDS),
    tappers: zeroed(TAPPER_IDS),
    isotopes: state.isotopes + isotopesGained,
    prestiges: state.prestiges + 1,
    lastSeen: now,
    perks: freshRun(state.perks),
  };
}
