/**
 * Spacebar Clicker — the browser side.
 *
 * A game, not a tool: there are no scored runs, so none of the telemetry rig
 * (createRig, ProgressWidgets) applies. This file owns the DOM, the input, the
 * frame loop, the surge scheduler, saving, and sound. Every rule it enforces
 * comes from the pure modules in src/games/spacebar-clicker, which carry the
 * unit tests.
 *
 * Reuse from the engine is deliberate and narrow: the guarded localStorage
 * adapter and the Web Audio beeper. The save lives under its own namespaced
 * key and never touches another tool's data.
 */

import { browserAdapter, KEY_PREFIX } from '../engine/storage';
import { createBeeper } from '../engine/sound';
import { checkAchievements } from '../games/spacebar-clicker/achievements';
import { ComboTracker } from '../games/spacebar-clicker/combo';
import {
  ACHIEVEMENTS,
  AUTO_TAPPERS,
  MIN_PRESS_GAP_MS,
  PRESS_UPGRADES,
  PRESTIGE_UNLOCK,
  REACTOR_STATES,
  SAVE_INTERVAL_MS,
  SURGE,
  type AutoTapperId,
  type PressUpgradeId,
  type ShopTab,
} from '../games/spacebar-clicker/config';
import {
  autoTapper,
  buyTapper,
  buyUpgrade,
  canBuyTapper,
  canBuyUpgrade,
  comboTier,
  doubleTapChance,
  earn,
  energyPerPress,
  energyPerSecond,
  isotopeBonus,
  markShopTabSeen,
  nextComboTier,
  offlineAward,
  pressUpgrade,
  prestigeGain,
  prestigeUnlocked,
  reactorIndex,
  reactorProgress,
  shopTabHasNews,
  tapperCost,
  updateReveals,
  upgradeCost,
} from '../games/spacebar-clicker/economy';
import {
  formatDuration,
  formatEnergy,
  formatMultiplier,
  formatRate,
} from '../games/spacebar-clicker/format';
import {
  defaultSave,
  parseSave,
  prestigeReset,
  serializeSave,
  type SaveState,
} from '../games/spacebar-clicker/save';

const SAVE_KEY = `${KEY_PREFIX}:spacebar-clicker:save`;
const SETTINGS_KEY = `${KEY_PREFIX}:spacebar-clicker:settings`;

/** How long the dial holds full on a stage change before sweeping back. */
const ARC_HOLD_MS = 420;
/** Matches the .arc-fill.is-sweeping transition. */
const ARC_SWEEP_MS = 800;

interface Settings {
  sound: boolean;
}

// --- Storage ------------------------------------------------------------------

const adapter = browserAdapter();
let state: SaveState = parseSave(adapter.get(SAVE_KEY), Date.now());

function loadSettings(): Settings {
  try {
    const raw = JSON.parse(adapter.get(SETTINGS_KEY) ?? '{}') as Partial<Settings>;
    return { sound: typeof raw.sound === 'boolean' ? raw.sound : true };
  } catch {
    return { sound: true };
  }
}
const settings = loadSettings();

function saveSettings(): void {
  adapter.set(SETTINGS_KEY, JSON.stringify(settings));
}

function save(): void {
  state.lastSeen = Date.now();
  adapter.set(SAVE_KEY, serializeSave(state));
}

// --- DOM ------------------------------------------------------------------------

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Spacebar Clicker: missing #${id}`);
  return node as T;
}

const reactor = el('sc-reactor');
const energyEl = el('sc-energy');
const epsEl = el('sc-eps');
const eppEl = el('sc-epp');
const coreEl = el('sc-core');
const arcEl = document.getElementById('sc-arc') as SVGCircleElement | null;
/** Circumference of the progress arc, read from the drawn circle. */
const ARC_LENGTH = arcEl ? 2 * Math.PI * arcEl.r.baseVal.value : 0;
const stateEl = el('sc-state');
const washEl = el('sc-wash');
const shockEl = el('sc-shockwave');
/** Dial lights, each paired with the index of the reactor state it marks. */
const dialLeds = Array.from(document.querySelectorAll<SVGGElement>('.dial-led')).map((node) => ({
  node,
  index: REACTOR_STATES.findIndex((s) => s.id === node.dataset.led),
}));
const hintEl = el('sc-hint');
const comboEl = el('sc-combo');
const comboTierEl = el('sc-combo-tier');
const comboNextEl = el('sc-combo-next');
const comboMultEl = el('sc-combo-mult');
const comboFill = el('sc-combo-fill');
const floats = el('sc-floats');
const announceEl = el('sc-announce');

