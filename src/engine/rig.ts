/**
 * The telemetry rig — the shared UI below the test area.
 *
 * A tool page renders the static skeleton (ProgressWidgets.astro,
 * ResetModal.astro); this module brings it to life: personal best, session
 * average, rank checklist, trend chart, history log, and the reset flow. The
 * tool's own script owns only the measurement loop and the test-area DOM, and
 * reports finished sessions through `recordSession`.
 *
 * DOM contract: the element ids used here are emitted by ProgressWidgets.astro
 * and ResetModal.astro. This file is deliberately thin over the tested engine
 * core (ranks/stats/storage) — logic lives there, DOM wiring lives here.
 */

import { formatValue, primaryMetric, primaryMetricKey, ranksUpTo, resolveRank } from './ranks';
import { averagePrimary, beatsBest, trendSeries } from './stats';
import type { StorageAdapter, ToolStore } from './storage';
import type { RankDef, ScoreRecord, ToolDefinition } from './types';

/** Per-tool display copy the rig cannot invent. */
export interface RigCopy {
  /**
   * e.g. rank => `${rank}-tier click speed.`
   * Rendered as HTML — may carry markup like `<span class="desc-highlight">`.
   * Author constants only; never interpolate user input.
   */
  bestDescription: (rankName: string) => string;
  /**
   * e.g. n => `Average across your last ${n} run${n === 1 ? '' : 's'}.`
   * Also receives the average's rank name, for tools whose copy keys off it.
   * Rendered as HTML.
   */
  avgDescription: (runs: number, rankName: string) => string;
  /** History row score text, e.g. v => `${v.toFixed(1)} CPS` */
  historyScore: (value: number) => string;
  /** Chart tooltip, e.g. v => `${v} CPS` */
  chartTooltip: (value: number) => string;
  /** Chart x-label stem: 'Run' → "Run 1", "Run 2", … */
  runLabel: string;
}

export interface SessionOutcome {
  record: ScoreRecord;
  rank: RankDef;
  isBest: boolean;
}

export interface Rig {
  /** Re-render every widget from the store. Call once on page load. */
  refresh(): void;
  /** Persist a finished session and update all telemetry. */
  recordSession(metrics: Record<string, number>, settings: Record<string, unknown>): SessionOutcome;
}

interface RigConfig {
  /** Runs after a confirmed reset, so the tool can return its test area to idle. */
  onReset?: () => void;
  /**
   * How many of the newest records feed the average widget and the trend
   * chart. Defaults to all stored history. The reaction test keeps 50 history
   * rows but has always averaged and charted its last 20 sessions — parity
   * for returning players depends on this staying a window, not the full log.
   */
  telemetryWindow?: number;
  /** Chart y-axis. CPS starts at zero; reaction time does not. Default true. */
  chartBeginAtZero?: boolean;
}

function byId<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function setBadge(el: HTMLElement | null, baseClass: string, rank: RankDef | null): void {
  if (!el) return;
  el.textContent = rank ? rank.name : '—';
  el.className = rank ? `${baseClass} ${rank.id}` : baseClass;
}

