/**
 * Aim trainer — measurement loop and test-area state machine.
 *
 * One standardized run: a starter target, then 30 scored targets, one at a
 * time. The starter is the calibration point — the clock starts on that click,
 * so the first flick is measured from a known cursor position. Everything
 * below the test area (best, average, ranks, trend, history, reset) is the
 * rig's job.
 *
 * Standardization contract (the copy makes these promises — keep them):
 * - Target diameter is a fixed proportion of the arena, clamped for touch.
 * - Each target spawns within a fixed distance band from the previous one, so
 *   total cursor travel is roughly equal every run.
 * - Target style and color are paint only. Every style is drawn to the full
 *   hitbox diameter, and the hitbox never changes.
 *
 * Timing integrity: performance.now() is stamped at the top of the input
 * handlers, before any DOM work (REVAMP.md §8).
 */

import { openTool, resolveRank } from '../engine';
import { createRig } from '../engine/rig';
import { createBeeper } from '../engine/sound';
import { aimTrainerTool } from '../data/tool-defs';

type TargetStyle = 'bullseye' | 'dot' | 'ring' | 'reticle';
type TargetColor = 'green' | 'white' | 'blue' | 'violet' | 'amber';

interface AimSettings extends Record<string, unknown> {
  targetStyle: TargetStyle;
  targetColor: TargetColor;
  sound: boolean;
}

const TARGET_COUNT = 30;
const START_FREQ = 1046; // C6 — run start
const END_FREQ = 523; // C5 — run end

const STYLES: TargetStyle[] = ['bullseye', 'dot', 'ring', 'reticle'];
const COLORS: TargetColor[] = ['green', 'white', 'blue', 'violet', 'amber'];

// Palette hues the design system already owns (DESIGN.md §2, the Target-Paint
// Exception). No red: red means wait/error sitewide.
const COLOR_HEX: Record<TargetColor, string> = {
  green: '#22c55e',
  white: '#fafafa',
  blue: '#3b82f6',
  violet: '#a855f7',
  amber: '#f59e0b',
};

// Target faces, drawn in currentColor to the full 100-unit viewBox so the
// visible outer edge sits on the hitbox edge. Kept in sync with the style
// picker's button faces in aim-trainer.astro.
const TARGET_SVGS: Record<TargetStyle, string> = {
  bullseye:
    '<svg viewBox="0 0 100 100" aria-hidden="true">' +
    '<circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" stroke-width="9"/>' +
    '<circle cx="50" cy="50" r="27" fill="none" stroke="currentColor" stroke-width="9"/>' +
    '<circle cx="50" cy="50" r="10" fill="currentColor"/></svg>',
  dot:
    '<svg viewBox="0 0 100 100" aria-hidden="true">' +
    '<circle cx="50" cy="50" r="48" fill="currentColor"/></svg>',
  ring:
    '<svg viewBox="0 0 100 100" aria-hidden="true">' +
    '<circle cx="50" cy="50" r="43" fill="none" stroke="currentColor" stroke-width="10"/>' +
    '<circle cx="50" cy="50" r="7" fill="currentColor"/></svg>',
  reticle:
    '<svg viewBox="0 0 100 100" aria-hidden="true">' +
    '<circle cx="50" cy="50" r="38" fill="none" stroke="currentColor" stroke-width="7"/>' +
    '<line x1="50" y1="2" x2="50" y2="26" stroke="currentColor" stroke-width="7"/>' +
    '<line x1="50" y1="74" x2="50" y2="98" stroke="currentColor" stroke-width="7"/>' +
    '<line x1="2" y1="50" x2="26" y2="50" stroke="currentColor" stroke-width="7"/>' +
    '<line x1="74" y1="50" x2="98" y2="50" stroke="currentColor" stroke-width="7"/>' +
    '<circle cx="50" cy="50" r="6" fill="currentColor"/></svg>',
};