const surgeEl = el('sc-surge');
const surgeTitle = el('sc-surge-title');
const surgeLive = el('sc-surge-live');
const surgeCps = el('sc-surge-cps');
const surgeCount = el('sc-surge-count');
const surgeFill = el('sc-surge-fill');
const surgeSummary = el('sc-surge-summary');
const surgePresses = el('sc-surge-presses');
const surgeRate = el('sc-surge-rate');
const surgeEarned = el('sc-surge-earned');
const surgeBest = el('sc-surge-best');

const toastEl = el('sc-toast');
const toastText = el('sc-toast-text');

// Shop: two tabs. A closed tab that gains something wears an amber "New" tag
// until it is opened (DESIGN.md, the Shop-Signal Exception; rules in economy.ts).
const shopTabs = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-shop-tab]'));
const shopPanels = new Map(
  shopTabs.map((t) => [t.dataset.shopTab as ShopTab, el(`sc-shop-${t.dataset.shopTab}`)])
);
const newTagEls: Record<ShopTab, HTMLElement> = {
  press: el('sc-new-press'),
  auto: el('sc-new-auto'),
};
const shopHiddenHint = el('sc-shop-hidden-hint');
let activeShopTab: ShopTab = 'press';

const shopButtons = new Map<string, HTMLButtonElement>();
document.querySelectorAll<HTMLButtonElement>('.shop-buy').forEach((btn) => {
  const item = btn.closest<HTMLElement>('.shop-item');
  if (item?.dataset.id) shopButtons.set(`${item.dataset.kind}:${item.dataset.id}`, btn);
});

const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-tab]'));
const panels = new Map(tabs.map((t) => [t.dataset.tab!, el(`sc-panel-${t.dataset.tab}`)]));

const statEls = {
  presses: el('sc-stat-presses'),
  run: el('sc-stat-run'),
  lifetime: el('sc-stat-lifetime'),
  eps: el('sc-stat-eps'),
  epp: el('sc-stat-epp'),
  bestCombo: el('sc-stat-best-combo'),
  bestSurge: el('sc-stat-best-surge'),
  isotopes: el('sc-stat-isotopes'),
  prestiges: el('sc-stat-prestiges'),
  played: el('sc-stat-played'),
};

const achCount = el('sc-ach-count');
const prestigeLocked = el('sc-prestige-locked');
const prestigeReady = el('sc-prestige-ready');
const prestigeProgress = el('sc-prestige-progress');
const prestigeGainEl = el('sc-prestige-gain');
const prestigeBtn = el<HTMLButtonElement>('sc-prestige-btn');
const isotopesEl = el('sc-isotopes');
const isotopeBonusEl = el('sc-isotope-bonus');

const prestigeModal = el('sc-prestige-modal');
const prestigeModalGain = el('sc-prestige-modal-gain');
const prestigeCancel = el('sc-prestige-cancel');
const prestigeConfirm = el('sc-prestige-confirm');

const awayModal = el('sc-away-modal');
const awayTime = el('sc-away-time');
const awayEnergy = el('sc-away-energy');
const awayCollect = el('sc-away-collect');

const resetModal = el('reset-modal');
const resetBtn = el('reset-btn');
const resetCancel = el('modal-cancel-btn');
const resetConfirm = el('modal-confirm-btn');

const soundToggle = el('sound-toggle');
const soundOnIcon = el('sound-icon-on');
const soundOffIcon = el('sound-icon-off');

const isTouchInput = window.matchMedia('(pointer: coarse)').matches;
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// --- Sound ---------------------------------------------------------------------
// Noteworthy moments only (maintainer decision): never a beep per press.

const beeper = createBeeper({ enabled: () => settings.sound, gain: 0.18 });

function chord(freqs: number[], gapMs = 90): void {
  freqs.forEach((f, i) => window.setTimeout(() => beeper.play(f), i * gapMs));
}

const SOUND = {
  purchase: () => beeper.play(880),
  tierUp: () => chord([659, 988]),
  warningTick: () => beeper.play(523),
  surgeStart: () => chord([784, 1046], 70),
  surgeEnd: () => chord([784, 523], 120),
  reactorUp: () => chord([659, 880, 1046]),
  achievement: () => chord([784, 1175]),
  prestige: () => chord([523, 659, 784, 1046], 110),
};

