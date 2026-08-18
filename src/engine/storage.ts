/**
 * Persistence.
 *
 * All storage goes through a narrow adapter so a remote layer can be added
 * later without touching tool code (REVAMP.md §4.1).
 *
 * A note on why this interface is synchronous, since that looks like it would
 * block a future leaderboard: it would not. Leaderboards are *additive* —
 * localStorage stays the source of truth for a player's own data, because the
 * UI renders from it during a live test and cannot await a network round trip.
 * A remote layer publishes records upward and reads aggregates back; it does
 * not replace this. Do not make these methods async in anticipation of it.
 */

import { DEFAULT_MAX_HISTORY } from './types';
import type { RankId, ScoreRecord, ToolDefinition } from './types';

export const KEY_PREFIX = 'reflexlab';

export type StoreField = 'best' | 'history' | 'settings' | 'ranks' | 'migrated';

/** Namespaced key, e.g. `reflexlab:cps:best`. */
export function keyFor(toolId: string, field: StoreField): string {
  return `${KEY_PREFIX}:${toolId}:${field}`;
}

export interface StorageAdapter {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

/** In-memory adapter. Used during SSR and in tests. */
export function memoryAdapter(seed: Record<string, string> = {}): StorageAdapter {
  const map = new Map<string, string>(Object.entries(seed));
  return {
    get: (key) => map.get(key) ?? null,
    set: (key, value) => void map.set(key, value),
    remove: (key) => void map.delete(key),
  };
}

/**
 * localStorage, guarded.
 *
 * Every access is wrapped: Safari private mode throws on write, storage can be
 * disabled entirely, and quota can be exceeded. A tool that cannot persist
 * should still be playable, so failures degrade to in-memory rather than
 * throwing into the test loop.
 */
export function browserAdapter(): StorageAdapter {
  let usable = false;
  try {
    usable = typeof localStorage !== 'undefined';
    if (usable) {
      const probe = `${KEY_PREFIX}:__probe__`;
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
    }
  } catch {
    usable = false;
  }

  if (!usable) return memoryAdapter();

  return {
    get(key) {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, value);
      } catch {
        /* Storage full or blocked — the session still works, it just won't persist. */
      }
    },
    remove(key) {
      try {
        localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    },
  };
}

/** Default adapter for the current environment. */
export function defaultAdapter(): StorageAdapter {
  return typeof window === 'undefined' ? memoryAdapter() : browserAdapter();
}

function readJson<T>(adapter: StorageAdapter, key: string, fallback: T): T {
  const raw = adapter.get(key);
  if (raw === null) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return (parsed ?? fallback) as T;
  } catch {
    // Malformed data is treated as absent rather than fatal. Losing one field
    // is recoverable; throwing on load would brick the page.
    return fallback;
  }
}

function writeJson(adapter: StorageAdapter, key: string, value: unknown): void {
  try {
    adapter.set(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export interface ToolStore {
  getBest(): ScoreRecord | null;
  setBest(record: ScoreRecord): void;
  getHistory(): ScoreRecord[];
  /** Prepends (newest first) and trims to the tool's history cap. */
  addRecord(record: ScoreRecord): void;
  getSettings<T extends Record<string, unknown>>(fallback: T): T;
  setSettings(settings: Record<string, unknown>): void;
  getAchievedRanks(): RankId[];
  addAchievedRanks(ids: RankId[]): void;
  /** Clears progress but keeps settings — matching the documented Reset behaviour. */
  clearProgress(): void;
  isMigrated(): boolean;
  markMigrated(): void;
}

export function createToolStore(
  tool: ToolDefinition,
  adapter: StorageAdapter = defaultAdapter()
): ToolStore {
  const cap = tool.maxHistory ?? DEFAULT_MAX_HISTORY;
  const k = (field: StoreField) => keyFor(tool.id, field);

  return {
    getBest: () => readJson<ScoreRecord | null>(adapter, k('best'), null),

    setBest: (record) => writeJson(adapter, k('best'), record),

    getHistory: () => readJson<ScoreRecord[]>(adapter, k('history'), []),

    addRecord(record) {
      const history = [record, ...this.getHistory()].slice(0, cap);
      writeJson(adapter, k('history'), history);
    },

    getSettings<T extends Record<string, unknown>>(fallback: T): T {
      return { ...fallback, ...readJson<Partial<T>>(adapter, k('settings'), {}) };
    },

    setSettings: (settings) => writeJson(adapter, k('settings'), settings),

    getAchievedRanks: () => readJson<RankId[]>(adapter, k('ranks'), []),

    addAchievedRanks(ids) {
      const merged = new Set([...this.getAchievedRanks(), ...ids]);
      writeJson(adapter, k('ranks'), [...merged]);
    },

    clearProgress() {
      adapter.remove(k('best'));
      adapter.remove(k('history'));
      adapter.remove(k('ranks'));
      // `settings` and `migrated` deliberately survive: settings because the
      // Reset dialog promises they will, and `migrated` because clearing it
      // would re-import the legacy keys the user just asked to erase.
    },

    isMigrated: () => adapter.get(k('migrated')) !== null,

    markMigrated: () => adapter.set(k('migrated'), new Date().toISOString()),
  };
}