const DEFAULT_SETTINGS: AimSettings = {
  targetStyle: 'bullseye',
  targetColor: 'green',
  sound: true,
};

const { store, adapter } = (() => {
  const opened = openTool(aimTrainerTool);
  return { store: opened.store, adapter: opened.adapter };
})();

// --- Settings ---------------------------------------------------------------

function loadSettings(): AimSettings {
  const raw = store.getSettings<AimSettings>(DEFAULT_SETTINGS);
  return {
    targetStyle: STYLES.includes(raw.targetStyle as TargetStyle)
      ? (raw.targetStyle as TargetStyle)
      : DEFAULT_SETTINGS.targetStyle,
    targetColor: COLORS.includes(raw.targetColor as TargetColor)
      ? (raw.targetColor as TargetColor)
      : DEFAULT_SETTINGS.targetColor,
    sound: typeof raw.sound === 'boolean' ? raw.sound : true,
  };
}

const settings = loadSettings();

// --- DOM ----------------------------------------------------------------------

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Aim trainer: missing #${id}`);
  return node as T;
}

const area = el('aim-area');
const contentDefault = el('aim-content-default');
const starter = el('aim-starter');
const hud = el('aim-hud');
const results = el('aim-results');
const announceEl = el('aim-announce');
const hudHits = el('aim-hits');
const hudAcc = el('aim-acc');
const hudTime = el('aim-time');
const finalScore = el('aim-final');
const rankLabel = el('aim-rank-label');
const resultMeta = el('aim-result-meta');
const calcTps = el('aim-calc-tps');
const calcAcc = el('aim-calc-acc');
const calcScore = el('aim-calc-score');
const bestFlag = el('aim-best-flag');
const message = el('aim-message');
const tryAgainBtn = el('aim-try-again');
const progressFill = el('aim-progress-fill');
const styleGroup = el('style-group');
const colorGroup = el('color-group');
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
  aimTrainerTool,
  store,
  adapter,
  {
    bestDescription: (rank) => `${rank}-tier aim.`,
    avgDescription: (runs) => `Average across your last ${runs} run${runs === 1 ? '' : 's'}.`,
    historyScore: (v) => String(Math.round(v)),
    chartTooltip: (v) => `Score: ${v}`,
    runLabel: 'Run',
  },
  { onReset: () => resetRun() }
);

// --- Run state -------------------------------------------------------------------

type RunStatus = 'idle' | 'running' | 'complete';

let runStatus: RunStatus = 'idle';
let hits = 0;
let misses = 0;
let startTime = 0;
let rafId = 0;
let targetEl: HTMLElement | null = null;
let targetPos = { x: 0, y: 0 };

const AREA_CLASSES = [
  'state-idle',
  'state-aim-running',
  'state-session-complete',
  'rank-elite',
  'rank-pro',
  'rank-advanced',
  'rank-intermediate',
  'rank-beginner',
];

function setAreaState(name: string, rankId?: string): void {
  area.classList.remove(...AREA_CLASSES);
  area.classList.add(`state-${name}`);
  if (rankId) area.classList.add(`rank-${rankId}`);
}

function announce(text: string): void {
  announceEl.textContent = text;
}

const MESSAGES: Record<string, string> = {
  elite: 'Elite aim. Fast, clean flicks all the way through.',
  pro: 'Pro-level aim. Speed and accuracy working together.',
  advanced: 'Sharp shooting - above the pack.',
  intermediate: 'Solid run. Tune your sensitivity and push the pace.',
  beginner: 'Good start. Slow down until every flick lands, then speed up.',
};

// --- Geometry ------------------------------------------------------------------

/** Fixed proportion of the arena, clamped so touch targets stay usable. */
function targetDiameter(): number {
  return Math.round(Math.min(60, Math.max(44, area.clientWidth * 0.075)));
}

function accuracyPct(): number {
  const total = hits + misses;
  return total === 0 ? 100 : (hits / total) * 100;
}