function updateSoundIcon(): void {
  soundOnIcon.hidden = !settings.sound;
  soundOffIcon.hidden = settings.sound;
  soundToggle.classList.toggle('muted', !settings.sound);
  soundToggle.setAttribute('aria-pressed', String(settings.sound));
}

// --- Announcements -------------------------------------------------------------

function announce(text: string): void {
  announceEl.textContent = text;
}

const toastQueue: string[] = [];
let toastTimer = 0;

function toast(text: string): void {
  toastQueue.push(text);
  if (!toastTimer) showNextToast();
}

function showNextToast(): void {
  const next = toastQueue.shift();
  if (next === undefined) {
    toastTimer = 0;
    toastEl.hidden = true;
    return;
  }
  toastText.textContent = next;
  toastEl.hidden = false;
  toastEl.classList.remove('is-in');
  void toastEl.offsetWidth;
  toastEl.classList.add('is-in');
  toastTimer = window.setTimeout(showNextToast, 2600);
}

/** Restart a one-shot CSS animation on an element (HTML or SVG). */
function replay(node: Element, className: string): void {
  if (reducedMotion()) return;
  node.classList.remove(className);
  void node.getBoundingClientRect(); // force a reflow so the animation restarts
  node.classList.add(className);
}

// --- Run state ------------------------------------------------------------------

const combo = new ComboTracker(() => state.upgrades.stabiliser > 0);
let lastPressAt = -Infinity; // performance.now()
let lastTierMultiplier = 1;
let reactorIdx = reactorIndex(state.runLifetime);
/** performance.now() until which the dial shows full after a stage change. */
let arcHoldUntil = 0;
let arcTimers: number[] = [];

type SurgePhase = 'idle' | 'warning' | 'active' | 'summary';
const surge = {
  phase: 'idle' as SurgePhase,
  /** Active-play seconds at which the next surge begins its warning. */
  dueAt: 0,
  /** performance.now() at which the current phase ends. */
  phaseEndsAt: 0,
  presses: 0,
  earned: 0,
  /** Whole seconds left on the warning the last time a tick sounded. */
  lastTick: 0,
};
/** Seconds of active play: page visible and a press within the last minute. */
let activeS = 0;

function scheduleSurge(): void {
  surge.dueAt = activeS + SURGE.minGapS + Math.random() * (SURGE.maxGapS - SURGE.minGapS);
}
scheduleSurge();

// --- Rendering ------------------------------------------------------------------

function renderReadouts(): void {
  const mult = comboTier(combo.combo).multiplier;
  energyEl.textContent = formatEnergy(state.energy);
  epsEl.textContent = formatRate(energyPerSecond(state, mult));
  eppEl.textContent = formatEnergy(energyPerPress(state, mult, surge.phase === 'active'));
}

function renderReactor(): void {
  const def = REACTOR_STATES[reactorIdx]!;
  reactor.dataset.state = def.id;
  coreEl.dataset.state = def.id;
  stateEl.textContent = def.name;
  for (const led of dialLeds) led.node.classList.toggle('is-lit', led.index <= reactorIdx);
}

/** The arc around the core fills toward the next reactor state. */
function renderArc(now = performance.now()): void {
  if (!arcEl) return;
  const fraction = now < arcHoldUntil ? 1 : reactorProgress(state.runLifetime);
  arcEl.style.strokeDashoffset = String(ARC_LENGTH * (1 - fraction));
}

function clearArcTimers(): void {
  for (const id of arcTimers) window.clearTimeout(id);
  arcTimers = [];
  arcEl?.classList.remove('is-complete', 'is-sweeping');
  arcHoldUntil = 0;
}

/**
 * A stage reached. The color fade is CSS (registered custom properties); this
 * plays the one-shot moments over it: the new lights pop on, a ring rolls out
 * from the core, the grid lights in a travelling band, the name settles, and
 * the dial holds full before sweeping back to the start of the new stage.
 */
