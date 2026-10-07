/**
 * F1 reaction time test — measurement loop and test-area rendering.
 *
 * The race-start light sequence: five red light pairs come on one second
 * apart, hold for a random interval, then all go out at once. The user reacts
 * to lights-out. Moving before lights-out is a jump start and voids the
 * attempt, as on the grid.
 *
 * The telemetry below the test area is the engine's rig; this file owns the
 * state machine that IS the game:
 * idle → lights (ramp + hold) → go (lights out) → result, with jump starts.
 *
 * Timing integrity (REVAMP.md §8) — the two lines that are the product:
 * `goTimestamp = performance.now()` at lights-out, and
 * `performance.now() - goTimestamp` in the input handler. Nothing may be
 * inserted between stimulus and handler. Input events match the reaction
 * test ('click' / 'touchend' / 'keydown') so times on the two tests are
 * measured the same way.
 */

import { openTool } from '../engine';
import { createRig } from '../engine/rig';
import { createBeeper } from '../engine/sound';
import { f1ReactionTool } from '../data/tool-defs';

interface F1Settings extends Record<string, unknown> {
  rounds: number;
  inputMethod: 'mouse' | 'spacebar';
  sound: boolean;
}

const ROUNDS = [1, 3, 5, 10];
const DEFAULT_SETTINGS: F1Settings = {
  rounds: 5,
  inputMethod: 'mouse',
  sound: true,
};

// The start procedure, as the sporting regulations describe it: five lights
// at one-second intervals, then lights-out at a random moment between 0.2 and
// 3 seconds after the fifth. Fixed, not a setting — the fixed sequence is what
// makes this a different test from the one at /.
const LIGHT_COUNT = 5;
const LIGHT_INTERVAL_MS = 1000;
const HOLD_MIN_MS = 200;
const HOLD_MAX_MS = 3000;

const BEEP_FREQ = 880; // A5 — same GO signal as the reaction test

const { store, adapter } = openTool(f1ReactionTool);

// --- Settings ----------------------------------------------------------------

function loadSettings(): F1Settings {
  const raw = store.getSettings<F1Settings>(DEFAULT_SETTINGS);
  return {
    rounds: ROUNDS.includes(Number(raw.rounds)) ? Number(raw.rounds) : DEFAULT_SETTINGS.rounds,
    inputMethod: raw.inputMethod === 'spacebar' ? 'spacebar' : 'mouse',
    sound: typeof raw.sound === 'boolean' ? raw.sound : true,
  };
}

const settings = loadSettings();

// --- DOM ----------------------------------------------------------------------

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`F1 reaction test: missing #${id}`);
  return node as T;
}

const area = el('f1-area');
const contentDefault = el('f1-content-default');
const contentResults = el('f1-content-results');
const gantry = el('f1-gantry');
const columns = Array.from(gantry.querySelectorAll<HTMLElement>('.f1-column'));
const hint = el('f1-hint');
const status = el('f1-status');
const result = el('f1-result');
const instruction = el('f1-instruction');
const announceEl = el('f1-announce');
const progressBar = el('f1-progress-bar');
const avgTime = el('f1-avg-time');
const attemptsList = el('f1-attempts-list');
const bestFlag = el('f1-best-flag');
const resultMessage = el('f1-result-message');
const tryAgainBtn = el('f1-try-again');
const roundsGroup = el('rounds-group');
const inputGroup = el('input-group');
const soundToggle = el('sound-toggle');
const soundOnIcon = el('sound-icon-on');
const soundOffIcon = el('sound-icon-off');
const resetModal = el('reset-modal');

if (columns.length !== LIGHT_COUNT) {
  throw new Error(
    `F1 reaction test: expected ${LIGHT_COUNT} light columns, found ${columns.length}`
  );
}

// --- Sound ----------------------------------------------------------------------

const beeper = createBeeper({ gain: 0.3, enabled: () => settings.sound });

function updateSoundIcon(): void {
  soundOnIcon.hidden = !settings.sound;
  soundOffIcon.hidden = settings.sound;
  soundToggle.classList.toggle('muted', !settings.sound);
  soundToggle.setAttribute('aria-pressed', String(settings.sound));
}

// --- Telemetry rig -----------------------------------------------------------------

const HIGHLIGHT_PB = '<span class="desc-highlight">best start</span>';
const HIGHLIGHT_AVG = '<span class="desc-highlight">average start</span>';

const rig = createRig(
  f1ReactionTool,
  store,
  adapter,
  {
    // Milestone tool: no rank name to key off, so one line each.
    bestDescription: () => `Your ${HIGHLIGHT_PB} is the fastest session average you have recorded.`,
    avgDescription: () =>
      `Your ${HIGHLIGHT_AVG} across recent sessions. Watch the trend, not one run.`,
    historyScore: (v) => `${Math.round(v)}ms`,
    chartTooltip: (v) => `${v}ms`,
    runLabel: 'Session',
  },
  {
    onReset: () => resetSession(),
    telemetryWindow: 20,
    chartBeginAtZero: false,
  }
);

