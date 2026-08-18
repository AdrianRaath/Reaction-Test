/**
 * Rank resolution and score comparison.
 *
 * Every comparison in the engine routes through here, so `direction` is handled
 * in exactly one place. The legacy tools each hardcoded their own sense of
 * "better" (`time < best` in app.js, `cps > best` in cps.js), which is precisely
 * the fork this module exists to prevent.
 */

import type { Direction, MetricDef, RankDef, ScoreRecord, ToolDefinition } from './types';

/** Is `candidate` strictly better than `incumbent` for this direction? */
export function isBetter(candidate: number, incumbent: number, direction: Direction): boolean {
  return direction === 'lower-is-better' ? candidate < incumbent : candidate > incumbent;
}

/** Does `value` meet a rank threshold expressed as "at least this good"? */
export function meetsThreshold(value: number, threshold: number, direction: Direction): boolean {
  return direction === 'lower-is-better' ? value <= threshold : value >= threshold;
}

/** The key of the tool's primary metric. Throws if the definition is malformed. */
export function primaryMetricKey(tool: ToolDefinition): string {
  const primary = Object.entries(tool.metrics).filter(([, m]) => m.primary);

  if (primary.length !== 1) {
    throw new Error(
      `Tool "${tool.id}" must define exactly one primary metric, found ${primary.length}. ` +
        `The primary metric drives rank, personal best, and the trend chart — ` +
        `without exactly one, those have no unambiguous number to sort on.`
    );
  }

  return primary[0]![0];
}

export function primaryMetric(tool: ToolDefinition): MetricDef {
  return tool.metrics[primaryMetricKey(tool)]!;
}

/** The primary metric's value from a record, or null if absent. */
export function primaryValue(tool: ToolDefinition, record: ScoreRecord): number | null {
  const value = record.metrics[primaryMetricKey(tool)];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Resolve a primary-metric value to a rank.
 *
 * Walks best to worst and returns the first rank whose threshold is met, so the
 * final entry acts as the catch-all. Returns the worst rank if a tool's table
 * somehow leaves a gap, rather than returning undefined into the UI.
 */
export function resolveRank(tool: ToolDefinition, value: number): RankDef {
  const { direction } = primaryMetric(tool);

  for (const rank of tool.ranks) {
    if (meetsThreshold(value, rank.threshold, direction)) return rank;
  }

  const worst = tool.ranks[tool.ranks.length - 1];
  if (!worst) throw new Error(`Tool "${tool.id}" defines no ranks.`);
  return worst;
}

/**
 * Every rank at or below the one achieved, best-first.
 *
 * Reaching Pro implies having reached Advanced, Intermediate, and Beginner —
 * the achieved-rank checklist would otherwise show gaps for anyone whose first
 * ever session landed above the bottom rung.
 */
export function ranksUpTo(tool: ToolDefinition, value: number): RankDef[] {
  const achieved = resolveRank(tool, value);
  const index = tool.ranks.findIndex((r) => r.id === achieved.id);
  return tool.ranks.slice(index);
}

/** Format a metric value for display, honouring the metric's own formatter. */
export function formatMetric(metric: MetricDef, value: number): string {
  const formatted = metric.format ? metric.format(value) : String(Math.round(value));
  return metric.unit ? `${formatted}${metric.unit}` : formatted;
}