function celebrateStage(prevIdx: number): void {
  for (const led of dialLeds) {
    if (led.index > prevIdx && led.index <= reactorIdx) replay(led.node, 'is-new');
  }
  replay(stateEl, 'is-settling');
  replay(shockEl, 'is-firing');

  const face = reactor.getBoundingClientRect();
  const core = coreEl.getBoundingClientRect();
  washEl.style.setProperty('--wash-x', `${core.left - face.left + core.width / 2}px`);
  washEl.style.setProperty('--wash-y', `${core.top - face.top + core.height / 2}px`);
  replay(washEl, 'is-washing');

  if (!arcEl) return;
  clearArcTimers();
  arcHoldUntil = performance.now() + ARC_HOLD_MS;
  arcEl.classList.add('is-complete');
  renderArc();
  arcTimers.push(
    window.setTimeout(() => {
      arcEl.classList.replace('is-complete', 'is-sweeping');
      renderArc();
      arcTimers.push(window.setTimeout(() => arcEl.classList.remove('is-sweeping'), ARC_SWEEP_MS));
    }, ARC_HOLD_MS)
  );
}

function renderCombo(now: number): void {
  const tier = comboTier(combo.combo);
  const next = nextComboTier(combo.combo);
  comboEl.textContent = String(combo.combo);
  comboTierEl.textContent = tier.label || 'combo';
  comboTierEl.classList.toggle('is-tiered', tier.multiplier > 1);
  comboNextEl.textContent = next ? `${next.min - combo.combo} to ${next.label}` : 'top tier';
  comboMultEl.textContent = formatMultiplier(tier.multiplier);
  comboFill.style.transform = `scaleX(${combo.graceRemaining(now)})`;
}

function renderShop(): void {
  for (const def of PRESS_UPGRADES) {
    const btn = shopButtons.get(`press:${def.id}`);
    if (!btn) continue;
    const owned = state.upgrades[def.id];
    const maxed = owned >= def.max;
    const affordable = canBuyUpgrade(state, def.id);
    btn.querySelector('[data-cost]')!.textContent = maxed
      ? 'Max'
      : formatEnergy(upgradeCost(state, def.id));
    btn.querySelector('[data-level]')!.textContent =
      def.max === 1 ? (owned ? 'Owned' : '') : `${owned}/${def.max}`;
    btn.classList.toggle('is-affordable', affordable);
    btn.classList.toggle('is-maxed', maxed);
    btn.setAttribute('aria-disabled', String(!affordable));
  }

  let anyHidden = false;
  for (const def of AUTO_TAPPERS) {
    const btn = shopButtons.get(`auto:${def.id}`);
    if (!btn) continue;
    const item = btn.closest<HTMLElement>('.shop-item')!;
    const revealed = state.revealed.includes(def.id);
    item.hidden = !revealed;
    if (!revealed) {
      anyHidden = true;
      continue;
    }
    const affordable = canBuyTapper(state, def.id);
    btn.querySelector('[data-cost]')!.textContent = formatEnergy(tapperCost(state, def.id));
    btn.querySelector('[data-owned]')!.textContent = String(state.tappers[def.id]);
    btn.classList.toggle('is-affordable', affordable);
    btn.setAttribute('aria-disabled', String(!affordable));
  }
  shopHiddenHint.hidden = !anyHidden;

  renderShopNotices();
}

/**
 * The open tab is always being looked at, so everything on it is marked seen
 * first; then each closed tab shows its tag if it has gained anything since.
 */
function renderShopNotices(): void {
  if (markShopTabSeen(state, activeShopTab)) dirty = true;
  for (const tab of ['press', 'auto'] as const) {
    newTagEls[tab].hidden = tab === activeShopTab || !shopTabHasNews(state, tab);
  }
}

function renderStats(): void {
  const mult = comboTier(combo.combo).multiplier;
  statEls.presses.textContent = state.totalPresses.toLocaleString('en-US');
  statEls.run.textContent = formatEnergy(state.runLifetime);
  statEls.lifetime.textContent = formatEnergy(state.totalLifetime);
  statEls.eps.textContent = formatRate(energyPerSecond(state, mult));
  statEls.epp.textContent = formatEnergy(energyPerPress(state, mult));
  statEls.bestCombo.textContent = String(state.bestCombo);
  statEls.bestSurge.textContent = state.surges ? state.bestSurgeCps.toFixed(1) : '—';
  statEls.isotopes.textContent = String(state.isotopes);
  statEls.prestiges.textContent = String(state.prestiges);
  statEls.played.textContent = formatDuration(state.playedS);
}

