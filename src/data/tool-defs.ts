/**
 * Engine definitions for each tool.
 *
 * Kept separate from `tools.ts` (the nav/SEO registry) because these are
 * imported by client-side tool code, and the registry is imported by every page
 * that renders the sidebar. Splitting them keeps rank tables out of the bundle
 * on pages that only need a nav label.
 *
 * Thresholds below are transcribed from the pre-revamp CONFIG blocks so ranks
 * do not shift for existing players. Both tools score a session average.
 */

import { defineTool } from '../engine';

/**
 * Reaction time. Lower is better.
 * Legacy thresholds used `maxMs`: Elite ≤149, Pro ≤199, Advanced ≤249,
 * Intermediate ≤349, Beginner otherwise.
 */
export const reactionTool = defineTool({
  id: 'reaction-time',
  metrics: {
    ms: {
      label: 'Reaction time',
      direction: 'lower-is-better',
      unit: 'ms',
      primary: true,
    },
  },
  ranks: [
    { id: 'elite', name: 'Elite', threshold: 149, rangeLabel: '0-149ms' },
    { id: 'pro', name: 'Pro', threshold: 199, rangeLabel: '150-199ms' },
    { id: 'advanced', name: 'Advanced', threshold: 249, rangeLabel: '200-249ms' },
    { id: 'intermediate', name: 'Intermediate', threshold: 349, rangeLabel: '250-349ms' },
    { id: 'beginner', name: 'Beginner', threshold: Infinity, rangeLabel: '350ms and above' },
  ],
  maxHistory: 50,
  legacy: {
    best: 'reactionlab_personal_best',
    settings: 'reactionlab_settings',
    historyLog: 'reactionlab_history_log',
    achievedRanks: 'reactionlab_achieved_ranks',
    sessionHistory: 'reactionlab_session_history',
  },
});

/**
 * Clicks per second. Higher is better.
 * Legacy thresholds used `minCps`: Elite ≥10, Pro ≥8, Advanced ≥7,
 * Intermediate ≥4, Beginner otherwise.
 */
export const cpsTool = defineTool({
  id: 'cps',
  metrics: {
    cps: {
      label: 'Clicks per second',
      direction: 'higher-is-better',
      format: (v) => v.toFixed(1),
      primary: true,
    },
    clicks: {
      label: 'Total clicks',
      direction: 'higher-is-better',
    },
  },
  ranks: [
    { id: 'elite', name: 'Elite', threshold: 10, rangeLabel: '10+ CPS' },
    { id: 'pro', name: 'Pro', threshold: 8, rangeLabel: '8–9.9 CPS' },
    { id: 'advanced', name: 'Advanced', threshold: 7, rangeLabel: '7–7.9 CPS' },
    { id: 'intermediate', name: 'Intermediate', threshold: 4, rangeLabel: '4–6.9 CPS' },
    { id: 'beginner', name: 'Beginner', threshold: 0, rangeLabel: 'Under 4 CPS' },
  ],
  maxHistory: 20,
  legacy: {
    best: 'cpslab_best',
    settings: 'cpslab_settings',
    historyLog: 'cpslab_history_log',
    achievedRanks: 'cpslab_achieved_ranks',
    sessionHistory: 'cpslab_session_history',
  },
});

/**
 * Kohi click test. Higher is better.
 * The classic fixed format: 10 seconds, mouse clicks. Thresholds deliberately
 * match the CPS test so scores compare across the two tools (user decision).
 * A new tool — no legacy keys.
 */
export const kohiTool = defineTool({
  id: 'kohi',
  metrics: {
    cps: {
      label: 'Clicks per second',
      direction: 'higher-is-better',
      format: (v) => v.toFixed(1),
      primary: true,
    },
    clicks: {
      label: 'Total clicks',
      direction: 'higher-is-better',
    },
  },
  ranks: [
    { id: 'elite', name: 'Elite', threshold: 10, rangeLabel: '10+ CPS' },
    { id: 'pro', name: 'Pro', threshold: 8, rangeLabel: '8–9.9 CPS' },
    { id: 'advanced', name: 'Advanced', threshold: 7, rangeLabel: '7–7.9 CPS' },
    { id: 'intermediate', name: 'Intermediate', threshold: 4, rangeLabel: '4–6.9 CPS' },
    { id: 'beginner', name: 'Beginner', threshold: 0, rangeLabel: 'Under 4 CPS' },
  ],
  maxHistory: 20,
});

