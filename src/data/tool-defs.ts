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