// --- Test state machine --------------------------------------------------------------

type Status = 'idle' | 'lights' | 'go' | 'result' | 'jump-start' | 'session-complete';

let testStatus: Status = 'idle';
let currentRound = 0;
let attempts: number[] = [];
let jumpStarts = 0;
let goTimestamp = 0;
let timerIds: number[] = [];
let inputLocked = false;

const STATE_CLASSES = [
  'state-idle',
  'state-lights',
  'state-go',
  'state-result',
  'state-jump-start',
  'state-session-complete',
];

function setAreaState(name: Status): void {
  area.classList.remove(...STATE_CLASSES);
  area.classList.add(`state-${name}`);
}

function announce(text: string): void {
  announceEl.textContent = text;
}

function clearTimers(): void {
  for (const id of timerIds) window.clearTimeout(id);
  timerIds = [];
}

function setLitCount(count: number): void {
  columns.forEach((column, index) => column.classList.toggle('lit', index < count));
}

const actionText = () => (settings.inputMethod === 'mouse' ? 'Click' : 'Press Space');
const actionVerb = () => (settings.inputMethod === 'mouse' ? 'click' : 'hit Space');

function updateProgressBar(): void {
  const progress = settings.rounds > 0 ? (currentRound / settings.rounds) * 100 : 0;
  progressBar.style.width = `${progress}%`;
}

// --- Round lifecycle ------------------------------------------------------------------

function startTest(): void {
  beeper.unlock();

  if (testStatus === 'session-complete') resetSession();
  clearTimers();

  contentDefault.hidden = false;
  contentResults.hidden = true;
  hint.hidden = true;

  testStatus = 'lights';
  inputLocked = false;
  setAreaState('lights');
  setLitCount(0);

  status.textContent = 'Wait for lights out';
  result.textContent = '';
  instruction.textContent = 'Moving early is a jump start';
  announce('Lights coming on. Wait for lights out.');

  // Light i comes on at i seconds; the first one right away. The hold starts
  // when the fifth is lit.
  for (let i = 0; i < LIGHT_COUNT; i++) {
    timerIds.push(window.setTimeout(() => setLitCount(i + 1), i * LIGHT_INTERVAL_MS));
  }
  const hold = HOLD_MIN_MS + Math.random() * (HOLD_MAX_MS - HOLD_MIN_MS);
  timerIds.push(window.setTimeout(lightsOut, (LIGHT_COUNT - 1) * LIGHT_INTERVAL_MS + hold));
}

function lightsOut(): void {
  testStatus = 'go';
  goTimestamp = performance.now();
  inputLocked = false;

  setLitCount(0);
  setAreaState('go');
  status.textContent = 'LIGHTS OUT!';
  result.textContent = '';
  instruction.textContent = '';
  beeper.play(BEEP_FREQ);
}

function handleResponse(): void {
  if (inputLocked) return;

  if (testStatus === 'lights') {
    handleJumpStart();
  } else if (testStatus === 'go') {
    const reactionTime = Math.round(performance.now() - goTimestamp);
    recordAttempt(reactionTime);
  } else if (testStatus === 'idle' || testStatus === 'result' || testStatus === 'jump-start') {
    startTest();
  } else if (testStatus === 'session-complete') {
    resetSession();
    startTest();
  }
}

function handleJumpStart(): void {
  clearTimers();
  jumpStarts++;

  testStatus = 'jump-start';
  inputLocked = true;
  setAreaState('jump-start');

  status.textContent = 'Jump start!';
  result.textContent = '';
  instruction.textContent = `You moved before lights out. ${actionText()} to go again.`;
  announce('Jump start. You moved before lights out. Try again.');

  window.setTimeout(() => {
    inputLocked = false;
  }, 500);
}

function recordAttempt(time: number): void {
  inputLocked = true;
  currentRound++;
  attempts.push(time);

  testStatus = 'result';
  setAreaState('result');

  status.textContent = 'Your start:';
  result.textContent = `${time}ms`;
  announce(`${time} milliseconds.`);
  updateProgressBar();

  if (currentRound < settings.rounds) {
    instruction.textContent = `${actionText()} for the next start`;
    window.setTimeout(() => {
      inputLocked = false;
    }, 300);
  } else {
    completeSession();
  }
}

