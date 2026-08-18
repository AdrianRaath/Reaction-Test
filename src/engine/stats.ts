/**
 * Aggregation over score records.
 *
 * Pure functions only — no storage, no DOM. This is the part of the engine most
 * worth testing, and keeping it free of side effects is what makes that cheap.
 */

import { isBetter, primaryMetricKey, primaryValue } from './ranks';
import type { ScoreRecord, ToolDefinition } from './types';

/**
 * Arithmetic mean, unrounded. Returns null for an empty set.
 *
 * Rounding is a display concern and lives in `formatMetric` — the legacy tools
 * disagreed about precision (reaction averaged to a whole number, CPS to one
 * decimal), and each metric's `format` is what encodes that.
 */
export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  const total = values.reduce((sum, v) => sum + v, 0);
  return total / values.length;
}

/**
 * The best record by primary metric.
 *
 * Ties keep the earlier record — a personal best is when you first achieved it,
 * not the most recent time you matched it.
 */
export function bestRecord(tool: ToolDefinition, records: ScoreRecord[]): ScoreRecord | null {
  const direction = tool.metrics[primaryMetricKey(tool)]!.direction;
  let best: ScoreRecord | null = null;
  let bestValue: number | null = null;

  for (const record of records) {
    const value = primaryValue(tool, record);
    if (value === null) continue;

    if (bestValue === null || isBetter(value, bestValue, direction)) {
      best = record;
      bestValue = value;
    }
  }

  return best;
}

/** Would this record beat the current best? True when there is no best yet. */
export function beatsBest(
  tool: ToolDefinition,
  candidate: ScoreRecord,
  currentBest: ScoreRecord | null
): boolean {
  const value = primaryValue(tool, candidate);
  if (value === null) return false;
  if (!currentBest) return true;

  const incumbent = primaryValue(tool, currentBest);
  if (incumbent === null) return true;

  const direction = tool.metrics[primaryMetricKey(tool)]!.direction;
  return isBetter(value, incumbent, direction);
}

/** Mean of the primary metric across records. */
export function averagePrimary(tool: ToolDefinition, records: ScoreRecord[]): number | null {
  const values = records.map((r) => primaryValue(tool, r)).filter((v): v is number => v !== null);
  return mean(values);
}

/**
 * Records ordered oldest to newest, for the trend chart.
 *
 * Storage keeps history newest-first because that is the order the history list
 * renders in; a chart needs the opposite. Doing the flip here means neither
 * consumer has to remember which order it is receiving.
 */
export function chronological(records: ScoreRecord[]): ScoreRecord[] {
  return [...records].sort((a, b) => a.ts - b.ts);
}

/** Primary-metric series, oldest first — the trend chart's input. */
export function trendSeries(tool: ToolDefinition, records: ScoreRecord[]): number[] {
  return chronological(records)
    .map((r) => primaryValue(tool, r))
    .filter((v): v is number => v !== null);
}
