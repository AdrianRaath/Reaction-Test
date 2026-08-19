/**
 * Rank resolution and score comparison.
 *
 * Every comparison in the engine routes through here, so `direction` is handled
 * in exactly one place. The legacy tools each hardcoded their own sense of
 * "better" (`time < best` in app.js, `cps > best` in cps.js), which is precisely
 * the fork this module exists to prevent.
 */

import type { Direction, MetricDef, RankDef, ScoreRecord, TierDef, ToolDefinition } from './types';

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

/** The tool's tier list, whichever flavour it declared. */
export function tiersOf(tool: ToolDefinition): TierDef[] {
  return tool.ranks ?? tool.milestones ?? [];
}

/**
 * Resolve a primary-metric value to a rank, or null for a tool that has none.
 *
 * Walks best to worst and returns the first rank whose threshold is met, so the
 * final entry acts as the catch-all. Returns the worst rank if a tool's table
 * somehow leaves a gap, rather than returning undefined into the UI.
 *
 * Milestone tools return null: they deliberately have no "current tier", and
 * every caller in the rig treats null as "render no badge".
 */
export function resolveRank(tool: ToolDefinition, value: number): RankDef | null {
  const ranks = tool.ranks;
  if (!ranks || ranks.length === 0) return null;

  const { direction } = primaryMetric(tool);

  for (const rank of ranks) {
    if (meetsThreshold(value, rank.threshold, direction)) return rank;
  }

  return ranks[ranks.length - 1]!;
}

/**
 * Every rank at or below the one achieved, best-first. Empty for a tool with
 * no ranks.
 *
 * Reaching Pro implies having reached Advanced, Intermediate, and Beginner —
 * the achieved-rank checklist would otherwise show gaps for anyone whose first
 * ever session landed above the bottom rung.
 */
export function ranksUpTo(tool: ToolDefinition, value: number): RankDef[] {
  const achieved = resolveRank(tool, value);
  if (!achieved || !tool.ranks) return [];
  const index = tool.ranks.findIndex((r) => r.id === achieved.id);
  return tool.ranks.slice(index);
}

/**
 * Ids of every tier the value clears — what the achieved checklist persists.
 *
 * One function for both flavours. Rank thresholds nest, so filtering by "meets
 * the threshold" yields exactly `ranksUpTo`; milestones simply keep the ones
 * cleared, with no implied ordering between them.
 */
export function achievedTierIds(tool: ToolDefinition, value: number): string[] {
  const { direction } = primaryMetric(tool);
  return tiersOf(tool)
    .filter((tier) => meetsThreshold(value, tier.threshold, direction))
    .map((tier) => tier.id);
}

/** Format a metric value without its unit — for UIs that render the unit separately. */
export function formatValue(metric: MetricDef, value: number): string {
  return metric.format ? metric.format(value) : String(Math.round(value));
}

/** Format a metric value for display, honouring the metric's own formatter. */
export function formatMetric(metric: MetricDef, value: number): string {
  const formatted = formatValue(metric, value);
  return metric.unit ? `${formatted}${metric.unit}` : formatted;
}
