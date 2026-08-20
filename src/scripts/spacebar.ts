/**
 * Spacebar speed test — measurement loop and test-area rendering.
 *
 * A sibling of the CPS test with one deliberate difference: the spacebar is
 * the only input. There is no input-method setting to get wrong, which is the
 * whole reason this tool exists separately from /cps.
 *
 * Timing integrity: performance.now() is the clock, and the keydown handler
 * increments synchronously — nothing sits between the key and the count
 * (REVAMP.md §8).
 */

import { openTool, resolveRank } from '../engine';
import { createRig } from '../engine/rig';
import { createBeeper } from '../engine/sound';
import { spacebarTool } from '../data/tool-defs';

interface SpacebarSettings extends Record<string, unknown> {
  duration: number;
  sound: boolean;
}

const DURATIONS = [5, 10, 30, 60];
const DEFAULT_SETTINGS: SpacebarSettings = { duration: 5, sound: true };
const START_FREQ = 1046; // C6 — run start
const END_FREQ = 523; // C5 — run end

const { store, adapter } = (() => {
  const opened = openTool(spacebarTool);
  return { store: opened.store, adapter: opened.adapter };
})();

/**
 * Phones and tablets have no spacebar, and a keyboard-only test would be dead
 * on the largest slice of traffic. On a coarse pointer the test area doubles
 * as a tappable key; on a mouse-driven machine taps are ignored, so this
 * cannot quietly become a second click test.
 */
const isTouchInput = window.matchMedia('(pointer: coarse)').matches;

// --- Settings ----------------------------------------------------------------

function loadSettings(): SpacebarSettings {
  const raw = store.getSettings<SpacebarSettings>(DEFAULT_SETTINGS);
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
  if (!node) throw new Error(`Spacebar test: missing #${id}`);
  return node as T;
}

const area = el('sb-area');
const contentDefault = el('sb-content-default');
const live = el('sb-live');
const results = el('sb-results');
const hint = el('sb-hint');
const status = el('sb-status-text');
const instruction = el('sb-instruction');
const announceEl = el('sb-announce');
const cpsValue = el('sb-value');
const pressCount = el('sb-count');
const timeleft = el('sb-timeleft');
const cpsFinal = el('sb-final');
const rankLabel = el('sb-rank-label');
const resultMeta = el('sb-result-meta');
const bestFlag = el('sb-best-flag');
const message = el('sb-message');
const tryAgainBtn = el('sb-try-again');
const timerFill = el('sb-timer-fill');
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
  spacebarTool,
  store,
  adapter,
  {
    bestDescription: (rank) => `${rank}-tier spacebar speed.`,
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
let presses = 0;
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
  elite: 'Elite speed. That thumb is a machine.',
  pro: 'Pro-level pressing. Seriously fast.',
  advanced: 'Fast and steady - above the pack.',
  intermediate: 'Solid pace. A warm-up and some rhythm will push you higher.',
  beginner: 'Good start. Relax your hand and try a quick warm-up run.',
};

// --- Run lifecycle ------------------------------------------------------------------

function startRun(): void {
  beeper.unlock();
  runStatus = 'counting';
  presses = 0;
  runDuration = settings.duration;
  startTime = performance.now();

  contentDefault.hidden = true;
  results.hidden = true;
  bestFlag.hidden = true;
  live.hidden = false;
  live.removeAttribute('aria-hidden');

  cpsValue.textContent = '0.0';
  pressCount.textContent = '0';
  timeleft.textContent = runDuration.toFixed(1);

  setAreaState('cps-counting');
  announce(`Go. Press the spacebar as fast as you can for ${runDuration} seconds.`);
  beeper.play(START_FREQ);

  rafId = requestAnimationFrame(tick);
}