/**
 * Right click CPS. Higher is better.
 * Thresholds deliberately match the CPS and Kohi tests so a rank means the
 * same thing across all three click tools (user decision). A new tool — no
 * legacy keys.
 */
export const rightClickTool = defineTool({
  id: 'right-click',
  metrics: {
    cps: {
      label: 'Clicks per second',
      direction: 'higher-is-better',
      format: (v) => v.toFixed(1),
      primary: true,
    },
    clicks: {
      label: 'Total clicks',
      direction: 'higher-is-better',
    },
  },
  ranks: [
    { id: 'elite', name: 'Elite', threshold: 10, rangeLabel: '10+ CPS' },
    { id: 'pro', name: 'Pro', threshold: 8, rangeLabel: '8–9.9 CPS' },
    { id: 'advanced', name: 'Advanced', threshold: 7, rangeLabel: '7–7.9 CPS' },
    { id: 'intermediate', name: 'Intermediate', threshold: 4, rangeLabel: '4–6.9 CPS' },
    { id: 'beginner', name: 'Beginner', threshold: 0, rangeLabel: 'Under 4 CPS' },
  ],
  maxHistory: 20,
});

/**
 * Visual memory. Higher is better.
 *
 * The first milestone tool: a level number does not band into "you are an
 * Advanced rememberer", so it declares checkpoints instead of ranks (see
 * MilestoneDef). Level 25 is deliberately near-unreachable — milestones may
 * aspire in a way a rank table may not.
 */
export const visualMemoryTool = defineTool({
  id: 'visual-memory',
  metrics: {
    level: {
      label: 'Level',
      direction: 'higher-is-better',
      primary: true,
    },
    tiles: {
      label: 'Tiles recalled',
      direction: 'higher-is-better',
    },
  },
  milestones: [
    { id: 'level-5', name: 'Level 5', threshold: 5, detail: 'Warmed up' },
    { id: 'level-10', name: 'Level 10', threshold: 10, detail: 'Around average' },
    { id: 'level-15', name: 'Level 15', threshold: 15, detail: 'Strong recall' },
    { id: 'level-20', name: 'Level 20', threshold: 20, detail: 'Exceptional' },
    { id: 'level-25', name: 'Level 25', threshold: 25, detail: 'Almost nobody' },
  ],
  maxHistory: 20,
});

/**
 * Spacebar speed. Higher is better.
 *
 * The one click-family tool that does NOT share the CPS rank table (user
 * decision). Spacebar pressing has a different ceiling from mouse clicking —
 * two-thumb and drum techniques push the top end higher — and the site's own
 * advice is to compare spacebar scores only against other spacebar scores. A
 * shared table would have contradicted that.
 *
 * The metric key stays `cps` so the phrasing people search for ("spacebar
 * CPS") holds, even though the copy calls them presses.
 */
export const spacebarTool = defineTool({
  id: 'spacebar',
  metrics: {
    cps: {
      label: 'Presses per second',
      direction: 'higher-is-better',
      format: (v) => v.toFixed(1),
      primary: true,
    },
    presses: {
      label: 'Total presses',
      direction: 'higher-is-better',
    },
  },
  ranks: [
    { id: 'elite', name: 'Elite', threshold: 12, rangeLabel: '12+ CPS' },
    { id: 'pro', name: 'Pro', threshold: 9, rangeLabel: '9–11.9 CPS' },
    { id: 'advanced', name: 'Advanced', threshold: 7.5, rangeLabel: '7.5–8.9 CPS' },
    { id: 'intermediate', name: 'Intermediate', threshold: 5, rangeLabel: '5–7.4 CPS' },
    { id: 'beginner', name: 'Beginner', threshold: 0, rangeLabel: 'Under 5 CPS' },
  ],
  maxHistory: 20,
});