function renderAchievements(): void {
  const unlocked = new Set<string>(state.achievements);
  document.querySelectorAll<HTMLElement>('.achievement').forEach((item) => {
    const hit = unlocked.has(item.dataset.id ?? '');
    item.classList.toggle('is-unlocked', hit);
    const mark = item.querySelector('.achievement-mark');
    if (mark) mark.textContent = hit ? '✓' : '✗';
  });
  achCount.textContent = `${unlocked.size} of ${ACHIEVEMENTS.length}`;
}

function renderPrestige(): void {
  const ready = prestigeUnlocked(state);
  prestigeLocked.hidden = ready;
  prestigeReady.hidden = !ready;
  isotopesEl.textContent = String(state.isotopes);
  isotopeBonusEl.textContent = `+${Math.round((isotopeBonus(state.isotopes) - 1) * 100)}%`;
  if (ready) {
    prestigeGainEl.textContent = String(prestigeGain(state.runLifetime));
  } else {
    prestigeProgress.textContent = `${formatEnergy(state.runLifetime)} of ${formatEnergy(PRESTIGE_UNLOCK)}`;
  }
}

function renderPanels(): void {
  renderStats();
  renderAchievements();
  renderPrestige();
}

function renderAll(now = performance.now()): void {
  renderReadouts();
  renderReactor();
  renderArc();
  renderCombo(now);
  renderShop();
  renderPanels();
}

// --- Press feedback ---------------------------------------------------------------

const MAX_FLOATS = 14;

function spawnFloat(value: number, doubled: boolean, e?: Event): void {
  if (reducedMotion() || floats.childElementCount >= MAX_FLOATS) return;
  const span = document.createElement('span');
  span.className = 'float readout';
  span.textContent = `+${formatEnergy(value)}${doubled ? ' x2' : ''}`;

  // Rise from where the press landed, or from around the core on a key press.
  const rect = reactor.getBoundingClientRect();
  const core = coreEl.getBoundingClientRect();
  let x = core.left - rect.left + core.width / 2 + (Math.random() - 0.5) * core.width;
  let y = core.top - rect.top + core.height * 0.4;
  if (e instanceof PointerEvent && e.clientX !== 0) {
    x = e.clientX - rect.left;
    y = e.clientY - rect.top;
  }
  span.style.left = `${x}px`;
  span.style.top = `${y}px`;
  span.addEventListener('animationend', () => span.remove());
  floats.appendChild(span);
}

// --- Game events -------------------------------------------------------------------

function afterEarn(): void {
  const idx = reactorIndex(state.runLifetime);
  if (idx !== reactorIdx) {
    const prevIdx = reactorIdx;
    reactorIdx = idx;
    renderReactor();
    replay(coreEl, 'is-stepped');
    if (idx > prevIdx) celebrateStage(prevIdx);
    const name = REACTOR_STATES[idx]!.name;
    toast(`Reactor is now ${name}`);
    announce(`Reactor is now ${name}.`);
    SOUND.reactorUp();
    awardAchievements();
  }
  for (const id of updateReveals(state)) {
    toast(`New in the shop: ${autoTapper(id).name}`);
  }
}

function awardAchievements(ctx: { combo?: number; surgeCps?: number } = {}): void {
  const earned = checkAchievements(state, ctx);
  if (earned.length === 0) return;
  const names = earned.map((id) => ACHIEVEMENTS.find((a) => a.id === id)!.name);
  for (const name of names) toast(`Achievement: ${name}`);
  announce(`Achievement unlocked: ${names.join(', ')}.`);
  SOUND.achievement();
  renderAchievements();
}

function press(e?: Event): void {
  const now = performance.now();
  if (now - lastPressAt < MIN_PRESS_GAP_MS) return; // 30 per second cap (spec §2)
  lastPressAt = now;
  beeper.unlock();

  const result = combo.press(now);
  const tier = comboTier(result.combo);
  if (tier.multiplier > lastTierMultiplier) {
    SOUND.tierUp();
    replay(comboTierEl, 'is-up');
  }
  lastTierMultiplier = tier.multiplier;

  const surging = surge.phase === 'active';
  let value = energyPerPress(state, tier.multiplier, surging);
  const doubled = Math.random() < doubleTapChance(state);
  if (doubled) value *= 2;

  earn(state, value);
  state.totalPresses++;
  if (result.combo > state.bestCombo) state.bestCombo = result.combo;
  if (surging) {
    surge.presses++;
    surge.earned += value;
  }

  spawnFloat(value, doubled, e);
  replay(coreEl, 'is-pressed');
  afterEarn();
  if (
    state.totalPresses === 1 ||
    state.totalPresses % 100 === 0 ||
    result.combo === 25 ||
    result.combo === 50 ||
    result.combo === 100
  ) {
    awardAchievements({ combo: result.combo });
  }
}

