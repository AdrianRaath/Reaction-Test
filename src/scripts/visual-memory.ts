/**
 * Visual memory test — grid, pattern, and the level loop.
 *
 * Unlike the speed tools, this one has no clock in the measurement path: the
 * score is the level reached, so nothing here is timing-sensitive. What it does
 * have is a longer state machine (show → recall → cleared → next level) and a
 * grid whose size changes as levels climb.
 *
 * The pattern lives in a closure and only ever touches the DOM as a class
 * during the show phase, so it is not sitting in a data- attribute waiting to
 * be read during recall.
 *
 * Ranks do not apply — this tool declares milestones instead, and the rig
 * renders them in place of the rank checklist (see engine/types.ts).
 */

import { openTool } from '../engine';
import { createRig } from '../engine/rig';
import { createBeeper } from '../engine/sound';
import { visualMemoryTool } from '../data/tool-defs';

interface MemorySettings extends Record<string, unknown> {
  sound: boolean;
}

/** The ruleset, versioned into every record so a future tweak stays traceable. */
const RULES_VERSION = 'v1';
const SHOW_MS = 2000;
const LIVES = 3;
const CLEARED_PAUSE_MS = 600;
const WRONG_FLASH_MS = 400;

const DEFAULT_SETTINGS: MemorySettings = { sound: true };
const CORRECT_FREQ = 880; // A5 — tile found
const WRONG_FREQ = 220; // A3 — miss
const LEVEL_FREQ = 1046; // C6 — level cleared
const OVER_FREQ = 330; // E4 — run over

/**
 * Tiles to remember is always `level + 2`. The grid grows to keep early levels
 * from being trivially dense, then caps at 7×7: an 8×8 grid on a 360px screen
 * puts tiles under the 44px touch target floor, and past level 11 a denser
 * pattern is the difficulty ramp anyway.
 */
function tilesForLevel(level: number): number {
  return level + 2;
}

function gridForLevel(level: number): number {
  if (level <= 2) return 3;
  if (level <= 4) return 4;
  if (level <= 7) return 5;
  if (level <= 10) return 6;
  return 7;
}

const { store, adapter } = (() => {
  const opened = openTool(visualMemoryTool);
  return { store: opened.store, adapter: opened.adapter };
})();

function loadSettings(): MemorySettings {
  const raw = store.getSettings<MemorySettings>(DEFAULT_SETTINGS);
  return { sound: typeof raw.sound === 'boolean' ? raw.sound : true };
}

const settings = loadSettings();

// --- DOM ----------------------------------------------------------------------

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Visual memory test: missing #${id}`);
  return node as T;
}

const area = el('vm-area');
const grid = el('vm-grid');
const intro = el('vm-intro');
const results = el('vm-results');
const statusEl = el('vm-status');
const levelEl = el('vm-level');
const livesEl = el('vm-lives');
const statusBar = el('vm-status-bar');
const announceEl = el('vm-announce');
const startBtn = el('vm-start');
const finalLevel = el('vm-final-level');
const resultMeta = el('vm-result-meta');
const bestFlag = el('vm-best-flag');
const message = el('vm-message');
const tryAgainBtn = el('vm-try-again');
const soundToggle = el('sound-toggle');
const soundOnIcon = el('sound-icon-on');
const soundOffIcon = el('sound-icon-off');
const resetModal = el('reset-modal');

const beeper = createBeeper({ enabled: () => settings.sound, gain: 0.2 });

function updateSoundIcon(): void {
  soundOnIcon.hidden = !settings.sound;
  soundOffIcon.hidden = settings.sound;
  soundToggle.classList.toggle('muted', !settings.sound);
  soundToggle.setAttribute('aria-pressed', String(settings.sound));
}

// --- Telemetry rig -----------------------------------------------------------------

const rig = createRig(
  visualMemoryTool,
  store,
  adapter,
  {
    // No rank name to key off — a milestone tool passes '' here.
    bestDescription: () => 'The furthest you have reached in one run.',
    avgDescription: (runs) => `Average across your last ${runs} run${runs === 1 ? '' : 's'}.`,
    historyScore: (v) => `Level ${v}`,
    chartTooltip: (v) => `Level ${v}`,
    runLabel: 'Run',
  },
  { onReset: () => resetRun() }
);

// --- Run state -------------------------------------------------------------------

type Phase = 'idle' | 'showing' | 'recall' | 'cleared' | 'over';

