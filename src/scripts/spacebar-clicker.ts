/**
 * Spacebar Clicker — the browser side.
 *
 * A game, not a tool: there are no scored runs, so none of the telemetry rig
 * (createRig, ProgressWidgets) applies. This file owns the DOM, the input, the
 * frame loop, the surge scheduler, the perks in play, saving, and sound. Every
 * rule it enforces comes from the pure modules in src/games/spacebar-clicker,
 * which carry the unit tests.
 *
 * Reuse from the engine is deliberate and narrow: the guarded localStorage
 * adapter and the Web Audio beeper. The save lives under its own namespaced
 * key and never touches another tool's data.
 */

import { browserAdapter, KEY_PREFIX } from '../engine/storage';
import { createBeeper } from '../engine/sound';
import { checkAchievements } from '../games/spacebar-clicker/achievements';
import { ComboTracker, type PressResult } from '../games/spacebar-clicker/combo';
import {
  ACHIEVEMENTS,
  AUTO_TAPPERS,
  COMBO,
  ISOTOPE_TRACK,
  MIN_PRESS_GAP_MS,
  OFFLINE,
  PERK_FAMILY_NAMES,
  PERK_RARITY_NAMES,
  PERKS,
  PRESS_UPGRADES,
  PRESTIGE_UNLOCK,
  REACTOR_STATES,
  SAVE_INTERVAL_MS,
  TRACK_EFFECT,
  type AutoTapperId,
  type PerkDef,
  type PerkFamily,
  type PerkId,
  type PerkRarity,
  type PressUpgradeId,
  type RungId,
  type ShopTab,
  type TrackStep,
} from '../games/spacebar-clicker/config';
import {
  autoTapper,
  buyTapper,
  buyUpgrade,
  canBuyTapper,
  canBuyUpgrade,
  comboTier,
  earn,
  energyPerPress,
  energyPerSecond,
  isotopeProgress,
  luckyMultiplier,
  markShopTabSeen,
  nextComboTier,
  nextIsotopeAt,
  offerOn,
  offlineAward,
  perk,
  pressUpgrade,
  prestigeGain,
  prestigeUnlocked,
  reactorIndex,
  reactorProgress,
  shopTabHasNews,
  tapperCost,
  updateReveals,
  upgradeCost,
  upgradeSwitchedOff,
  type PlayContext,
} from '../games/spacebar-clicker/economy';
import {
  formatDuration,
  formatEnergy,
  formatMultiplier,
  formatRate,
} from '../games/spacebar-clicker/format';
import { IncomeMeter } from '../games/spacebar-clicker/income';
import { modsOf } from '../games/spacebar-clicker/mods';
import {
  buyPerk,
  deferPerks,
  formatPerkValue,
  keystoneSwap,
  needsSlot,
  offerCredits,
  offerRemaining,
  perkDetail,
  perkLevel,
  perkTick,
  replicate,
  rerollOffer,
  rerollsLeft,
  surgeDrop,
  swapChoices,
  type OfferCredit,
} from '../games/spacebar-clicker/perks';
import {
  defaultSave,
  keepable,
  parseSave,
  prestigeReset,
  serializeSave,
  type PerkOffer,
  type SaveState,
} from '../games/spacebar-clicker/save';
import {
  activeRungs,
  hasRung,
  isFork,
  isotopeRate,
  isPickFor,
  nextSteps,
  rung,
  stepsReached,
  unpickedForks,
  type ForkPicks,
} from '../games/spacebar-clicker/track';

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
const comboMeter = el('sc-combo-meter');
const comboEl = el('sc-combo');
const comboTierEl = el('sc-combo-tier');
const comboNextEl = el('sc-combo-next');
const comboMultEl = el('sc-combo-mult');
const comboFill = el('sc-combo-fill');
const floats = el('sc-floats');
const announceEl = el('sc-announce');

const stateLabelEl = el('sc-state-label');
const surgeLabel = el('sc-surge-label');
const coreNum = el('sc-core-num');
const coreUnit = el('sc-core-unit');
const sparksEl = el('sc-sparks');
const scopeEl = document.getElementById('sc-scope') as HTMLCanvasElement | null;
const keycapEl = el('sc-keycap');
const bezelEl = document.getElementById('sc-bezel') as SVGSVGElement | null;
// The isotope shelf over the face's top-left corner: the beads held, then a
// ring for the next reset once one is open, and a tooltip of its own.
const shelfEl = el('sc-shelf');
const isotopesHeld = el<HTMLButtonElement>('sc-isotopes-held');
const pelletsEl = el('sc-pellets');
const shelfMoreEl = el('sc-shelf-more');
const isotopeNext = el<HTMLButtonElement>('sc-isotope-next');
const isotopeRing = document.getElementById('sc-isotope-ring') as SVGCircleElement | null;
const isotopeNextCount = el('sc-isotope-next-count');
const isotopeTip = el('sc-isotope-tip');
const isotopeTipName = el('sc-isotope-tip-name');
const isotopeTipKind = el('sc-isotope-tip-kind');
const isotopeTipDetail = el('sc-isotope-tip-detail');
const isotopeTipUnlock = el('sc-isotope-tip-unlock');
const reactorWrap = el('sc-reactor-wrap');
const gameSection = el('game-section');

// The perk shelf over the face's top-right corner: a socket per slot, five or
// six, a chip and level pips in each, and one shared tooltip.
const perkShelf = el('sc-perk-shelf');
const perkSlotList = el('sc-perk-slots');
const perkSlots = Array.from(perkSlotList.querySelectorAll<HTMLElement>('.perk-slot')).map(
  (li) => ({
    li,
    chip: li.querySelector<HTMLButtonElement>('.perk-chip')!,
    glyph: li.querySelector<HTMLElement>('.perk-chip-glyph')!,
    pips: li.querySelector<HTMLElement>('.perk-pips')!,
    /** The perk whose glyph the chip holds. */
    shown: '',
  })
);
const perkTip = el('sc-perk-tip');
const perkTipName = el('sc-perk-tip-name');
const perkTipLevel = el('sc-perk-tip-level');
const perkTipKind = el('sc-perk-tip-kind');
const perkTipDetail = el('sc-perk-tip-detail');

const perksSlotsEl = el('sc-perks-slots');
const perksEmptyEl = el('sc-perks-empty');
const perksRunEl = el('sc-perks-run');
const codexCountEl = el('sc-codex-count');
const codexEl = el('sc-codex');
const codexRows: Record<ShopTab, HTMLElement> = {
  press: el('sc-codex-press'),
  auto: el('sc-codex-auto'),
};
const surgeSummary = el('sc-surge-summary');
const surgePresses = el('sc-surge-presses');
const surgeRate = el('sc-surge-rate');
const surgeEarned = el('sc-surge-earned');
const surgeBest = el('sc-surge-best');
const surgeDropEl = el('sc-surge-drop');
const surgeDropKind = el('sc-surge-drop-kind');
const surgeDropName = el('sc-surge-drop-name');
const surgeCredit = el('sc-surge-credit');
const unlockCard = el('sc-unlock-card');
const unlockList = el('sc-unlock-list');

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
const SHOP_TABS: readonly ShopTab[] = ['press', 'auto'];
let activeShopTab: ShopTab = 'press';

/** The perk offer row at the top of a shop tab, and the parts the script fills. */
interface OfferRow {
  li: HTMLElement;
  btn: HTMLButtonElement;
  tile: HTMLElement;
  ring: SVGPathElement;
  glyph: HTMLElement;
  name: HTMLElement;
  level: HTMLElement;
  detail: HTMLElement;
  note: HTMLElement;
  /** What the isotope track did for the offer, when it did something. */
  credit: HTMLElement;
  window: HTMLElement;
  cost: HTMLElement;
  rarity: HTMLElement;
  /** The Reroll rung's button under the row, shown while the run has a reroll. */
  reroll: HTMLButtonElement;
  /** The offer the row shows, as "id:level:held"; empty when none. */
  shown: string;
  /** The fold-away while the row leaves, bought or run out. */
  leaving: Animation | null;
}

function offerRow(tab: ShopTab): OfferRow {
  const li = el(`sc-offer-${tab}`);
  const part = <T extends Element = HTMLElement>(selector: string) =>
    li.querySelector<T>(selector)!;
  return {
    li,
    btn: part<HTMLButtonElement>('.perk-buy'),
    tile: part('.perk-tile'),
    ring: part<SVGPathElement>('.perk-ring-fill'),
    glyph: part('[data-perk-glyph]'),
    name: part('[data-perk-name]'),
    level: part('[data-perk-level]'),
    detail: part('[data-perk-detail]'),
    note: part('[data-perk-note]'),
    credit: part('[data-perk-credit]'),
    window: part('[data-perk-window]'),
    cost: part('[data-perk-cost]'),
    rarity: part('[data-perk-rarity]'),
    reroll: part<HTMLButtonElement>('[data-perk-reroll]'),
    shown: '',
    leaving: null,
  };
}

const offerRows: Record<ShopTab, OfferRow> = { press: offerRow('press'), auto: offerRow('auto') };
/** Every perk's glyph (PerkIcon.astro), for cloning. */
const perkGlyphs = el<HTMLTemplateElement>('sc-perk-glyphs');

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
const prestigeTab = el('sc-tab-prestige');
const prestigeTiles = el('sc-reset-tiles');
const prestigeHeld = el('sc-prestige-held');
const prestigeBonus = el('sc-prestige-bonus');
const prestigePays = el('sc-prestige-pays');
const prestigeGainValue = el('sc-prestige-gain');
const prestigeAfter = el('sc-prestige-after');
const prestigeNext = el('sc-prestige-next');
const isotopeMeter = el('sc-isotope-meter');
const prestigeProgress = el('sc-prestige-progress');
const prestigeAction = el('sc-reset-action');
const prestigeUnlocks = el('sc-reset-unlocks');
const prestigeBtn = el<HTMLButtonElement>('sc-prestige-btn');
const trackCount = el('sc-track-count');
const trackNextGroup = el('sc-track-next-group');
const trackNext = el('sc-track-next');
const trackHeldGroup = el('sc-track-held-group');
const trackHeld = el('sc-track-held');
/** The track's sockets in the Isotopes tab, a fork's two halves in each of those. */
const trackSockets = Array.from(document.querySelectorAll<HTMLElement>('.track-socket')).map(
  (li) => ({
    li,
    isotopes: Number(li.dataset.isotopes),
    halves: Array.from(li.querySelectorAll<HTMLElement>('.track-half')),
  })
);

const prestigeModal = el('sc-prestige-modal');
const prestigeModalMessage = el('sc-prestige-modal-message');
const prestigeCancel = el('sc-prestige-cancel');
const prestigeConfirm = el('sc-prestige-confirm');
const resetChoices = el('sc-reset-choices');
const resetPickHint = el('sc-reset-pick-hint');

const awayModal = el('sc-away-modal');
const awayTime = el('sc-away-time');
const awayRate = el('sc-away-rate');
const awayEnergy = el('sc-away-energy');
const awayOffers = el('sc-away-offers');
const awayCredit = el('sc-away-credit');
const awayCollect = el('sc-away-collect');

const swapModal = el('sc-swap-modal');
const swapTitle = el('sc-swap-title');
const swapIncoming = el('sc-swap-incoming');
const swapMessage = el('sc-swap-message');
const swapList = el('sc-swap-list');
const swapCancel = el('sc-swap-cancel');
const swapConfirm = el<HTMLButtonElement>('sc-swap-confirm');

const resetModal = el('reset-modal');
const resetBtn = el('reset-btn');
const resetCancel = el('modal-cancel-btn');
const resetConfirm = el('modal-confirm-btn');

const soundToggle = el('sound-toggle');
const soundOnIcon = el('sound-icon-on');
const soundOffIcon = el('sound-icon-off');

const isTouchInput = window.matchMedia('(pointer: coarse)').matches;
const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const reducedMotion = () => motionQuery.matches;

// --- Sound ---------------------------------------------------------------------
// Noteworthy moments only (maintainer decision): never a beep per press.

const beeper = createBeeper({ enabled: () => settings.sound, gain: 0.18 });

function chord(freqs: number[], gapMs = 90): void {
  freqs.forEach((f, i) => window.setTimeout(() => beeper.play(f), i * gapMs));
}

/** A perk drop rings by its rarity, so a high tier is heard as an event. */
const DROP_CHIMES: Record<PerkRarity, [number[], number]> = {
  common: [[1046, 1318], 80],
  rare: [[880, 1175, 1568], 85],
  keystone: [[659, 880, 1175, 1568, 2093], 105],
};

const SOUND = {
  purchase: () => beeper.play(880),
  tierUp: () => chord([659, 988]),
  warningTick: () => beeper.play(523),
  surgeStart: () => chord([784, 1046], 70),
  surgeEnd: () => chord([784, 523], 120),
  reactorUp: () => chord([659, 880, 1046]),
  achievement: () => chord([784, 1175]),
  prestige: () => chord([523, 659, 784, 1046], 110),
  collect: () => chord([523, 659, 784], 80),
  perkDrop: (rarity: PerkRarity) => chord(...DROP_CHIMES[rarity]),
  perkBuy: () => chord([880, 1318], 60),
};

function updateSoundIcon(): void {
  soundOnIcon.hidden = !settings.sound;
  soundOffIcon.hidden = settings.sound;
  soundToggle.classList.toggle('muted', !settings.sound);
  soundToggle.setAttribute('aria-pressed', String(settings.sound));
}