function onComboBroke(): void {
  lastTierMultiplier = comboTier(combo.combo).multiplier;
}

// --- Surge ---------------------------------------------------------------------------

function surgeTick(now: number): void {
  switch (surge.phase) {
    case 'idle':
      if (activeS >= surge.dueAt && now - lastPressAt < SURGE.idleAfterS * 1000) {
        surge.phase = 'warning';
        surge.phaseEndsAt = now + SURGE.warningS * 1000;
        surge.lastTick = SURGE.warningS;
        surgeEl.hidden = false;
        surgeLive.hidden = true;
        surgeSummary.hidden = true;
        reactor.classList.add('is-warning');
        announce(`Surge in ${SURGE.warningS} seconds. Every press is worth ten times more.`);
        SOUND.warningTick();
      }
      break;
    case 'warning': {
      const left = Math.ceil((surge.phaseEndsAt - now) / 1000);
      surgeTitle.textContent = `Surge in ${Math.max(left, 1)}`;
      if (left < surge.lastTick && left >= 1) {
        surge.lastTick = left;
        SOUND.warningTick();
      }
      if (now >= surge.phaseEndsAt) {
        surge.phase = 'active';
        surge.phaseEndsAt = now + SURGE.durationS * 1000;
        surge.presses = 0;
        surge.earned = 0;
        surgeTitle.textContent = `Surge x${SURGE.multiplier}`;
        surgeLive.hidden = false;
        reactor.classList.remove('is-warning');
        reactor.classList.add('is-surging');
        announce('Surge. Press as fast as you can for five seconds.');
        SOUND.surgeStart();
      }
      break;
    }
    case 'active': {
      const elapsed = (SURGE.durationS * 1000 - (surge.phaseEndsAt - now)) / 1000;
      surgeCps.textContent = (surge.presses / Math.max(elapsed, 0.3)).toFixed(1);
      surgeCount.textContent = String(surge.presses);
      surgeFill.style.transform = `scaleX(${Math.max(0, (surge.phaseEndsAt - now) / (SURGE.durationS * 1000))})`;
      if (now >= surge.phaseEndsAt) endSurge(now);
      break;
    }
    case 'summary':
      if (now >= surge.phaseEndsAt) {
        surge.phase = 'idle';
        surgeEl.hidden = true;
        scheduleSurge();
      }
      break;
  }
}

function endSurge(now: number): void {
  const cps = Math.round((surge.presses / SURGE.durationS) * 10) / 10;
  const isBest = cps > state.bestSurgeCps;
  state.surges++;
  if (isBest) state.bestSurgeCps = cps;

  surge.phase = 'summary';
  surge.phaseEndsAt = now + 4000;
  surgeLive.hidden = true;
  surgeSummary.hidden = false;
  surgeTitle.textContent = 'Surge over';
  surgePresses.textContent = String(surge.presses);
  surgeRate.textContent = cps.toFixed(1);
  surgeEarned.textContent = formatEnergy(surge.earned);
  surgeBest.hidden = !isBest;
  reactor.classList.remove('is-surging');
  announce(
    `Surge over. ${surge.presses} presses, ${cps.toFixed(1)} per second.${isBest ? ' New best.' : ''}`
  );
  SOUND.surgeEnd();
  awardAchievements({ surgeCps: cps });
  renderStats();
}

// --- Frame loop ------------------------------------------------------------------------

let lastFrame = performance.now();
let lastShopRender = 0;
let lastPanelRender = 0;
let dirty = false;

function frame(now: number): void {
  const dt = Math.min((now - lastFrame) / 1000, 1);
  lastFrame = now;

  if (!document.hidden) {
    state.playedS += dt;
    if (now - lastPressAt < SURGE.idleAfterS * 1000) activeS += dt;
  }

  if (combo.tick(now)) onComboBroke();

  const eps = energyPerSecond(state, comboTier(combo.combo).multiplier);
  if (eps > 0) {
    earn(state, eps * dt);
    afterEarn();
    dirty = true;
  }

  surgeTick(now);

  renderReadouts();
  renderCombo(now);
  if (now - lastShopRender > 150) {
    renderShop();
    renderArc();
    lastShopRender = now;
  }
  if (now - lastPanelRender > 500) {
    renderStats();
    renderPrestige();
    lastPanelRender = now;
  }

  requestAnimationFrame(frame);
}

