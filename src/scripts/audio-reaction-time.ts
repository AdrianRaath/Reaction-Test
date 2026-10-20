/**
 * Audio reaction time test — measurement loop and test-area rendering.
 *
 * The stimulus is a beep and nothing else: the test area holds the same red
 * "wait" frame before and after the sound, so the screen gives nothing away.
 * The state machine that IS the game:
 * idle → listening (red hold, beep scheduled) → result, with false starts and
 * misses (no response at all, usually a muted device).
 *
 * Timing integrity (REVAMP.md §8). The reaction test stamps performance.now()
 * when it flips the screen, because a visual stimulus lands in the next paint.
 * A sound reaches the listener tens of milliseconds after the page schedules
 * it (about 70 ms in Chrome on a stock Windows machine, measured while
 * building this tool), so stamping at schedule time would bill the player for
 * their audio stack. Instead the beep is scheduled on the audio clock and its
 * onset converted to the performance.now() timeline with getOutputTimestamp()
 * plus whatever output delay that mapping leaves out, which differs by engine
 * (see calibrate()). Bluetooth delay the OS never reports stays in the score;
 * the page tells players to use wired audio for that reason.
 *
 * The input handler stamps performance.now() before anything else and
 * compares it with the onset, so a late timer can never turn a valid
 * response into a false start. Input events match the reaction test
 * ('click' / 'touchend' / 'keydown') so the two tests time input the same way.
 */

import { openTool, resolveRank } from '../engine';
import { createRig } from '../engine/rig';
import { audioReactionTool } from '../data/tool-defs';

type DelayKey = '1-3' | '2-4' | '2-6' | '3-8';

interface AudioReactionSettings extends Record<string, unknown> {
  rounds: number;
  delay: DelayKey;
  inputMethod: 'mouse' | 'spacebar';
}

// Same presets as the reaction test, so the two pages offer the same holds.
const DELAY_PRESETS: Record<DelayKey, [number, number]> = {
  '1-3': [1000, 3000],
  '2-4': [2000, 4000],
  '2-6': [2000, 6000],
  '3-8': [3000, 8000],
};
const ROUNDS = [1, 3, 5, 10];
const DEFAULT_SETTINGS: AudioReactionSettings = {
  rounds: 5,
  delay: '1-3',
  inputMethod: 'mouse',
};

// The stimulus. A 1 kHz sine is the common lab tone. The 2 ms attack stops
// the speaker clicking at onset without blurring when the sound starts. Fixed,
// not a setting: a choice of sounds would split scores into groups that don't
// compare.
const TONE_HZ = 1000;
const TONE_S = 0.12;
const TONE_ATTACK_S = 0.002;
const TONE_RELEASE_S = 0.01;
const TONE_GAIN = 0.4;

// A response this soon after the onset is a guess, not a reaction: the World
// Athletics false-start line (Technical Rule 16.6). Olympic data puts the
// fastest real auditory reaction near 110 ms (Lipps et al. 2011), and the
// time shown here still includes input lag, so a genuine reaction can't
// display under 100. Guesses stay out of personal bests.
const ANTICIPATION_MS = 100;

// No response this long after the onset means the beep never reached the
// player (muted tab, volume at zero, silent switch). The round is voided.
const MISS_AFTER_MS = 3000;

// The onset clock is rebuilt this long before each beep, from timestamp
// readings taken every TIMESTAMP_SAMPLE_MS over CALIBRATION_MS, so it never
// rests on a reading from while the context was starting up.
const ONSET_REFRESH_LEAD_MS = 300;
const CALIBRATION_MS = 150;
const TIMESTAMP_SAMPLE_MS = 10;

// The soonest a beep is scheduled once the context runs. Longer than the
// refresh lead, so the refresh always lands before the beep.
const MIN_LEAD_MS = 400;

// WebKit can leave resume() pending through an interruption; stop waiting
// after this and tell the player sound is blocked.
const RESUME_TIMEOUT_MS = 1500;

// A reported latency at or above this is not a real reading.
const MAX_PLAUSIBLE_LATENCY_MS = 500;

// Above this the delay is almost certainly wireless audio, worth a warning.
const WIRELESS_HINT_MS = 100;

const { store, adapter } = openTool(audioReactionTool);

