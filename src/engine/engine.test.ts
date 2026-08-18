import { describe, expect, it } from 'vitest';

import { defineTool, openTool } from './index';
import {
  formatMetric,
  isBetter,
  meetsThreshold,
  primaryMetricKey,
  ranksUpTo,
  resolveRank,
} from './ranks';
import { averagePrimary, beatsBest, bestRecord, mean, trendSeries } from './stats';
import { createToolStore, keyFor, memoryAdapter } from './storage';
import { migrateLegacyData } from './migrate';
import type { ScoreRecord } from './types';
import { cpsTool, reactionTool } from '../data/tool-defs';

const record = (toolId: string, ts: number, metrics: Record<string, number>): ScoreRecord => ({
  toolId,
  ts,
  metrics,
  settings: {},
});

// ---------------------------------------------------------------------------
// Direction — the whole reason the engine exists. The legacy tools each
// hardcoded their own sense of "better"; these assert one resolver handles both.
// ---------------------------------------------------------------------------

describe('direction', () => {
  it('treats lower as better for reaction time', () => {
    expect(isBetter(200, 250, 'lower-is-better')).toBe(true);
    expect(isBetter(250, 200, 'lower-is-better')).toBe(false);
  });

  it('treats higher as better for CPS', () => {
    expect(isBetter(9, 7, 'higher-is-better')).toBe(true);
    expect(isBetter(7, 9, 'higher-is-better')).toBe(false);
  });

  it('does not count an equal score as better', () => {
    expect(isBetter(200, 200, 'lower-is-better')).toBe(false);
    expect(isBetter(200, 200, 'higher-is-better')).toBe(false);
  });

  it('reads thresholds as "at least this good" in both directions', () => {
    expect(meetsThreshold(149, 149, 'lower-is-better')).toBe(true);
    expect(meetsThreshold(150, 149, 'lower-is-better')).toBe(false);
    expect(meetsThreshold(10, 10, 'higher-is-better')).toBe(true);
    expect(meetsThreshold(9.9, 10, 'higher-is-better')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Rank tables must produce exactly what the pre-revamp CONFIG produced, or
// existing players silently change rank on their next visit.
// ---------------------------------------------------------------------------

describe('rank parity with the legacy thresholds', () => {
  it.each([
    [100, 'elite'],
    [149, 'elite'],
    [150, 'pro'],
    [199, 'pro'],
    [200, 'advanced'],
    [249, 'advanced'],
    [250, 'intermediate'],
    [349, 'intermediate'],
    [350, 'beginner'],
    [2000, 'beginner'],
  ])('reaction %ims ranks as %s', (ms, expected) => {
    expect(resolveRank(reactionTool, ms).id).toBe(expected);
  });

  it.each([
    [12, 'elite'],
    [10, 'elite'],
    [9.9, 'pro'],
    [8, 'pro'],
    [7.9, 'advanced'],
    [7, 'advanced'],
    [6.9, 'intermediate'],
    [4, 'intermediate'],
    [3.9, 'beginner'],
    [0, 'beginner'],
  ])('cps %s ranks as %s', (cps, expected) => {
    expect(resolveRank(cpsTool, cps).id).toBe(expected);
  });

  it('includes every rank at or below the one achieved', () => {
    expect(ranksUpTo(reactionTool, 180).map((r) => r.id)).toEqual([
      'pro',
      'advanced',
      'intermediate',
      'beginner',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Tool definition validation
// ---------------------------------------------------------------------------

describe('defineTool', () => {
  const base = {
    id: 'x',
    ranks: [{ id: 'beginner' as const, name: 'Beginner', threshold: Infinity }],
  };

  it('rejects a tool with no primary metric', () => {
    expect(() =>
      defineTool({ ...base, metrics: { a: { label: 'A', direction: 'lower-is-better' } } })
    ).toThrow(/exactly one primary metric/);
  });

  it('rejects a tool with two primary metrics', () => {
    expect(() =>
      defineTool({
        ...base,
        metrics: {
          a: { label: 'A', direction: 'lower-is-better', primary: true },
          b: { label: 'B', direction: 'lower-is-better', primary: true },
        },
      })
    ).toThrow(/exactly one primary metric/);
  });

  it('rejects an unreachable bottom rank', () => {
    expect(() =>
      defineTool({
        id: 'x',
        metrics: { a: { label: 'A', direction: 'lower-is-better', primary: true } },
        ranks: [{ id: 'beginner', name: 'Beginner', threshold: 500 }],
      })
    ).toThrow(/unreachable bottom rank/);
  });

  it('accepts a multi-metric tool with one primary', () => {
    expect(primaryMetricKey(cpsTool)).toBe('cps');
  });
});

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

describe('stats', () => {
  it('returns null for the mean of nothing', () => {
    expect(mean([])).toBeNull();
  });

  it('does not round the mean — precision belongs to the display formatter', () => {
    // Legacy CPS showed averages to one decimal; a mean rounded to a whole
    // number here would silently coarsen that at the port.
    expect(mean([6, 7])).toBe(6.5);
    expect(mean([9.2, 9.3])).toBeCloseTo(9.25);
  });

  it('picks the best record by direction', () => {
    const rs = [
      record('reaction-time', 1, { ms: 300 }),
      record('reaction-time', 2, { ms: 210 }),
      record('reaction-time', 3, { ms: 260 }),
    ];
    expect(bestRecord(reactionTool, rs)?.metrics.ms).toBe(210);

    const cs = [record('cps', 1, { cps: 6 }), record('cps', 2, { cps: 9 })];
    expect(bestRecord(cpsTool, cs)?.metrics.cps).toBe(9);
  });

  it('keeps the earlier record when scores tie', () => {
    const rs = [
      record('reaction-time', 100, { ms: 200 }),
      record('reaction-time', 200, { ms: 200 }),
    ];
    // A personal best is when you first achieved it, not the last time you matched it.
    expect(bestRecord(reactionTool, rs)?.ts).toBe(100);
  });

  it('ignores records missing the primary metric', () => {
    const rs = [record('cps', 1, { clicks: 40 }), record('cps', 2, { cps: 5 })];
    expect(bestRecord(cpsTool, rs)?.metrics.cps).toBe(5);
  });

  it('treats any score as beating an absent best', () => {
    expect(beatsBest(reactionTool, record('reaction-time', 1, { ms: 900 }), null)).toBe(true);
  });

  it('does not treat an equal score as a new best', () => {
    const best = record('reaction-time', 1, { ms: 200 });
    expect(beatsBest(reactionTool, record('reaction-time', 2, { ms: 200 }), best)).toBe(false);
  });

  it('averages the primary metric only', () => {
    const rs = [record('cps', 1, { cps: 6, clicks: 30 }), record('cps', 2, { cps: 8, clicks: 40 })];
    expect(averagePrimary(cpsTool, rs)).toBe(7);
  });

  it('returns the trend oldest-first regardless of stored order', () => {
    const rs = [
      record('reaction-time', 300, { ms: 210 }),
      record('reaction-time', 100, { ms: 260 }),
      record('reaction-time', 200, { ms: 240 }),
    ];
    expect(trendSeries(reactionTool, rs)).toEqual([260, 240, 210]);
  });
});

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

describe('storage', () => {
  it('namespaces keys by tool', () => {
    expect(keyFor('cps', 'best')).toBe('reflexlab:cps:best');
    expect(keyFor('reaction-time', 'history')).toBe('reflexlab:reaction-time:history');
  });

  it('keeps history newest-first and trims to the cap', () => {
    const adapter = memoryAdapter();
    const store = createToolStore({ ...cpsTool, maxHistory: 3 }, adapter);

    for (let i = 1; i <= 5; i++) store.addRecord(record('cps', i, { cps: i }));

    const history = store.getHistory();
    expect(history).toHaveLength(3);
    expect(history.map((r) => r.ts)).toEqual([5, 4, 3]);
  });

  it('merges stored settings over defaults', () => {
    const adapter = memoryAdapter();
    const store = createToolStore(cpsTool, adapter);
    store.setSettings({ duration: 30 });

    expect(store.getSettings({ duration: 5, sound: true })).toEqual({
      duration: 30,
      sound: true,
    });
  });

  it('does not duplicate achieved ranks', () => {
    const adapter = memoryAdapter();
    const store = createToolStore(cpsTool, adapter);
    store.addAchievedRanks(['pro', 'advanced']);
    store.addAchievedRanks(['pro', 'beginner']);

    expect([...store.getAchievedRanks()].sort()).toEqual(['advanced', 'beginner', 'pro']);
  });

  it('clears progress but preserves settings, as the Reset dialog promises', () => {
    const adapter = memoryAdapter();
    const store = createToolStore(cpsTool, adapter);
    store.setSettings({ duration: 30 });
    store.setBest(record('cps', 1, { cps: 9 }));
    store.addRecord(record('cps', 1, { cps: 9 }));
    store.addAchievedRanks(['pro']);

    store.clearProgress();

    expect(store.getBest()).toBeNull();
    expect(store.getHistory()).toEqual([]);
    expect(store.getAchievedRanks()).toEqual([]);
    expect(store.getSettings({ duration: 5 })).toEqual({ duration: 30 });
  });

  it('treats malformed JSON as absent rather than throwing', () => {
    const adapter = memoryAdapter({ 'reflexlab:cps:history': '{not json' });
    const store = createToolStore(cpsTool, adapter);
    expect(store.getHistory()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Migration — the blocking requirement (§3.2). These guard real user data.
// ---------------------------------------------------------------------------

describe('legacy migration', () => {
  const legacyCps = () =>
    memoryAdapter({
      cpslab_best: '9.4',
      cpslab_settings: JSON.stringify({ duration: 30, inputMethod: 'mouse', sound: false }),
      cpslab_history_log: JSON.stringify([
        { score: 9.4, timestamp: 3000 },
        { score: 7.1, timestamp: 2000 },
        { score: 5.2, timestamp: 1000 },
      ]),
      cpslab_achieved_ranks: JSON.stringify(['pro', 'advanced', 'intermediate']),
    });

  it('imports history, best, settings and ranks', () => {
    const adapter = legacyCps();
    const { store, migration } = openTool(cpsTool, adapter);

    expect(migration.ran).toBe(true);
    expect(migration.recordsImported).toBe(3);

    expect(store.getHistory().map((r) => r.metrics.cps)).toEqual([9.4, 7.1, 5.2]);
    expect(store.getBest()?.metrics.cps).toBe(9.4);
    expect(store.getSettings({ duration: 5 }).duration).toBe(30);
    expect([...store.getAchievedRanks()].sort()).toEqual(['advanced', 'intermediate', 'pro']);
  });

  it('gives the imported best the timestamp of the session it came from', () => {
    const { store } = openTool(cpsTool, legacyCps());
    expect(store.getBest()?.ts).toBe(3000);
  });

  it('flags imported records as migrated, since their settings are unknowable', () => {
    const { store } = openTool(cpsTool, legacyCps());
    expect(store.getHistory().every((r) => r.migrated)).toBe(true);
    expect(store.getHistory()[0]!.settings).toEqual({});
  });

  it('runs only once, even after the user clears their progress', () => {
    const adapter = legacyCps();
    const { store } = openTool(cpsTool, adapter);
    store.clearProgress();

    const second = migrateLegacyData(cpsTool, store, adapter);

    // Re-importing here would resurrect the data the user just asked to erase.
    expect(second.ran).toBe(false);
    expect(store.getHistory()).toEqual([]);
  });

  it('resolves a duplicated best score to when it was first achieved', () => {
    const adapter = memoryAdapter({
      cpslab_best: '9.4',
      cpslab_history_log: JSON.stringify([
        { score: 9.4, timestamp: 5000 },
        { score: 9.4, timestamp: 1500 },
        { score: 6.0, timestamp: 1000 },
      ]),
    });
    const { store } = openTool(cpsTool, adapter);

    // Matches bestRecord's tie rule: a PB is when you first achieved it.
    expect(store.getBest()?.ts).toBe(1500);
  });

  it('imports a best that has no matching history entry', () => {
    const adapter = memoryAdapter({ reactionlab_personal_best: '188' });
    const { store } = openTool(reactionTool, adapter);

    expect(store.getBest()?.metrics.ms).toBe(188);
    expect(store.getBest()?.ts).toBe(0);
  });

  it('survives malformed legacy data without losing the rest', () => {
    const adapter = memoryAdapter({
      cpslab_best: 'not-a-number',
      cpslab_settings: '{{{',
      cpslab_history_log: JSON.stringify([
        { score: 8.2, timestamp: 2000 },
        { score: 'bad', timestamp: 1000 },
        null,
      ]),
      cpslab_achieved_ranks: JSON.stringify(['pro', 'nonsense', 42]),
    });
    const { store, migration } = openTool(cpsTool, adapter);

    expect(migration.recordsImported).toBe(1);
    expect(migration.bestImported).toBe(false);
    expect(store.getHistory()[0]!.metrics.cps).toBe(8.2);
    expect(store.getAchievedRanks()).toEqual(['pro']);
  });

  it('is a no-op for a user with no legacy data', () => {
    const { store, migration } = openTool(cpsTool, memoryAdapter());
    expect(migration.recordsImported).toBe(0);
    expect(store.getHistory()).toEqual([]);
  });

  it('does not delete the legacy keys', () => {
    const adapter = legacyCps();
    openTool(cpsTool, adapter);
    // Kept deliberately: if a bug is found in the import after release, the
    // source data is still there to re-run against.
    expect(adapter.get('cpslab_best')).toBe('9.4');
  });

  it('keeps the two tools independent', () => {
    const adapter = legacyCps();
    const cps = openTool(cpsTool, adapter);
    const reaction = openTool(reactionTool, adapter);

    expect(cps.store.getHistory()).toHaveLength(3);
    expect(reaction.store.getHistory()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

describe('formatMetric', () => {
  it('appends the unit for reaction time', () => {
    expect(formatMetric(reactionTool.metrics.ms!, 247.4)).toBe('247ms');
  });

  it('uses the metric formatter for CPS', () => {
    expect(formatMetric(cpsTool.metrics.cps!, 9.37)).toBe('9.4');
  });
});