/**
 * Next spawn point: a fixed distance band from the previous target (20–50% of
 * the arena diagonal, random angle), rejection-sampled into the margins. The
 * band is what keeps total cursor travel roughly equal across runs.
 */
function spawnPosition(prev: { x: number; y: number }, radius: number): { x: number; y: number } {
  const w = area.clientWidth;
  const h = area.clientHeight;
  const margin = radius + 10;
  const diag = Math.hypot(w, h);

  for (let i = 0; i < 24; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = diag * (0.2 + Math.random() * 0.3);
    const x = prev.x + Math.cos(angle) * dist;
    const y = prev.y + Math.sin(angle) * dist;
    if (x >= margin && x <= w - margin && y >= margin && y <= h - margin) return { x, y };
  }

  // Pathological arena (tiny or extreme aspect): clamp a final sample so the
  // run can always continue.
  const angle = Math.random() * Math.PI * 2;
  return {
    x: Math.min(w - margin, Math.max(margin, prev.x + Math.cos(angle) * diag * 0.25)),
    y: Math.min(h - margin, Math.max(margin, prev.y + Math.sin(angle) * diag * 0.25)),
  };
}

// --- Target rendering -----------------------------------------------------------

function paintTarget(node: HTMLElement): void {
  node.innerHTML = TARGET_SVGS[settings.targetStyle];
  node.style.color = COLOR_HEX[settings.targetColor];
}

function sizeTarget(node: HTMLElement, d: number): void {
  node.style.width = `${d}px`;
  node.style.height = `${d}px`;
}

