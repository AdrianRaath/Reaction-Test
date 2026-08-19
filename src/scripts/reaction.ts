/**
 * Reaction time test — measurement loop and test-area rendering.
 *
 * Ported from the pre-revamp app.js. The telemetry below the test area lives
 * in the engine's rig; this file owns the state machine that IS the game:
 * idle → waiting (red hold) → go (green flash) → result, with false starts.
 *
 * Timing integrity (REVAMP.md §8) — the two lines that are the product:
 * `goTimestamp = performance.now()` at the flip, and
 * `performance.now() - goTimestamp` in the input handler. Nothing may be
 * inserted between stimulus and handler. Input events are deliberately the
 * same ones the legacy code used ('click' / 'touchend' / 'keydown') so
 * measured times stay comparable with players' existing records — switching
 * to pointerdown would silently make everyone ~10ms "faster".
 */

import { openTool, resolveRank } from '../engine';
import { createRig } from '../engine/rig';
import { createBeeper } from '../engine/sound';
import { reactionTool } from '../data/tool-defs';

type DelayKey = '1-3' | '2-4' | '2-6' | '3-8';

interface ReactionSettings extends Record<string, unknown> {
  rounds: number;
  delay: DelayKey;
  inputMethod: 'mouse' | 'spacebar';
  sound: boolean;
}

const DELAY_PRESETS: Record<DelayKey, [number, number]> = {
  '1-3': [1000, 3000],
  '2-4': [2000, 4000],
  '2-6': [2000, 6000],
  '3-8': [3000, 8000],
};
const ROUNDS = [1, 3, 5, 10];
const DEFAULT_SETTINGS: ReactionSettings = {
  rounds: 5,
  delay: '1-3',
  inputMethod: 'mouse',
  sound: true,
};
const BEEP_FREQ = 880; // A5 — the GO signal

const { store, adapter } = openTool(reactionTool);

// --- Settings ----------------------------------------------------------------

function loadSettings(): ReactionSettings {
  const raw = store.getSettings<ReactionSettings>(DEFAULT_SETTINGS);
  return {
    rounds: ROUNDS.includes(Number(raw.rounds)) ? Number(raw.rounds) : DEFAULT_SETTINGS.rounds,
    delay: raw.delay in DELAY_PRESETS ? (raw.delay as DelayKey) : DEFAULT_SETTINGS.delay,
    inputMethod: raw.inputMethod === 'spacebar' ? 'spacebar' : 'mouse',
    sound: typeof raw.sound === 'boolean' ? raw.sound : true,
  };
}

const settings = loadSettings();

// --- DOM ----------------------------------------------------------------------

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Reaction test: missing #${id}`);
  return node as T;
}

const area = el('test-area');
const contentDefault = el('test-content-default');
const contentResults = el('test-content-results');
const hint = el('test-hint');
const status = el('test-status');
const result = el('test-result');
const instruction = el('test-instruction');
const announceEl = el('test-announce');
const progressBar = el('progress-bar');
const avgTime = el('avg-time');
const rankLabel = el('rank-label');
const attemptsList = el('attempts-list');
const resultMessage = el('result-message');
const tryAgainBtn = el('try-again-btn');
const roundsGroup = el('rounds-group');
const delayGroup = el('delay-group');
const inputGroup = el('input-group');
const soundToggle = el('sound-toggle');
const soundOnIcon = el('sound-icon-on');
const soundOffIcon = el('sound-icon-off');
const resetModal = el('reset-modal');

// --- Sound ----------------------------------------------------------------------

const beeper = createBeeper({ gain: 0.3, enabled: () => settings.sound });

function updateSoundIcon(): void {
  soundOnIcon.hidden = !settings.sound;
  soundOffIcon.hidden = settings.sound;
  soundToggle.classList.toggle('muted', !settings.sound);
  soundToggle.setAttribute('aria-pressed', String(settings.sound));
}

// --- Telemetry rig -----------------------------------------------------------------

const HIGHLIGHT_PB = '<span class="desc-highlight">personal best reaction time</span>';
const HIGHLIGHT_AVG = '<span class="desc-highlight">average reaction time</span>';

const PB_DESCRIPTIONS: Record<string, string> = {
  Elite: `Your ${HIGHLIGHT_PB} is incredible! You're in the top tier, competitive with professional esports players.`,
  Pro: `Your ${HIGHLIGHT_PB} is excellent! You have competitive-level reflexes that put you ahead of most players.`,
  Advanced: `Your ${HIGHLIGHT_PB} is above average. You're faster than the majority of people.`,
  Intermediate: `Your ${HIGHLIGHT_PB} is in the average range. Keep practicing to reach the next level.`,
  Beginner: `Your ${HIGHLIGHT_PB} has room for improvement. With regular practice, you'll get faster.`,
};