// --- Settings ----------------------------------------------------------------

function loadSettings(): AudioReactionSettings {
  const raw = store.getSettings<AudioReactionSettings>(DEFAULT_SETTINGS);
  return {
    rounds: ROUNDS.includes(Number(raw.rounds)) ? Number(raw.rounds) : DEFAULT_SETTINGS.rounds,
    delay: raw.delay in DELAY_PRESETS ? (raw.delay as DelayKey) : DEFAULT_SETTINGS.delay,
    inputMethod: raw.inputMethod === 'spacebar' ? 'spacebar' : 'mouse',
  };
}

const settings = loadSettings();

// --- DOM ----------------------------------------------------------------------

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Audio reaction test: missing #${id}`);
  return node as T;
}

const area = el('audio-area');
const contentDefault = el('audio-content-default');
const contentResults = el('audio-content-results');
const hint = el('audio-hint');
const status = el('audio-status');
const result = el('audio-result');
const instruction = el('audio-instruction');
const announceEl = el('audio-announce');
const progressBar = el('audio-progress-bar');
const avgTime = el('audio-avg-time');
const rankLabel = el('audio-rank-label');
const attemptsList = el('audio-attempts-list');
const resultMessage = el('audio-result-message');
const delayNote = el('audio-delay-note');
const tryAgainBtn = el('audio-try-again');
const roundsGroup = el('rounds-group');
const delayGroup = el('delay-group');
const inputGroup = el('input-group');
const soundCheckBtn = el('sound-check');
const resetModal = el('reset-modal');

// --- Audio ------------------------------------------------------------------------

interface ScheduledTone {
  osc: OscillatorNode;
  gain: GainNode;
}

let audioCtx: AudioContext | null = null;

/**
 * The page's one AudioContext, created and resumed inside a user gesture
 * (autoplay policy). Returns null where Web Audio is unavailable.
 */
function getAudio(): AudioContext | null {
  if (!audioCtx) {
    // Safari 16.4+: declare media playback, so iOS doesn't treat the beep as
    // an ambient sound that the ring/silent switch mutes.
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session) {
      try {
        session.type = 'playback';
      } catch {
        // Older WebKit: the page explains the silent switch instead.
      }
    }
    try {
      audioCtx = new AudioContext({ latencyHint: 'interactive' });
    } catch {
      return null;
    }
    // A call or a Siri prompt (iOS), or the OS pulling the device, stops the
    // clock mid-round. The beep may never play, so the round can't be scored.
    audioCtx.addEventListener('statechange', () => {
      if (audioCtx?.state !== 'running' && testStatus === 'listening') showAudioStopped();
    });
  }
  // 'suspended' before the first gesture; 'interrupted' on iOS after a call
  // or a Siri prompt. resume() covers both and must run inside the gesture.
  if (audioCtx.state !== 'running') audioCtx.resume().catch(() => {});
  return audioCtx;
}

function scheduleTone(ctx: AudioContext, when: number): ScheduledTone {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = TONE_HZ;
  gain.gain.setValueAtTime(0, when);
  gain.gain.linearRampToValueAtTime(TONE_GAIN, when + TONE_ATTACK_S);
  gain.gain.setValueAtTime(TONE_GAIN, when + TONE_S - TONE_RELEASE_S);
  gain.gain.linearRampToValueAtTime(0, when + TONE_S);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(when);
  osc.stop(when + TONE_S);
  return { osc, gain };
}

/** Silence a scheduled tone before it plays. Disconnecting is safe in any state. */
function cancelTone(tone: ScheduledTone | null): void {
  if (!tone) return;
  try {
    tone.gain.disconnect();
  } catch {
    // Already disconnected.
  }
}

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/** Resume (already requested inside the gesture) and wait for it, capped. */
async function ensureRunning(ctx: AudioContext): Promise<boolean> {
  if (ctx.state !== 'running') {
    await Promise.race([ctx.resume().catch(() => {}), wait(RESUME_TIMEOUT_MS)]);
  }
  return ctx.state === 'running';
}

/** baseLatency + outputLatency in ms, or 0 when the browser reports nothing usable. */
function reportedLatencyMs(ctx: AudioContext): number {
  const ms = ((ctx.baseLatency ?? 0) + (ctx.outputLatency ?? 0)) * 1000;
  return ms > 0 && ms < MAX_PLAUSIBLE_LATENCY_MS ? ms : 0;
}