let phase: Phase = 'idle';
let level = 1;
let livesLeft = LIVES;
let tilesRecalled = 0;
/** Indices of the current pattern. Deliberately closure-only — see file header. */
let pattern = new Set<number>();
let found = new Set<number>();
let cells: HTMLButtonElement[] = [];
let focusIndex = 0;
let timers: number[] = [];

function clearTimers(): void {
  for (const id of timers) window.clearTimeout(id);
  timers = [];
}

function after(ms: number, fn: () => void): void {
  timers.push(window.setTimeout(fn, ms));
}

function announce(text: string): void {
  announceEl.textContent = text;
}

function setPhase(next: Phase): void {
  phase = next;
  area.classList.remove('phase-idle', 'phase-showing', 'phase-recall', 'phase-over');
  area.classList.add(`phase-${next === 'cleared' ? 'recall' : next}`);
}

// --- Grid ------------------------------------------------------------------------

function buildGrid(size: number): void {
  grid.replaceChildren();
  grid.style.setProperty('--vm-grid-size', String(size));
  cells = [];

  for (let i = 0; i < size * size; i++) {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'vm-cell';
    cell.dataset.index = String(i);
    cell.setAttribute('aria-label', `Tile ${i + 1}`);
    // Roving tabindex: one tab stop for the whole grid, arrows move within it.
    cell.tabIndex = i === 0 ? 0 : -1;
    cell.addEventListener('click', () => onCellActivate(i));
    grid.appendChild(cell);
    cells.push(cell);
  }
  focusIndex = 0;
}

function paintPattern(show: boolean): void {
  cells.forEach((cell, i) => {
    cell.classList.toggle('lit', show && pattern.has(i));
  });
}

function randomPattern(size: number, count: number): Set<number> {
  const total = size * size;
  const picked = new Set<number>();
  while (picked.size < count) {
    picked.add(Math.floor(Math.random() * total));
  }
  return picked;
}

// --- Level lifecycle ---------------------------------------------------------------

function startRun(): void {
  beeper.unlock();
  clearTimers();
  level = 1;
  livesLeft = LIVES;
  tilesRecalled = 0;
  intro.hidden = true;
  results.hidden = true;
  bestFlag.hidden = true;
  grid.hidden = false;
  statusBar.hidden = false;
  startLevel();
}

function startLevel(): void {
  const size = gridForLevel(level);
  const count = Math.min(tilesForLevel(level), size * size);

  buildGrid(size);
  pattern = randomPattern(size, count);
  found = new Set();

  renderStatus();
  setPhase('showing');
  statusEl.textContent = 'Memorise the pattern';
  paintPattern(true);
  announce(`Level ${level}. Memorise ${count} tiles.`);

  after(SHOW_MS, () => {
    paintPattern(false);
    setPhase('recall');
    statusEl.textContent = 'Click the tiles you saw';
    announce(`Recall. Click the ${count} tiles you saw.`);
    cells[focusIndex]?.focus({ preventScroll: true });
  });
}

function onCellActivate(index: number): void {
  if (phase !== 'recall') return;
  const cell = cells[index];
  if (!cell || cell.classList.contains('correct') || cell.classList.contains('wrong')) return;

  if (pattern.has(index)) {
    found.add(index);
    tilesRecalled++;
    cell.classList.add('correct');
    cell.setAttribute('aria-label', `Tile ${index + 1}, correct`);
    beeper.play(CORRECT_FREQ);

    if (found.size === pattern.size) {
      levelCleared();
    } else {
      announce(`Correct. ${pattern.size - found.size} to go.`);
    }
    return;
  }

  // A miss costs a life but the level continues — lives are a budget for the
  // whole run, not per-level retries.
  livesLeft--;
  cell.classList.add('wrong');
  cell.setAttribute('aria-label', `Tile ${index + 1}, wrong`);
  beeper.play(WRONG_FREQ);
  renderStatus();
  after(WRONG_FLASH_MS, () => cell.classList.remove('wrong'));

  if (livesLeft <= 0) {
    endRun();
    return;
  }
  announce(`Wrong. ${livesLeft} ${livesLeft === 1 ? 'life' : 'lives'} left.`);
}

function levelCleared(): void {
  setPhase('cleared');
  statusEl.textContent = 'Level cleared';
  beeper.play(LEVEL_FREQ);
  announce(`Level ${level} cleared.`);
  level++;
  after(CLEARED_PAUSE_MS, startLevel);
}