// --- Offline / away progress --------------------------------------------------------------

let pendingAway = 0;

/**
 * Credit the time since the last save. Short gaps (a tab switch) pay full EPS
 * silently; a real absence pays half, capped, behind a Collect button (spec §7).
 */
function settleAbsence(): void {
  const awayS = Math.max(0, (Date.now() - state.lastSeen) / 1000);
  if (awayS <= 0) return;

  const award = offlineAward(state, awayS);
  if (award) {
    awayTime.textContent = formatDuration(award.seconds);
    awayEnergy.textContent = formatEnergy(award.energy);
    pendingAway = award.energy;
    openDialog(awayModal, awayCollect);
  } else if (awayS > 1) {
    earn(state, energyPerSecond(state) * Math.min(awayS, 60));
    afterEarn();
  }
  state.lastSeen = Date.now();
}

awayCollect.addEventListener('click', () => {
  earn(state, pendingAway);
  pendingAway = 0;
  afterEarn();
  closeDialog(awayModal);
  renderAll();
  save();
});

// --- Dialogs ------------------------------------------------------------------------------

let lastFocused: HTMLElement | null = null;

function openDialog(modal: HTMLElement, focus: HTMLElement): void {
  lastFocused = document.activeElement as HTMLElement | null;
  modal.hidden = false;
  focus.focus();
}

function closeDialog(modal: HTMLElement): void {
  modal.hidden = true;
  // A dialog opened on page load has nothing to hand focus back to, so the
  // reactor takes it: Space is the game's input and should land there.
  const target = lastFocused && lastFocused !== document.body ? lastFocused : reactor;
  target.focus();
  lastFocused = null;
}

function anyDialogOpen(): boolean {
  return !resetModal.hidden || !prestigeModal.hidden || !awayModal.hidden;
}

for (const modal of [resetModal, prestigeModal, awayModal]) {
  modal.addEventListener('click', (e) => {
    if (e.target === modal && modal !== awayModal) closeDialog(modal);
  });
}

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!resetModal.hidden) closeDialog(resetModal);
  if (!prestigeModal.hidden) closeDialog(prestigeModal);
});

/** Return the live state to a fresh run's starting point (reset or prestige). */
function restartRun(): void {
  combo.reset();
  lastTierMultiplier = 1;
  reactorIdx = reactorIndex(state.runLifetime);
  clearArcTimers();
  surge.phase = 'idle';
  surgeEl.hidden = true;
  reactor.classList.remove('is-surging', 'is-warning');
  scheduleSurge();
}

// Reset everything (top bar). Settings survive, as the dialog promises.
resetBtn.addEventListener('click', () => openDialog(resetModal, resetCancel));
resetCancel.addEventListener('click', () => closeDialog(resetModal));
resetConfirm.addEventListener('click', () => {
  state = defaultSave(Date.now());
  activeS = 0;
  restartRun();
  save();
  selectShopTab('press');
  renderAll();
  closeDialog(resetModal);
  announce('All progress erased.');
});

// Prestige (spec §9).
prestigeBtn.addEventListener('click', () => {
  prestigeModalGain.textContent = String(prestigeGain(state.runLifetime));
  openDialog(prestigeModal, prestigeCancel);
});
prestigeCancel.addEventListener('click', () => closeDialog(prestigeModal));
prestigeConfirm.addEventListener('click', () => {
  const gain = prestigeGain(state.runLifetime);
  if (gain === 0) {
    closeDialog(prestigeModal);
    return;
  }
  state = prestigeReset(state, gain, Date.now());
  restartRun();
  closeDialog(prestigeModal);
  renderAll();
  toast(`Experiment reset. ${gain} isotope${gain === 1 ? '' : 's'} gained.`);
  announce(`Experiment reset. You now hold ${state.isotopes} isotopes.`);
  SOUND.prestige();
  awardAchievements();
  save();
});

// --- Shop --------------------------------------------------------------------------------