/** Maps audio-clock time to the performance.now() moment it reaches the player. */
interface OnsetClock {
  /** performance.now() at which audio-clock time 0 would be heard. */
  origin: number;
  /** The output delay the mapping removes (ms); null if the browser reported none. */
  outputDelayMs: number | null;
}

/**
 * Build the onset clock from `durationMs` of output-timestamp readings.
 *
 * Engines disagree on what getOutputTimestamp() pairs. Chromium pairs each
 * sample with the moment it is heard, so the mapping already carries the
 * output delay (measured while building this: currentTime ran ~71 ms ahead
 * of the timestamp's contextTime, against a reported base + output latency
 * of 74 ms). Firefox and WebKit pair it with the moment it leaves the
 * browser, so the reported latency has to be added on top. Each reading
 * measures how much delay the timestamp includes, which tells the two apart
 * without sniffing the user agent; adding outputLatency on Chromium would
 * count it twice.
 *
 * Firefox advances contextTime once per audio callback, so a reading can be
 * stale. A stale reading only ever pushes the origin later, so the smallest
 * performanceTime − contextTime offset is the freshest pairing.
 */
async function calibrate(ctx: AudioContext, durationMs: number): Promise<OnsetClock> {
  let origin = Infinity;
  const included: number[] = [];
  const end = performance.now() + durationMs;
  do {
    const { contextTime = 0, performanceTime = 0 } = ctx.getOutputTimestamp?.() ?? {};
    if (contextTime > 0 && performanceTime > 0) {
      const now = performance.now();
      origin = Math.min(origin, performanceTime - contextTime * 1000);
      included.push((ctx.currentTime - contextTime) * 1000 - (now - performanceTime));
    }
    await wait(TIMESTAMP_SAMPLE_MS);
  } while (performance.now() < end);

  const reported = reportedLatencyMs(ctx);
  if (included.length === 0) {
    // No timestamp yet, or no support: map from the clocks as they stand and
    // add whatever latency the browser reports.
    return {
      origin: performance.now() - ctx.currentTime * 1000 + reported,
      outputDelayMs: reported > 0 ? reported : null,
    };
  }

  included.sort((a, b) => a - b);
  const includedMs = Math.max(included[included.length >> 1], 0);
  const added = includedMs > reported / 2 ? 0 : reported;
  const total = includedMs + added;
  return { origin: origin + added, outputDelayMs: total > 0 ? total : null };
}

// --- Telemetry rig -----------------------------------------------------------------

const HIGHLIGHT_PB = '<span class="desc-highlight">best audio reaction time</span>';
const HIGHLIGHT_AVG = '<span class="desc-highlight">average audio reaction time</span>';

const PB_DESCRIPTIONS: Record<string, string> = {
  Elite: `Your ${HIGHLIGHT_PB} matches the fastest lab results for a beep.`,
  Pro: `Your ${HIGHLIGHT_PB} beats the lab average for reacting to sound.`,
  Advanced: `Your ${HIGHLIGHT_PB} is faster than most adults manage.`,
  Intermediate: `Your ${HIGHLIGHT_PB} is in the normal adult range. Test when you're rested and focused to bring it down.`,
  Beginner: `Your ${HIGHLIGHT_PB} is slower than most adults. Check your audio setup, then run a few more sessions.`,
};

const AVG_DESCRIPTIONS: Record<string, string> = {
  Elite: `Your ${HIGHLIGHT_AVG} stays at the top of the scale across sessions.`,
  Pro: `Your ${HIGHLIGHT_AVG} stays under the lab average for reacting to sound.`,
  Advanced: `Your ${HIGHLIGHT_AVG} is faster than most adults manage.`,
  Intermediate: `Your ${HIGHLIGHT_AVG} is in the normal adult range. Watch the trend over a week of sessions.`,
  Beginner: `Your ${HIGHLIGHT_AVG} is slower than most adults. Wired headphones and a good night's sleep help most.`,
};

