/**
 * Legacy localStorage migration.
 *
 * Returning visitors are the ones holding personal bests, and they are exactly
 * the audience this site is for — so losing their data is the most damaging
 * thing this rebuild could do. REVAMP.md §3.2 treats this as a blocking
 * requirement rather than a cleanup.
 *
 * Legacy shapes (verified against the pre-revamp app.js and cps.js):
 *   <prefix>_personal_best / _best   "247"                    bare number
 *   <prefix>_settings                {...}                    JSON object
 *   <prefix>_history_log             [{ score, timestamp }]   newest first
 *   <prefix>_achieved_ranks          ["pro", "advanced"]      rank ids
 *
 * A fifth legacy key, <prefix>_session_history, is deliberately not imported.
 * It held the trend chart's bare number array — the same session scores as
 * history_log minus timestamps, written by the same code path since the initial
 * commit. The trend now derives from history records, so importing it would
 * only duplicate data.
 *
 * Both legacy tools scored a *session average*, not a single attempt, so each
 * legacy entry maps cleanly onto one ScoreRecord.
 */

import { primaryMetricKey } from './ranks';
import type { StorageAdapter, ToolStore } from './storage';
import type { ScoreRecord, ToolDefinition } from './types';

interface LegacyHistoryEntry {
  score: number;
  timestamp: number;
}

function parse<T>(adapter: StorageAdapter, key: string): T | null {
  const raw = adapter.get(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function isEntry(value: unknown): value is LegacyHistoryEntry {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Partial<LegacyHistoryEntry>;
  return (
    typeof entry.score === 'number' &&
    Number.isFinite(entry.score) &&
    typeof entry.timestamp === 'number' &&
    Number.isFinite(entry.timestamp)
  );
}

export interface MigrationResult {
  /** False when the tool had already been migrated, or defines no legacy keys. */
  ran: boolean;
  recordsImported: number;
  bestImported: boolean;
  settingsImported: boolean;
  ranksImported: number;
}

const NOOP: MigrationResult = {
  ran: false,
  recordsImported: 0,
  bestImported: false,
  settingsImported: false,
  ranksImported: 0,
};

/**
 * Import pre-revamp data for a tool, once.
 *
 * Legacy keys are deliberately **not** deleted. They cost a few hundred bytes,
 * and keeping them means a bug found in this function after release is still
 * recoverable — the source data is right there. The `migrated` marker, not the
 * absence of legacy keys, is what stops a re-run.
 */
export function migrateLegacyData(
  tool: ToolDefinition,
  store: ToolStore,
  adapter: StorageAdapter
): MigrationResult {
  if (!tool.legacy || store.isMigrated()) return NOOP;

  const { legacy } = tool;
  const metricKey = primaryMetricKey(tool);
  const result: MigrationResult = { ...NOOP, ran: true };

  const toRecord = (score: number, ts: number): ScoreRecord => ({
    toolId: tool.id,
    ts,
    metrics: { [metricKey]: score },
    // Legacy entries carry no settings context, so the conditions behind the
    // score are unknowable. Flagged rather than guessed — see ScoreRecord.migrated.
    settings: {},
    migrated: true,
  });

  // --- History -----------------------------------------------------------
  const rawHistory = parse<unknown[]>(adapter, legacy.historyLog);
  const entries = Array.isArray(rawHistory) ? rawHistory.filter(isEntry) : [];
  const records = entries.map((e) => toRecord(e.score, e.timestamp));

  if (records.length > 0) {
    // Legacy stored newest-first, which is also this engine's order, but sort
    // rather than trust it — a hand-edited or partially-written array should
    // not silently produce a backwards trend chart.
    records.sort((a, b) => b.ts - a.ts);
    for (const record of [...records].reverse()) store.addRecord(record);
    result.recordsImported = records.length;
  }

  // --- Personal best -----------------------------------------------------
  const rawBest = adapter.get(legacy.best);
  const bestValue = rawBest === null ? NaN : Number.parseFloat(rawBest);

  if (Number.isFinite(bestValue)) {
    // Prefer the actual session the best came from, so its timestamp is real.
    // Records are sorted newest-first; take the *last* match so a duplicated
    // score resolves to when it was first achieved, matching bestRecord's tie rule.
    const source = records.filter((r) => r.metrics[metricKey] === bestValue).at(-1);
    store.setBest(source ?? toRecord(bestValue, 0));
    result.bestImported = true;
  }

  // --- Settings ----------------------------------------------------------
  const settings = parse<Record<string, unknown>>(adapter, legacy.settings);
  if (settings && typeof settings === 'object' && !Array.isArray(settings)) {
    // Passed through unvalidated; each tool validates its own settings against
    // its schema on load, exactly as the legacy code did.
    store.setSettings(settings);
    result.settingsImported = true;
  }

  // --- Achieved ranks ----------------------------------------------------
  const rawRanks = parse<unknown[]>(adapter, legacy.achievedRanks);
  if (Array.isArray(rawRanks)) {
    // Only ranked tools have legacy keys, but guard anyway so the milestone
    // flavour cannot trip this path if one ever gains a legacy import.
    const valid = new Set((tool.ranks ?? []).map((r) => r.id as string));
    const ids = rawRanks.filter((id): id is string => typeof id === 'string' && valid.has(id));
    if (ids.length > 0) {
      store.addAchievedTiers(ids);
      result.ranksImported = ids.length;
    }
  }

  store.markMigrated();
  return result;
}