for (const [key, btn] of shopButtons) {
  const [kind, id] = key.split(':') as ['press' | 'auto', string];
  btn.addEventListener('click', () => {
    const bought =
      kind === 'press'
        ? buyUpgrade(state, id as PressUpgradeId)
        : buyTapper(state, id as AutoTapperId);
    if (!bought) return;
    SOUND.purchase();
    const name =
      kind === 'press'
        ? pressUpgrade(id as PressUpgradeId).name
        : autoTapper(id as AutoTapperId).name;
    announce(`Bought ${name}.`);
    renderShop();
    renderReadouts();
    renderStats();
    awardAchievements();
    dirty = true;
    // Space is the game's input; a focused button would swallow it.
    btn.blur();
  });
}

function selectShopTab(name: ShopTab): void {
  activeShopTab = name;
  for (const tab of shopTabs) {
    const on = tab.dataset.shopTab === name;
    tab.setAttribute('aria-selected', String(on));
    tab.tabIndex = on ? 0 : -1;
  }
  for (const [key, panel] of shopPanels) panel.hidden = key !== name;
  renderShop(); // marks the opened tab seen, which clears its tag
}

// --- Tabs ---------------------------------------------------------------------------------

function selectTab(name: string): void {
  for (const tab of tabs) {
    const on = tab.dataset.tab === name;
    tab.setAttribute('aria-selected', String(on));
    tab.tabIndex = on ? 0 : -1;
  }
  for (const [key, panel] of panels) panel.hidden = key !== name;
  renderPanels();
}

/** Click to select, arrow keys to move; the selected tab loses focus so Space still presses. */
function wireTabs<T extends string>(
  buttons: HTMLButtonElement[],
  nameOf: (b: HTMLButtonElement) => T,
  select: (name: T) => void
): void {
  buttons.forEach((tab, i) => {
    tab.addEventListener('click', () => {
      select(nameOf(tab));
      tab.blur();
    });
    tab.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      const next =
        buttons[(i + (e.key === 'ArrowRight' ? 1 : buttons.length - 1)) % buttons.length]!;
      select(nameOf(next));
      next.focus();
    });
  });
}

wireTabs(tabs, (b) => b.dataset.tab!, selectTab);
wireTabs(shopTabs, (b) => b.dataset.shopTab as ShopTab, selectShopTab);

// --- Input ----------------------------------------------------------------------------------

document.addEventListener('keydown', (e) => {
  if (anyDialogOpen()) return;
  if (e.code !== 'Space' && e.key !== ' ') return;

  // Space on a focused control activates the control, not the reactor.
  const active = document.activeElement;
  const onControl =
    active instanceof HTMLElement &&
    active !== reactor &&
    ['BUTTON', 'A', 'SUMMARY', 'INPUT', 'TEXTAREA', 'SELECT', 'DETAILS'].includes(active.tagName);
  if (onControl) return;

  e.preventDefault(); // never scroll the page
  if (e.repeat) return; // a held key is one press (spec §2)
  press(e);
});

// Clicks and taps count too, so the game works by mouse and on phones (spec §2).
reactor.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  e.preventDefault();
  press(e);
});

// Enter on the focused reactor, for keyboards without a usable spacebar.
reactor.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.repeat) press(e);
});

soundToggle.addEventListener('click', () => {
  settings.sound = !settings.sound;
  saveSettings();
  updateSoundIcon();
  beeper.unlock();
  soundToggle.blur();
});

// --- Lifecycle ---------------------------------------------------------------------------------

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    save();
  } else {
    lastFrame = performance.now();
    settleAbsence();
    renderAll();
  }
});
window.addEventListener('pagehide', save);
window.setInterval(() => {
  if (dirty || state.totalPresses > 0) save();
  dirty = false;
}, SAVE_INTERVAL_MS);

// --- Boot ---------------------------------------------------------------------------------------

hintEl.textContent = isTouchInput
  ? 'Tap the reactor to generate energy. Keep a steady beat to build a combo.'
  : 'Press the spacebar to generate energy. Keep a steady beat to build a combo.';
if (isTouchInput) reactor.classList.add('touch-key');

// The markup ships as Dormant; the saved stage should apply on first paint
// rather than fade up from green. Transitions return two frames later.
reactor.classList.add('is-booting');
updateSoundIcon();
updateReveals(state);
renderReactor();
settleAbsence();
selectTab('stats');
selectShopTab('press');
renderAll();
requestAnimationFrame(() => requestAnimationFrame(() => reactor.classList.remove('is-booting')));
requestAnimationFrame(frame);