function tick(): void {
  const elapsed = (performance.now() - startTime) / 1000;
  const remaining = Math.max(0, runDuration - elapsed);

  timerFill.style.transform = `scaleX(${remaining / runDuration})`;
  timeleft.textContent = remaining.toFixed(1);
  // Clamp the denominator early so the first fraction of a second doesn't spike.
  cpsValue.textContent = (presses / Math.max(elapsed, 0.3)).toFixed(1);

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

  const cps = Math.round((presses / runDuration) * 10) / 10;
  // Non-null: this tool declares ranks, so resolveRank always finds one.
  const rank = resolveRank(spacebarTool, cps)!;

  live.hidden = true;
  live.setAttribute('aria-hidden', 'true');
  cpsFinal.textContent = cps.toFixed(1);
  rankLabel.textContent = rank.name;
  rankLabel.className = `rank-badge ${rank.id}`;
  resultMeta.textContent = `${presses} press${presses === 1 ? '' : 'es'} in ${runDuration}s`;

  setAreaState('session-complete', rank.id);
  results.hidden = false;
  beeper.play(END_FREQ);

  // Sound is a preference, not a condition — it does not shape the score, so
  // it stays out of the record's settings context (§3.2). `inputMethod` is
  // recorded even though it never varies: a leaderboard reading these records
  // should not have to infer it from the tool id.
  const { isBest } = rig.recordSession(
    { cps, presses },
    { duration: runDuration, inputMethod: 'spacebar' }
  );

  bestFlag.hidden = !isBest;
  message.textContent = isBest
    ? 'New personal best. Keep that momentum going!'
    : (MESSAGES[rank.id] ?? 'Nice run. Go again to beat it.');

  announce(
    `Time. ${cps.toFixed(1)} presses per second. Rank ${rank.name}. ${presses} presses.` +
      (isBest ? ' New best.' : '')
  );
}

function resetRun(): void {
  cancelAnimationFrame(rafId);
  runStatus = 'idle';
  presses = 0;

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

function registerPress(e?: Event): void {
  if (runStatus !== 'counting') return;
  presses++;
  pressCount.textContent = String(presses);
  pulseKey();
  spawnRipple(e);
}

function handleInput(e?: Event): void {
  if (runStatus === 'idle') {
    startRun();
    registerPress(e);
  } else if (runStatus === 'counting') {
    registerPress(e);
  }
  // 'complete': ignore; Try Again restarts.
}

document.addEventListener('keydown', (e) => {
  // The rig owns Escape-to-close for the modal; while it is open the test
  // must not swallow keys.
  if (!resetModal.hidden) return;
  if (e.code !== 'Space' && e.key !== ' ') return;

  // Don't hijack Space meant to activate a focused control (settings buttons,
  // links, the FAQ disclosures below the test).
  const active = document.activeElement;
  const onControl =
    active instanceof HTMLElement &&
    active !== area &&
    ['BUTTON', 'A', 'SUMMARY', 'INPUT', 'TEXTAREA', 'SELECT', 'DETAILS'].includes(active.tagName);
  if (onControl) return;

  e.preventDefault(); // stop page scroll
  // Auto-repeat would let a held key farm presses. One press, one count.
  if (e.repeat) return;
  handleInput(e);
});

// Touch devices have no spacebar, so the area itself is the key (see
// isTouchInput). A fine pointer gets nothing here on purpose.
if (isTouchInput) {
  area.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest('#sb-try-again')) return; // the button handles it
    e.preventDefault();
    handleInput(e);
  });
}

tryAgainBtn.addEventListener('click', () => {
  resetRun();
  area.focus();
});

// --- Key press feedback ----------------------------------------------------------------

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * The pressed-key flash. Colour alone never carries state here — the live
 * readout and count are the real signal (PRODUCT.md, WCAG 2.1 AA).
 */
function pulseKey(): void {
  if (prefersReducedMotion()) return;
  area.classList.remove('key-down');
  // Force a reflow so a press mid-animation restarts it rather than being
  // swallowed. Deliberate layout read, and it happens after the count.
  void area.offsetWidth;
  area.classList.add('key-down');
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
  ripple.className = 'sb-ripple';
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
  const action = isTouchInput ? 'Tap the key' : 'Press Space';
  if (runStatus === 'idle') status.textContent = `${action} to start`;
  instruction.textContent = `${settings.duration}-second test`;
  hint.textContent = isTouchInput
    ? 'Tap the key as fast as you can until the timer runs out. Your score is your presses per second.'
    : 'Press the spacebar as fast as you can until the timer runs out. Your score is your presses per second.';
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

      // A duration button keeps focus after the click, and Space is the test's
      // input — leaving focus there would re-fire the button instead of
      // starting a run.
      btn.blur();
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
  soundToggle.blur(); // same reason as the duration buttons
});

// --- Boot --------------------------------------------------------------------------------

if (isTouchInput) area.classList.add('touch-key');
setActiveOption(durationGroup, String(settings.duration));
updateSoundIcon();
updateInputText();
rig.refresh();
