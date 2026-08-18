/**
 * CPS test — measurement loop and test-area rendering.
 *
 * Ported from the pre-revamp cps.js. Everything below the test area (best,
 * average, ranks, trend, history, reset) moved into the engine's telemetry
 * rig; this file owns only what is unique to this tool: the click counting,
 * the timer, and the test-area state machine.
 *
 * Timing integrity: performance.now() is the clock, and the pointerdown /
 * keydown handlers count clicks synchronously — nothing sits between the
 * input and the increment (REVAMP.md §8).
 */

import { openTool, resolveRank } from '../engine';
import { createRig } from '../engine/rig';
import { createBeeper } from '../engine/sound';
import { cpsTool } from '../data/tool-defs';

interface CpsSettings extends Record<string, unknown> {
  duration: number;
  inputMethod: 'mouse' | 'spacebar';
  sound: boolean;
}

const DURATIONS = [5, 10, 30, 60];
const DEFAULT_SETTINGS: CpsSettings = { duration: 5, inputMethod: 'mouse', sound: true };
const START_FREQ = 1046; // C6 — run start
const END_FREQ = 523; // C5 — run end

const { store, adapter } = (() => {
  const opened = openTool(cpsTool);
  return { store: opened.store, adapter: opened.adapter };
})();

// --- Settings (validated exactly as the legacy loader did) -------------------

function loadSettings(): CpsSettings {
  const raw = store.getSettings<CpsSettings>(DEFAULT_SETTINGS);
  return {
    duration: DURATIONS.includes(Number(raw.duration))
      ? Number(raw.duration)
      : DEFAULT_SETTINGS.duration,
    inputMethod: raw.inputMethod === 'spacebar' ? 'spacebar' : 'mouse',
    sound: typeof raw.sound === 'boolean' ? raw.sound : true,
  };
}

const settings = loadSettings();

// --- DOM ----------------------------------------------------------------------

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`CPS test: missing #${id}`);
  return node as T;
}

const area = el('cps-area');
const contentDefault = el('cps-content-default');
const live = el('cps-live');
const results = el('cps-results');
const hint = el('cps-hint');
const status = el('cps-status');
const instruction = el('cps-instruction');
const announceEl = el('cps-announce');
const cpsValue = el('cps-value');
const cpsCount = el('cps-count');
const timeleft = el('cps-timeleft');
const cpsFinal = el('cps-final');
const rankLabel = el('cps-rank-label');
const resultMeta = el('cps-result-meta');
const bestFlag = el('cps-best-flag');
const message = el('cps-message');
const tryAgainBtn = el('cps-try-again');
const timerFill = el('cps-timer-fill');
const durationGroup = el('duration-group');
const inputGroup = el('input-group');
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
  cpsTool,
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
let runDuration = settings.duration;
let rafId = 0;

const RANK_AREA_CLASSES = [
  'state-idle',
  'state-cps-counting',
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
  elite: 'Elite speed. Your hands are flying.',
  pro: 'Pro-level clicking. Seriously fast.',
  advanced: 'Fast and steady - above the pack.',
  intermediate: 'Solid pace. A warm-up and some rhythm will push you higher.',
  beginner: 'Good start. Relax your hand and try a quick warm-up run.',
};

// --- Run lifecycle ------------------------------------------------------------------

function startRun(): void {
  beeper.unlock();
  runStatus = 'counting';
  clicks = 0;
  runDuration = settings.duration;
  startTime = performance.now();

  contentDefault.hidden = true;
  results.hidden = true;
  bestFlag.hidden = true;
  live.hidden = false;
  live.removeAttribute('aria-hidden');

  cpsValue.textContent = '0.0';
  cpsCount.textContent = '0';
  timeleft.textContent = runDuration.toFixed(1);

  setAreaState('cps-counting');
  announce(`Go. Click as fast as you can for ${runDuration} seconds.`);
  beeper.play(START_FREQ);

  rafId = requestAnimationFrame(tick);
}