// --- Announcements -------------------------------------------------------------

/** Messages for the announcer from one moment. */
let announcing: string[] = [];

/**
 * Tell a screen reader. Messages from the same moment are read as one, so a
 * reset's unlocks aren't replaced by the achievement the reset earns.
 */
function announce(text: string): void {
  announcing.push(text);
  if (announcing.length > 1) return;
  queueMicrotask(() => {
    announceEl.textContent = announcing.join(' ');
    announcing = [];
  });
}

const toastQueue: { text: string; family?: PerkFamily }[] = [];
let toastTimer = 0;

/** A short notice on the reactor face. A perk's notice wears its family's hue. */
function toast(text: string, family?: PerkFamily): void {
  toastQueue.push({ text, family });
  if (!toastTimer) showNextToast();
}

function showNextToast(): void {
  const next = toastQueue.shift();
  if (next === undefined) {
    toastTimer = 0;
    toastEl.hidden = true;
    return;
  }
  toastText.textContent = next.text;
  if (next.family) toastEl.dataset.family = next.family;
  else delete toastEl.dataset.family;
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

/** Set text only when it changes, for nodes rewritten every frame. */
function setText(node: HTMLElement, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

// --- Run state ------------------------------------------------------------------

// The tracker reads the run's rules on every press, so a perk applies at once.
const combo = new ComboTracker(
  () => modsOf(state).stabiliser,
  () => modsOf(state).combo
);
/** Energy per second actually being earned; perk prices are set in it. */
const income = new IncomeMeter();
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
  /** This surge's timings, fixed as it starts so a perk bought mid-surge cannot skew its clock. */
  warningS: 0,
  durationS: 0,
  /** Capacitor's extra seconds at the end of this surge, and what they brought in. */
  bonusS: 0,
  bonusPresses: 0,
  bonusEarned: 0,
};
/** Seconds of active play: page visible and a press within the last minute. */
let activeS = 0;
/** performance.now() until which presses keep Afterglow's multiplier. */
let afterglowUntil = 0;
/** Active seconds toward Self-Replicator's next copy. Not saved: a reload starts the count over. */
let replicateClock = 0;

function scheduleSurge(): void {
  const { minGapS, maxGapS } = modsOf(state).surge;
  surge.dueAt = activeS + minGapS + Math.random() * (maxGapS - minGapS);
}

/** What is happening in play right now, for the economy's formulas. */
function playContext(now = performance.now()): PlayContext {
  return {
    combo: combo.combo,
    surging: surge.phase === 'active',
    afterglow: now < afterglowUntil,
    idleS: (now - lastPressAt) / 1000,
  };
}

/**
 * The passing boosts on a press: a surge, and Afterglow after one. The income
 * meter takes them back out, so a perk dropping during or just after a surge
 * is priced at the player's own pace, not ten times it.
 */
function pressBoost(play: PlayContext, mods = modsOf(state)): number {
  return (play.surging ? mods.surge.multiplier : 1) * (play.afterglow ? mods.afterglowMult : 1);
}
scheduleSurge();

// --- Rendering ------------------------------------------------------------------

/** How long collected away-energy takes to count into the readout. */
const ROLL_MS = 900;
/** Away-energy still counting in: the readout trails the real balance by it. */
let energyRoll: { amount: number; start: number } | null = null;

function renderReadouts(): void {
  let shown = state.energy;
  if (energyRoll) {
    const p = (performance.now() - energyRoll.start) / ROLL_MS;
    if (p >= 1) energyRoll = null;
    else shown -= energyRoll.amount * Math.pow(1 - p, 3);
  }
  energyEl.textContent = formatEnergy(shown);
  const play = playContext();
  epsEl.textContent = formatRate(energyPerSecond(state, play));
  eppEl.textContent = formatEnergy(energyPerPress(state, play));
}

function renderReactor(): void {
  const def = REACTOR_STATES[reactorIdx]!;
  reactor.dataset.state = def.id;
  coreEl.dataset.state = def.id;
  stateEl.textContent = def.name;
  for (const led of dialLeds) led.node.classList.toggle('is-lit', led.index <= reactorIdx);
}

/**
 * The arc around the core fills toward the next reactor state. While a surge
 * counts down or runs, it becomes that phase's clock and drains instead.
 */
function renderArc(now = performance.now()): void {
  if (!arcEl) return;
  let fraction: number;
  if (surge.phase === 'warning') {
    fraction = (surge.phaseEndsAt - now) / (surge.warningS * 1000);
  } else if (surge.phase === 'active') {
    fraction = (surge.phaseEndsAt - now) / (surge.durationS * 1000);
  } else {
    fraction = now < arcHoldUntil ? 1 : reactorProgress(state.runLifetime);
  }
  fraction = Math.min(1, Math.max(0, fraction));
  arcEl.style.strokeDashoffset = String(ARC_LENGTH * (1 - fraction));
}

/** Ease the dial back to the run's progress (after a stage change or a surge). */
function sweepArcBack(): void {
  if (!arcEl) return;
  clearArcTimers();
  arcEl.classList.add('is-sweeping');
  renderArc();
  arcTimers.push(window.setTimeout(() => arcEl.classList.remove('is-sweeping'), ARC_SWEEP_MS));
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

  // During a surge the dial is the surge clock; it sweeps back when that ends.
  if (!arcEl || surge.phase === 'warning' || surge.phase === 'active') return;
  clearArcTimers();
  arcHoldUntil = performance.now() + ARC_HOLD_MS;
  arcEl.classList.add('is-complete');
  renderArc();
  arcTimers.push(
    window.setTimeout(() => {
      arcEl.classList.remove('is-complete');
      sweepArcBack();
    }, ARC_HOLD_MS)
  );
}

function renderCombo(now: number): void {
  const { tiers, comboOff } = modsOf(state);
  // Brute Force: the beat still draws on the scope, but the combo stands down.
  comboMeter.classList.toggle('is-off', comboOff);
  if (comboOff) {
    setText(comboEl, '0');
    setText(comboTierEl, 'combo');
    comboTierEl.classList.remove('is-tiered');
    setText(comboNextEl, `off with ${perk('brute-force').name}`);
    setText(comboMultEl, 'x1');
    comboFill.style.transform = 'scaleX(0)';
    return;
  }
  const tier = comboTier(combo.combo, tiers);
  const next = nextComboTier(combo.combo, tiers);
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
    // A held perk can leave a one-off upgrade doing nothing; the row says so.
    const off = upgradeSwitchedOff(state, def.id);
    btn.querySelector('[data-cost]')!.textContent = maxed
      ? 'Max'
      : formatEnergy(upgradeCost(state, def.id));
    btn.querySelector('[data-level]')!.textContent =
      def.max === 1 ? (off ? 'Off' : owned ? 'Owned' : '') : `${owned}/${def.max}`;
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

  for (const tab of SHOP_TABS) renderOffer(tab);
  renderShopNotices();
}

/**
 * The open tab is always being looked at, so everything on it is marked seen
 * first; then each closed tab shows its tag if it has gained anything since.
 */
function renderShopNotices(): void {
  if (markShopTabSeen(state, activeShopTab)) dirty = true;
  for (const tab of SHOP_TABS) {
    newTagEls[tab].hidden = tab === activeShopTab || !shopTabHasNews(state, tab);
  }
}

// --- Perks in the shop ------------------------------------------------------------
// A drop puts a perk on offer at the top of its tab for a window of the run's
// energy (SPACEBAR-CLICKER.md §8.1). The rules live in perks.ts; this draws
// the offer, its draining ring and its notes, and folds it away when it is
// bought or runs out.

const ROMAN = ['', 'I', 'II', 'III'];

/** A fresh copy of a perk's glyph. */
function perkGlyph(id: PerkId): Node {
  return perkGlyphs.content.querySelector(`[data-glyph="${id}"]`)!.cloneNode(true);
}

/** A perk's name with its level, past the first: "Overtone II". */
function perkTitle(id: PerkId, level: number): string {
  return level > 1 ? `${perk(id).name} ${ROMAN[level]}` : perk(id).name;
}

/**
 * What a drop is called: "Perk drop", "Rare drop", "Keystone drop", "Upgrade
 * drop". A perk not held is never an upgrade, even at level II (Prodigy).
 */
function dropKind(offer: PerkOffer): string {
  if (perkLevel(state, offer.id) > 0) return 'Upgrade drop';
  const { rarity } = perk(offer.id);
  return rarity === 'common' ? 'Perk drop' : `${PERK_RARITY_NAMES[rarity]} drop`;
}

/** The level badge after a name: "II" on screen, "level 2" to a screen reader. */
function setLevelBadge(badge: HTMLElement, level: number): void {
  badge.hidden = level < 2;
  if (level < 2) return;
  const shown = document.createElement('span');
  shown.setAttribute('aria-hidden', 'true');
  shown.textContent = ROMAN[level]!;
  const spoken = document.createElement('span');
  spoken.className = 'visually-hidden';
  spoken.textContent = `level ${level}`;
  badge.replaceChildren(shown, spoken);
}

/**
 * A perk's effect at a level, with its number in the perk's hue. Given the
 * level held, an upgrade: the number now struck out beside the one it becomes.
 */
function perkEffect(def: PerkDef, level: number, held = 0): Node[] {
  const [before = '', after = ''] = def.detail.split('{v}');
  const number = (lvl: number, className: string, spoken: string) => {
    const node = document.createElement(className === 'perk-was' ? 's' : 'span');
    node.className = className;
    if (spoken) {
      const hidden = document.createElement('span');
      hidden.className = 'visually-hidden';
      hidden.textContent = spoken;
      node.append(hidden);
    }
    node.append(formatPerkValue(def.unit, def.values[lvl - 1]!));
    return node;
  };
  const value =
    held > 0
      ? [number(held, 'perk-was', 'now '), ' ', number(level, 'perk-value', ', then ')]
      : [number(level, 'perk-value', '')];
  const nodes: Node[] = [document.createTextNode(before)];
  for (const part of value)
    nodes.push(typeof part === 'string' ? document.createTextNode(part) : part);
  nodes.push(document.createTextNode(after));
  return nodes;
}

const TAB_NAME: Record<ShopTab, string> = { press: 'Upgrades', auto: 'Auto-tappers' };

/** "Rare · Rhythm": rarity and family in words, so the hue never stands alone. */
function perkKind(def: PerkDef): string {
  return `${PERK_RARITY_NAMES[def.rarity]} · ${PERK_FAMILY_NAMES[def.family]}`;
}

/** A held perk in full, for its shelf chip's accessible name. */
function perkLabel(id: PerkId, level: number): string {
  const def = perk(id);
  const kind = `${def.rarity} ${PERK_FAMILY_NAMES[def.family].toLowerCase()} perk`;
  return `${def.name}, level ${level}, ${kind}. ${perkDetail(def, level)}`;
}

/**
 * Every level's number, the best one held lit in the perk's hue and the
 * rest muted: "for x3.5 / x3.75 / x4". For the codex.
 */
function perkEffectAllLevels(def: PerkDef, best: number): Node[] {
  const [before = '', after = ''] = def.detail.split('{v}');
  const nodes: Node[] = [document.createTextNode(before)];
  def.values.forEach((v, i) => {
    if (i > 0) nodes.push(document.createTextNode(' / '));
    const value = document.createElement('span');
    value.className = i + 1 === best ? 'perk-value' : 'perk-level-value';
    value.textContent = formatPerkValue(def.unit, v);
    nodes.push(value);
  });
  nodes.push(document.createTextNode(after));
  return nodes;
}

/** One line of a perk card's text. */
function cardLine(className: string, content: string | Node[]): HTMLElement {
  const line = document.createElement('span');
  line.className = className;
  if (typeof content === 'string') line.textContent = content;
  else line.append(...content);
  return line;
}

/**
 * A perk as a card: its tile, its name with a level badge, then the lines
 * given. The swap dialog, this run's perks and the codex all use it; the
 * dialog's are buttons when the player is picking one to drop.
 */
function perkCard(id: PerkId, level: number, lines: HTMLElement[], asButton = false): HTMLElement {
  const def = perk(id);
  const card = document.createElement(asButton ? 'button' : 'div');
  card.className = 'perk-card';
  card.dataset.family = def.family;
  card.dataset.rarity = def.rarity;
  if (card instanceof HTMLButtonElement) card.type = 'button';

  const tile = document.createElement('span');
  tile.className = 'perk-tile';
  tile.append(perkGlyph(id));
  const text = document.createElement('span');
  text.className = 'perk-card-text';
  const name = document.createElement('span');
  name.className = 'perk-card-name';
  const badge = document.createElement('span');
  badge.className = 'perk-level';
  setLevelBadge(badge, level);
  name.append(def.name, ' ', badge);
  text.append(name, ...lines);
  card.append(tile, text);
  return card;
}

/** A perk card for the swap dialog: name, level and effect. */
function swapCard(id: PerkId, level: number, asButton = false): HTMLElement {
  return perkCard(id, level, [cardLine('perk-card-detail', perkEffect(perk(id), level))], asButton);
}

/** Bring a tab's offer row up to date: what is on offer, its price, its ring, its notes. */
function renderOffer(tab: ShopTab): void {
  const row = offerRows[tab];
  const offer = offerOn(state, tab);
  if (!offer) {
    if (!row.leaving) row.li.hidden = true;
    row.shown = '';
    return;
  }
  if (row.leaving) {
    row.leaving.cancel();
    row.leaving = null;
    row.li.classList.remove('is-leaving');
  }

  const def = perk(offer.id);
  // An upgrade strikes out the level held; a perk not held shows its level
  // alone, which with Prodigy is level II.
  const held = perkLevel(state, offer.id);
  const key = `${offer.id}:${offer.level}:${held}`;
  if (row.shown !== key) {
    row.shown = key;
    row.li.dataset.family = def.family;
    row.li.dataset.rarity = def.rarity;
    row.li.classList.toggle('is-upgrade', held > 0);
    row.glyph.replaceChildren(perkGlyph(def.id));
    row.name.textContent = def.name;
    setLevelBadge(row.level, offer.level);
    row.detail.replaceChildren(...perkEffect(def, offer.level, held));
    row.rarity.textContent = held > 0 ? 'Upgrade' : PERK_RARITY_NAMES[def.rarity];
  }

  const affordable = state.energy >= offer.price;
  row.btn.classList.toggle('is-affordable', affordable);
  row.btn.setAttribute('aria-disabled', String(!affordable));
  setText(row.cost, formatEnergy(offer.price));

  const left = offerRemaining(state, offer);
  row.ring.style.strokeDashoffset = String(100 * (1 - left));
  row.li.classList.toggle('is-fading', left < 0.2);
  setText(row.window, `, ${Math.ceil(left * 10) * 10}% of its window left`);

  // What buying it would cost besides energy.
  const out = keystoneSwap(state, tab);
  const choices = swapChoices(state, tab);
  const note = out
    ? `Swaps out your keystone, ${perkTitle(out, perkLevel(state, out))}`
    : choices.length === 0
      ? ''
      : keystonesOnly(choices)
        ? "Both keystone slots are full: you'll pick one to drop"
        : `All ${modsOf(state).perkSlots} slots are full: you'll pick one to drop`;
  row.note.hidden = !note;
  setText(row.note, note);
  // What the isotope track did for it, a line each.
  const credits = offerCredits(state, offer).map((c) => creditWords(c, offer));
  const creditKey = credits.join('|');
  row.credit.hidden = credits.length === 0;
  if (row.credit.dataset.shown !== creditKey) {
    row.credit.dataset.shown = creditKey;
    // A screen reader hears the lines as sentences: "… price. Lucky Find: …".
    row.credit.replaceChildren(
      ...credits.flatMap((words, i) => {
        const line = cardLine('credit', words);
        if (i === 0) return [line];
        const pause = cardLine('visually-hidden', '. ');
        return [pause, line];
      })
    );
  }
  row.reroll.hidden = rerollsLeft(state) === 0;
  row.li.hidden = false;
}

/** A rung's credit on an offer: "Familiar: 25% off". */
function creditWords(credit: OfferCredit, offer: PerkOffer): string {
  const name = rung(credit).name;
  switch (credit) {
    case 'prodigy':
      return `${name}: level ${ROMAN[offer.level]} for the level I price`;
    case 'lucky-find':
    case 'rich-find':
      return perk(offer.id).rarity === 'keystone'
        ? `${name}: a keystone, not a rare`
        : `${name}: a rare, not a common`;
    case 'patience':
      return `${name}: still on offer`;
    case 'familiar':
      return `${name}: ${Math.round(modsOf(state).familiarDiscount * 100)}% off`;
  }
}

/** True when the perks to pick from are keystones: Twin Keystones' two, both held. */
function keystonesOnly(ids: readonly PerkId[]): boolean {
  return ids.every((id) => perk(id).rarity === 'keystone');
}

/** A drop lands in its row: the row slides in and the tile pops (CSS, by rarity). */
function arriveOffer(tab: ShopTab): void {
  renderOffer(tab);
  replay(offerRows[tab].li, 'is-arriving');
}

/**
 * Fold an offer row away, once it is bought (the tile flares first) or has
 * run out. On a closed tab, or under reduced motion, it simply goes.
 */
function leaveOffer(tab: ShopTab, bought: boolean): void {
  const row = offerRows[tab];
  row.shown = '';
  row.leaving?.cancel();
  row.leaving = null;
  if (row.li.hidden || !row.li.offsetParent || reducedMotion()) {
    row.li.hidden = true;
    return;
  }
  if (bought) replay(row.tile, 'is-claimed');
  row.li.classList.add('is-leaving');
  const leaving = row.li.animate(
    [
      { opacity: 1, height: `${row.li.offsetHeight}px` },
      { opacity: 0, height: '0px' },
    ],
    {
      duration: bought ? 380 : 520,
      delay: bought ? 280 : 0,
      easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
      fill: 'both',
    }
  );
  row.leaving = leaving;
  leaving.onfinish = () => {
    row.li.hidden = true;
    row.li.classList.remove('is-leaving');
    leaving.cancel();
    row.leaving = null;
  };
}

// --- The perk shelf and the Perks panel ---------------------------------------------
// This run's perks over the face's top-right corner, each with its level in
// pips and a tooltip on hover, keyboard focus or a tap. The tooltip is visual;
// each chip's accessible name carries the same words. The Perks panel lists
// them in full, then the codex of every perk ever found.

/** The perks the shelf shows, as "id:level,...". */
let shelfShown: string | null = null;

function renderPerkShelf(): void {
  perkShelf.classList.remove('is-clearing');
  const owned = state.perks.owned;
  // Five sockets, or six with the Sixth Slot rung.
  const slots = modsOf(state).perkSlots;
  const key = `${slots}|${owned.map((o) => `${o.id}:${o.level}`).join(',')}`;
  if (key === shelfShown) return;
  shelfShown = key;

  perkShelf.hidden = owned.length === 0;
  perkSlotList.setAttribute('aria-label', `Perks this run, ${owned.length} of ${slots} slots`);
  perkSlots.forEach((slot, i) => {
    slot.li.hidden = i >= slots;
    const held = owned[i];
    slot.chip.hidden = !held;
    slot.li.toggleAttribute('data-empty', !held);
    if (!held) {
      // An empty socket is decoration; the list's label counts the slots.
      slot.li.setAttribute('aria-hidden', 'true');
      delete slot.li.dataset.family;
      delete slot.li.dataset.rarity;
      slot.shown = '';
      return;
    }
    const def = perk(held.id);
    slot.li.removeAttribute('aria-hidden');
    slot.li.dataset.family = def.family;
    slot.li.dataset.rarity = def.rarity;
    slot.pips.dataset.level = String(held.level);
    slot.chip.setAttribute('aria-label', perkLabel(held.id, held.level));
    if (slot.shown !== held.id) {
      slot.glyph.replaceChildren(perkGlyph(held.id));
      slot.shown = held.id;
    }
  });
  fitShelves();
  renderTip();
}

// A shelf's tooltip: a perk chip's, by its slot, or the isotope shelf's beads
// or ring. It shows for whatever is under a mouse, else what has keyboard
// focus, else what was last tapped. Escape dismisses it until the next hover,
// focus or tap.
type TipTarget = number | 'held' | 'next';
let tipHover: TipTarget | null = null;
let tipFocus: TipTarget | null = null;
let tipPinned: TipTarget | null = null;
let tipDismissed = false;
let perkTipShown = '';
let isotopeTipShown = '';
let lastPointer = 'mouse';

function renderTip(): void {
  const target = tipDismissed ? null : (tipHover ?? tipFocus ?? tipPinned);
  renderPerkTip(typeof target === 'number' ? target : null);
  renderIsotopeTip(typeof target === 'string' ? target : null);
}

function renderPerkTip(slot: number | null): void {
  const held = slot === null ? undefined : state.perks.owned[slot];
  perkTip.hidden = !held;
  if (!held || slot === null) {
    perkTipShown = '';
    return;
  }
  const key = `${slot}:${held.id}:${held.level}`;
  if (key === perkTipShown) return;
  perkTipShown = key;

  const def = perk(held.id);
  perkTip.dataset.family = def.family;
  perkTipName.textContent = def.name;
  setLevelBadge(perkTipLevel, held.level);
  perkTipKind.textContent = perkKind(def);
  perkTipDetail.replaceChildren(...perkEffect(def, held.level));
  // The caret points at the chip.
  const chip = perkSlots[slot]!.li.getBoundingClientRect();
  const shelf = perkShelf.getBoundingClientRect();
  perkTip.style.setProperty('--caret-right', `${shelf.right - (chip.left + chip.width / 2)}px`);
}

/** The isotopes held, or the next reset: what it pays now and where the next one comes. */
function renderIsotopeTip(target: 'held' | 'next' | null): void {
  const held = state.isotopes;
  const gain = prestigeGain(state.runLifetime);
  const shown = target === 'held' ? held > 0 : target === 'next' && gain > 0;
  isotopeTip.hidden = !shown;
  if (!shown) {
    isotopeTipShown = '';
    return;
  }
  const key = `${target}:${held}:${gain}:${JSON.stringify(state.forks)}`;
  if (key === isotopeTipShown) return;
  isotopeTipShown = key;

  // The track's line: the next unlock, or what this reset unlocks.
  let unlock: Node[] = [];
  if (target === 'held') {
    const rate = Math.round(isotopeRate(held, state.forks) * 100);
    isotopeTipName.textContent = isotopeCount(held);
    isotopeTipKind.textContent = `${bonusText(held)} to all gains`;
    isotopeTipDetail.textContent = `Each one adds ${rate}% to everything you earn, and they last through every reset.`;
    const next = nextSteps(held, 1)[0];
    unlock = next
      ? [text(`Next at ${isotopeCount(next.isotopes)}: `), ...unlockNodes([next]), text('.')]
      : [text('Every rung of the isotope track is unlocked.')];
  } else {
    isotopeTipName.textContent = `Reset now for ${isotopeCount(gain)}`;
    isotopeTipKind.textContent = `${bonusText(held)} now, ${bonusText(held + gain)} after`;
    isotopeTipDetail.textContent = `The next isotope comes at ${formatEnergy(nextIsotopeAt(state.runLifetime))} energy this run. Click to open the Isotopes tab.`;
    const steps = stepsReached(held, held + gain);
    if (steps.length > 0) unlock = [text('Unlocks '), ...unlockNodes(steps), text('.')];
  }
  isotopeTipUnlock.hidden = unlock.length === 0;
  isotopeTipUnlock.replaceChildren(...unlock);
  // The ring's hook is what the reset unlocks, so it leads; the beads' next unlock follows.
  if (target === 'held') isotopeTipDetail.after(isotopeTipUnlock);
  else isotopeTipDetail.before(isotopeTipUnlock);
  // The caret points at the beads or the ring, and stays clear of the corner.
  const anchor = (target === 'held' ? isotopesHeld : isotopeNext).getBoundingClientRect();
  const tip = isotopeTip.getBoundingClientRect();
  const caret = Math.max(12, anchor.left + anchor.width / 2 - tip.left);
  isotopeTip.style.setProperty('--caret-left', `${caret}px`);
}

/** Close a tooltip a tap opened: tapping anywhere else, or pressing. */
function unpinTip(): void {
  if (tipPinned === null) return;
  tipPinned = null;
  renderTip();
}

/**
 * Hover, keyboard focus or a tap shows a shelf button's tooltip. A button
 * with an action (the isotope ring) runs it on any click instead of pinning.
 */
function wireTip(
  button: HTMLButtonElement,
  target: TipTarget,
  action?: (fromKeyboard: boolean) => void
): void {
  button.addEventListener('pointerdown', (e) => {
    lastPointer = e.pointerType;
  });
  button.addEventListener('pointerenter', (e) => {
    if (e.pointerType !== 'mouse') return;
    tipHover = target;
    tipDismissed = false;
    renderTip();
  });
  button.addEventListener('focus', () => {
    if (!button.matches(':focus-visible')) return;
    tipFocus = target;
    tipDismissed = false;
    renderTip();
  });
  button.addEventListener('blur', () => {
    if (tipFocus !== target) return;
    tipFocus = null;
    renderTip();
  });
  button.addEventListener('click', (e) => {
    if (action) {
      action(e.detail === 0);
      return;
    }
    // From the keyboard (no pointer), focus is already showing it.
    if (e.detail === 0) return;
    // Touch has no hover, so a tap pins the tooltip open; a second tap closes it.
    if (lastPointer !== 'mouse') {
      tipPinned = tipPinned === target ? null : target;
      tipDismissed = false;
      renderTip();
    }
    // Space is the game's input; a focused button would swallow it.
    button.blur();
  });
}

perkSlots.forEach((slot, i) => wireTip(slot.chip, i));
wireTip(isotopesHeld, 'held');
wireTip(isotopeNext, 'next', openResetTab);

for (const shelf of [shelfEl, perkShelf]) {
  shelf.addEventListener('pointerleave', (e) => {
    if (e.pointerType !== 'mouse' || tipHover === null) return;
    tipHover = null;
    renderTip();
  });
}

document.addEventListener('pointerdown', (e) => {
  const on = e.target as Node;
  if (!perkShelf.contains(on) && !shelfEl.contains(on)) unpinTip();
});

/**
 * The ring's way in: select the Isotopes tab and bring it into
 * view. From the keyboard, focus follows to the tab; from a pointer it lets
 * go, so Space keeps pressing the reactor.
 */
function openResetTab(fromKeyboard: boolean): void {
  tipHover = null;
  tipPinned = null;
  renderTip();
  selectTab('prestige');
  prestigeTab
    .closest('.panels')
    ?.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
  if (fromKeyboard) prestigeTab.focus();
  else isotopeNext.blur();
}

/** How long a bought perk takes to fly from its offer to its socket. */
const PERK_FLY_MS = 650;

/**
 * A bought perk flies from its offer tile to its socket on the shelf, arcing
 * up, and the chip lands with a pop. An upgrade flies to the chip it raises.
 * Reduced motion: the chip is simply there.
 */
function flyToShelf(from: DOMRect, id: PerkId): void {
  const slot = perkSlots[state.perks.owned.findIndex((o) => o.id === id)];
  if (!slot) return;
  if (reducedMotion() || from.width === 0) return;

  const to = slot.chip.getBoundingClientRect();
  const flyer = document.createElement('span');
  flyer.className = 'perk-tile perk-flyer';
  flyer.dataset.family = perk(id).family;
  flyer.append(perkGlyph(id));
  gameSection.append(flyer);
  slot.li.classList.add('is-pending');

  const peakY = Math.min(from.top, to.top) - 36;
  const midX = (from.left + to.left) / 2;
  const flight = flyer.animate(
    [
      { transform: `translate(${from.left}px, ${from.top}px) scale(1)` },
      { transform: `translate(${midX}px, ${peakY}px) scale(1.1)`, offset: 0.45 },
      { transform: `translate(${to.left}px, ${to.top}px) scale(${to.width / from.width})` },
    ],
    { duration: PERK_FLY_MS, easing: 'cubic-bezier(0.5, 0, 0.2, 1)' }
  );
  const land = () => {
    flyer.remove();
    slot.li.classList.remove('is-pending');
    replay(slot.chip, 'is-landed');
  };
  flight.onfinish = land;
  flight.oncancel = land;
}

/** What the Perks panel shows, as JSON of the perks held and the codex. */
let perksPanelShown = '';

/** The Perks panel: this run's perks in full, then the codex. */
function renderPerksPanel(): void {
  const { owned, codex } = state.perks;
  const slots = modsOf(state).perkSlots;
  const key = JSON.stringify([slots, owned, codex]);
  if (key === perksPanelShown) return;
  perksPanelShown = key;

  perksSlotsEl.textContent = `${owned.length} of ${slots}`;
  perksEmptyEl.hidden = owned.length > 0;
  perksRunEl.replaceChildren(
    ...owned.map((o) => {
      const def = perk(o.id);
      const item = document.createElement('li');
      item.append(
        perkCard(o.id, o.level, [
          cardLine('perk-card-kind', perkKind(def)),
          cardLine('perk-card-detail', perkEffect(def, o.level)),
        ])
      );
      return item;
    })
  );

  const found = PERKS.filter((p) => codex[p.id] !== undefined);
  codexCountEl.textContent = `${found.length} of ${PERKS.length}`;
  for (const tab of SHOP_TABS) {
    codexRows[tab].replaceChildren(
      ...PERKS.filter((p) => p.tab === tab).map((def) => codexSocket(def, codex[def.id]))
    );
  }
  codexEl.replaceChildren(
    ...found.map((def) => {
      const item = document.createElement('li');
      item.append(codexCard(def, codex[def.id]!));
      return item;
    })
  );
}

/**
 * A perk's socket on the codex board: lit once found, dimmer if never held.
 * Not found, it stays an empty socket in its rarity's shape (a keystone's has
 * its inner ring), so there is something to hunt without spoiling it.
 */
function codexSocket(def: PerkDef, best: number | undefined): HTMLLIElement {
  const item = document.createElement('li');
  item.className = 'codex-entry';
  item.dataset.rarity = def.rarity;
  const tile = document.createElement('span');
  tile.className = 'perk-tile';
  tile.setAttribute('role', 'img');
  let label: string;
  if (best === undefined) {
    item.classList.add('is-undiscovered');
    label = `Undiscovered ${def.rarity} perk`;
  } else {
    item.dataset.family = def.family;
    item.classList.toggle('is-unheld', best === 0);
    tile.append(perkGlyph(def.id));
    label = `${def.name}, ${best > 0 ? `held up to level ${best}` : 'found, never held'}`;
  }
  tile.setAttribute('aria-label', label);
  tile.title = label;
  item.append(tile);
  return item;
}

/** A found perk's codex card: every level's number with the best held lit, and how far it was held. */
function codexCard(def: PerkDef, best: number): HTMLElement {
  return perkCard(def.id, 0, [
    cardLine('perk-card-kind', perkKind(def)),
    cardLine('perk-card-detail', perkEffectAllLevels(def, best)),
    cardLine('perk-card-status', best > 0 ? `Held up to level ${best}` : 'Found, never held'),
  ]);
}

function renderStats(): void {
  const play = { combo: combo.combo };
  statEls.presses.textContent = state.totalPresses.toLocaleString('en-US');
  statEls.run.textContent = formatEnergy(state.runLifetime);
  statEls.lifetime.textContent = formatEnergy(state.totalLifetime);
  statEls.eps.textContent = formatRate(energyPerSecond(state, play));
  statEls.epp.textContent = formatEnergy(energyPerPress(state, play));
  statEls.bestCombo.textContent = String(state.bestCombo);
  statEls.bestSurge.textContent = state.surges ? state.bestSurgeCps.toFixed(1) : '—';
  statEls.isotopes.textContent = state.isotopes
    ? `${state.isotopes}, ${bonusText(state.isotopes)}`
    : '0';
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

// --- Isotopes: the Isotopes tab and the shelf ---------------------------

function isotopeNoun(n: number): string {
  return n === 1 ? 'isotope' : 'isotopes';
}

/** "1 isotope", "3 isotopes". */
function isotopeCount(n: number): string {
  return `${n} ${isotopeNoun(n)}`;
}

/**
 * What n isotopes add to every gain, as "+30%": at Enrichment's rate once it
 * is picked. `forks` are the picks to count, the save's unless a reset is
 * about to change them.
 */
function bonusText(n: number, forks: ForkPicks = state.forks): string {
  return `+${Math.round(isotopeRate(n, forks) * n * 100)}%`;
}

function text(words: string): Text {
  return document.createTextNode(words);
}

/** A step's rungs by name: "Warm Start", or a fork's two, "Sixth Slot or Prodigy". */
function stepName(step: TrackStep): string {
  return step.rungs.map((r) => r.name).join(' or ');
}

/** "a", "a and b", "a, b and c". */
function listWords(words: readonly string[]): string {
  if (words.length < 2) return words[0] ?? '';
  return `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`;
}

/** What reaching these steps unlocks, in words: "Capacitor and a choice of Sixth Slot or Prodigy". */
function unlockWords(steps: readonly TrackStep[]): string {
  return listWords(steps.map((s) => (isFork(s) ? `a choice of ${stepName(s)}` : stepName(s))));
}

/** The same, with each rung's name lit: the isotope tooltip's line. */
function unlockNodes(steps: readonly TrackStep[]): Node[] {
  const name = (words: string) => {
    const node = document.createElement('span');
    node.className = 'rung-name';
    node.textContent = words;
    return node;
  };
  const parts = steps.map((step): Node[] =>
    isFork(step)
      ? [text('a choice of '), name(step.rungs[0].name), text(' or '), name(step.rungs[1]!.name)]
      : [name(step.rungs[0].name)]
  );
  return parts.flatMap((part, i) => [
    ...(i === 0 ? [] : [text(i === parts.length - 1 ? ' and ' : ', ')]),
    ...part,
  ]);
}

/** A rung's detail as a sentence. */
function rungSentence(id: RungId): string {
  return `${rung(id).detail}.`;
}

/** A word, or a number set as a readout (with an extra class, if given). */
type SentencePart = string | [value: string, className?: string];

/** Write a sentence whose numbers are readouts; unchanged, it is left alone. */
function setSentence(target: HTMLElement, ...parts: SentencePart[]): void {
  const key = JSON.stringify(parts);
  if (target.dataset.sentence === key) return;
  target.dataset.sentence = key;
  target.replaceChildren(
    ...parts.map((part) => {
      if (typeof part === 'string') return part;
      const number = document.createElement('span');
      number.className = part[1] ? `readout ${part[1]}` : 'readout';
      number.textContent = part[0];
      return number;
    })
  );
}

/**
 * The Isotopes tab's tiles: the isotopes held, what a reset pays, and the way to
 * the next isotope; then the button and what the reset unlocks. Until a
 * reset opens, the meter tracks the way to the first isotope it pays.
 */
function renderPrestige(): void {
  const held = state.isotopes;
  const gain = prestigeGain(state.runLifetime);
  const ready = prestigeUnlocked(state);
  setText(prestigeHeld, String(held));
  // With none held, what one is worth, rather than "+0%".
  if (held) setSentence(prestigeBonus, [bonusText(held)], ' to all gains');
  else
    setSentence(prestigeBonus, 'each adds ', [
      `${Math.round(isotopeRate(held, state.forks) * 100)}%`,
    ]);

  prestigeTiles.classList.toggle('is-open', ready);
  prestigePays.hidden = !ready;
  prestigeAction.hidden = !ready;
  if (ready) {
    const next = nextIsotopeAt(state.runLifetime);
    setText(prestigeGainValue, `+${gain}`);
    setSentence(prestigeAfter, [bonusText(held + gain)], ' after');
    setSentence(prestigeNext, 'Next isotope at ', [formatEnergy(next)]);
    setSentence(prestigeProgress, [formatEnergy(next - state.runLifetime)], ' to go');
  } else {
    setSentence(prestigeNext, 'Reset opens at ', [formatEnergy(PRESTIGE_UNLOCK)]);
    setSentence(prestigeProgress, [formatEnergy(PRESTIGE_UNLOCK - state.runLifetime)], ' to go');
  }
  renderResetUnlocks(ready ? stepsReached(held, held + gain) : []);
  isotopeMeter.style.transform = `scaleX(${isotopeProgress(state.runLifetime)})`;
  renderTrack();
}

/** The steps the unlock line names, so it is rebuilt only when they change. */
let unlocksShown = '';

/** Beside the button, what resetting now unlocks: the ring tooltip's hook. */
function renderResetUnlocks(steps: readonly TrackStep[]): void {
  const key = steps.map((s) => s.isotopes).join();
  if (key === unlocksShown) return;
  unlocksShown = key;
  prestigeUnlocks.hidden = steps.length === 0;
  prestigeUnlocks.replaceChildren(
    ...(steps.length > 0
      ? [cardLine('reset-unlocks-text', [text('Unlocks '), ...unlockNodes(steps), text('.')])]
      : [])
  );
}

/** What the track shows, as the isotopes held and the picks. */
let trackShown = '';

/**
 * The isotope track in the Isotopes tab: the sockets lit to the isotopes held,
 * each fork's picked half, a rim on the next two; then a row for each of the
 * next two, and one for each rung held. A group with no rows hides.
 */
function renderTrack(): void {
  const held = state.isotopes;
  const key = `${held}:${JSON.stringify(state.forks)}`;
  if (key === trackShown) return;
  trackShown = key;

  const reached = ISOTOPE_TRACK.filter((s) => s.isotopes <= held);
  const next = nextSteps(held);
  trackCount.textContent = `${reached.length} of ${ISOTOPE_TRACK.length}`;
  for (const socket of trackSockets) {
    const lit = socket.isotopes <= held;
    socket.li.classList.toggle('is-lit', lit);
    socket.li.classList.toggle(
      'is-next',
      next.some((s) => s.isotopes === socket.isotopes)
    );
    for (const half of socket.halves) {
      half.classList.toggle('is-picked', lit && half.dataset.rung === state.forks[socket.isotopes]);
    }
  }
  trackNext.replaceChildren(...next.map((s) => trackRow(s, true)));
  trackHeld.replaceChildren(...reached.map((s) => trackRow(s, false)));
  trackNextGroup.hidden = next.length === 0;
  trackHeldGroup.hidden = reached.length === 0;
}

/**
 * A rung on the track as a row: the socket and number it has on the rail,
 * its name, what it does. A fork held names its pick, then the other option.
 * Screen readers hear where it sits first: "At 3 isotopes: Prodigy, or …".
 */
function trackRow(step: TrackStep, upcoming: boolean): HTMLLIElement {
  const item = document.createElement('li');
  item.className = upcoming ? 'track-row is-next' : 'track-row is-lit';
  const pick = state.forks[step.isotopes];
  const picked = !upcoming && pick && isPickFor(step.isotopes, pick) ? pick : undefined;
  const halves = isFork(step)
    ? step.rungs.map((r) => {
        const half = cardLine('track-half', '');
        half.classList.toggle('is-picked', r.id === picked);
        return half;
      })
    : [];
  if (halves.length > 0) item.dataset.fork = '';
  const mark = cardLine('track-row-mark', [cardLine('track-gem', halves)]);
  const num = cardLine('track-row-num', String(step.isotopes));
  mark.setAttribute('aria-hidden', 'true');
  num.setAttribute('aria-hidden', 'true');
  item.append(cardLine('visually-hidden', `At ${isotopeCount(step.isotopes)}: `), mark, num);

  if (!isFork(step)) {
    const r = step.rungs[0];
    item.append(
      cardLine('track-row-name', r.name),
      cardLine('track-row-detail', rungSentence(r.id))
    );
  } else if (upcoming) {
    item.append(
      cardLine('track-row-name', stepName(step)),
      cardLine(
        'track-row-detail',
        step.rungs.map((r) => cardLine('track-row-option', `${r.name}: ${rungSentence(r.id)}`))
      )
    );
  } else if (picked) {
    const other = step.rungs.find((r) => r.id !== picked)!;
    item.append(
      cardLine('track-row-name', [
        text(`${rung(picked).name} `),
        cardLine('track-row-alt', `or ${other.name}`),
      ]),
      cardLine('track-row-detail', rungSentence(picked))
    );
  } else {
    item.append(
      cardLine('track-row-name', stepName(step)),
      cardLine('track-row-detail', 'Pick one when you next reset the experiment.')
    );
  }
  return item;
}

function renderPanels(): void {
  renderStats();
  renderAchievements();
  renderPerksPanel();
  renderPrestige();
}

/** Pellets shown on the shelf before the rest collapse into "+N". */
const SHELF_MAX = 10;

/** What a reset paid when the shelf last drew, so a rise can pop the ring; null before the first draw. */
let shelfGain: number | null = null;

/**
 * The trophy shelf: one bead per isotope, kept across every reset. Once a
 * reset is open, the ring after them: the isotopes it pays now, filling
 * toward the next. Runs on the panel tick, so it only touches what changed.
 */
function renderShelf(): void {
  const count = state.isotopes;
  const gain = prestigeGain(state.runLifetime);
  shelfEl.hidden = count === 0 && gain === 0;

  isotopesHeld.hidden = count === 0;
  const next = nextSteps(count, 1)[0];
  const heldLabel =
    `${isotopeCount(count)}, ${bonusText(count)} to all gains, kept through every reset.` +
    (next ? ` Next unlock at ${isotopeCount(next.isotopes)}: ${unlockWords([next])}.` : '');
  if (isotopesHeld.getAttribute('aria-label') !== heldLabel) {
    isotopesHeld.setAttribute('aria-label', heldLabel);
  }

  isotopeNext.hidden = gain === 0;
  if (gain > 0) renderRing(gain);
  if (shelfGain !== null && gain > shelfGain) {
    // A reset just opened, or pays one more: the ring grows in, or pops. The
    // other motion's class goes first, since the ring keeps its last one
    // through a hidden run.
    isotopeNext.classList.remove('is-arriving', 'is-up');
    replay(isotopeNext, shelfGain === 0 ? 'is-arriving' : 'is-up');
  }
  shelfGain = gain;

  const shown = Math.min(count, SHELF_MAX);
  while (pelletsEl.childElementCount < shown) {
    const pellet = document.createElement('span');
    pellet.className = 'pellet';
    pelletsEl.appendChild(pellet);
  }
  while (pelletsEl.childElementCount > shown) pelletsEl.lastElementChild!.remove();
  shelfMoreEl.hidden = count <= SHELF_MAX;
  shelfMoreEl.textContent = `+${count - SHELF_MAX}`;
  fitShelves();
  renderTip();
}

/** The room the two shelves keep between them before the perk shelf drops a row. */
const SHELF_GAP = 12;

/**
 * On a narrow face the shelves can meet in the middle. Measured, since the
 * isotope row's length depends on its beads, its "+N" and the ring; the
 * perk shelf's left edge is the same stacked or not, so this never flips
 * back and forth.
 */
function fitShelves(): void {
  let meet = false;
  if (!shelfEl.hidden && !perkShelf.hidden) {
    const last = !isotopeNext.hidden
      ? isotopeNext.querySelector('svg')!
      : !shelfMoreEl.hidden
        ? shelfMoreEl
        : pelletsEl;
    meet = last.getBoundingClientRect().right + SHELF_GAP > perkShelf.getBoundingClientRect().left;
  }
  reactorWrap.classList.toggle('is-stacked', meet);
}

new ResizeObserver(fitShelves).observe(reactorWrap);

/** The ring: its count, its fill toward the next isotope, and its name for screen readers. */
function renderRing(gain: number): void {
  const count = gain < 10 ? `+${gain}` : String(gain);
  if (isotopeNextCount.textContent !== count) {
    isotopeNextCount.textContent = count;
    isotopeNextCount.dataset.digits = String(String(gain).length);
  }
  const next = formatEnergy(nextIsotopeAt(state.runLifetime));
  const steps = stepsReached(state.isotopes, state.isotopes + gain);
  const unlocks = steps.length > 0 ? ` and unlocking ${unlockWords(steps)}` : '';
  const label = `Reset the experiment now for ${isotopeCount(gain)}, taking all gains to ${bonusText(state.isotopes + gain)}${unlocks}. The next isotope comes at ${next} energy.`;
  if (isotopeNext.getAttribute('aria-label') !== label)
    isotopeNext.setAttribute('aria-label', label);

  if (!isotopeRing) return;
  const offset = (100 * (1 - isotopeProgress(state.runLifetime))).toFixed(2);
  if (shelfGain !== null && gain > shelfGain) {
    // A fresh count starts an empty ring at once, rather than winding back.
    isotopeRing.style.transition = 'none';
    isotopeRing.style.strokeDashoffset = offset;
    void isotopeRing.getBoundingClientRect();
    isotopeRing.style.transition = '';
  } else {
    isotopeRing.style.strokeDashoffset = offset;
  }
}

function renderAll(now = performance.now()): void {
  renderReadouts();
  renderReactor();
  renderArc();
  renderCombo(now);
  renderShop();
  renderPanels();
  renderShelf();
  renderPerkShelf();
}

// --- Press feedback ---------------------------------------------------------------

const MAX_FLOATS = 14;

/**
 * A press's gain rising off the core. A lucky Double Tap press rises in gold;
 * a Chain Reaction past x2 pops each doubling out after it, x2, x4, x8.
 */
function spawnFloat(value: number, lucky: number, e?: Event): void {
  if (reducedMotion() || floats.childElementCount >= MAX_FLOATS) return;
  const span = document.createElement('span');
  span.className = lucky > 1 ? 'float is-lucky readout' : 'float readout';
  span.textContent = `+${formatEnergy(value)}${lucky === 2 ? ' x2' : ''}`;

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

  for (let mult = 2, i = 0; lucky >= 4 && mult <= lucky; mult *= 2, i++) {
    if (floats.childElementCount >= MAX_FLOATS) break;
    const link = document.createElement('span');
    link.className = 'float is-lucky is-chain readout';
    link.textContent = `x${mult}`;
    link.style.left = `${x + 30 + i * 24}px`;
    link.style.top = `${y - 4 - i * 12}px`;
    link.style.fontSize = `${0.875 + i * 0.125}rem`;
    link.style.animationDelay = `${80 + i * 120}ms`;
    link.addEventListener('animationend', () => link.remove());
    floats.appendChild(link);
  }
}

/** Seconds of auto-tapper output gathered into each idle float. */
const IDLE_FLOAT_S = 1.2;
let idleAccum = 0;
let idleTimer = 0;

/** Auto-tapper income made visible: a small dim gain drifting off the rim. */
function spawnIdleFloat(amount: number): void {
  spawnRimFloat(`+${formatEnergy(amount)}`);
}

/**
 * Something drifting up off the core's rim: auto-tapper income, or a perk
 * at work (Self-Replicator's free copy) in the perk's own hue.
 */
function spawnRimFloat(text: string, tint?: PerkFamily | 'track'): void {
  if (reducedMotion() || floats.childElementCount >= MAX_FLOATS) return;
  const box = floats.getBoundingClientRect();
  const core = coreEl.getBoundingClientRect();
  // Somewhere on the upper half of the rim, so it drifts up and away.
  const angle = (-160 + Math.random() * 140) * (Math.PI / 180);
  const r = core.width * 0.48;
  const span = document.createElement('span');
  span.className =
    tint === 'track'
      ? 'float is-idle is-track'
      : tint
        ? 'float is-idle is-perk'
        : 'float is-idle readout';
  if (tint && tint !== 'track') span.dataset.family = tint;
  span.textContent = text;
  span.style.left = `${core.left - box.left + core.width / 2 + r * Math.cos(angle)}px`;
  span.style.top = `${core.top - box.top + core.height / 2 + r * Math.sin(angle)}px`;
  span.addEventListener('animationend', () => span.remove());
  floats.appendChild(span);
}

/** The bezel's angle, turned a little each frame by energy per second. */
let bezelAngle = 0;

/**
 * Seconds per turn: two minutes at one energy a second, quickening with each
 * order of magnitude, never faster than sixteen seconds. Still at zero.
 */
function bezelDegreesPerSecond(eps: number): number {
  if (eps <= 0) return 0;
  return 360 / Math.max(16, 120 - 26 * Math.log10(1 + eps));
}

const MAX_SPARKS = 60;
const SPARKS_PER_PRESS = 5;

/** Overdrive presses throw a few short streaks off the core's rim. */
function spawnSparks(): void {
  if (reducedMotion()) return;
  const box = sparksEl.getBoundingClientRect();
  const core = coreEl.getBoundingClientRect();
  const cx = core.left - box.left + core.width / 2;
  const cy = core.top - box.top + core.height / 2;
  const rim = core.width * 0.42;
  for (let i = 0; i < SPARKS_PER_PRESS && sparksEl.childElementCount < MAX_SPARKS; i++) {
    const spark = document.createElement('span');
    spark.className = 'spark';
    spark.style.left = `${cx}px`;
    spark.style.top = `${cy - 1}px`;
    spark.style.setProperty('--a', `${Math.random() * 360}deg`);
    spark.style.setProperty('--r0', `${rim}px`);
    spark.style.setProperty('--r1', `${rim + 36 + Math.random() * 44}px`);
    spark.addEventListener('animationend', () => spark.remove());
    sparksEl.appendChild(spark);
  }
}

// --- Rhythm scope ------------------------------------------------------------------
// One spike per press on a trace that scrolls left. Evenly spaced spikes are a
// steady beat; mashing crowds them into a ragged scribble. Presses that miss
// the rhythm draw at half height. Under reduced motion it redraws on presses
// only, so nothing scrolls on its own.

const SCOPE_WINDOW_MS = 2400;
const scopeCtx = scopeEl?.getContext('2d') ?? null;
/** Presses on the scope; `pitch` marks one Perfect Pitch caught. */
const blips: { t: number; kept: boolean; pitch: boolean }[] = [];
/** The isotopes' colors, from the page's tokens, for the scope's beads. */
const isotopeInk = (() => {
  const css = getComputedStyle(gameSection);
  return {
    blue: css.getPropertyValue('--ramp-blue').trim() || '#38bdf8',
    white: css.getPropertyValue('--ramp-white').trim() || '#e0f2fe',
  };
})();
let scopeColor = '#22c55e';
/** The idle baseline is already on the canvas; skip redrawing it. */
let scopeFlat = false;

function sizeScope(): void {
  if (!scopeEl || !scopeCtx) return;
  const dpr = window.devicePixelRatio || 1;
  scopeEl.width = Math.round(scopeEl.clientWidth * dpr);
  scopeEl.height = Math.round(scopeEl.clientHeight * dpr);
  scopeCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  scopeFlat = false;
  drawScope(performance.now());
}

/** The trace follows the reactor's (possibly fading) stage color. */
function readScopeColor(): void {
  const color = getComputedStyle(reactor).getPropertyValue('--stage').trim();
  if (color && color !== scopeColor) {
    scopeColor = color;
    scopeFlat = false;
  }
}

function drawScope(now: number): void {
  if (!scopeEl || !scopeCtx) return;
  while (blips.length && now - blips[0]!.t > SCOPE_WINDOW_MS) blips.shift();
  if (blips.length === 0 && scopeFlat) return;

  const ctx = scopeCtx;
  const w = scopeEl.clientWidth;
  const h = scopeEl.clientHeight;
  const base = Math.round(h * 0.72) + 0.5;
  const peak = h * 0.62;
  ctx.clearRect(0, 0, w, h);

  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgb(255 255 255 / 7%)';
  ctx.beginPath();
  ctx.moveTo(0, base);
  ctx.lineTo(w, base);
  ctx.stroke();
  if (blips.length === 0) {
    scopeFlat = true;
    return;
  }

  ctx.beginPath();
  ctx.moveTo(0, base);
  for (const blip of blips) {
    const x = w * (1 - (now - blip.t) / SCOPE_WINDOW_MS);
    const height = blip.kept ? peak : peak * 0.45;
    ctx.lineTo(x - 6, base);
    ctx.lineTo(x - 3, base + 2.5);
    ctx.lineTo(x, base - height);
    ctx.lineTo(x + 3, base + 3);
    ctx.lineTo(x + 6, base);
  }
  ctx.lineTo(w, base);
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = scopeColor;
  ctx.shadowColor = scopeColor;
  ctx.shadowBlur = 6;
  ctx.stroke();

  // A press Perfect Pitch caught wears an isotope bead on its peak, a shape
  // as well as a color, so it shows at any stage.
  ctx.fillStyle = isotopeInk.white;
  ctx.shadowColor = isotopeInk.blue;
  for (const blip of blips) {
    if (!blip.pitch) continue;
    const x = w * (1 - (now - blip.t) / SCOPE_WINDOW_MS);
    ctx.beginPath();
    ctx.arc(x, base - peak, 2.5, 0, 2 * Math.PI);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
  scopeFlat = false;
}

if (scopeEl) new ResizeObserver(sizeScope).observe(scopeEl);

// --- Game events -------------------------------------------------------------------

/** Whether this run has reached a reset yet, for the notice when it first does. */
let resetOpen = prestigeUnlocked(state);

function afterEarn(): void {
  const idx = reactorIndex(state.runLifetime);
  // A reset opens at Unstable, so the two notices usually come as one.
  const opened = !resetOpen && prestigeUnlocked(state);
  if (opened) resetOpen = true;
  const resetNote = opened ? ' You can reset the experiment.' : '';
  if (idx !== reactorIdx) {
    const prevIdx = reactorIdx;
    reactorIdx = idx;
    renderReactor();
    replay(coreEl, 'is-stepped');
    if (idx > prevIdx) celebrateStage(prevIdx);
    const name = REACTOR_STATES[idx]!.name;
    toast(opened ? `Reactor is now ${name}.${resetNote}` : `Reactor is now ${name}`);
    announce(`Reactor is now ${name}.${resetNote}`);
    SOUND.reactorUp();
    awardAchievements();
  } else if (opened) {
    toast('You can now reset the experiment.');
    announce('You can now reset the experiment.');
  }
  if (opened) renderShelf();
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
  if (imploding) return; // the reset sequence owns the core for half a second
  if (now - lastPressAt < MIN_PRESS_GAP_MS) return; // 30 per second cap (spec §2)
  lastPressAt = now;
  beeper.unlock();
  replay(keycapEl, 'is-down');
  unpinTip();

  const mods = modsOf(state);
  const result = combo.press(now);
  // Brute Force: the beat is still tracked for the scope, but counts for nothing.
  const counted = mods.comboOff ? 0 : result.combo;
  const tier = comboTier(counted, mods.tiers);
  if (tier.multiplier > lastTierMultiplier) {
    SOUND.tierUp();
    replay(comboTierEl, 'is-up');
  }
  lastTierMultiplier = tier.multiplier;

  const play = playContext(now);
  // x1, or x2 on a Double Tap, and on down a Chain Reaction to x8.
  const lucky = luckyMultiplier(state);
  const value = energyPerPress(state, play, mods) * lucky;

  earn(state, value);
  income.add(now, value / pressBoost(play, mods));
  state.totalPresses++;
  if (counted > state.bestCombo) state.bestCombo = counted;
  if (play.surging) {
    surge.presses++;
    surge.earned += value;
    // Capacitor's second, the last of the surge.
    if (surge.bonusS > 0 && now >= surge.phaseEndsAt - surge.bonusS * 1000) {
      surge.bonusPresses++;
      surge.bonusEarned += value;
    }
    spawnSparks();
  }

  const pitch = pitchCaught(result, mods);
  if (pitch && now - pitchCreditAt >= PITCH_CREDIT_MS) {
    pitchCreditAt = now;
    spawnRimFloat(rung('perfect-pitch').name, 'track');
  }
  blips.push({ t: now, kept: result.kept, pitch });
  if (reducedMotion()) drawScope(now);
  spawnFloat(value, lucky, e);
  replay(coreEl, 'is-pressed');
  afterEarn();
  if (
    state.totalPresses === 1 ||
    state.totalPresses % 100 === 0 ||
    counted === 25 ||
    counted === 50 ||
    counted === 100
  ) {
    awardAchievements({ combo: counted });
  }
}

// A press pulse or stage snap comes off the core once it has played. Left on,
// the stage snap outranks every later press, and either one stops the core
// breathing. The countdown inside the core ends animations of its own.
coreEl.addEventListener('animationend', (e) => {
  if (e.target === coreEl) coreEl.classList.remove('is-pressed', 'is-stepped');
});

/** Perfect Pitch's credit floats off the core at most this often; the scope marks every press it catches. */
const PITCH_CREDIT_MS = 30_000;
let pitchCreditAt = -Infinity;

/**
 * Perfect Pitch caught this press: it kept the beat inside the rung's wider
 * window but outside the usual one, and no perk's window is wider still.
 */
function pitchCaught(result: PressResult, mods: ReturnType<typeof modsOf>): boolean {
  return (
    result.kept &&
    result.drift !== null &&
    result.drift > COMBO.tolerance &&
    !mods.comboOff &&
    hasRung(state, 'perfect-pitch') &&
    mods.combo.tolerance === TRACK_EFFECT.perfectPitchTolerance
  );
}

/** The combo the formulas count: none at all under Brute Force. */
function countedCombo(): number {
  return modsOf(state).comboOff ? 0 : combo.combo;
}

function onComboBroke(): void {
  lastTierMultiplier = comboTier(countedCombo(), modsOf(state).tiers).multiplier;
}

// --- Surge ---------------------------------------------------------------------------

/** How long the results card stays over the core. */
const SUMMARY_MS = 4000;
/** How long the results take to count up. */
const TALLY_MS = 800;
/** Bumped to cancel any count-up still running (a reset, or a new surge). */
let tallyGen = 0;

/**
 * Put the reactor into a surge phase. CSS keys everything visual off
 * data-surge; this also swaps the state label for the surge label while the
 * countdown and overdrive run.
 */
function setSurgePhase(phase: SurgePhase): void {
  surge.phase = phase;
  if (phase === 'idle') delete reactor.dataset.surge;
  else reactor.dataset.surge = phase;
  const live = phase === 'warning' || phase === 'active';
  stateLabelEl.hidden = live;
  surgeLabel.hidden = !live;
  if (phase !== 'summary') surgeSummary.hidden = true;
}

/** One countdown second in the core. */
function showCount(n: number): void {
  coreNum.textContent = String(n);
  coreUnit.textContent = '';
  replay(coreNum, 'is-tick');
}

/** Count a result up from zero, easing out. Reduced motion shows the total. */
function tally(node: HTMLElement, to: number, format: (v: number) => string, gen: number): void {
  if (reducedMotion()) {
    node.textContent = format(to);
    return;
  }
  const start = performance.now();
  node.textContent = format(0);
  const step = (now: number) => {
    if (gen !== tallyGen) return;
    const p = Math.min(1, (now - start) / TALLY_MS);
    node.textContent = format(to * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function surgeTick(now: number): void {
  switch (surge.phase) {
    case 'idle': {
      const rules = modsOf(state).surge;
      if (activeS < surge.dueAt || now - lastPressAt >= rules.idleAfterS * 1000) break;
      surge.warningS = rules.warningS;
      surge.durationS = rules.durationS;
      surge.bonusS = hasRung(state, 'capacitor') ? TRACK_EFFECT.capacitorS : 0;
      // A surge with no countdown (Storm Front) strikes at once.
      if (surge.warningS <= 0) {
        startOverdrive(now, true);
        break;
      }
      setSurgePhase('warning');
      surge.phaseEndsAt = now + surge.warningS * 1000;
      surge.lastTick = surge.warningS;
      surgeLabel.textContent = 'Surge incoming';
      showCount(surge.warningS);
      announce(
        `Surge in ${surge.warningS} seconds. Every press is worth ${rules.multiplier} times more.`
      );
      SOUND.warningTick();
      break;
    }
    case 'warning': {
      const left = Math.ceil((surge.phaseEndsAt - now) / 1000);
      if (left < surge.lastTick && left >= 1) {
        surge.lastTick = left;
        showCount(left);
        SOUND.warningTick();
      }
      if (now >= surge.phaseEndsAt) startOverdrive(now);
      break;
    }
    case 'active': {
      const elapsed = (surge.durationS * 1000 - (surge.phaseEndsAt - now)) / 1000;
      coreNum.textContent = (surge.presses / Math.max(elapsed, 0.3)).toFixed(1);
      if (now >= surge.phaseEndsAt) endSurge(now);
      break;
    }
    case 'summary':
      if (now >= surge.phaseEndsAt) {
        setSurgePhase('idle');
        scheduleSurge();
      }
      break;
  }
}

/** Into overdrive. `struck`: there was no countdown, so a ring rolls off the core instead. */
function startOverdrive(now: number, struck = false): void {
  setSurgePhase('active');
  surge.phaseEndsAt = now + surge.durationS * 1000;
  surge.presses = 0;
  surge.earned = 0;
  surge.bonusPresses = 0;
  surge.bonusEarned = 0;
  surgeLabel.textContent = `Surge x${modsOf(state).surge.multiplier}`;
  coreNum.textContent = '0.0';
  coreUnit.textContent = 'per second';
  replay(coreNum, 'is-tick');
  if (struck) replay(shockEl, 'is-firing');
  announce(
    `${struck ? 'A surge strikes without warning.' : 'Surge.'} Press as fast as you can for ${surge.durationS} seconds.`
  );
  SOUND.surgeStart();
}

function endSurge(now: number): void {
  const cps = Math.round((surge.presses / surge.durationS) * 10) / 10;
  const isBest = cps > state.bestSurgeCps;
  state.surges++;
  if (isBest) state.bestSurgeCps = cps;

  setSurgePhase('summary');
  surge.phaseEndsAt = now + SUMMARY_MS;
  surgeSummary.hidden = false;
  surgeBest.hidden = !isBest;
  surgeBest.classList.remove('is-shining');

  const gen = ++tallyGen;
  tally(surgePresses, surge.presses, (v) => String(Math.round(v)), gen);
  tally(surgeRate, cps, (v) => v.toFixed(1), gen);
  tally(surgeEarned, surge.earned, formatEnergy, gen);
  if (isBest) {
    window.setTimeout(() => {
      if (gen === tallyGen) replay(surgeBest, 'is-shining');
    }, TALLY_MS);
  }
  sweepArcBack();

  const mods = modsOf(state);
  if (mods.afterglowS > 0) afterglowUntil = now + mods.afterglowS * 1000;
  // Surges are the boss fights: now and then one drops a perk, named on the card.
  const dropped = surgeDrop(state, income.rate(now));
  surgeDropEl.hidden = !dropped;
  if (dropped) {
    surgeDropEl.dataset.family = perk(dropped.id).family;
    surgeDropKind.textContent = dropKind(dropped);
    surgeDropName.textContent = perkTitle(dropped.id, dropped.level);
    onPerkDropped(dropped, true);
  }
  // Capacitor's extra second, with what it brought in.
  const bonus = surge.bonusS > 0 ? capacitorWords() : '';
  surgeCredit.hidden = !bonus;
  surgeCredit.textContent = bonus;

  announce(
    `Surge over. ${surge.presses} presses, ${cps.toFixed(1)} per second, ${formatEnergy(surge.earned)} energy.` +
      (isBest ? ' New best.' : '') +
      (bonus ? ` ${bonus}.` : '') +
      (dropped ? ` ${dropAnnouncement(dropped)}` : '')
  );
  SOUND.surgeEnd();
  awardAchievements({ surgeCps: cps });
  renderStats();
}

/** "Capacitor +1 s: 9 presses, 1,240 energy", what its extra second brought in. */
function capacitorWords(): string {
  const n = surge.bonusPresses;
  const what = `${n} ${n === 1 ? 'press' : 'presses'}, ${formatEnergy(surge.bonusEarned)} energy`;
  return `${rung('capacitor').name} +${surge.bonusS} s: ${what}`;
}

// --- Perks in play -------------------------------------------------------------------------

/**
 * A perk dropped. Its row lights up and a closed tab tags itself; the chime
 * rings by rarity; a toast names it, unless a surge dropped it and its
 * results card already does, in which case the chime waits for the surge's own.
 */
function onPerkDropped(offer: PerkOffer, fromSurge = false): void {
  const def = perk(offer.id);
  arriveOffer(def.tab);
  renderShopNotices();
  renderPerksPanel(); // the codex has found it
  if (fromSurge) {
    // The surge's own end chord and announcement come first; it adds the drop to them.
    window.setTimeout(() => SOUND.perkDrop(def.rarity), 450);
  } else {
    SOUND.perkDrop(def.rarity);
    toast(
      `${dropKind(offer)}: ${perkTitle(offer.id, offer.level)}${findThanks(offer)}`,
      def.family
    );
    announce(dropAnnouncement(offer));
  }
  dirty = true;
}

/** "Rare drop: Overtone, in the Upgrades tab for 18,000 energy." */
function dropAnnouncement(offer: PerkOffer): string {
  const where = TAB_NAME[perk(offer.id).tab];
  return `${dropKind(offer)}: ${perkTitle(offer.id, offer.level)}${findThanks(offer)}, in the ${where} tab for ${formatEnergy(offer.price)} energy.`;
}

/** ", thanks to Lucky Find" on a drop a find rung raised a tier; nothing otherwise. */
function findThanks(offer: PerkOffer): string {
  if (!offer.lifted) return '';
  return `, thanks to ${rung(hasRung(state, 'rich-find') ? 'rich-find' : 'lucky-find').name}`;
}

/** An offer's window ran out: its row fades away, and a screen reader hears it go. */
function onOfferExpired(offer: PerkOffer): void {
  const { tab } = perk(offer.id);
  if (!swapModal.hidden && swapTab === tab) closeDialog(swapModal);
  leaveOffer(tab, false);
  renderShopNotices();
  announce(`${perkTitle(offer.id, offer.level)} is no longer on offer.`);
  dirty = true;
}

/** Self-Replicator made a copy: it drifts off the core, and the tapper's glyph plays its motion. */
function onReplicated(id: AutoTapperId): void {
  spawnRimFloat(`+1 ${autoTapper(id).name}`, perk('self-replicator').family);
  if (activeShopTab === 'auto') {
    const glyph = shopButtons.get(`auto:${id}`)?.querySelector('.shop-glyph');
    if (glyph) replay(glyph, 'is-bought');
  }
  awardAchievements();
  dirty = true;
}

/** Every frame: Self-Replicator's clock, then the drops and expiries (perks.ts). */
function perkFrame(now: number, activeDt: number): void {
  const every = modsOf(state).replicateEveryS;
  if (every > 0) {
    replicateClock += activeDt;
    if (replicateClock >= every) {
      replicateClock -= every;
      const id = replicate(state);
      if (id) onReplicated(id);
    }
  } else {
    replicateClock = 0;
  }

  const { dropped, expired } = perkTick(state, income.rate(now), activeDt);
  for (const offer of expired) onOfferExpired(offer);
  for (const offer of dropped) onPerkDropped(offer);
}

/** While Afterglow lasts, the label under the core counts it down in place of the stage name. */
function renderAfterglow(now: number): void {
  if (surge.phase === 'warning' || surge.phase === 'active') return;
  const left = afterglowUntil - now;
  const glowing = left > 0;
  reactor.classList.toggle('is-afterglow', glowing);
  stateLabelEl.hidden = glowing;
  surgeLabel.hidden = !glowing;
  if (glowing) {
    setText(surgeLabel, `Afterglow x${modsOf(state).afterglowMult}, ${Math.ceil(left / 1000)} s`);
  }
}

// --- Frame loop ------------------------------------------------------------------------

let lastFrame = performance.now();
let lastShopRender = 0;
let lastPanelRender = 0;
let dirty = false;

function frame(now: number): void {
  const dt = Math.min((now - lastFrame) / 1000, 1);
  lastFrame = now;
  const mods = modsOf(state);

  // Active play, the clock surges, perk drops and Self-Replicator run on: the
  // page in view and a press within the last minute.
  const visible = !document.hidden;
  const activeDt = visible && now - lastPressAt < mods.surge.idleAfterS * 1000 ? dt : 0;
  if (visible) state.playedS += dt;
  activeS += activeDt;

  if (combo.tick(now)) onComboBroke();

  const play = playContext(now);
  const eps = energyPerSecond(state, play, mods);
  // Idle Hands at work: the per-second readout says so.
  epsEl.classList.toggle(
    'is-boosted',
    eps > 0 && mods.idleBoostMult > 1 && play.idleS! >= mods.idleBoostAfterS
  );
  if (eps > 0) {
    earn(state, eps * dt);
    // As for presses, a surge reaching the auto-tappers (Surge Lines) stays out of the pace.
    income.add(
      now,
      (eps * dt) / (play.surging && mods.surgeHitsTappers ? mods.surge.multiplier : 1)
    );
    afterEarn();
    dirty = true;

    // Gather a little output, then let it drift off the core as one gain.
    idleAccum += eps * dt;
    idleTimer += dt;
    if (idleTimer >= IDLE_FLOAT_S && idleAccum >= 1) {
      spawnIdleFloat(idleAccum);
      idleAccum = 0;
      idleTimer = 0;
    }
  }

  if (bezelEl && !reducedMotion()) {
    const speed = bezelDegreesPerSecond(eps);
    if (speed > 0) {
      bezelAngle = (bezelAngle + speed * dt) % 360;
      bezelEl.style.transform = `rotate(${bezelAngle.toFixed(2)}deg)`;
    }
  }

  surgeTick(now);
  perkFrame(now, activeDt);
  renderAfterglow(now);

  renderReadouts();
  renderCombo(now);
  if (!reducedMotion()) drawScope(now);
  // The dial is a clock during a surge, so it updates every frame then.
  if (surge.phase === 'warning' || surge.phase === 'active') renderArc(now);
  if (now - lastShopRender > 150) {
    renderShop();
    renderArc(now);
    readScopeColor();
    lastShopRender = now;
  }
  if (now - lastPanelRender > 500) {
    renderStats();
    renderPrestige();
    // The shelf waits out a reset's collapse: the beads it earns fly in after.
    if (!imploding) renderShelf();
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
    const { rate, capS } = modsOf(state).offline;
    awayTime.textContent = formatDuration(award.seconds);
    // Night Shift pays all of it. Night Lab's rate and cap are credited where
    // they are the ones in force.
    const lab = hasRung(state, 'night-lab');
    const labName = rung('night-lab').name;
    awayRate.textContent =
      (rate >= 1
        ? 'full speed'
        : rate === 0.5
          ? 'half speed'
          : `${Math.round(rate * 100)}% speed`) +
      (lab && rate === TRACK_EFFECT.nightLabRate ? ` with ${labName}` : '');
    const longer = lab && capS === TRACK_EFFECT.nightLabCapS && award.seconds > OFFLINE.capS;
    awayCredit.hidden = !longer;
    awayCredit.textContent = ` ${labName} kept them running past the usual ${OFFLINE.capS / 3600} hours.`;
    awayEnergy.textContent = formatEnergy(award.energy);
    // An offer still in the shop is worth a mention: time away didn't use it up.
    const waiting = state.perks.offers.map((o) => perkTitle(o.id, o.level));
    awayOffers.hidden = waiting.length === 0;
    awayOffers.textContent =
      waiting.length === 1
        ? ` ${waiting[0]} is still on offer in the shop: time away doesn't count against its window.`
        : ` ${waiting.join(' and ')} are still on offer in the shop: time away doesn't count against their windows.`;
    pendingAway = award.energy;
    // The reactor idled while you were gone; it wakes when you collect.
    reactor.classList.add('is-asleep');
    openDialog(awayModal, awayCollect);
  } else if (awayS > 1) {
    const amount = energyPerSecond(state) * Math.min(awayS, 60);
    earn(state, amount);
    // Time away never runs a perk offer down (SPACEBAR-CLICKER.md §8.1.2).
    deferPerks(state, amount);
    afterEarn();
  }
  state.lastSeen = Date.now();
}

awayCollect.addEventListener('click', () => {
  const amount = pendingAway;
  earn(state, amount);
  deferPerks(state, amount);
  pendingAway = 0;
  // The core brightens (CSS) while the energy counts into the readout.
  reactor.classList.remove('is-asleep');
  if (!reducedMotion()) energyRoll = { amount, start: performance.now() };
  SOUND.collect();
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
  return !resetModal.hidden || !prestigeModal.hidden || !awayModal.hidden || !swapModal.hidden;
}

for (const modal of [resetModal, prestigeModal, awayModal, swapModal]) {
  modal.addEventListener('click', (e) => {
    if (e.target === modal && modal !== awayModal) closeDialog(modal);
  });
}

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!resetModal.hidden) closeDialog(resetModal);
  if (!prestigeModal.hidden) closeDialog(prestigeModal);
  if (!swapModal.hidden) closeDialog(swapModal);
  // A shelf's tooltip can always be dismissed without moving the pointer or focus.
  if (!perkTip.hidden || !isotopeTip.hidden) {
    tipDismissed = true;
    renderTip();
  }
});

/** Return the live state to a fresh run's starting point (reset or prestige). */
function restartRun(): void {
  combo.reset();
  lastTierMultiplier = 1;
  reactorIdx = reactorIndex(state.runLifetime);
  resetOpen = prestigeUnlocked(state);
  clearArcTimers();
  setSurgePhase('idle');
  tallyGen++;
  sparksEl.replaceChildren();
  blips.length = 0;
  energyRoll = null;
  idleAccum = 0;
  idleTimer = 0;
  income.reset();
  afterglowUntil = 0;
  replicateClock = 0;
  reactor.classList.remove('is-afterglow');
  surgeDropEl.hidden = true;
  window.clearTimeout(unlockTimer);
  unlockCard.hidden = true;
  for (const tab of SHOP_TABS) {
    const row = offerRows[tab];
    row.leaving?.cancel();
    row.leaving = null;
    row.shown = '';
    row.li.hidden = true;
    row.li.classList.remove('is-leaving', 'is-arriving', 'is-fading');
  }
  scheduleSurge();
}

// --- Reset the experiment: the sequence ------------------------------------------------

const IMPLODE_MS = 500;
const BLOOM_MS = 900;
const FLY_MS = 700;
/** How long the unlock card stays over the core. */
const UNLOCK_MS = 5000;
let unlockTimer = 0;
/** True while the core collapses; presses are ignored for that half second. */
let imploding = false;

/**
 * The core collapses to a point while the rest of the face dims, then blooms
 * back as a Dormant reactor while the isotopes just earned fly from the core
 * to the shelf. The save has already been reset; this only holds the reactor's
 * old look until the collapse completes. Once the beads land, a card names
 * the rungs the reset unlocked. Reduced motion shows the result at once.
 */
function playReset(isotopesBefore: number, unlocked: readonly RungId[]): void {
  if (reducedMotion()) {
    renderAll();
    showUnlocks(unlocked);
    return;
  }
  imploding = true;
  reactor.classList.remove('is-blooming');
  reactor.classList.add('is-imploding');
  // The run's perks go with it: the shelf fades as the core collapses.
  perkShelf.classList.add('is-clearing');
  // Everything off the reactor face updates now; the face waits.
  renderReadouts();
  renderShop();
  renderPanels();

  window.setTimeout(() => {
    imploding = false;
    renderAll();
    reactor.classList.replace('is-imploding', 'is-blooming');
    const landed = flyIsotopes(isotopesBefore);
    window.setTimeout(() => reactor.classList.remove('is-blooming'), BLOOM_MS);
    unlockTimer = window.setTimeout(() => showUnlocks(unlocked), landed);
  }, IMPLODE_MS);
}

/** The unlock card: each new rung by name, with what it does, for a few seconds. */
function showUnlocks(unlocked: readonly RungId[]): void {
  window.clearTimeout(unlockTimer);
  if (unlocked.length === 0) return;
  unlockList.replaceChildren(
    ...unlocked.map((id) => {
      const item = document.createElement('li');
      item.append(
        cardLine('unlock-name', rung(id).name),
        cardLine('unlock-detail', rungSentence(id))
      );
      return item;
    })
  );
  unlockCard.hidden = false;
  unlockTimer = window.setTimeout(() => {
    unlockCard.hidden = true;
  }, UNLOCK_MS);
}

/** Beads fly from the core to each new slot on the shelf, then land. Returns ms until the last lands. */
function flyIsotopes(before: number): number {
  const fresh = Array.from(pelletsEl.children).slice(Math.min(before, SHELF_MAX)) as HTMLElement[];
  for (const pellet of fresh) pellet.classList.add('is-pending');
  // Past ten on the shelf, a few beads fly to the "+N" count instead.
  const extra = Math.min(3, state.isotopes - before - fresh.length);
  const targets: HTMLElement[] = [...fresh, ...Array.from({ length: extra }, () => shelfMoreEl)];

  const face = reactor.getBoundingClientRect();
  const core = coreEl.getBoundingClientRect();
  const fx = core.left - face.left + core.width / 2 - 4;
  const fy = core.top - face.top + core.height / 2 - 4;

  targets.forEach((target, i) => {
    const to = target.getBoundingClientRect();
    const tx = to.left - face.left + to.width / 2 - 4;
    const ty = to.top - face.top + to.height / 2 - 4;
    const flyer = document.createElement('span');
    flyer.className = 'isotope-flyer';
    reactor.appendChild(flyer);
    const flight = flyer.animate(
      [
        { transform: `translate(${fx}px, ${fy}px) scale(0.4)`, opacity: 0 },
        { transform: `translate(${fx}px, ${fy - 24}px) scale(1.5)`, opacity: 1, offset: 0.2 },
        { transform: `translate(${tx}px, ${ty}px) scale(1)`, opacity: 1 },
      ],
      {
        duration: FLY_MS,
        delay: 150 + i * 90,
        easing: 'cubic-bezier(0.5, 0, 0.2, 1)',
        fill: 'backwards',
      }
    );
    flight.onfinish = () => {
      flyer.remove();
      if (target !== shelfMoreEl) {
        target.classList.remove('is-pending');
        replay(target, 'is-landed');
      }
    };
  });
  return 150 + Math.max(0, targets.length - 1) * 90 + FLY_MS;
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

// Prestige (spec §9), with the isotope track's part (SPACEBAR-CLICKER.md §8.3):
// the rungs the reset unlocks, a pick at every fork the new count reaches, the
// last pick chosen, and the perk Heirloom or Cornerstone carries. A fork
// reached for the first time has no pick, and the reset waits for one.

/** The isotopes the dialog's reset goes to. */
let resetTo = 0;

/** The picks the dialog shows, over the save's. */
function dialogPicks(): ForkPicks {
  const picks: ForkPicks = { ...state.forks };
  for (const input of resetChoices.querySelectorAll<HTMLInputElement>(
    '[data-fork] input:checked'
  )) {
    picks[Number(input.name.slice('fork-'.length))] = input.value as RungId;
  }
  return picks;
}

/** A radio as an option card: its name, then what it does. */
function resetOption(name: string, value: string, label: string, detail: string): HTMLLabelElement {
  const option = document.createElement('label');
  option.className = 'reset-option';
  const input = document.createElement('input');
  input.type = 'radio';
  input.name = name;
  input.value = value;
  option.append(
    input,
    cardLine('reset-option-name', label),
    cardLine('reset-option-detail', detail)
  );
  return option;
}

/** A titled group of the dialog's: a fieldset when it holds a choice. */
function resetGroup(title: string, choice: boolean): HTMLElement {
  const group = document.createElement(choice ? 'fieldset' : 'div');
  group.className = 'reset-group';
  const heading = document.createElement(choice ? 'legend' : 'p');
  heading.className = 'reset-group-title';
  heading.textContent = title;
  group.append(heading);
  return group;
}

/**
 * Build the dialog's track part for a reset to `resetTo`: the rungs it
 * unlocks, then each fork reached with `chosen` picked, then the keeping
 * rung's perks.
 */
function buildResetChoices(chosen: ForkPicks): void {
  const groups: HTMLElement[] = [];
  const fresh = stepsReached(state.isotopes, resetTo).filter((s) => !isFork(s));
  if (fresh.length > 0) {
    const group = resetGroup('This reset unlocks', false);
    const list = document.createElement('ul');
    list.className = 'reset-unlocks';
    for (const step of fresh) {
      const item = document.createElement('li');
      const id = step.rungs[0].id;
      item.append(
        cardLine('reset-option-name', rung(id).name),
        text(' '),
        cardLine('reset-option-detail', rungSentence(id))
      );
      list.append(item);
    }
    group.append(list);
    groups.push(group);
  }

  for (const step of ISOTOPE_TRACK.filter((s) => isFork(s) && s.isotopes <= resetTo)) {
    const picked = isPickFor(step.isotopes, chosen[step.isotopes]) ? chosen[step.isotopes] : null;
    const isNew = !isPickFor(step.isotopes, state.forks[step.isotopes]);
    const group = resetGroup(
      `At ${isotopeCount(step.isotopes)}: ${isNew ? 'pick one' : 'your pick'}`,
      true
    );
    group.dataset.fork = String(step.isotopes);
    const options = document.createElement('div');
    options.className = 'reset-options';
    for (const r of step.rungs) {
      const option = resetOption(`fork-${step.isotopes}`, r.id, r.name, rungSentence(r.id));
      option.querySelector('input')!.checked = r.id === picked;
      options.append(option);
    }
    group.append(options);
    groups.push(group);
  }

  const keep = document.createElement('div');
  keep.id = 'sc-reset-keep';
  groups.push(keep);
  resetChoices.replaceChildren(...groups);
  renderKeep();
}

/**
 * The keeping rung's perks, for the picks the dialog shows: Heirloom offers
 * the perks held that aren't keystones, Cornerstone the keystones. The best
 * comes chosen, or the one chosen before if it is still on offer.
 */
function renderKeep(): void {
  const keep = resetChoices.querySelector<HTMLElement>('#sc-reset-keep');
  if (!keep) return;
  const before = keep.querySelector<HTMLInputElement>('input:checked')?.value;
  const rungs = activeRungs(resetTo, dialogPicks());
  const perks = keepable(state.perks.owned, rungs);
  if (perks.length === 0) {
    keep.replaceChildren();
    return;
  }
  const cornerstone = rungs.includes('cornerstone');
  const group = resetGroup(
    cornerstone ? 'Cornerstone: keep your keystone' : 'Heirloom: keep a perk',
    true
  );
  const options = document.createElement('div');
  options.className = 'reset-options is-list';
  for (const held of perks) {
    options.append(
      resetOption(
        'keep',
        held.id,
        perkTitle(held.id, held.level),
        'Starts the next run in its slot, at level I.'
      )
    );
  }
  options.append(resetOption('keep', '', 'Keep none', 'Start the next run with no perks.'));
  group.append(options);
  keep.replaceChildren(group);
  const chosen = perks.some((o) => o.id === before) ? before : perks[0]!.id;
  for (const input of options.querySelectorAll('input')) input.checked = input.value === chosen;
}

/** The dialog's sentence: what goes, what comes, and the new run's head start. */
function renderResetMessage(): void {
  const held = state.isotopes;
  const gain = resetTo - held;
  const picks = dialogPicks();
  const rungs = activeRungs(resetTo, picks);
  const warm = rungs.includes('warm-start');
  const hot = rungs.includes('hot-start');
  const energy = TRACK_EFFECT.warmStartEnergy.toLocaleString('en-US');
  const finger = `Finger Strength ${ROMAN[TRACK_EFFECT.hotStartFinger]}`;
  const headStart =
    warm && hot
      ? ` Warm Start and Hot Start begin the new run with ${energy} energy, a Lab Assistant, a Pneumatic Key and ${finger}.`
      : warm
        ? ` Warm Start begins the new run with ${energy} energy and a Lab Assistant.`
        : '';
  setSentence(
    prestigeModalMessage,
    "Your energy, upgrades, auto-tappers, reactor state and this run's perks are wiped. You gain ",
    [String(gain)],
    ` ${isotopeNoun(gain)}, taking all gains from `,
    [bonusText(held)],
    ' to ',
    [bonusText(resetTo, picks)],
    `, and keep your achievements, records and perk codex.${headStart}`
  );
}

prestigeBtn.addEventListener('click', () => {
  resetTo = state.isotopes + prestigeGain(state.runLifetime);
  buildResetChoices(state.forks);
  renderResetMessage();
  resetPickHint.hidden = true;
  openDialog(prestigeModal, prestigeCancel);
});
resetChoices.addEventListener('change', (e) => {
  // A fork pick can change which perks a keeping rung offers, and the bonus.
  if ((e.target as HTMLInputElement).name !== 'keep') renderKeep();
  renderResetMessage();
  if (unpickedForks(resetTo, dialogPicks()).length === 0) resetPickHint.hidden = true;
});
prestigeCancel.addEventListener('click', () => closeDialog(prestigeModal));
prestigeConfirm.addEventListener('click', () => {
  const gain = prestigeGain(state.runLifetime);
  if (gain === 0) {
    closeDialog(prestigeModal);
    return;
  }
  const isotopesBefore = state.isotopes;
  // The run kept earning while the dialog was open: a reset that now pays
  // more may reach a new fork, which needs a pick first.
  if (isotopesBefore + gain !== resetTo) {
    resetTo = isotopesBefore + gain;
    buildResetChoices(dialogPicks());
    renderResetMessage();
  }
  const picks = dialogPicks();
  const missing = unpickedForks(resetTo, picks)[0];
  if (missing) {
    resetPickHint.textContent = `Pick one at ${isotopeCount(missing.isotopes)} to reset: ${stepName(missing)}.`;
    resetPickHint.hidden = false;
    resetChoices
      .querySelector<HTMLInputElement>(`[data-fork="${missing.isotopes}"] input`)
      ?.focus();
    return;
  }
  const keep = resetChoices.querySelector<HTMLInputElement>('[name="keep"]:checked')?.value;

  state = prestigeReset(state, gain, Date.now(), {
    forks: picks,
    keep: (keep || undefined) as PerkId | undefined,
  });
  // The rungs this reset reached, a fork as its pick.
  const unlocked = stepsReached(isotopesBefore, state.isotopes).map((step) =>
    isFork(step) ? state.forks[step.isotopes]! : step.rungs[0].id
  );
  restartRun();
  closeDialog(prestigeModal);
  playReset(isotopesBefore, unlocked);
  const bonus = `${bonusText(state.isotopes)} to all gains`;
  toast(`Experiment reset. ${isotopeCount(gain)} gained: ${bonus}.`);
  const kept = state.perks.owned[0];
  announce(
    `Experiment reset. You now hold ${isotopeCount(state.isotopes)}, ${bonus}.` +
      unlocked.map((id) => ` Unlocked ${rung(id).name}: ${rungSentence(id)}`).join('') +
      (kept ? ` ${perk(kept.id).name} stays with you, at level I.` : '')
  );
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
    // The item's glyph plays its own motion once (ShopIcon.astro).
    const glyph = btn.querySelector('.shop-glyph');
    if (glyph) replay(glyph, 'is-bought');
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

// Perk offers. A free slot, or an upgrade, buys at once. With every slot full
// the swap dialog asks which perk to drop, and a second keystone asks before
// it swaps out the first.

/** The tab whose offer the swap dialog is about. */
let swapTab: ShopTab | null = null;

for (const tab of SHOP_TABS) {
  offerRows[tab].btn.addEventListener('click', () => {
    // Space is the game's input; a focused button would swallow it.
    offerRows[tab].btn.blur();
    const offer = offerOn(state, tab);
    if (!offer || state.energy < offer.price) return;
    if (needsSlot(state, tab)) openSwap(tab, 'slot');
    else if (keystoneSwap(state, tab)) openSwap(tab, 'keystone');
    else buyOffer(tab);
  });
}

// The Reroll rung: once a run, swap an offer for a fresh drop on the run's odds.
for (const tab of SHOP_TABS) {
  const row = offerRows[tab];
  row.reroll.addEventListener('click', () => {
    // Space is the game's input; a focused button would swallow it.
    row.reroll.blur();
    const old = offerOn(state, tab);
    const offer = rerollOffer(state, tab, income.rate(performance.now()));
    if (!old || !offer) {
      announce('Nothing else can drop in this tab right now.');
      return;
    }
    SOUND.perkDrop(perk(offer.id).rarity);
    arriveOffer(tab);
    renderShopNotices();
    renderPerksPanel(); // the codex has found it
    announce(`Rerolled ${perkTitle(old.id, old.level)}. ${dropAnnouncement(offer)}`);
    dirty = true;
  });
}

/** Buy the offer on a tab, dropping `replace` from its slot if every slot is full. */
function buyOffer(tab: ShopTab, replace?: PerkId): void {
  const offer = offerOn(state, tab);
  if (!offer) return;
  const out = replace ?? keystoneSwap(state, tab);
  const gapBefore = modsOf(state).surge.maxGapS;
  const result = buyPerk(state, tab, replace);
  if (result !== 'bought' && result !== 'upgraded' && result !== 'swapped') return;

  SOUND.perkBuy();
  // Where the flight to the shelf starts, before the tile flares.
  const from = offerRows[tab].tile.getBoundingClientRect();
  leaveOffer(tab, true);
  renderPerkShelf();
  renderPerksPanel();
  flyToShelf(from, offer.id);
  const name = perk(offer.id).name;
  announce(
    result === 'upgraded'
      ? `${name} is now level ${offer.level}.`
      : out
        ? `Bought ${name}, in place of ${perk(out).name}.`
        : `Bought ${name}.`
  );

  // Lightning Rod changes the pace of surges, including the one on its way.
  const gapAfter = modsOf(state).surge.maxGapS;
  if (surge.phase === 'idle' && gapAfter !== gapBefore) {
    surge.dueAt = activeS + (surge.dueAt - activeS) * (gapAfter / gapBefore);
  }
  // A perk may rescale the tiers; the next press shouldn't hear that as a tier-up.
  lastTierMultiplier = comboTier(countedCombo(), modsOf(state).tiers).multiplier;
  renderShop();
  renderReadouts();
  renderCombo(performance.now());
  renderStats();
  dirty = true;
}

/**
 * The swap dialog. 'slot': every slot is full, or with Twin Keystones both
 * keystone slots are, so pick a perk to drop. Each perk that may go is a
 * button, and choosing one buys. 'keystone': one keystone at a time, so
 * confirm the swap.
 */
function openSwap(tab: ShopTab, mode: 'slot' | 'keystone'): void {
  const offer = offerOn(state, tab);
  if (!offer) return;
  const incoming = perk(offer.id);
  swapTab = tab;
  swapIncoming.replaceChildren(swapCard(offer.id, offer.level));
  swapList.replaceChildren();

  if (mode === 'slot') {
    const choices = swapChoices(state, tab);
    const keystones = keystonesOnly(choices);
    swapTitle.textContent = keystones
      ? 'Both keystone slots are full'
      : `All ${modsOf(state).perkSlots} slots are full`;
    swapMessage.textContent = keystones
      ? `You can hold two keystones at once. Pick one to drop for ${incoming.name}. The one you drop is gone for the rest of this run.`
      : `Pick a perk to drop for ${incoming.name}. The one you drop is gone for the rest of this run.`;
    for (const id of choices) {
      const card = swapCard(id, perkLevel(state, id), true);
      card.addEventListener('click', () => {
        closeDialog(swapModal);
        buyOffer(tab, id);
      });
      const item = document.createElement('li');
      item.append(card);
      swapList.append(item);
    }
    swapCancel.textContent = 'Keep my perks';
    swapConfirm.hidden = true;
  } else {
    const held = keystoneSwap(state, tab)!;
    const level = perkLevel(state, held);
    swapTitle.textContent = 'Swap your keystone?';
    swapMessage.textContent = `You can hold one keystone at a time. ${incoming.name} takes the place of ${perkTitle(held, level)}, which is gone for the rest of this run.`;
    const card = swapCard(held, level);
    card.classList.add('is-outgoing');
    const item = document.createElement('li');
    item.append(card);
    swapList.append(item);
    swapCancel.textContent = `Keep ${perk(held).name}`;
    swapConfirm.hidden = false;
  }
  openDialog(swapModal, swapCancel);
}

swapCancel.addEventListener('click', () => closeDialog(swapModal));
swapConfirm.addEventListener('click', () => {
  const tab = swapTab;
  closeDialog(swapModal);
  if (tab) buyOffer(tab);
});

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