const AVG_DESCRIPTIONS: Record<string, string> = {
  Elite: `Your ${HIGHLIGHT_AVG} is incredible! You're consistently performing at a professional level.`,
  Pro: `Your ${HIGHLIGHT_AVG} is excellent! You're consistently achieving competitive-level results.`,
  Advanced: `Your ${HIGHLIGHT_AVG} is above average. You're consistently faster than most people.`,
  Intermediate: `Your ${HIGHLIGHT_AVG} is in the normal range. Consistent practice will help you improve.`,
  Beginner: `Your ${HIGHLIGHT_AVG} has room for growth. Focus on consistency and you'll see improvement.`,
};

const rig = createRig(
  reactionTool,
  store,
  adapter,
  {
    bestDescription: (rank) =>
      PB_DESCRIPTIONS[rank] ?? 'Keep practicing to improve your reaction time!',
    avgDescription: (_runs, rank) =>
      AVG_DESCRIPTIONS[rank] ?? 'Keep practicing to improve your average!',
    historyScore: (v) => `${Math.round(v)}ms`,
    chartTooltip: (v) => `${v}ms`,
    runLabel: 'Session',
  },
  {
    onReset: () => resetSession(),
    // The legacy page kept 50 history rows but averaged and charted its last
    // 20 sessions. Preserved so returning players' numbers don't shift.
    telemetryWindow: 20,
    chartBeginAtZero: false,
  }
);

// --- Test state machine --------------------------------------------------------------

type Status = 'idle' | 'waiting' | 'go' | 'result' | 'false-start' | 'session-complete';

let testStatus: Status = 'idle';
let currentRound = 0;
let attempts: number[] = [];
let goTimestamp = 0;
let delayTimeoutId = 0;
let inputLocked = false;

const STATE_CLASSES = [
  'state-idle',
  'state-waiting',
  'state-go',
  'state-result',
  'state-false-start',
  'state-session-complete',
  'rank-elite',
  'rank-pro',
  'rank-advanced',
  'rank-intermediate',
  'rank-beginner',
];

function setAreaState(name: Status, rankId?: string): void {
  area.classList.remove(...STATE_CLASSES);
  area.classList.add(`state-${name}`);
  if (rankId) area.classList.add(`rank-${rankId}`);
}

function announce(text: string): void {
  announceEl.textContent = text;
}

const actionText = () => (settings.inputMethod === 'mouse' ? 'Click' : 'Press Space');
const goText = () => (settings.inputMethod === 'mouse' ? 'CLICK!' : 'NOW!');
const actionVerb = () => (settings.inputMethod === 'mouse' ? 'click' : 'react');

const MESSAGES: Record<string, string> = {
  elite: "Incredible reflexes! You're in the top tier.",
  pro: 'Excellent! You have competitive-level reactions.',
  advanced: 'Nice work! Your reflexes are above average.',
  intermediate: 'Good effort! Keep practicing to improve.',
  beginner: 'Keep at it! Practice makes perfect.',
};

function updateProgressBar(): void {
  const progress = settings.rounds > 0 ? (currentRound / settings.rounds) * 100 : 0;
  progressBar.style.width = `${progress}%`;
}

// --- Round lifecycle ------------------------------------------------------------------

function startTest(): void {
  beeper.unlock();

  if (testStatus === 'session-complete') resetSession();
  window.clearTimeout(delayTimeoutId);

  contentDefault.hidden = false;
  contentResults.hidden = true;
  hint.hidden = true;

  testStatus = 'waiting';
  inputLocked = false;
  setAreaState('waiting');

  status.textContent = 'Wait for it…';
  result.textContent = '';
  instruction.textContent = 'Hold steady…';
  announce('Wait for the green signal.');

  const [minDelay, maxDelay] = DELAY_PRESETS[settings.delay];
  const delay = Math.random() * (maxDelay - minDelay) + minDelay;
  delayTimeoutId = window.setTimeout(showGo, delay);
}

function showGo(): void {
  testStatus = 'go';
  goTimestamp = performance.now();
  inputLocked = false;

  setAreaState('go');
  status.textContent = goText();
  result.textContent = '';
  instruction.textContent = '';
  beeper.play(BEEP_FREQ);
}

