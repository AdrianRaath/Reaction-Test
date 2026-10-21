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
  PRESS_UPGRADES,
  SAVE_VERSION,
  type AchievementId,
  type AutoTapperId,
  type PressUpgradeId,
  type ShopItemId,
} from './config';

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
}

const UPGRADE_IDS = PRESS_UPGRADES.map((u) => u.id);
const TAPPER_IDS = AUTO_TAPPERS.map((t) => t.id);
const ACHIEVEMENT_IDS = new Set<string>(ACHIEVEMENTS.map((a) => a.id));

function zeroed<K extends string>(ids: readonly K[]): Record<K, number> {
  return Object.fromEntries(ids.map((id) => [id, 0])) as Record<K, number>;
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
  };
}

export function serializeSave(state: SaveState): string {
  return JSON.stringify(state);
}

/**
 * Prestige (spec §9). Wipes the run — energy, shop, reactor state — and keeps
 * isotopes, achievements, lifetime stats and best records. The shop's
 * revealed list survives too: a player on their second run knows the shop.
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
  };
}
