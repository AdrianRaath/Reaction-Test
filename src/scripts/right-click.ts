/**
 * Right click CPS test — measurement loop and test-area rendering.
 *
 * The CPS test's format with one twist: only right mouse button presses
 * (button === 2) score, and the browser context menu is suppressed inside the
 * test area so right-clicking is usable at speed. Left clicks and touch taps
 * do not count — on devices with no fine pointer the page shows a notice
 * pointing to the regular CPS test instead. Everything below the test area
 * (best, average, ranks, trend, history, reset) is the telemetry rig's job.
 *
 * Timing integrity: performance.now() is the clock, and the pointerdown /
 * keydown handlers count clicks synchronously — nothing sits between the
 * input and the increment (REVAMP.md §8).
 */

import { openTool, resolveRank } from '../engine';
import { createRig } from '../engine/rig';
import { createBeeper } from '../engine/sound';
import { rightClickTool } from '../data/tool-defs';

interface RightClickSettings extends Record<string, unknown> {
  duration: number;
  sound: boolean;
}

const DURATIONS = [5, 10, 30, 60];
const DEFAULT_SETTINGS: RightClickSettings = { duration: 5, sound: true };
const START_FREQ = 1046; // C6 — run start
const END_FREQ = 523; // C5 — run end

const { store, adapter } = (() => {
  const opened = openTool(rightClickTool);
  return { store: opened.store, adapter: opened.adapter };
})();

// --- Settings (validated — stored values are untrusted) ----------------------

function loadSettings(): RightClickSettings {
  const raw = store.getSettings<RightClickSettings>(DEFAULT_SETTINGS);
  return {
    duration: DURATIONS.includes(Number(raw.duration))
      ? Number(raw.duration)
      : DEFAULT_SETTINGS.duration,
    sound: typeof raw.sound === 'boolean' ? raw.sound : true,
  };
}

const settings = loadSettings();

// --- DOM ----------------------------------------------------------------------

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Right click test: missing #${id}`);
  return node as T;
}

const area = el('rclick-area');
const contentDefault = el('rclick-content-default');
const live = el('rclick-live');
const results = el('rclick-results');
const status = el('rclick-status');
const instruction = el('rclick-instruction');
const touchNote = el('rclick-touch-note');
const announceEl = el('rclick-announce');
const cpsValue = el('rclick-value');
const cpsCount = el('rclick-count');
const timeleft = el('rclick-timeleft');
const cpsFinal = el('rclick-final');
const rankLabel = el('rclick-rank-label');
const resultMeta = el('rclick-result-meta');
const bestFlag = el('rclick-best-flag');
const message = el('rclick-message');
const tryAgainBtn = el('rclick-try-again');
const timerFill = el('rclick-timer-fill');
const durationGroup = el('duration-group');
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
  rightClickTool,
  store,
  adapter,
  {
    bestDescription: (rank) => `${rank}-tier right click speed.`,
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
  'state-rclick-counting',
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
  elite: 'Elite right click speed. That finger is trained.',
  pro: 'Pro-level pace on the weaker finger. Fast.',
  advanced: 'Above the pack. Keep the rhythm and push for Pro.',
  intermediate: 'Solid pace. Most right hands live here.',
  beginner: 'Good start. Relax your hand and go again.',
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

  setAreaState('rclick-counting');
  announce(`Go. Right click as fast as you can for ${runDuration} seconds.`);
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
  const rank = resolveRank(rightClickTool, cps);

  live.hidden = true;
  live.setAttribute('aria-hidden', 'true');
  cpsFinal.textContent = cps.toFixed(1);
  rankLabel.textContent = rank.name;
  rankLabel.className = `rank-badge ${rank.id}`;
  resultMeta.textContent = `${clicks} click${clicks === 1 ? '' : 's'} in ${runDuration}s`;

  setAreaState('session-complete', rank.id);
  results.hidden = false;
  beeper.play(END_FREQ);

  const { isBest } = rig.recordSession(
    { cps, clicks },
    { duration: runDuration, inputMethod: 'right-click' }
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
  updateInstructionText();
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

// The whole point of the tool: the context menu must never open over the test
// area, idle or mid-run, or the second right click eats the menu instead.
area.addEventListener('contextmenu', (e) => e.preventDefault());

area.addEventListener('pointerdown', (e) => {
  if ((e.target as HTMLElement).closest('#rclick-try-again')) return; // the button handles it
  if (e.button !== 2) return; // right button only — left clicks and taps don't score
  e.preventDefault();
  handleInput(e);
});

// Right click is the format, but keyboard stays as the accessibility path:
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
  // Don't hijack keys meant to activate a focused control (settings, buttons, links).
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
  ripple.className = 'rclick-ripple';
  ripple.style.left = `${x}px`;
  ripple.style.top = `${y}px`;
  ripple.addEventListener('animationend', () => ripple.remove());
  area.appendChild(ripple);
}

// --- Settings UI -----------------------------------------------------------------------

function saveSettings(): void {
  store.setSettings(settings);
}

function updateInstructionText(): void {
  if (runStatus === 'idle') status.textContent = 'Right click to start';
  instruction.textContent = `${settings.duration}-second test`;
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
      else updateInstructionText();
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

soundToggle.addEventListener('click', () => {
  settings.sound = !settings.sound;
  saveSettings();
  updateSoundIcon();
  beeper.unlock();
});

// --- Boot --------------------------------------------------------------------------------

// No fine pointer means no right button — surface the notice instead of
// letting the tap-and-nothing-happens experience explain itself.
if (!window.matchMedia('(any-pointer: fine)').matches) {
  touchNote.hidden = false;
}

setActiveOption(durationGroup, String(settings.duration));
updateSoundIcon();
updateInstructionText();
rig.refresh();