const rig = createRig(
  audioReactionTool,
  store,
  adapter,
  {
    bestDescription: (rank) =>
      PB_DESCRIPTIONS[rank] ?? 'Complete more sessions to sharpen your best time.',
    avgDescription: (_runs, rank) =>
      AVG_DESCRIPTIONS[rank] ?? 'Complete more sessions to steady your average.',
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

type Status = 'idle' | 'listening' | 'result' | 'false-start' | 'missed' | 'session-complete';

let testStatus: Status = 'idle';
let currentRound = 0;
let attempts: number[] = [];
let falseStarts = 0;
let outputDelays: number[] = [];
let onsetAt = 0; // performance.now() when the beep reaches the player; 0 = not scheduled
let roundDelayMs: number | null = null;
let pendingTone: ScheduledTone | null = null;
let timerIds: number[] = [];
let inputLocked = false;
let lastCheckDelayMs: number | null = null;
// Bumped whenever a round is torn down, so async steps from an abandoned
// round (resume, calibration) see they are stale and stop.
let roundToken = 0;

const STATE_CLASSES = [
  'state-idle',
  'state-listening',
  'state-result',
  'state-false-start',
  'state-missed',
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

function clearTimers(): void {
  for (const id of timerIds) window.clearTimeout(id);
  timerIds = [];
}

/** Stop everything pending for the current round: timers and the beep. */
function abortRound(): void {
  roundToken++;
  clearTimers();
  cancelTone(pendingTone);
  pendingTone = null;
  onsetAt = 0;
  roundDelayMs = null;
}

const actionText = () => (settings.inputMethod === 'mouse' ? 'Click' : 'Press Space');
const actionVerb = () => (settings.inputMethod === 'mouse' ? 'click' : 'press Space');

const MESSAGES: Record<string, string> = {
  elite: 'Top of the scale. Few people react to a beep this fast.',
  pro: 'Faster than the lab average for reacting to sound.',
  advanced: 'Faster than most adults.',
  intermediate: "A normal adult time. Try again when you're rested and see if it drops.",
  beginner: 'Room to improve. Check your headphones, then go again.',
};

function updateProgressBar(): void {
  const progress = settings.rounds > 0 ? (currentRound / settings.rounds) * 100 : 0;
  progressBar.style.width = `${progress}%`;
}

/** Text with one measured value set in the readout face (Monospace-Numerals Rule). */
function setWithReadout(target: HTMLElement, before: string, value: number, after: string): void {
  const num = document.createElement('span');
  num.className = 'readout';
  num.textContent = String(value);
  target.replaceChildren(before, num, after);
}

function showIdleInstruction(): void {
  if (lastCheckDelayMs === null) {
    instruction.textContent = 'Use Sound check first to set your volume.';
  } else if (lastCheckDelayMs > WIRELESS_HINT_MS) {
    setWithReadout(
      instruction,
      'Audio delay: ',
      Math.round(lastCheckDelayMs),
      ' ms. That looks like wireless audio. We subtract it, but wired headphones give a more accurate time.'
    );
  } else {
    setWithReadout(
      instruction,
      'Audio delay: ',
      Math.round(lastCheckDelayMs),
      ' ms, subtracted from every time.'
    );
  }
}

// --- Round lifecycle ------------------------------------------------------------------

function startTest(): void {
  const ctx = getAudio();
  if (!ctx) {
    showAudioUnavailable();
    return;
  }

  if (testStatus === 'session-complete') resetSession();
  abortRound();

  contentDefault.hidden = false;
  contentResults.hidden = true;
  hint.hidden = true;

  testStatus = 'listening';
  inputLocked = false;
  setAreaState('listening');

  status.textContent = 'Listen…';
  result.textContent = '';
  instruction.textContent = `${actionText()} the moment you hear the beep`;
  // Spoken now, well before the earliest beep. Nothing is announced at the
  // onset itself: a screen reader voicing "now" would be a second cue.
  announce('Listen for the beep.');

  const [minDelay, maxDelay] = DELAY_PRESETS[settings.delay];
  const delayMs = Math.random() * (maxDelay - minDelay) + minDelay;
  void runRound(ctx, delayMs, performance.now(), roundToken);
}

/**
 * Schedule this round's beep and keep its onset current. Until the first
 * calibration lands, onsetAt stays 0 and any input counts as a false start,
 * which it is: the beep is at least MIN_LEAD_MS away.
 */
async function runRound(
  ctx: AudioContext,
  delayMs: number,
  startedAt: number,
  token: number
): Promise<void> {
  // The first start resumes the context inside the gesture. Time spent
  // resuming comes out of the hold, keeping the beep where the preset put it.
  const running = await ensureRunning(ctx);
  if (token !== roundToken) return;
  if (!running) {
    showAudioUnavailable();
    return;
  }

  const leadMs = Math.max(delayMs - (performance.now() - startedAt), MIN_LEAD_MS);
  const when = ctx.currentTime + leadMs / 1000;
  pendingTone = scheduleTone(ctx, when);

  const setOnset = (clock: OnsetClock) => {
    onsetAt = clock.origin + when * 1000;
    roundDelayMs = clock.outputDelayMs;
  };

  setOnset(await calibrate(ctx, 0));
  if (token !== roundToken) return;

  // Rebuild the clock from fresh readings just before the beep, then arm the
  // miss timer against that onset.
  await wait(Math.max((when - ctx.currentTime) * 1000 - ONSET_REFRESH_LEAD_MS, 0));
  if (token !== roundToken) return;
  setOnset(await calibrate(ctx, CALIBRATION_MS));
  if (token !== roundToken) return;
  timerIds.push(window.setTimeout(handleMiss, onsetAt - performance.now() + MISS_AFTER_MS));
}

function handleResponse(): void {
  const now = performance.now(); // stamp first, before any other work (§8)
  if (inputLocked) return;

  if (testStatus === 'listening') {
    if (onsetAt > 0 && now - onsetAt >= ANTICIPATION_MS) {
      recordAttempt(Math.round(now - onsetAt));
    } else {
      handleFalseStart();
    }
  } else if (
    testStatus === 'idle' ||
    testStatus === 'result' ||
    testStatus === 'false-start' ||
    testStatus === 'missed'
  ) {
    startTest();
  } else if (testStatus === 'session-complete') {
    resetSession();
    startTest();
  }
}

function handleFalseStart(): void {
  abortRound();
  falseStarts++;

  testStatus = 'false-start';
  inputLocked = true;
  setAreaState('false-start');

  status.textContent = 'Too soon!';
  result.textContent = '';
  instruction.textContent = `You went before you could have heard the beep. ${actionText()} to try again.`;
  announce('Too soon. Wait for the beep, then try again.');

  timerIds.push(
    window.setTimeout(() => {
      inputLocked = false;
    }, 500)
  );
}

function handleMiss(): void {
  if (testStatus !== 'listening') return;
  abortRound();

  testStatus = 'missed';
  inputLocked = true;
  setAreaState('missed');

  status.textContent = 'No response';
  result.textContent = '';
  instruction.textContent = `Didn't hear a beep? Turn your volume up and run Sound check, then ${actionVerb()} to try again.`;
  announce('No response. Check your volume, then try again.');

  timerIds.push(
    window.setTimeout(() => {
      inputLocked = false;
    }, 500)
  );
}

function recordAttempt(time: number): void {
  if (roundDelayMs !== null) outputDelays.push(roundDelayMs);
  abortRound();

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
    instruction.textContent = `${actionText()} for the next beep`;
    timerIds.push(
      window.setTimeout(() => {
        inputLocked = false;
      }, 300)
    );
  } else {
    completeSession();
  }
}

function completeSession(): void {
  testStatus = 'session-complete';

  const avg = Math.round(attempts.reduce((a, b) => a + b, 0) / attempts.length);
  // Non-null: this tool declares ranks, so resolveRank always finds one.
  const rank = resolveRank(audioReactionTool, avg)!;
  const outputDelayMs =
    outputDelays.length > 0
      ? Math.round(outputDelays.reduce((a, b) => a + b, 0) / outputDelays.length)
      : null;

  setAreaState('session-complete', rank.id);

  // Rounds and delay range shape what the score means (§3.2), as on the
  // reaction test. The audio delay rides along too: a score corrected by 70 ms
  // and one the browser couldn't correct are different measurements, and a
  // future leaderboard needs to tell them apart. False starts are context,
  // never ranked.
  rig.recordSession(
    { ms: avg, falseStarts },
    {
      rounds: settings.rounds,
      delay: settings.delay,
      inputMethod: settings.inputMethod,
      outputDelayMs,
    }
  );

  avgTime.textContent = String(avg);
  rankLabel.textContent = rank.name;
  rankLabel.className = `rank-badge ${rank.id}`;
  resultMessage.textContent = MESSAGES[rank.id] ?? 'Session complete.';
  if (outputDelayMs !== null) {
    setWithReadout(delayNote, 'Audio delay subtracted: ', outputDelayMs, ' ms');
  } else {
    delayNote.textContent = 'Your browser reported no audio delay, so these times include it.';
  }

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

  timerIds.push(
    window.setTimeout(() => {
      inputLocked = false;
    }, 500)
  );
}

function resetSession(): void {
  abortRound();

  testStatus = 'idle';
  currentRound = 0;
  attempts = [];
  falseStarts = 0;
  outputDelays = [];
  inputLocked = false;

  contentDefault.hidden = false;
  contentResults.hidden = true;
  hint.hidden = false;

  setAreaState('idle');
  status.textContent = `${actionText()} to start`;
  result.textContent = '';
  showIdleInstruction();
  updateProgressBar();
}

function showAudioUnavailable(): void {
  abortRound();
  testStatus = 'idle';
  setAreaState('idle');
  status.textContent = 'Sound is blocked';
  instruction.textContent =
    "Your browser didn't start the audio. Allow sound for this site, then try again.";
  announce('Sound is blocked. Allow sound for this site, then try again.');
}

function showAudioStopped(): void {
  abortRound();
  testStatus = 'missed';
  inputLocked = false;
  setAreaState('missed');
  status.textContent = 'Sound stopped';
  result.textContent = '';
  instruction.textContent = `Your device paused the audio. ${actionText()} to try again.`;
  announce('Sound stopped. Try the round again.');
}

// --- Sound check -----------------------------------------------------------------------

async function soundCheck(): Promise<void> {
  // A beep mid-round would be a false cue, so a check abandons the session,
  // the same as changing a setting does.
  if (testStatus !== 'idle') resetSession();

  const ctx = getAudio();
  if (!ctx) {
    showAudioUnavailable();
    return;
  }

  const token = roundToken;
  const running = await ensureRunning(ctx);
  if (token !== roundToken || testStatus !== 'idle') return;
  if (!running) {
    showAudioUnavailable();
    return;
  }

  scheduleTone(ctx, ctx.currentTime + 0.05);
  const clock = await calibrate(ctx, CALIBRATION_MS);
  if (token !== roundToken || testStatus !== 'idle') return;

  lastCheckDelayMs = clock.outputDelayMs;
  status.textContent = `${actionText()} to start`;
  if (lastCheckDelayMs !== null) showIdleInstruction();
  else instruction.textContent = 'Your browser reports no audio delay, so times will include it.';
  announce('Sound check played. Start when ready.');
}

// --- Input ------------------------------------------------------------------------

area.addEventListener('click', (e) => {
  if ((e.target as HTMLElement).closest('#audio-try-again')) return; // the button handles it
  if (settings.inputMethod !== 'mouse') return;
  handleResponse();
});

area.addEventListener('touchend', (e) => {
  if ((e.target as HTMLElement).closest('#audio-try-again')) return;
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
      if (!e.repeat) handleResponse();
    }
  } else if ((isSpace || isEnter) && areaFocused) {
    if (isSpace) e.preventDefault();
    if (!e.repeat) handleResponse();
  }
});

tryAgainBtn.addEventListener('click', () => {
  resetSession();
  area.focus();
});

soundCheckBtn.addEventListener('click', () => void soundCheck());

// --- Settings UI -----------------------------------------------------------------------

function saveSettings(): void {
  store.setSettings(settings);
}

function updateInputMethodText(): void {
  hint.textContent = `Turn your sound on. The screen won't change when the beep plays, so listen for it and ${actionVerb()} as fast as you can.`;
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

// --- Boot --------------------------------------------------------------------------------

setActiveOption(roundsGroup, String(settings.rounds));
setActiveOption(delayGroup, settings.delay);
setActiveOption(inputGroup, settings.inputMethod);
updateInputMethodText();
showIdleInstruction();
updateProgressBar();
rig.refresh();