function endRun(): void {
  clearTimers();
  setPhase('over');
  // The score is the last level *completed*, so a run that dies on level 7
  // scores 6, and one that dies on level 1 scores 0.
  const reached = level - 1;

  grid.hidden = true;
  statusBar.hidden = true;
  results.hidden = false;
  finalLevel.textContent = String(reached);
  resultMeta.textContent = `${tilesRecalled} tile${tilesRecalled === 1 ? '' : 's'} recalled`;

  const { isBest } = rig.recordSession(
    { level: reached, tiles: tilesRecalled },
    { rules: RULES_VERSION, showMs: SHOW_MS, lives: LIVES }
  );

  beeper.play(OVER_FREQ);
  bestFlag.hidden = !isBest;
  message.textContent = isBest
    ? 'New personal best. Your recall is improving.'
    : messageFor(reached);

  announce(
    `Run over. Level ${reached}. ${tilesRecalled} tiles recalled.` + (isBest ? ' New best.' : '')
  );
  tryAgainBtn.focus({ preventScroll: true });
}

function messageFor(reached: number): string {
  if (reached >= 20) return 'Exceptional recall. Very few people hold this many tiles.';
  if (reached >= 15) return 'Strong recall, well above average.';
  if (reached >= 10) return 'Around average, and a good base to build on.';
  if (reached >= 5) return 'Solid start. Try grouping tiles into shapes.';
  return 'Warming up. Look for a shape in the pattern rather than single tiles.';
}

function resetRun(): void {
  clearTimers();
  setPhase('idle');
  level = 1;
  livesLeft = LIVES;
  tilesRecalled = 0;
  pattern = new Set();
  found = new Set();
  grid.replaceChildren();
  cells = [];
  grid.hidden = true;
  statusBar.hidden = true;
  results.hidden = true;
  bestFlag.hidden = true;
  intro.hidden = false;
  statusEl.textContent = '';
}

function renderStatus(): void {
  levelEl.textContent = String(level);
  // Lives read as filled/spent pips plus a screen-reader count, so the state is
  // never carried by colour alone.
  livesEl.replaceChildren();
  for (let i = 0; i < LIVES; i++) {
    const pip = document.createElement('span');
    pip.className = i < livesLeft ? 'vm-life' : 'vm-life spent';
    pip.setAttribute('aria-hidden', 'true');
    livesEl.appendChild(pip);
  }
  const count = document.createElement('span');
  count.className = 'visually-hidden';
  count.textContent = `${livesLeft} of ${LIVES} lives remaining`;
  livesEl.appendChild(count);
}

// --- Keyboard --------------------------------------------------------------------

const ARROWS: Record<string, [number, number]> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
};

grid.addEventListener('keydown', (e) => {
  if (phase !== 'recall' || cells.length === 0) return;

  const size = gridForLevel(level);
  const delta = ARROWS[e.key];

  if (delta) {
    e.preventDefault();
    const x = focusIndex % size;
    const y = Math.floor(focusIndex / size);
    const nx = Math.min(size - 1, Math.max(0, x + delta[0]));
    const ny = Math.min(size - 1, Math.max(0, y + delta[1]));
    moveFocus(ny * size + nx);
    return;
  }

  if (e.key === 'Home') {
    e.preventDefault();
    moveFocus(0);
  } else if (e.key === 'End') {
    e.preventDefault();
    moveFocus(cells.length - 1);
  }
  // Space and Enter fall through to the button's native click.
});

function moveFocus(index: number): void {
  cells[focusIndex]?.setAttribute('tabindex', '-1');
  focusIndex = index;
  const cell = cells[index];
  if (!cell) return;
  cell.setAttribute('tabindex', '0');
  cell.focus({ preventScroll: true });
}

startBtn.addEventListener('click', startRun);
tryAgainBtn.addEventListener('click', startRun);

// Space/Enter on the idle area starts a run, matching the other tools.
area.addEventListener('keydown', (e) => {
  if (!resetModal.hidden) return;
  if (phase !== 'idle' && phase !== 'over') return;
  if (e.target !== area) return;
  if (e.key === 'Enter' || e.code === 'Space' || e.key === ' ') {
    e.preventDefault();
    startRun();
  }
});

soundToggle.addEventListener('click', () => {
  settings.sound = !settings.sound;
  store.setSettings(settings);
  updateSoundIcon();
  beeper.unlock();
});

// --- Boot --------------------------------------------------------------------------------

updateSoundIcon();
rig.refresh();
