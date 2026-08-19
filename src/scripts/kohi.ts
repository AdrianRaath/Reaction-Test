/**
 * Kohi click test — measurement loop and test-area rendering.
 *
 * The classic fixed format: 10 seconds, mouse clicks, first click starts the
 * clock. No settings panel — the fixed conditions are the point, so the only
 * stored preference is sound. Everything below the test area (best, average,
 * ranks, trend, history, reset) is the telemetry rig's job.
 *
 * Timing integrity: performance.now() is the clock, and the pointerdown /
 * keydown handlers count clicks synchronously — nothing sits between the
 * input and the increment (REVAMP.md §8).
 */

import { openTool, resolveRank } from '../engine';
import { createRig } from '../engine/rig';
import { createBeeper } from '../engine/sound';
import { kohiTool } from '../data/tool-defs';

interface KohiSettings extends Record<string, unknown> {
  sound: boolean;
}

/** The Kohi format — fixed, not configurable. */
const DURATION = 10;
const DEFAULT_SETTINGS: KohiSettings = { sound: true };
const START_FREQ = 1046; // C6 — run start
const END_FREQ = 523; // C5 — run end

const { store, adapter } = (() => {
  const opened = openTool(kohiTool);
  return { store: opened.store, adapter: opened.adapter };
})();

// --- Settings ----------------------------------------------------------------

function loadSettings(): KohiSettings {
  const raw = store.getSettings<KohiSettings>(DEFAULT_SETTINGS);
  return { sound: typeof raw.sound === 'boolean' ? raw.sound : true };
}

const settings = loadSettings();

// --- DOM ----------------------------------------------------------------------

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Kohi test: missing #${id}`);
  return node as T;
}

const area = el('kohi-area');
const contentDefault = el('kohi-content-default');
const live = el('kohi-live');
const results = el('kohi-results');
const status = el('kohi-status');
const announceEl = el('kohi-announce');
const cpsValue = el('kohi-value');
const cpsCount = el('kohi-count');
const timeleft = el('kohi-timeleft');
const cpsFinal = el('kohi-final');
const rankLabel = el('kohi-rank-label');
const resultMeta = el('kohi-result-meta');
const bestFlag = el('kohi-best-flag');
const message = el('kohi-message');
const tryAgainBtn = el('kohi-try-again');
const timerFill = el('kohi-timer-fill');
const soundToggle = el('sound-toggle');
const soundOnIcon = el('sound-icon-on');
const soundOffIcon = el('sound-icon-off');
const resetModal = el('reset-modal');

// --- Sound ----------------------------------------------------------------------

const beeper = createBeeper({ enabled: () => settings.sound });

function updateSoundIcon(): void {
  soundOnIcon.hidden = !settings.sound;
  soundOffIcon.hidden = settings.sound;
  soundToggle.classList.toggle('muted', !settings.sound);
  soundToggle.setAttribute('aria-pressed', String(settings.sound));
}

// --- Telemetry rig -----------------------------------------------------------------

const rig = createRig(
  kohiTool,
  store,
  adapter,
  {
    bestDescription: (rank) => `${rank}-tier click speed.`,
    avgDescription: (runs) => `Average across your last ${runs} run${runs === 1 ? '' : 's'}.`,
    historyScore: (v) => `${v.toFixed(1)} CPS`,
    chartTooltip: (v) => `${v} CPS`,
    runLabel: 'Run',
  },
  { onReset: () => resetRun() }
);

// --- Run state -------------------------------------------------------------------

type RunStatus = 'idle' | 'counting' | 'complete';

let runStatus: RunStatus = 'idle';
let clicks = 0;
let startTime = 0;
let rafId = 0;

const RANK_AREA_CLASSES = [
  'state-idle',
  'state-kohi-counting',
  'state-session-complete',
  'rank-elite',
  'rank-pro',
  'rank-advanced',
  'rank-intermediate',
  'rank-beginner',
];

function setAreaState(name: string, rankId?: string): void {
  area.classList.remove(...RANK_AREA_CLASSES);
  area.classList.add(`state-${name}`);
  if (rankId) area.classList.add(`rank-${rankId}`);
}

function announce(text: string): void {
  announceEl.textContent = text;
}

const MESSAGES: Record<string, string> = {
  elite: 'Elite. Ten seconds at that pace is serious speed.',
  pro: 'Pro-level clicking, held for the full ten.',
  advanced: 'Above the pack. Keep the rhythm and push for Pro.',
  intermediate: 'Solid pace. A steady rhythm beats a burst here.',
  beginner: 'Good start. Relax your hand and go again.',
};

// --- Run lifecycle ------------------------------------------------------------------

function startRun(): void {
  beeper.unlock();
  runStatus = 'counting';
  clicks = 0;
  startTime = performance.now();

  contentDefault.hidden = true;
  results.hidden = true;
  bestFlag.hidden = true;
  live.hidden = false;
  live.removeAttribute('aria-hidden');

  cpsValue.textContent = '0.0';
  cpsCount.textContent = '0';
  timeleft.textContent = DURATION.toFixed(1);

  setAreaState('kohi-counting');
  announce(`Go. Click as fast as you can for ${DURATION} seconds.`);
  beeper.play(START_FREQ);

  rafId = requestAnimationFrame(tick);
}