function handleResponse(): void {
  if (inputLocked) return;

  if (testStatus === 'waiting') {
    handleFalseStart();
  } else if (testStatus === 'go') {
    const reactionTime = Math.round(performance.now() - goTimestamp);
    recordAttempt(reactionTime);
  } else if (testStatus === 'idle' || testStatus === 'result' || testStatus === 'false-start') {
    startTest();
  } else if (testStatus === 'session-complete') {
    resetSession();
    startTest();
  }
}

function handleFalseStart(): void {
  window.clearTimeout(delayTimeoutId);

  testStatus = 'false-start';
  inputLocked = true;
  setAreaState('false-start');

  status.textContent = 'Not yet!';
  result.textContent = '';
  instruction.textContent = `Jumped the gun — wait for the flash. ${actionText()} to try again.`;
  announce('Too soon. Wait for the green signal, then try again.');

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

  status.textContent = 'Your time:';
  result.textContent = `${time}ms`;
  announce(`${time} milliseconds.`);
  updateProgressBar();

  if (currentRound < settings.rounds) {
    instruction.textContent = `${actionText()} for next round`;
    window.setTimeout(() => {
      inputLocked = false;
    }, 300);
  } else {
    completeSession();
  }
}

function completeSession(): void {
  testStatus = 'session-complete';

  const avg = Math.round(attempts.reduce((a, b) => a + b, 0) / attempts.length);
  // Non-null: this tool declares ranks, so resolveRank always finds one.
  const rank = resolveRank(reactionTool, avg)!;

  setAreaState('session-complete', rank.id);

  // Rounds and delay range shape what the score means — a 1-round session and
  // a 3-8s hold are different tests. Captured per §3.2 so records stay
  // comparable; sound is a preference and stays out.
  rig.recordSession(
    { ms: avg },
    { rounds: settings.rounds, delay: settings.delay, inputMethod: settings.inputMethod }
  );

  avgTime.textContent = String(avg);
  rankLabel.textContent = rank.name;
  rankLabel.className = `rank-badge ${rank.id}`;
  resultMessage.textContent = MESSAGES[rank.id] ?? 'Great job completing the test!';

  attemptsList.replaceChildren(
    ...attempts.map((time, index) => {
      const column = document.createElement('div');
      column.className = 'attempt-column';

      const timeSpan = document.createElement('span');
      timeSpan.className = 'attempt-time readout';
      timeSpan.textContent = String(time);

      const labelSpan = document.createElement('span');
      labelSpan.className = 'attempt-label';
      labelSpan.textContent = `Test ${index + 1}`;

      column.append(timeSpan, labelSpan);
      return column;
    })
  );

  contentDefault.hidden = true;
  contentResults.hidden = false;
  announce(`Session complete. Average ${avg} milliseconds. Rank ${rank.name}.`);

  window.setTimeout(() => {
    inputLocked = false;
  }, 500);
}

function resetSession(): void {
  window.clearTimeout(delayTimeoutId);

  testStatus = 'idle';
  currentRound = 0;
  attempts = [];
  goTimestamp = 0;
  inputLocked = false;

  contentDefault.hidden = false;
  contentResults.hidden = true;
  hint.hidden = false;

  setAreaState('idle');
  status.textContent = `${actionText()} to start`;
  result.textContent = '';
  instruction.textContent = '';
  updateProgressBar();
}

// --- Input ------------------------------------------------------------------------

area.addEventListener('click', (e) => {
  if ((e.target as HTMLElement).closest('#try-again-btn')) return; // the button handles it
  if (settings.inputMethod !== 'mouse') return;
  handleResponse();
});

area.addEventListener('touchend', (e) => {
  if ((e.target as HTMLElement).closest('#try-again-btn')) return;
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
    // Mouse mode: the keyboard path the area's role="button" and its own
    // aria-label promise. The legacy page labelled it but never wired it.
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
  hint.innerHTML =
    `Wait for the <span class="hint-box hint-box-red"></span> red hold, then ${actionVerb()} ` +
    `the instant it flashes <span class="hint-box hint-box-green"></span> <strong>${goText()}</strong>.`;
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
setupButtonGroup(delayGroup, (value) => {
  if (value in DELAY_PRESETS) settings.delay = value as DelayKey;
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
setActiveOption(delayGroup, settings.delay);
setActiveOption(inputGroup, settings.inputMethod);
updateSoundIcon();
updateInputMethodText();
updateProgressBar();
rig.refresh();
