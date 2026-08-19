/**
 * Tool engine — public surface.
 *
 * A tool supplies its measurement loop and its test-area rendering. Everything
 * else — persistence, ranks, personal best, trend, history — comes from here.
 */

export * from './types';
export * from './ranks';
export * from './stats';
export * from './storage';
export * from './migrate';

import { primaryMetricKey } from './ranks';
import { createToolStore, defaultAdapter } from './storage';
import type { StorageAdapter } from './storage';
import { migrateLegacyData } from './migrate';
import type { ToolDefinition } from './types';

/**
 * Validate a tool definition at module load.
 *
 * Cheap to run and catches the mistakes that would otherwise surface as
 * confusing UI: no single primary metric, no tier list (or both kinds at
 * once), and an unreachable bottom rank.
 */
export function defineTool(tool: ToolDefinition): ToolDefinition {
  primaryMetricKey(tool); // throws if not exactly one

  const hasRanks = (tool.ranks?.length ?? 0) > 0;
  const hasMilestones = (tool.milestones?.length ?? 0) > 0;

  if (hasRanks === hasMilestones) {
    throw new Error(
      `Tool "${tool.id}" must declare either ranks or milestones, not ${hasRanks ? 'both' : 'neither'}. ` +
        `Ranks band every score and carry colour; milestones are checkpoints with no current tier. ` +
        `Declaring both would leave the rig with two competing checklists.`
    );
  }

  // Milestones are exempt from the reachability rule below on purpose: an
  // out-of-reach top milestone is a valid aspiration, whereas a rank table
  // that fails to classify a score leaves the UI with nothing to show.
  if (hasRanks) {
    const ranks = tool.ranks!;
    const worst = ranks[ranks.length - 1]!;
    const direction = tool.metrics[primaryMetricKey(tool)]!.direction;
    const unreachable =
      direction === 'lower-is-better'
        ? worst.threshold !== Infinity
        : worst.threshold !== -Infinity && worst.threshold > 0;

    if (unreachable) {
      throw new Error(
        `Tool "${tool.id}" has an unreachable bottom rank ("${worst.id}", threshold ${worst.threshold}). ` +
          `The last rank must match any value, or scores past it resolve to nothing.`
      );
    }
  }

  return tool;
}

/**
 * Open a tool's store, running the one-time legacy import first.
 *
 * Call this once per page load, before reading anything. The migration is
 * idempotent — it is guarded by a marker key, not by the presence of data.
 */
export function openTool(tool: ToolDefinition, adapter: StorageAdapter = defaultAdapter()) {
  const store = createToolStore(tool, adapter);
  const migration = migrateLegacyData(tool, store, adapter);
  return { store, migration, adapter };
}