function tick(): void {
  const elapsed = (performance.now() - startTime) / 1000;
  const remaining = Math.max(0, runDuration - elapsed);

  timerFill.style.transform = `scaleX(${remaining / runDuration})`;
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

  const cps = Math.round((clicks / runDuration) * 10) / 10;
  const rank = resolveRank(cpsTool, cps);

  live.hidden = true;
  live.setAttribute('aria-hidden', 'true');
  cpsFinal.textContent = cps.toFixed(1);
  rankLabel.textContent = rank.name;
  rankLabel.className = `rank-badge ${rank.id}`;
  resultMeta.textContent = `${clicks} click${clicks === 1 ? '' : 's'} in ${runDuration}s`;

  setAreaState('session-complete', rank.id);
  results.hidden = false;
  beeper.play(END_FREQ);

  // Sound is a preference, not a condition — it does not shape the score, so
  // it stays out of the record's settings context (§3.2).
  const { isBest } = rig.recordSession(
    { cps, clicks },
    { duration: runDuration, inputMethod: settings.inputMethod }
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
  updateInputText();
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
  if ((e.target as HTMLElement).closest('#cps-try-again')) return; // the button handles it
  if (e.button && e.button !== 0) return; // primary button only
  e.preventDefault();
  handleInput(e);
});

document.addEventListener('keydown', (e) => {
  // The rig owns Escape-to-close for the modal; while it is open the test
  // must not swallow keys.
  if (!resetModal.hidden) return;

  const isSpace = e.code === 'Space' || e.key === ' ';
  const isEnter = e.key === 'Enter';

  const active = document.activeElement;
  const areaFocused = active === area;
  // Don't hijack keys meant to activate a focused control (settings, buttons, links).
  const onControl =
    active instanceof HTMLElement &&
    active !== area &&
    ['BUTTON', 'A', 'SUMMARY', 'INPUT', 'TEXTAREA', 'SELECT', 'DETAILS'].includes(active.tagName);

  if (settings.inputMethod === 'spacebar') {
    if (isSpace && !onControl) {
      e.preventDefault(); // stop page scroll
      handleInput(e);
    }
  } else if ((isSpace || isEnter) && (areaFocused || runStatus === 'counting')) {
    // Mouse mode: keyboard is the accessibility path (area focused or mid-run).
    if (isSpace) e.preventDefault();
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
  ripple.className = 'cps-ripple';
  ripple.style.left = `${x}px`;
  ripple.style.top = `${y}px`;
  ripple.addEventListener('animationend', () => ripple.remove());
  area.appendChild(ripple);
}

// --- Settings UI -----------------------------------------------------------------------

function saveSettings(): void {
  store.setSettings(settings);
}

function updateInputText(): void {
  const action = settings.inputMethod === 'mouse' ? 'Click' : 'Press Space';
  if (runStatus === 'idle') status.textContent = `${action} to start`;
  instruction.textContent = `${settings.duration}-second test`;
  hint.textContent =
    settings.inputMethod === 'mouse'
      ? 'Click as fast as you can until the timer runs out. Your score is your clicks per second.'
      : 'Press Space as fast as you can until the timer runs out. Your score is your clicks per second.';
}

function setupButtonGroup(group: HTMLElement, apply: (value: string) => void): void {
  group.querySelectorAll<HTMLButtonElement>('.btn-option').forEach((btn) => {
    btn.addEventListener('click', () => {
      group.querySelectorAll('.btn-option').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      apply(btn.dataset.value ?? '');
      saveSettings();

      // Abort any run in progress — visibly, not silently.
      if (runStatus !== 'idle') resetRun();
      else updateInputText();
    });
  });
}

function setActiveOption(group: HTMLElement, value: string): void {
  group.querySelectorAll<HTMLButtonElement>('.btn-option').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.value === value);
  });
}

setupButtonGroup(durationGroup, (value) => {
  const parsed = Number.parseInt(value, 10);
  if (DURATIONS.includes(parsed)) settings.duration = parsed;
});
setupButtonGroup(inputGroup, (value) => {
  if (value === 'mouse' || value === 'spacebar') settings.inputMethod = value;
});

soundToggle.addEventListener('click', () => {
  settings.sound = !settings.sound;
  saveSettings();
  updateSoundIcon();
  beeper.unlock();
});

// --- Boot --------------------------------------------------------------------------------

setActiveOption(durationGroup, String(settings.duration));
setActiveOption(inputGroup, settings.inputMethod);
updateSoundIcon();
updateInputText();
rig.refresh();
