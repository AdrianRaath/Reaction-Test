/**
 * Tool engine — shared types.
 *
 * The shared surface across tools is not the test, it is everything below the
 * test area: personal best, session average, rank, trend, history, settings.
 * A tool supplies its measurement loop; the engine supplies the rest.
 *
 * See REVAMP.md §3.1.
 */

/** Which way is better for a given metric. Belongs to the metric, not the tool. */
export type Direction = 'higher-is-better' | 'lower-is-better';

/**
 * A closed set, deliberately.
 *
 * DESIGN.md licenses exactly five rank colours and forbids colour anywhere else
 * (the Rank-Only Colour Rule). Typing the ids as a union means a new rank
 * cannot be introduced without also deciding what colour it is.
 */
export type RankId = 'elite' | 'pro' | 'advanced' | 'intermediate' | 'beginner';

export interface MetricDef {
  /** Display name, e.g. 'WPM'. */
  label: string;
  direction: Direction;
  /** Short unit suffix rendered after the value, e.g. 'ms'. */
  unit?: string;
  /** Formats a raw value for display. Defaults to rounding to a whole number. */
  format?: (value: number) => string;
  /**
   * Exactly one metric per tool is primary. It drives the rank, the personal
   * best, the trend chart, and anything the sidebar surfaces — so everything
   * downstream has one unambiguous number to sort on. Secondary metrics are
   * stored and displayed but never rank.
   */
  primary?: boolean;
}

/**
 * A threshold on the primary metric that a score either clears or does not.
 *
 * Ranks and milestones are the two flavours. Ranks band every score into
 * exactly one tier and carry colour; milestones are aspirational checkpoints
 * with no colour and no notion of "the tier you are currently in".
 */
export interface TierDef {
  /** Stable id — persisted in the achieved list, so renaming one orphans it. */
  id: string;
  name: string;
  /**
   * Threshold on the primary metric, expressed as "at least this good".
   *
   * Direction resolves what that means: for a lower-is-better metric the value
   * must be <= threshold, for higher-is-better it must be >=. This is what lets
   * the reaction test (ranked on `maxMs`) and CPS (ranked on `minCps`) share one
   * rank resolver instead of forking it.
   */
  threshold: number;
}

export interface RankDef extends TierDef {
  id: RankId;
  /** Human-readable range shown in the checklist and rank table, e.g. '8–9.9 CPS'. */
  rangeLabel?: string;
}

/**
 * An aspirational checkpoint, for tools that measure progress without banding
 * it into tiers.
 *
 * Deliberately not a RankDef: milestones take no colour (the Rank-Only Colour
 * Rule), never badge the personal best or a history row, and may sit out of
 * reach for nearly every player without breaking anything — where a rank table
 * must classify every possible score.
 */
export interface MilestoneDef extends TierDef {
  /** Short qualifier shown beneath the name, e.g. 'Above average'. */
  detail?: string;
}

/**
 * One completed session.
 *
 * Stored as a record rather than a bare number so that (a) adding a secondary
 * metric to an existing tool does not invalidate its stored history, and (b) a
 * future leaderboard can compare like with like. See REVAMP.md §3.2 and §4.1.
 */
export interface ScoreRecord {
  toolId: string;
  /** Epoch milliseconds. */
  ts: number;
  /** Keyed by metric key. Always an object, never a scalar. */
  metrics: Record<string, number>;
  /** The settings in effect when the score was achieved. */
  settings: Record<string, unknown>;
  /**
   * Set on records recovered from pre-revamp localStorage.
   *
   * Legacy entries stored only `{ score, timestamp }` — no settings context —
   * so a 5-second CPS run is indistinguishable from a 60-second one. They are
   * fine for a personal trend line but must be excluded from any cross-user
   * comparison, because the conditions cannot be reconstructed after the fact.
   */
  migrated?: boolean;
}

export interface ToolDefinition {
  /** Stable id. Used in storage keys — changing it orphans user data. */
  id: string;
  /** Keyed by metric key. Exactly one entry must be `primary: true`. */
  metrics: Record<string, MetricDef>;
  /**
   * Rank bands, ordered best to worst. The last entry must be unconditionally
   * reachable. Mutually exclusive with `milestones` — a tool declares one or
   * the other, never both and never neither.
   */
  ranks?: RankDef[];
  /**
   * Milestone checkpoints, ordered easiest to hardest. The alternative to
   * `ranks` for a tool where banding every score would be meaningless.
   */
  milestones?: MilestoneDef[];
  /** How many session records to retain. Defaults to 50. */
  maxHistory?: number;
  /** Legacy localStorage keys to migrate from, if this tool predates the engine. */
  legacy?: LegacyKeys;
}

/** Pre-revamp localStorage keys for a tool that existed before the engine. */
export interface LegacyKeys {
  /** e.g. 'reactionlab_personal_best' — a bare number as a string. */
  best: string;
  /** e.g. 'reactionlab_settings' — a JSON object. */
  settings: string;
  /** e.g. 'reactionlab_history_log' — JSON `[{ score, timestamp }]`, newest first. */
  historyLog: string;
  /** e.g. 'reactionlab_achieved_ranks' — a JSON array of rank ids. */
  achievedRanks: string;
  /**
   * e.g. 'reactionlab_session_history' — the legacy trend chart's bare number
   * array. Never imported (redundant with historyLog — see migrate.ts), but
   * listed so Reset can erase it along with the other legacy data.
   */
  sessionHistory?: string;
}

export const DEFAULT_MAX_HISTORY = 50;