function moveTarget(): void {
  if (!targetEl) return;
  const d = targetDiameter();
  targetPos = spawnPosition(targetPos, d / 2);
  sizeTarget(targetEl, d);
  targetEl.style.left = `${targetPos.x}px`;
  targetEl.style.top = `${targetPos.y}px`;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Hit feedback: a ghost of the target pops and fades at its position. */
function spawnPop(x: number, y: number): void {
  if (prefersReducedMotion()) return;
  const pop = document.createElement('span');
  pop.className = 'aim-pop';
  pop.innerHTML = TARGET_SVGS[settings.targetStyle];
  pop.style.color = COLOR_HEX[settings.targetColor];
  const d = targetDiameter();
  pop.style.width = `${d}px`;
  pop.style.height = `${d}px`;
  pop.style.left = `${x}px`;
  pop.style.top = `${y}px`;
  pop.addEventListener('animationend', () => pop.remove());
  area.appendChild(pop);
}

/** Remove any in-flight pop/miss ghosts, so none linger over the results. */
function clearFeedback(): void {
  area.querySelectorAll('.aim-pop, .aim-miss').forEach((node) => node.remove());
}

/** Miss feedback: a small ink ring where the click landed. */
function spawnMissMark(x: number, y: number): void {
  if (prefersReducedMotion()) return;
  const ring = document.createElement('span');
  ring.className = 'aim-miss';
  ring.style.left = `${x}px`;
  ring.style.top = `${y}px`;
  ring.addEventListener('animationend', () => ring.remove());
  area.appendChild(ring);
}

// --- HUD ------------------------------------------------------------------------

function updateHud(): void {
  hudHits.textContent = String(hits);
  hudAcc.textContent = String(Math.round(accuracyPct()));
  progressFill.style.transform = `scaleX(${hits / TARGET_COUNT})`;
}

function tick(): void {
  hudTime.textContent = ((performance.now() - startTime) / 1000).toFixed(1);
  rafId = requestAnimationFrame(tick);
}

// --- Run lifecycle ------------------------------------------------------------------

function startRun(now: number): void {
  beeper.unlock();
  runStatus = 'running';
  hits = 0;
  misses = 0;
  startTime = now;

  // The first scored target spawns relative to the starter's actual position —
  // read before the default content is hidden.
  const areaRect = area.getBoundingClientRect();
  const starterRect = starter.getBoundingClientRect();
  targetPos = {
    x: starterRect.left + starterRect.width / 2 - areaRect.left,
    y: starterRect.top + starterRect.height / 2 - areaRect.top,
  };

  contentDefault.hidden = true;
  results.hidden = true;
  bestFlag.hidden = true;
  hud.hidden = false;
  hud.removeAttribute('aria-hidden');
  hudTime.textContent = '0.0';
  updateHud();

  targetEl = document.createElement('div');
  targetEl.className = 'aim-target spawned';
  paintTarget(targetEl);
  area.appendChild(targetEl);
  moveTarget();

  setAreaState('aim-running');
  announce(`Go. Hit ${TARGET_COUNT} targets as fast as you can.`);
  beeper.play(START_FREQ);

  rafId = requestAnimationFrame(tick);
}

function registerHit(now: number): void {
  hits++;
  spawnPop(targetPos.x, targetPos.y);
  updateHud();

  if (hits >= TARGET_COUNT) {
    endRun(now);
    return;
  }
  moveTarget();
}

function registerMiss(x: number, y: number): void {
  misses++;
  spawnMissMark(x, y);
  updateHud();
}

function endRun(endTime: number): void {
  cancelAnimationFrame(rafId);
  runStatus = 'complete';

  const elapsedMs = endTime - startTime;
  // Score = targets/s × accuracy% — computed from the values the result screen
  // shows (2dp speed, 1dp accuracy), so the displayed equation multiplies out
  // to exactly the displayed score. Transparency beats the third decimal.
  const tps = Math.round((TARGET_COUNT / (elapsedMs / 1000)) * 100) / 100;
  const accFraction = TARGET_COUNT / (TARGET_COUNT + misses);
  const accuracy = Math.round(accFraction * 1000) / 10;
  const score = Math.round(tps * accuracy);
  const avgMs = Math.round(elapsedMs / TARGET_COUNT);
  // Non-null: this tool declares ranks, so resolveRank always finds one.
  const rank = resolveRank(aimTrainerTool, score)!;

  targetEl?.remove();
  targetEl = null;
  clearFeedback();
  hud.hidden = true;
  hud.setAttribute('aria-hidden', 'true');
  progressFill.style.transform = 'scaleX(1)';

  finalScore.textContent = String(score);
  rankLabel.textContent = rank.name;
  rankLabel.className = `rank-badge ${rank.id}`;
  resultMeta.textContent = `${TARGET_COUNT} targets in ${(elapsedMs / 1000).toFixed(1)}s · ${avgMs}ms avg`;
  calcTps.textContent = tps.toFixed(2);
  calcAcc.textContent = accuracy.toFixed(1);
  calcScore.textContent = String(score);

  setAreaState('session-complete', rank.id);
  results.hidden = false;
  beeper.play(END_FREQ);

  // Style and color are paint, but the snapshot records them anyway — the
  // leaderboard-readiness rule wants the full conditions of every run (§4.1).
  const { isBest } = rig.recordSession(
    { score, accuracy, avgMs, misses },
    { targets: TARGET_COUNT, targetStyle: settings.targetStyle, targetColor: settings.targetColor }
  );

  bestFlag.hidden = !isBest;
  message.textContent = isBest
    ? 'New personal best. Keep that momentum going!'
    : (MESSAGES[rank.id] ?? 'Nice run. Go again to beat it.');

  announce(
    `Done. Score ${score}. Rank ${rank.name}. ${accuracy.toFixed(1)} percent accuracy, ` +
      `${avgMs} milliseconds per target.` +
      (isBest ? ' New best.' : '')
  );
}

function resetRun(): void {
  cancelAnimationFrame(rafId);
  runStatus = 'idle';
  hits = 0;
  misses = 0;

  targetEl?.remove();
  targetEl = null;
  clearFeedback();
  hud.hidden = true;
  hud.setAttribute('aria-hidden', 'true');
  results.hidden = true;
  bestFlag.hidden = true;
  contentDefault.hidden = false;
  setAreaState('idle');
  progressFill.style.transform = 'scaleX(0)';
  refreshStarter();
}

// --- Input ------------------------------------------------------------------------

// The arena floor takes clicks too, so the context menu must never open over it.
area.addEventListener('contextmenu', (e) => e.preventDefault());

area.addEventListener('pointerdown', (e) => {
  const now = performance.now(); // stamp before any DOM work
  if ((e.target as HTMLElement).closest('#aim-try-again')) return; // the button handles it
  if (e.button !== 0) return; // primary button / tap only
  e.preventDefault();

  const onTarget = !!(e.target as HTMLElement).closest('.aim-target');

  if (runStatus === 'idle') {
    // Only the starter starts the run — that is the calibration point. A click
    // on the floor while idle does nothing, so no run begins from an unknown
    // cursor position.
    if (onTarget) startRun(now);
    return;
  }

  if (runStatus !== 'running') return; // 'complete': Try Again restarts

  if (onTarget) {
    registerHit(now);
  } else {
    const rect = area.getBoundingClientRect();
    registerMiss(e.clientX - rect.left, e.clientY - rect.top);
  }
});

document.addEventListener('keydown', (e) => {
  // The rig owns Escape-to-close for the modal; while it is open the test
  // must not swallow keys.
  if (!resetModal.hidden) return;

  const isSpace = e.code === 'Space' || e.key === ' ';
  const isEnter = e.key === 'Enter';
  if (!isSpace && !isEnter) return;

  const now = performance.now();
  const active = document.activeElement;
  const areaFocused = active === area;
  // Don't hijack keys meant to activate a focused control (settings, buttons, links).
  const onControl =
    active instanceof HTMLElement &&
    active !== area &&
    ['BUTTON', 'A', 'SUMMARY', 'INPUT', 'TEXTAREA', 'SELECT', 'DETAILS'].includes(active.tagName);
  if (onControl) return;

  // Keyboard is the accessibility path, not a second input mode: it starts a
  // run and steps through the targets (a press counts as a hit on the live
  // target). It measures key cadence rather than aim, which the page copy
  // says out loud — but it means every part of the test can be completed
  // without a pointer.
  if (runStatus === 'idle' && areaFocused) {
    if (isSpace) e.preventDefault(); // stop page scroll
    startRun(now);
  } else if (runStatus === 'running' && (areaFocused || isSpace)) {
    if (isSpace) e.preventDefault();
    registerHit(now);
  }
});

tryAgainBtn.addEventListener('click', () => {
  resetRun();
  area.focus();
});

// --- Settings UI -----------------------------------------------------------------------

function saveSettings(): void {
  store.setSettings(settings);
}

/** The starter doubles as the live preview of the style/color settings. */
function refreshStarter(): void {
  sizeTarget(starter, targetDiameter());
  paintTarget(starter);
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
      else refreshStarter();
    });
  });
}

function setActiveOption(group: HTMLElement, value: string): void {
  group.querySelectorAll<HTMLButtonElement>('.btn-option').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.value === value);
  });
}

setupButtonGroup(styleGroup, (value) => {
  if (STYLES.includes(value as TargetStyle)) settings.targetStyle = value as TargetStyle;
});
setupButtonGroup(colorGroup, (value) => {
  if (COLORS.includes(value as TargetColor)) settings.targetColor = value as TargetColor;
});
soundToggle.addEventListener('click', () => {
  settings.sound = !settings.sound;
  saveSettings();
  updateSoundIcon();
  beeper.unlock();
});

// --- Boot --------------------------------------------------------------------------------

setActiveOption(styleGroup, settings.targetStyle);
setActiveOption(colorGroup, settings.targetColor);
updateSoundIcon();
refreshStarter();
rig.refresh();