function tick(): void {
  const elapsed = (performance.now() - startTime) / 1000;
  const remaining = Math.max(0, DURATION - elapsed);

  timerFill.style.transform = `scaleX(${remaining / DURATION})`;
  timeleft.textContent = remaining.toFixed(1);
  // Clamp the denominator early so the first fraction of a second doesn't spike.
  cpsValue.textContent = (clicks / Math.max(elapsed, 0.3)).toFixed(1);

  if (remaining <= 0) {
    endRun();
    return;
  }
  rafId = requestAnimationFrame(tick);
}

function endRun(): void {
  cancelAnimationFrame(rafId);
  runStatus = 'complete';
  timerFill.style.transform = 'scaleX(0)';

  const cps = Math.round((clicks / DURATION) * 10) / 10;
  // Non-null: this tool declares ranks, so resolveRank always finds one.
  const rank = resolveRank(kohiTool, cps)!;

  live.hidden = true;
  live.setAttribute('aria-hidden', 'true');
  cpsFinal.textContent = cps.toFixed(1);
  rankLabel.textContent = rank.name;
  rankLabel.className = `rank-badge ${rank.id}`;
  resultMeta.textContent = `${clicks} click${clicks === 1 ? '' : 's'} in ${DURATION}s`;

  setAreaState('session-complete', rank.id);
  results.hidden = false;
  beeper.play(END_FREQ);

  // Duration and input method are fixed, but they are still the conditions the
  // score was achieved under — recorded for leaderboard-readiness (§4.1).
  const { isBest } = rig.recordSession(
    { cps, clicks },
    { duration: DURATION, inputMethod: 'mouse' }
  );

  bestFlag.hidden = !isBest;
  message.textContent = isBest
    ? 'New personal best. Keep that momentum going!'
    : (MESSAGES[rank.id] ?? 'Nice run. Go again to beat it.');

  announce(
    `Time. ${cps.toFixed(1)} clicks per second. Rank ${rank.name}. ${clicks} clicks.` +
      (isBest ? ' New best.' : '')
  );
}

function resetRun(): void {
  cancelAnimationFrame(rafId);
  runStatus = 'idle';
  clicks = 0;

  live.hidden = true;
  live.setAttribute('aria-hidden', 'true');
  results.hidden = true;
  bestFlag.hidden = true;
  contentDefault.hidden = false;
  setAreaState('idle');
  timerFill.style.transform = 'scaleX(0)';
  status.textContent = 'Click to start';
}

// --- Input ------------------------------------------------------------------------

function registerClick(e?: Event): void {
  if (runStatus !== 'counting') return;
  clicks++;
  cpsCount.textContent = String(clicks);
  spawnRipple(e);
}

function handleInput(e?: Event): void {
  if (runStatus === 'idle') {
    startRun();
    registerClick(e);
  } else if (runStatus === 'counting') {
    registerClick(e);
  }
  // 'complete': ignore; Try Again restarts.
}

area.addEventListener('pointerdown', (e) => {
  if ((e.target as HTMLElement).closest('#kohi-try-again')) return; // the button handles it
  if (e.button && e.button !== 0) return; // primary button only
  e.preventDefault();
  handleInput(e);
});

// Mouse is the Kohi format, but keyboard stays as the accessibility path:
// Space/Enter work when the area is focused (or mid-run, so a run started by
// keyboard can be finished by keyboard).
document.addEventListener('keydown', (e) => {
  // The rig owns Escape-to-close for the modal; while it is open the test
  // must not swallow keys.
  if (!resetModal.hidden) return;

  const isSpace = e.code === 'Space' || e.key === ' ';
  const isEnter = e.key === 'Enter';

  const active = document.activeElement;
  const areaFocused = active === area;
  // Don't hijack keys meant to activate a focused control (buttons, links).
  const onControl =
    active instanceof HTMLElement &&
    active !== area &&
    ['BUTTON', 'A', 'SUMMARY', 'INPUT', 'TEXTAREA', 'SELECT', 'DETAILS'].includes(active.tagName);
  if (onControl) return;

  if ((isSpace || isEnter) && (areaFocused || runStatus === 'counting')) {
    if (isSpace) e.preventDefault(); // stop page scroll
    handleInput(e);
  }
});

tryAgainBtn.addEventListener('click', () => {
  resetRun();
  area.focus();
});

// --- Click ripple --------------------------------------------------------------------

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function spawnRipple(e?: Event): void {
  if (prefersReducedMotion()) return;

  let x = area.clientWidth / 2;
  let y = area.clientHeight / 2;
  if (e instanceof MouseEvent && e.clientX !== 0) {
    const rect = area.getBoundingClientRect();
    x = e.clientX - rect.left;
    y = e.clientY - rect.top;
  }

  const ripple = document.createElement('span');
  ripple.className = 'kohi-ripple';
  ripple.style.left = `${x}px`;
  ripple.style.top = `${y}px`;
  ripple.addEventListener('animationend', () => ripple.remove());
  area.appendChild(ripple);
}

// --- Sound toggle -----------------------------------------------------------------------

soundToggle.addEventListener('click', () => {
  settings.sound = !settings.sound;
  store.setSettings(settings);
  updateSoundIcon();
  beeper.unlock();
});

// --- Boot --------------------------------------------------------------------------------

updateSoundIcon();
rig.refresh();