export function createRig(
  tool: ToolDefinition,
  store: ToolStore,
  adapter: StorageAdapter,
  copy: RigCopy,
  config: RigConfig = {}
): Rig {
  const metric = primaryMetric(tool);
  const metricKey = primaryMetricKey(tool);

  /** The newest records feeding the average and the trend (newest-first). */
  const windowed = (records: ScoreRecord[]) =>
    config.telemetryWindow ? records.slice(0, config.telemetryWindow) : records;

  // --- Best / average widgets --------------------------------------------

  function renderBest(): void {
    const timeEl = byId('widget-pb-time');
    const descEl = byId('widget-pb-description');
    if (!timeEl) return;

    const best = store.getBest();
    const value = best ? best.metrics[metricKey] : undefined;

    if (typeof value === 'number' && Number.isFinite(value)) {
      const rank = resolveRank(tool, value);
      timeEl.textContent = formatValue(metric, value);
      setBadge(byId('widget-pb-rank'), 'pb-rank-badge', rank);
      if (descEl) descEl.innerHTML = copy.bestDescription(rank.name);
    } else {
      timeEl.textContent = '—';
      setBadge(byId('widget-pb-rank'), 'pb-rank-badge', null);
      if (descEl) descEl.textContent = descEl.dataset.empty ?? '';
    }
  }

  function renderAverage(): void {
    const timeEl = byId('widget-avg-time');
    const descEl = byId('widget-avg-description');
    const countEl = byId('widget-avg-sessions');
    if (!timeEl) return;

    const history = windowed(store.getHistory());
    const avg = averagePrimary(tool, history);

    if (avg !== null) {
      const display = formatValue(metric, avg);
      // Rank the value the user sees, not the raw mean — otherwise a 6.95
      // average would show "7.0" beside an Intermediate badge. The legacy
      // tools ranked the rounded value for the same reason.
      const rank = resolveRank(tool, Number.parseFloat(display));
      timeEl.textContent = display;
      setBadge(byId('widget-avg-rank'), 'pb-rank-badge', rank);
      if (countEl) countEl.textContent = String(history.length);
      if (descEl) descEl.innerHTML = copy.avgDescription(history.length, rank.name);
    } else {
      timeEl.textContent = '—';
      setBadge(byId('widget-avg-rank'), 'pb-rank-badge', null);
      if (countEl) countEl.textContent = '0';
      if (descEl) descEl.textContent = descEl.dataset.empty ?? '';
    }
  }

  // --- Rank checklist ------------------------------------------------------

  function renderChecklist(): void {
    const list = byId('rank-checklist');
    if (!list) return;

    const achieved = new Set<string>(store.getAchievedRanks());
    list.querySelectorAll<HTMLElement>('.rank-item').forEach((item) => {
      const hit = achieved.has(item.dataset.rank ?? '');
      item.classList.toggle('achieved', hit);
      const check = item.querySelector('.rank-check');
      if (check) check.textContent = hit ? '✓' : '✗';
    });
  }

  // --- History log ---------------------------------------------------------

  function renderHistory(): void {
    const list = byId('history-list');
    const empty = byId('history-empty-message');
    if (!list) return;

    list.querySelectorAll('.history-item').forEach((el) => el.remove());
    const history = store.getHistory();
    if (empty) empty.hidden = history.length > 0;

    for (const record of history) {
      const value = record.metrics[metricKey];
      if (typeof value !== 'number' || !Number.isFinite(value)) continue;
      const rank = resolveRank(tool, value);

      const item = document.createElement('div');
      item.className = 'history-item';

      const score = document.createElement('span');
      score.className = 'history-score';
      score.textContent = copy.historyScore(value);

      const badge = document.createElement('span');
      badge.className = `history-rank ${rank.id}`;
      badge.textContent = rank.name;

      const time = document.createElement('span');
      time.className = 'history-time';
      time.textContent = new Date(record.ts).toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });

      item.append(score, badge, time);
      list.appendChild(item);
    }
  }

  // --- Trend chart -----------------------------------------------------------
  // Chart.js is dynamically imported the first time there is anything to draw
  // (REVAMP.md §2) — a visitor who never finishes a session never downloads it.

  type ChartInstance = {
    data: { labels: unknown[]; datasets: { data: number[] }[] };
    update: () => void;
  };
  let chart: ChartInstance | null = null;
  let chartLoading = false;

  function chartColors() {
    const styles = getComputedStyle(document.documentElement);
    return {
      line: styles.getPropertyValue('--signal-green').trim() || '#22c55e',
      ink: styles.getPropertyValue('--ink-secondary').trim() || '#a1a1aa',
    };
  }

  async function ensureChart(): Promise<void> {
    if (chart || chartLoading) return;
    const canvas = byId<HTMLCanvasElement>('session-chart');
    if (!canvas) return;

    chartLoading = true;
    try {
      const { default: Chart } = await import('chart.js/auto');
      const { line, ink } = chartColors();

      chart = new Chart(canvas, {
        type: 'line',
        data: {
          labels: [],
          datasets: [
            {
              label: metric.label,
              data: [],
              borderColor: line,
              backgroundColor: 'rgba(34, 197, 94, 0.2)', // --signal-green at 20%
              borderWidth: 2,
              fill: true,
              tension: 0.3,
              pointBackgroundColor: line,
              pointBorderColor: line,
              pointRadius: 4,
              pointHoverRadius: 6,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: 'rgba(0, 0, 0, 0.8)',
              titleColor: '#fff',
              bodyColor: '#fff',
              padding: 10,
              displayColors: false,
              callbacks: {
                label: (ctx) => copy.chartTooltip((ctx.parsed as { y: number }).y),
              },
            },
          },
          scales: {
            x: { display: false },
            y: {
              display: true,
              beginAtZero: config.chartBeginAtZero ?? true,
              grid: { color: 'rgba(255, 255, 255, 0.05)' },
              ticks: { color: ink, font: { size: 10 } },
            },
          },
        },
      }) as unknown as ChartInstance;
    } catch {
      // Chart failing to load must never take the test down with it.
      chartLoading = false;
      return;
    }
    chartLoading = false;
    renderChart();
  }

  function renderChart(): void {
    const description = byId('chart-description');
    const empty = byId('chart-empty-message');
    const series = trendSeries(tool, windowed(store.getHistory()));
    const hasData = series.length > 0;

    if (description) description.hidden = !hasData;
    if (empty) empty.hidden = hasData;

    if (hasData && !chart) {
      void ensureChart(); // renders once loaded
      return;
    }
    if (!chart) return;

    chart.data.labels = series.map((_, i) => `${copy.runLabel} ${i + 1}`);
    chart.data.datasets[0]!.data = series;
    chart.update();
  }

  // --- Reset flow ------------------------------------------------------------

  let lastFocused: HTMLElement | null = null;

  function openModal(): void {
    const modal = byId('reset-modal');
    if (!modal) return;
    lastFocused = document.activeElement as HTMLElement | null;
    modal.hidden = false;
    byId('modal-cancel-btn')?.focus();
  }

  function closeModal(): void {
    const modal = byId('reset-modal');
    if (!modal) return;
    modal.hidden = true;
    lastFocused?.focus();
    lastFocused = null;
  }

  function confirmReset(): void {
    store.clearProgress();

    // The user asked for their data erased — that includes the pre-revamp
    // copies the migration deliberately left in place. Settings survive, as
    // the dialog promises. The `migrated` marker also survives (clearProgress
    // keeps it), so the wiped data is not re-imported on the next load.
    if (tool.legacy) {
      adapter.remove(tool.legacy.best);
      adapter.remove(tool.legacy.historyLog);
      adapter.remove(tool.legacy.achievedRanks);
      if (tool.legacy.sessionHistory) adapter.remove(tool.legacy.sessionHistory);
    }

    refresh();
    config.onReset?.();
    closeModal();
  }

  function wireReset(): void {
    byId('reset-btn')?.addEventListener('click', openModal);
    byId('modal-cancel-btn')?.addEventListener('click', closeModal);
    byId('modal-confirm-btn')?.addEventListener('click', confirmReset);

    const modal = byId('reset-modal');
    modal?.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal && !modal.hidden) closeModal();
    });
  }

  // --- Public surface --------------------------------------------------------

  function refresh(): void {
    renderBest();
    renderAverage();
    renderChecklist();
    renderHistory();
    renderChart();
  }

  wireReset();

  return {
    refresh,

    recordSession(metrics, settings) {
      const record: ScoreRecord = { toolId: tool.id, ts: Date.now(), metrics, settings };

      const value = record.metrics[metricKey];
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`recordSession: missing primary metric "${metricKey}"`);
      }

      const isBest = beatsBest(tool, record, store.getBest());
      store.addRecord(record);
      if (isBest) store.setBest(record);

      const rank = resolveRank(tool, value);
      store.addAchievedRanks(ranksUpTo(tool, value).map((r) => r.id));

      refresh();
      return { record, rank, isBest };
    },
  };
}