function completeSession(): void {
  testStatus = 'session-complete';
  setAreaState('session-complete');

  const avg = Math.round(attempts.reduce((a, b) => a + b, 0) / attempts.length);

  // Rounds shape what the average means, so they ride along with the score
  // (§3.2). Jump starts are context, never ranked. Sound is a preference and
  // stays out.
  const { isBest } = rig.recordSession(
    { ms: avg, jumpStarts },
    { rounds: settings.rounds, inputMethod: settings.inputMethod }
  );

  avgTime.textContent = String(avg);
  bestFlag.hidden = !isBest;
  resultMessage.textContent = resultCopy(isBest);

  attemptsList.replaceChildren(
    ...attempts.map((time, index) => {
      const column = document.createElement('div');
      column.className = 'attempt-column';

      const timeSpan = document.createElement('span');
      timeSpan.className = 'attempt-time readout';
      timeSpan.textContent = String(time);

      const labelSpan = document.createElement('span');
      labelSpan.className = 'attempt-label';
      labelSpan.textContent = `Start ${index + 1}`;

      column.append(timeSpan, labelSpan);
      return column;
    })
  );

  contentDefault.hidden = true;
  contentResults.hidden = false;
  announce(`Session complete. Average ${avg} milliseconds.` + (isBest ? ' New best.' : ''));

  window.setTimeout(() => {
    inputLocked = false;
  }, 500);
}

function resultCopy(isBest: boolean): string {
  const jumps =
    jumpStarts === 0
      ? 'No jump starts.'
      : `${jumpStarts} jump start${jumpStarts === 1 ? '' : 's'}.`;
  if (isBest) return `New personal best. ${jumps}`;
  return `${jumps} Run it again and watch the trend.`;
}

function resetSession(): void {
  clearTimers();

  testStatus = 'idle';
  currentRound = 0;
  attempts = [];
  jumpStarts = 0;
  goTimestamp = 0;
  inputLocked = false;

  contentDefault.hidden = false;
  contentResults.hidden = true;
  hint.hidden = false;
  bestFlag.hidden = true;

  setLitCount(0);
  setAreaState('idle');
  status.textContent = `${actionText()} to start`;
  result.textContent = '';
  instruction.textContent = '';
  updateProgressBar();
}

// --- Input ------------------------------------------------------------------------

area.addEventListener('click', (e) => {
  if ((e.target as HTMLElement).closest('#f1-try-again')) return; // the button handles it
  if (settings.inputMethod !== 'mouse') return;
  handleResponse();
});

area.addEventListener('touchend', (e) => {
  if ((e.target as HTMLElement).closest('#f1-try-again')) return;
  if (settings.inputMethod !== 'mouse') return;
  e.preventDefault(); // prevent double-firing via the synthesized click
  handleResponse();
});

document.addEventListener('keydown', (e) => {
  if (!resetModal.hidden) return; // the rig owns keys while the modal is open

  const isSpace = e.key === ' ' || e.code === 'Space';
  const isEnter = e.key === 'Enter';
  const active = document.activeElement;
  const areaFocused = active === area;
  const onControl =
    active instanceof HTMLElement &&
    active !== area &&
    ['BUTTON', 'A', 'SUMMARY', 'INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName);

  if (settings.inputMethod === 'spacebar') {
    if (isSpace && !onControl) {
      e.preventDefault();
      handleResponse();
    }
  } else if ((isSpace || isEnter) && areaFocused) {
    if (isSpace) e.preventDefault();
    handleResponse();
  }
});

tryAgainBtn.addEventListener('click', () => {
  resetSession();
  area.focus();
});

// --- Settings UI -----------------------------------------------------------------------

function saveSettings(): void {
  store.setSettings(settings);
}

function updateInputMethodText(): void {
  hint.textContent = `Five red lights come on one at a time. When they all go out, ${actionVerb()} as fast as you can.`;
  if (testStatus === 'idle') status.textContent = `${actionText()} to start`;
}

function setupButtonGroup(group: HTMLElement, apply: (value: string) => void): void {
  group.querySelectorAll<HTMLButtonElement>('.btn-option').forEach((btn) => {
    btn.addEventListener('click', () => {
      group.querySelectorAll('.btn-option').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      apply(btn.dataset.value ?? '');
      saveSettings();

      if (testStatus !== 'idle') resetSession();
      updateProgressBar();
    });
  });
}

function setActiveOption(group: HTMLElement, value: string): void {
  group.querySelectorAll<HTMLButtonElement>('.btn-option').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.value === value);
  });
}

setupButtonGroup(roundsGroup, (value) => {
  const parsed = Number.parseInt(value, 10);
  if (ROUNDS.includes(parsed)) settings.rounds = parsed;
});
setupButtonGroup(inputGroup, (value) => {
  if (value === 'mouse' || value === 'spacebar') {
    settings.inputMethod = value;
    updateInputMethodText();
  }
});

soundToggle.addEventListener('click', () => {
  settings.sound = !settings.sound;
  saveSettings();
  updateSoundIcon();
  beeper.unlock();
});

// --- Boot --------------------------------------------------------------------------------

setActiveOption(roundsGroup, String(settings.rounds));
setActiveOption(inputGroup, settings.inputMethod);
updateSoundIcon();
updateInputMethodText();
updateProgressBar();
rig.refresh();
