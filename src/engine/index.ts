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
 * Cheap to run and catches the two mistakes that would otherwise surface as
 * confusing UI: no single primary metric, and an unreachable bottom rank.
 */
export function defineTool(tool: ToolDefinition): ToolDefinition {
  primaryMetricKey(tool); // throws if not exactly one

  if (tool.ranks.length === 0) {
    throw new Error(`Tool "${tool.id}" defines no ranks.`);
  }

  const worst = tool.ranks[tool.ranks.length - 1]!;
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
  return { store, migration };
}
