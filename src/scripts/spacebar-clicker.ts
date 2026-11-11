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
import {
  achievementProgress,
  bestRun,
  checkAchievements,
  recordMillion,
  type AchievementContext,
} from '../games/spacebar-clicker/achievements';
import { ComboTracker, RestartTracker, type PressResult } from '../games/spacebar-clicker/combo';
import {
  ACHIEVEMENTS,
  type AchievementId,
  AUTO_TAPPERS,
  COMBO,
  COMBO_TIERS,
  ISOTOPE_TRACK,
  MIN_PRESS_GAP_MS,
  PERK_FAMILY_NAMES,
  PERK_RARITY_NAMES,
  PERKS,
  PRESS_UPGRADES,
  PRESTIGE_UNLOCK,
  REACTOR_STATES,
  RESTART_PRESSES,
  RUNDOWN,
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
  isotopeFill,
  luckyMultiplier,
  markShopTabSeen,
  nextComboTier,
  nextIsotopeAt,
  offerOn,
  perk,
  pressUpgrade,
  prestigeGain,
  prestigeUnlocked,
  reactorIndex,
  reactorProgress,
  shopTabHasNews,
  syncGain,
  surgePay,
  syncMultiplier,
  tapperCost,
  tapperSplit,
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
import { IncomeMeter, ShareMeter } from '../games/spacebar-clicker/income';
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
  perkDetailAllLevels,
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
  isFaulted,
  outputShare,
  restartReactor,
  tend,
  untendedAward,
  untendedS,
} from '../games/spacebar-clicker/rundown';
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

/**
 * Write the save. It leaves lastSeen alone: that moves only where energy is
 * counted, in the frame loop and on return, so a save from a background tab's
 * timer can't swallow the time away it hasn't paid for.
 */
function save(): void {
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
const comboSyncMultEl = el('sc-combo-sync-mult');
const comboFill = el('sc-combo-fill');
/** Synchronisation's shop row: what it would add, until it is bought (§8.5.12). */
const syncPreview = document.querySelector<HTMLElement>('[data-sync-preview]');
const floats = el('sc-floats');
// Where the energy comes from (SPACEBAR-CLICKER.md §8.5.10).
const shareRow = el('sc-share');
const shareYouEl = el('sc-share-you');
const shareMachinesEl = el('sc-share-machines');
const announceEl = el('sc-announce');

const stateLabelEl = el('sc-state-label');
const surgeLabel = el('sc-surge-label');
// The run-down (SPACEBAR-CLICKER.md §8.5): the label that stands in for the
// stage name, and the restart's marks on the dial's circle.
const powerLabel = el('sc-power-label');
const powerName = el('sc-power-name');
const powerDetail = el('sc-power-detail');
const restartRing = document.getElementById('sc-restart-ring') as SVGSVGElement | null;
const restartMarks = Array.from(
  restartRing?.querySelectorAll<SVGCircleElement>('.restart-mark') ?? []
);
const coreNum = el('sc-core-num');
const coreUnit = el('sc-core-unit');
const sparksEl = el('sc-sparks');
const scopeEl = document.getElementById('sc-scope') as HTMLCanvasElement | null;
const keycapEl = el('sc-keycap');
const bezelEl = document.getElementById('sc-bezel') as SVGSVGElement | null;
// The isotope shelf over the face's top-left corner: the beads held, then a
// ring for the next reset once one is open, and a tooltip of its own.
const shelfEl = el('sc-shelf');
const isotopeBadge = el<HTMLButtonElement>('sc-isotope-badge');
const isotopeDial = el('sc-isotope-dial');
const isotopeRing = document.getElementById('sc-isotope-ring') as SVGCircleElement | null;
const isotopeCountEl = el('sc-isotope-count');
const isotopeSeed = el('sc-isotope-seed');
const isotopeTag = el('sc-isotope-tag');
const isotopeNameEl = el('sc-isotope-name');
const isotopeProgressEl = el('sc-isotope-progress');
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
const codexBoard = el('sc-codex-board');
const codexRows: Record<ShopTab, HTMLElement> = {
  press: el('sc-codex-press'),
  auto: el('sc-codex-auto'),
};
const codexTabCounts: Record<ShopTab, HTMLElement> = {
  press: el('sc-codex-press-count'),
  auto: el('sc-codex-auto-count'),
};
const codexReadEmpty = el('sc-codex-read-empty');
const codexReadPerk = el('sc-codex-read-perk');
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
const unlockMore = el('sc-unlock-more');

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
  share: el('sc-stat-share'),
  bestCombo: el('sc-stat-best-combo'),
  bestSurge: el('sc-stat-best-surge'),
  bestRun: el('sc-stat-best-run'),
  fastestMillion: el('sc-stat-fastest-million'),
  isotopes: el('sc-stat-isotopes'),
  prestiges: el('sc-stat-prestiges'),
  played: el('sc-stat-played'),
};

const achCount = el('sc-ach-count');
const prestigeTab = el('sc-tab-prestige');
const resetIntro = el('sc-reset-intro');
const prestigeTiles = el('sc-reset-tiles');
const prestigeHeld = el('sc-prestige-held');
const prestigeHeldTitle = el('sc-prestige-held-title');
const prestigeLabel = el('sc-prestige-label');
const prestigeBonus = el('sc-prestige-bonus');
const prestigePays = el('sc-prestige-pays');
const prestigeGainValue = el('sc-prestige-gain');
const prestigeTo = el('sc-prestige-to');
const prestigeAfter = el('sc-prestige-after');
const prestigeFrom = el('sc-prestige-from');
const prestigeFromWrap = el('sc-prestige-from-wrap');
const prestigeNext = el('sc-prestige-next');
const isotopeMeter = el('sc-isotope-meter');
const prestigeProgress = el('sc-prestige-progress');
const prestigeUnlocks = el('sc-reset-unlocks');
const prestigeBtn = el<HTMLButtonElement>('sc-prestige-btn');
const trackCount = el('sc-track-count');
const trackGrid = el('sc-track');
const trackRead = el('sc-track-read');

const prestigeModal = el('sc-prestige-modal');
const prestigeCancel = el('sc-prestige-cancel');
const prestigeConfirm = el('sc-prestige-confirm');
const resetBody = el('sc-reset-body');
const resetSumGain = el('sc-reset-sum-gain');
const resetSumTo = el('sc-reset-sum-to');
const resetSumBonus = el('sc-reset-sum-bonus');
const resetSumFrom = el('sc-reset-sum-from');
const resetSumFromWrap = el('sc-reset-sum-from-wrap');
const resetKeptToggle = el<HTMLButtonElement>('sc-reset-kept-toggle');
const resetKeptRow = el('sc-reset-kept-row');
const resetHeadRow = el('sc-reset-head-row');
const resetHead = el('sc-reset-head');
const resetChoices = el('sc-reset-choices');
const resetPickHint = el('sc-reset-pick-hint');
const pickTip = el('sc-pick-tip');
const pickTipName = el('sc-pick-tip-name');
const pickTipDetail = el('sc-pick-tip-detail');

const swapModal = el('sc-swap-modal');
const swapTitle = el('sc-swap-title');
const swapIncoming = el('sc-swap-incoming');
const swapMessage = el('sc-swap-message');
const swapList = el('sc-swap-list');
const swapListLabel = el('sc-swap-list-label');
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
  // The reactor back from a fault: a rising run, lower than a stage change's.
  restart: () => chord([392, 523, 659, 784], 85),
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

const toastQueue: { text: string; family?: PerkFamily | 'track' }[] = [];
let toastTimer = 0;

/**
 * A short notice on the reactor face. A perk's notice wears its family's hue,
 * and a rung of the isotope track credited where it acts, the isotopes' blue.
 */
function toast(text: string, family?: PerkFamily | 'track'): void {
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
  () => modsOf(state).combo,
  () => modsOf(state).tiers
);
/** Energy per second actually being earned; perk prices are set in it. */
const income = new IncomeMeter();
/** The player's share of recent energy, for the bar under the readouts (§8.5.10). */
const share = new ShareMeter();
/** The share as last drawn: whole percent for the numbers, and the bar's fraction. */
let sharePct = -1;
let shareFraction = '';
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
 * meter takes them back out, with what a surge pays from the auto-tappers, so
 * a perk dropping during or just after a surge is priced at the player's own
 * pace, not ten times it.
 */
function pressBoost(play: PlayContext, mods = modsOf(state)): number {
  return (play.surging ? mods.surge.multiplier : 1) * (play.afterglow ? mods.afterglowMult : 1);
}
scheduleSurge();

// --- The run-down (SPACEBAR-CLICKER.md §8.5) -----------------------------------
// Left alone, the reactor runs down on the save's clock (`tendedAt`): full
// output for a while after the last press or purchase, then less, then a
// fault, until ten presses on a beat restart it. The rules are pure
// (rundown.ts); this draws them: the face's --power and data-power, the label
// that stands in for the stage name, the hint, and the restart's marks.

type Power = 'full' | 'down' | 'fault';

/** The restart's beat, judged by the run's rhythm rules, so Metronome and Perfect Pitch widen it. */
const restart = new RestartTracker(() => modsOf(state).combo);
/** What the face shows, and the output it last drew, in whole percent. */
let power: Power = 'full';
let powerPct = 100;

const HINT = isTouchInput
  ? 'Tap the reactor to generate energy. Keep a steady beat to build a combo.'
  : 'Press the spacebar to generate energy. Keep a steady beat to build a combo.';
const HINT_DOWN = isTouchInput
  ? 'Tap the reactor once to bring it back to full power.'
  : 'Press once to bring the reactor back to full power.';
const HINT_FAULT = isTouchInput
  ? 'Tap the reactor on a steady beat to restart it.'
  : 'Press the spacebar on a steady beat to restart the reactor.';
const REACTOR_LABEL = reactor.getAttribute('aria-label') ?? '';
const REACTOR_LABEL_FAULT = `Reactor, faulted. Press the spacebar, or tap here, ${RESTART_PRESSES} times on a steady beat to restart it.`;

/** The combo that reaches the first tier, Steady. */
const FIRST_TIER_MIN = Math.min(...COMBO_TIERS.filter((t) => t.multiplier > 1).map((t) => t.min));

/**
 * The standing hint has done its work once the player has held a combo, in
 * any run: it goes, its line closes, and the face spreads the room it gives
 * up (`is-roomy`, in the page's CSS). The run-down's and the fault's
 * instructions always show, and take the line back while they do.
 */
function renderHint(): void {
  const retired = power === 'full' && state.bestCombo >= FIRST_TIER_MIN;
  hintEl.classList.toggle('is-retired', retired);
  reactor.classList.toggle('is-roomy', retired);
}

/** The share of full output now: 1, falling while the reactor is left alone, 0 at a fault. */
function powerShare(wall = Date.now()): number {
  return outputShare(untendedS(state, wall), modsOf(state).rundown);
}

function powerOf(wall = Date.now()): Power {
  if (isFaulted(state, wall)) return 'fault';
  return powerShare(wall) < 1 ? 'down' : 'full';
}

/**
 * Draw the reactor's power. Called every frame, it writes only what changed.
 * `live` is false on a page's first draw and on return from time away, where
 * the return's own announcement says what happened.
 */
function renderPower(wall = Date.now(), live = true): void {
  const next = powerOf(wall);
  if (next !== power) {
    power = next;
    if (next === 'full') delete reactor.dataset.power;
    else reactor.dataset.power = next;
    powerLabel.classList.toggle('is-fault', next === 'fault');
    setText(powerName, next === 'fault' ? 'Fault' : 'Running down');
    if (next !== 'full') replay(powerName, 'is-settling');
    powerLabel.hidden = next === 'full';
    stateLabelEl.hidden = next !== 'full';
    if (next !== 'full') surgeLabel.hidden = true;
    hintEl.textContent = next === 'fault' ? HINT_FAULT : next === 'down' ? HINT_DOWN : HINT;
    renderHint();
    reactor.setAttribute('aria-label', next === 'fault' ? REACTOR_LABEL_FAULT : REACTOR_LABEL);
    if (next === 'fault') {
      restart.reset();
      lightMarks(0);
      setSentence(powerDetail, ...restartDetail(0));
      if (live) announce('The reactor has faulted. Press on a steady beat to restart it.');
    }
    powerPct = -1;
  }
  // The run-down steps by whole percents, so the face fades smoothly without
  // a style write every frame.
  const pct =
    next === 'full'
      ? 100
      : next === 'fault'
        ? 0
        : Math.min(99, Math.max(1, Math.round(powerShare(wall) * 100)));
  if (pct !== powerPct) {
    powerPct = pct;
    reactor.style.setProperty('--power', String(pct / 100));
    if (next === 'down') setSentence(powerDetail, [`${pct}%`]);
  }
}

/** The fault's detail under the core: the presses left, and a word after a stumble. */
function restartDetail(count: number, stumbled = false): SentencePart[] {
  const left = RESTART_PRESSES - count;
  if (count === 0) return [[String(left)], ' presses on a beat to restart'];
  return [stumbled ? 'Off the beat: ' : '', [String(left)], ' to restart'];
}

/** Light the first `count` restart marks; the newest lands with a little weight. */
function lightMarks(count: number, ignite = false): void {
  restartMarks.forEach((mark, i) => mark.classList.toggle('is-lit', i < count));
  if (ignite && count > 0) replay(restartMarks[count - 1]!, 'is-igniting');
}

/**
 * A press on a faulted reactor earns nothing. It counts toward the restart
 * if it keeps the beat, and draws on the rhythm scope either way, so the
 * player can see their beat while they find it.
 */
function restartPress(now: number): void {
  const before = restart.count;
  const r = restart.press(now);
  blips.push({ t: now, kept: r.done || r.count === before + 1, pitch: false });
  if (reducedMotion()) drawScope(now);
  if (r.done) {
    completeRestart();
    return;
  }
  lightMarks(r.count, !r.startedOver);
  setSentence(powerDetail, ...restartDetail(r.count, r.startedOver));
  if (r.startedOver) announce('Off the beat. The restart starts again.');
}

/**
 * The tenth press on the beat: the ring of marks swells, a ring of light
 * rolls out from the core with the graticule's wash, and the color flows back
 * over the face's fade as the stage name settles.
 */
function completeRestart(): void {
  restartReactor(state, Date.now());
  lightMarks(RESTART_PRESSES);
  if (restartRing) replay(restartRing, 'is-complete');
  if (reducedMotion()) lightMarks(0);
  renderPower();
  replay(coreEl, 'is-stepped');
  replay(shockEl, 'is-firing');
  washFromCore();
  replay(stateEl, 'is-settling');
  toast('Reactor restarted');
  announce('Reactor restarted. Back to full power.');
  SOUND.restart();
  dirty = true;
  save();
}

restartRing?.addEventListener('animationend', (e) => {
  if (e.target !== restartRing) return;
  restartRing.classList.remove('is-complete');
  lightMarks(0);
});

/** A press or a purchase brought a run-down reactor back: the color returns over the fade. */
function onRecovered(): void {
  renderPower();
  replay(stateEl, 'is-settling');
  spawnRimFloat('Full power');
  announce('Back to full power.');
}

/** A purchase tends the reactor as a press does. A faulted one still needs its restart. */
function tendReactor(): void {
  const wall = Date.now();
  const wasDown = powerOf(wall) === 'down';
  if (tend(state, wall) && wasDown) onRecovered();
}

// --- Rendering ------------------------------------------------------------------

/** How long energy earned while away takes to count into the readout. */
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
  const energyText = formatEnergy(shown);
  energyEl.textContent = energyText;
  // Six characters, 10,000 to 99,999: the widest the number gets (the page's
  // CSS steps it down a size under a sixth perk socket).
  energyEl.classList.toggle('is-long', energyText.length >= 6);
  const play = playContext();
  // The rates the reactor runs at now: run down, less; faulted, nothing.
  epsEl.textContent = formatRate(energyPerSecond(state, play) * powerShare());
  eppEl.textContent = formatEnergy(power === 'fault' ? 0 : energyPerPress(state, play));
}

/**
 * The bar under the readouts (§8.5.10): the player's share of the last few
 * seconds' energy, their presses, surges and what their combo adds to the
 * auto-tappers, against the auto-tappers' own. It shows once the run has
 * auto-tappers; on a fault, when nothing earns, the stylesheet stands it down.
 */
function renderShare(now = performance.now()): void {
  const value = share.share(now);
  shareRow.classList.toggle(
    'is-shown',
    value !== null && AUTO_TAPPERS.some((t) => state.tappers[t.id] > 0)
  );
  if (value === null) return;
  const pct = Math.round(value * 100);
  if (pct !== sharePct) {
    sharePct = pct;
    shareYouEl.textContent = `${pct}%`;
    shareMachinesEl.textContent = `${100 - pct}%`;
  }
  const fraction = value.toFixed(3);
  if (fraction !== shareFraction) {
    shareFraction = fraction;
    shareRow.style.setProperty('--share', fraction);
  }
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
  washFromCore();

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

/** The graticule lights in a band travelling out from the core: a stage reached, or a restart. */
function washFromCore(): void {
  const face = reactor.getBoundingClientRect();
  const core = coreEl.getBoundingClientRect();
  washEl.style.setProperty('--wash-x', `${core.left - face.left + core.width / 2}px`);
  washEl.style.setProperty('--wash-y', `${core.top - face.top + core.height / 2}px`);
  replay(washEl, 'is-washing');
}

function renderCombo(now: number): void {
  const mods = modsOf(state);
  const { tiers, comboOff } = mods;
  // Synchronisation, or Full Sync, shares the tier with the auto-tappers: a
  // line under the multiplier says what it gives them (§8.5.10).
  comboMeter.classList.toggle('is-synced', mods.syncShare > 0 && !comboOff);
  // Brute Force: the beat still draws on the scope, but the combo stands down.
  // So it does on a faulted reactor until the restart.
  const standDown = comboOff || power === 'fault';
  comboMeter.classList.toggle('is-off', standDown);
  if (standDown) {
    setText(comboEl, '0');
    setText(comboTierEl, 'combo');
    comboTierEl.classList.remove('is-tiered');
    setText(comboNextEl, comboOff ? `off with ${perk('brute-force').name}` : 'after the restart');
    setText(comboMultEl, 'x1');
    setText(comboSyncMultEl, 'x1');
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
  setText(comboSyncMultEl, formatMultiplier(syncMultiplier(combo.combo, mods)));
  comboFill.style.transform = `scaleX(${combo.graceRemaining(now)})`;
}

/**
 * Synchronisation's shop row, until it is bought (§8.5.12): what it would add
 * to the auto-tappers each second at the player's combo tier, or at the first
 * tier while they have none, so the number climbs with the combo. Hidden
 * where it would add nothing even at the top tier: no auto-tappers yet,
 * Brute Force, or Full Sync sharing more.
 */
function renderSyncPreview(): void {
  if (!syncPreview) return;
  const tiered = modsOf(state).tiers.filter((t) => t.multiplier > 1);
  const top = tiered[0];
  const first = tiered[tiered.length - 1];
  const shown = !!top && syncGain(state, top.min) > 0;
  syncPreview.hidden = !shown;
  if (!shown) return;
  const at = tiered.find((t) => combo.combo >= t.min) ?? first!;
  setSentence(
    syncPreview,
    [`+${formatRate(syncGain(state, at.min))}`],
    ` per second at ${at.label}`
  );
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

  renderSyncPreview();

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

/** "rare rhythm perk": rarity and family, for a screen reader. */
function perkKindSpoken(def: PerkDef): string {
  return `${def.rarity} ${PERK_FAMILY_NAMES[def.family].toLowerCase()} perk`;
}

/** A held perk in full, for its shelf chip's accessible name. */
function perkLabel(id: PerkId, level: number): string {
  const def = perk(id);
  return `${def.name}, level ${level}, ${perkKindSpoken(def)}. ${perkDetail(def, level)}`;
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
 * given. The swap dialog uses it; its cards are buttons when the player is
 * picking one to drop.
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

/**
 * A perk card for the swap dialog: name, level and effect, and at its end its
 * rarity when it is a rare or a keystone. The perk on offer also shows its
 * price there, and names a common too.
 */
function swapCard(id: PerkId, level: number, asButton = false, price?: number): HTMLElement {
  const def = perk(id);
  const card = perkCard(
    id,
    level,
    [cardLine('perk-card-detail', perkEffect(def, level))],
    asButton
  );
  const end = document.createElement('span');
  end.className = 'perk-card-end';
  if (price !== undefined) {
    const cost = document.createElement('span');
    cost.className = 'perk-card-cost readout';
    cost.textContent = formatEnergy(price);
    end.append(cost);
  }
  if (price !== undefined || def.rarity !== 'common') {
    const rarity = document.createElement('span');
    rarity.className = 'perk-card-rarity';
    rarity.textContent = PERK_RARITY_NAMES[def.rarity];
    end.append(rarity);
  }
  if (end.childElementCount) card.append(end);
  return card;
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

// A shelf's tooltip: a perk chip's, by its slot, or the isotope badge's. It shows for whatever is under a mouse, else what has keyboard
// focus, else what was last tapped. Escape dismisses it until the next hover,
// focus or tap.
type TipTarget = number | 'badge';
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
  renderIsotopeTip(target === 'badge');
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

/**
 * The badge's tooltip. Before a reset opens: the isotopes held and what they
 * are worth, how far off a reset is, then the track's next unlock. Once one
 * is open: what it pays now, what it unlocks, and where the next comes.
 */
function renderIsotopeTip(shown: boolean): void {
  isotopeTip.hidden = !shown;
  if (!shown) {
    isotopeTipShown = '';
    return;
  }
  const held = state.isotopes;
  const gain = prestigeGain(state.runLifetime);
  const next = nextIsotopeAt(state.runLifetime);
  const toGo = gain > 0 ? '' : formatEnergy(next - state.runLifetime);
  const key = `${held}:${gain}:${toGo}:${JSON.stringify(state.forks)}`;
  if (key === isotopeTipShown) return;
  isotopeTipShown = key;

  // The track's line: the next unlock, or what this reset unlocks.
  let unlock: Node[] = [];
  if (gain === 0) {
    const rate = Math.round(isotopeRate(held, state.forks) * 100);
    isotopeTipName.textContent = held > 0 ? isotopeCount(held) : 'Isotopes';
    isotopeTipKind.textContent =
      held > 0 ? `${bonusText(held)} to all gains` : `Each adds ${rate}% to all gains`;
    isotopeTipDetail.textContent =
      held > 0
        ? `Each one adds ${rate}% to everything you earn, and they last through every reset. A reset opens at ${formatEnergy(next)} energy: ${toGo} to go.`
        : `Resetting the experiment pays them, and they last through every reset. The first comes at ${formatEnergy(next)} energy: ${toGo} to go.`;
    const step = nextSteps(held, 1)[0];
    unlock = step
      ? [text(`Next at ${isotopeCount(step.isotopes)}: `), ...unlockNodes([step]), text('.')]
      : [text('Every rung of the isotope track is unlocked.')];
  } else {
    isotopeTipName.textContent = `Reset now for ${isotopeCount(gain)}`;
    isotopeTipKind.textContent = `${bonusText(held)} now, ${bonusText(held + gain)} after`;
    isotopeTipDetail.textContent = `The next isotope comes at ${formatEnergy(next)} energy this run. Click to open the Isotopes tab.`;
    const steps = stepsReached(held, held + gain);
    if (steps.length > 0) unlock = [text('Unlocks '), ...unlockNodes(steps), text('.')];
  }
  isotopeTipUnlock.hidden = unlock.length === 0;
  isotopeTipUnlock.replaceChildren(...unlock);
  // An open reset's hook is what it unlocks, so it leads; the next unlock follows.
  if (gain === 0) isotopeTipDetail.after(isotopeTipUnlock);
  else isotopeTipDetail.before(isotopeTipUnlock);
  // The caret points at the ring, and stays clear of the corner.
  const anchor = isotopeDial.getBoundingClientRect();
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
wireTip(isotopeBadge, 'badge', openResetTab);

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
 * The badge's way in: select the Isotopes tab and bring it into
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
  else isotopeBadge.blur();
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

/** The Perks panel: this run's perks as cards, then the codex board and its reading card. */
function renderPerksPanel(): void {
  const { owned, codex } = state.perks;
  const slots = modsOf(state).perkSlots;
  const key = JSON.stringify([slots, owned, codex]);
  if (key === perksPanelShown) return;
  perksPanelShown = key;

  perksSlotsEl.textContent = `${owned.length} of ${slots}`;
  perksEmptyEl.hidden = owned.length > 0;
  perksRunEl.replaceChildren(...owned.map((o) => runCard(o.id, o.level)));

  const isFound = (p: PerkDef) => codex[p.id] !== undefined;
  codexCountEl.textContent = `${PERKS.filter(isFound).length} of ${PERKS.length}`;
  for (const tab of SHOP_TABS) {
    const inTab = PERKS.filter((p) => p.tab === tab);
    codexTabCounts[tab].textContent = `${inTab.filter(isFound).length} of ${inTab.length}`;
  }
  codexSockets.forEach(renderSocket);
  renderCodexRead();
}

/** A perk held this run as a card: tile, name and level, a quiet rarity, then its effect. */
function runCard(id: PerkId, level: number): HTMLLIElement {
  const def = perk(id);
  const item = document.createElement('li');
  item.className = 'run-card';
  item.dataset.family = def.family;
  item.dataset.rarity = def.rarity;

  const tile = document.createElement('span');
  tile.className = 'perk-tile';
  tile.append(perkGlyph(id));
  const name = document.createElement('span');
  name.className = 'run-card-name';
  const badge = document.createElement('span');
  badge.className = 'perk-level';
  setLevelBadge(badge, level);
  // Rarity and family in words for a screen reader; on screen, the hue and the rarity word.
  const kind = document.createElement('span');
  kind.className = 'visually-hidden';
  kind.textContent = `, ${perkKindSpoken(def)}`;
  name.append(def.name, ' ', badge, kind);
  const head = document.createElement('div');
  head.className = 'run-card-head';
  head.append(tile, name);
  if (def.rarity !== 'common') {
    const rarity = document.createElement('span');
    rarity.className = 'run-card-rarity';
    rarity.setAttribute('aria-hidden', 'true');
    rarity.textContent = PERK_RARITY_NAMES[def.rarity];
    head.append(rarity);
  }
  item.append(head, cardLine('perk-card-detail', perkEffect(def, level)));
  return item;
}

/**
 * The codex board's sockets, built once in a fixed order: a row per shop tab,
 * in family bands. Rendering only updates them, so keyboard focus survives a
 * perk being found. A socket's tile stays empty until its perk is found, so
 * an undiscovered one gives away only its rarity's shape and its band.
 */
interface CodexSocket {
  def: PerkDef;
  button: HTMLButtonElement;
  /** What it shows, as "best:held this run". */
  shown: string;
}

const codexSockets: CodexSocket[] = [];
for (const tab of SHOP_TABS) {
  for (const family of Object.keys(PERK_FAMILY_NAMES) as PerkFamily[]) {
    const defs = PERKS.filter((p) => p.tab === tab && p.family === family);
    if (!defs.length) continue;
    const band = document.createElement('div');
    band.className = 'codex-band';
    for (const def of defs) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'codex-socket';
      button.dataset.rarity = def.rarity;
      button.tabIndex = -1;
      const tile = document.createElement('span');
      tile.className = 'perk-tile';
      button.append(tile);
      band.append(button);
      codexSockets.push({ def, button, shown: '' });
    }
    codexRows[tab].append(band);
  }
}

/** How far a found perk was held: "Held this run, level 3", "Held up to level 2", "Found, never held". */
function codexStatus(best: number, now: number): string {
  if (now > 0) return `Held this run, level ${now}`;
  return best > 0 ? `Held up to level ${best}` : 'Found, never held';
}

/** A socket lit once its perk is found, dimmer if never held, with a dot if held this run. */
function renderSocket(socket: CodexSocket): void {
  const { def, button } = socket;
  const best = state.perks.codex[def.id];
  const now = perkLevel(state, def.id);
  const key = `${best}:${now}`;
  if (key === socket.shown) return;
  socket.shown = key;

  const found = best !== undefined;
  button.classList.toggle('is-undiscovered', !found);
  button.classList.toggle('is-unheld', best === 0);
  button.classList.toggle('is-now', now > 0);
  if (found) button.dataset.family = def.family;
  else delete button.dataset.family;
  button.firstElementChild!.replaceChildren(...(found ? [perkGlyph(def.id)] : []));
  button.setAttribute(
    'aria-label',
    found
      ? `${def.name}, ${perkKindSpoken(def)}, ${codexStatus(best, now).toLowerCase()}. ${perkDetailAllLevels(def)}`
      : `Undiscovered ${def.rarity} perk`
  );
}

/**
 * Which socket the reading card shows: the one under the mouse, else the one
 * picked by a click, a tap or keyboard focus. None: what the codex is.
 */
let codexHover: number | null = null;
let codexPicked: number | null = null;

function renderCodexRead(): void {
  const shown = codexHover ?? codexPicked;
  // One Tab stop for the board: the picked socket, else the first.
  const stop = codexPicked ?? 0;
  codexSockets.forEach((s, i) => {
    s.button.classList.toggle('is-shown', i === shown);
    s.button.tabIndex = i === stop ? 0 : -1;
  });
  codexReadEmpty.hidden = shown !== null;
  codexReadPerk.hidden = shown === null;
  if (shown !== null) fillCodexRead(codexSockets[shown]!.def);
}

/**
 * The reading card for one perk: its tile, name, rarity and family, the
 * effect at the level held this run (else the best held, else the first),
 * every level's number with those held filled, and how far it was held. An
 * undiscovered perk shows only its rarity and where it drops.
 */
function fillCodexRead(def: PerkDef): void {
  const best = state.perks.codex[def.id];
  const now = perkLevel(state, def.id);
  const card = codexReadPerk;
  const tile = document.createElement('span');
  tile.className = 'perk-tile';
  const text = document.createElement('div');
  text.className = 'codex-read-text';
  const title = (name: string, kind: string) => {
    const line = document.createElement('p');
    line.className = 'codex-read-name';
    const kindEl = document.createElement('span');
    kindEl.className = 'codex-read-kind';
    kindEl.textContent = kind;
    line.append(name, ' ', kindEl);
    return line;
  };

  card.dataset.rarity = def.rarity;
  card.classList.toggle('is-undiscovered', best === undefined);
  if (best === undefined) {
    delete card.dataset.family;
    text.append(
      title('Undiscovered', PERK_RARITY_NAMES[def.rarity]),
      cardLine(
        'perk-card-detail',
        `Not found yet. It drops into the shop's ${TAB_NAME[def.tab]} tab.`
      )
    );
    card.replaceChildren(tile, text);
    return;
  }

  card.dataset.family = def.family;
  tile.append(perkGlyph(def.id));
  const quoted = now || Math.max(best, 1);
  const ladder = document.createElement('ol');
  ladder.className = 'codex-ladder';
  def.values.forEach((v, k) => {
    const step = document.createElement('li');
    step.classList.toggle('is-held', k + 1 <= best);
    step.classList.toggle('is-quoted', best > 0 && k + 1 === quoted);
    const num = document.createElement('span');
    num.className = 'codex-ladder-num';
    num.setAttribute('aria-hidden', 'true');
    num.textContent = ROMAN[k + 1]!;
    const spoken = document.createElement('span');
    spoken.className = 'visually-hidden';
    spoken.textContent = `Level ${k + 1}: `;
    step.append(num, spoken, formatPerkValue(def.unit, v));
    ladder.append(step);
  });
  const status = document.createElement('span');
  status.className = 'codex-read-status';
  status.textContent = codexStatus(best, now);
  const foot = document.createElement('div');
  foot.className = 'codex-read-foot';
  foot.append(ladder, status);
  text.append(
    title(def.name, perkKind(def)),
    cardLine('perk-card-detail', perkEffect(def, quoted)),
    foot
  );
  card.replaceChildren(tile, text);
}

/** Arrow keys along the board: left and right through every socket, up and down between rows. */
function codexStep(i: number, key: string): number | null {
  const last = codexSockets.length - 1;
  const firstAuto = codexSockets.findIndex((s) => s.def.tab === 'auto');
  const inPress = i < firstAuto;
  switch (key) {
    case 'ArrowRight':
      return i < last ? i + 1 : null;
    case 'ArrowLeft':
      return i > 0 ? i - 1 : null;
    case 'Home':
      return 0;
    case 'End':
      return last;
    case 'ArrowDown':
      return inPress ? Math.min(firstAuto + i, last) : null;
    case 'ArrowUp':
      return inPress ? null : Math.min(i - firstAuto, firstAuto - 1);
    default:
      return null;
  }
}

codexSockets.forEach((socket, i) => {
  const { button } = socket;
  button.addEventListener('pointerenter', (e) => {
    if (e.pointerType !== 'mouse') return;
    codexHover = i;
    renderCodexRead();
  });
  button.addEventListener('focus', () => {
    if (!button.matches(':focus-visible')) return;
    codexPicked = i;
    renderCodexRead();
  });
  button.addEventListener('click', (e) => {
    // From the keyboard (no pointer), focus has already picked it.
    if (e.detail === 0) return;
    // A click or tap picks it; a second one lets go.
    codexPicked = codexPicked === i ? null : i;
    renderCodexRead();
    // Space is the game's input; a focused button would swallow it.
    button.blur();
  });
  button.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && codexPicked !== null) {
      codexPicked = null;
      renderCodexRead();
      return;
    }
    const next = codexStep(i, e.key);
    if (next === null) return;
    e.preventDefault();
    codexSockets[next]!.button.focus();
  });
});

codexBoard.addEventListener('pointerleave', (e) => {
  if (e.pointerType !== 'mouse' || codexHover === null) return;
  codexHover = null;
  renderCodexRead();
});

function renderStats(): void {
  const play = { combo: combo.combo };
  statEls.presses.textContent = state.totalPresses.toLocaleString('en-US');
  statEls.run.textContent = formatEnergy(state.runLifetime);
  statEls.lifetime.textContent = formatEnergy(state.totalLifetime);
  statEls.eps.textContent = formatRate(energyPerSecond(state, play));
  statEls.epp.textContent = formatEnergy(energyPerPress(state, play));
  statEls.share.textContent = sharePct >= 0 && power !== 'fault' ? `${sharePct}%` : '—';
  statEls.bestCombo.textContent = String(state.bestCombo);
  statEls.bestSurge.textContent = state.surges ? state.bestSurgeCps.toFixed(1) : '—';
  statEls.bestRun.textContent = formatEnergy(bestRun(state));
  statEls.fastestMillion.textContent =
    state.bestMillionS === null ? '—' : formatDuration(state.bestMillionS);
  statEls.isotopes.textContent = state.isotopes
    ? `${state.isotopes}, ${bonusText(state.isotopes)}`
    : '0';
  statEls.prestiges.textContent = String(state.prestiges);
  statEls.played.textContent = formatDuration(state.playedS);
}

/** A count toward a badge: whole, or to one place for a surge's presses per second. */
function progressCount(value: number): string {
  return Number.isInteger(value) ? value.toLocaleString('en-US') : value.toFixed(1);
}

/**
 * The Achievements tab: each badge earned or not, and for a badge not yet
 * earned that has a count, how far along it is (SPACEBAR-CLICKER.md §8.5.18).
 */
function renderAchievements(): void {
  const unlocked = new Set<string>(state.achievements);
  document.querySelectorAll<HTMLElement>('.achievement').forEach((item) => {
    const id = item.dataset.id as AchievementId;
    const hit = unlocked.has(id);
    item.classList.toggle('is-unlocked', hit);
    const status = item.querySelector<HTMLElement>('.achievement-state');
    if (status) setText(status, hit ? ', unlocked' : ', locked');
    const row = item.querySelector<HTMLElement>('.achievement-progress');
    if (!row) return;
    const progress = hit ? null : achievementProgress(state, id);
    row.hidden = progress === null;
    if (!progress) return;
    const fill = row.querySelector<HTMLElement>('.achievement-fill');
    const count = row.querySelector<HTMLElement>('.achievement-count');
    if (fill) fill.style.transform = `scaleX(${progress.have / progress.need})`;
    if (count) setText(count, `${progressCount(progress.have)} of ${progressCount(progress.need)}`);
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
 * The Isotopes tab's card (SPACEBAR-CLICKER.md §8.5.19). On one side what the
 * player holds: the count and what it adds to every gain. On the other the
 * reset: once one is open, what it pays, the gains before and after, what it
 * unlocks, and the button; before, what the next reset will unlock. Under
 * both, the way to the next isotope.
 */
function renderPrestige(): void {
  const held = state.isotopes;
  const gain = prestigeGain(state.runLifetime);
  const ready = prestigeUnlocked(state);
  // What a reset is, until the player has made one.
  resetIntro.hidden = state.prestiges > 0 || held > 0;
  prestigeTiles.classList.toggle('is-open', ready);
  prestigeTiles.classList.toggle('has-isotopes', held > 0);
  prestigePays.hidden = !ready;
  prestigeBtn.hidden = !ready;
  setText(prestigeLabel, ready ? 'A reset now pays' : 'Next reset');

  setText(prestigeHeld, String(held));
  setText(prestigeHeldTitle, held ? isotopeCount(held) : 'No isotopes yet');
  // With none held, what one is worth, rather than "+0%".
  if (held) setSentence(prestigeBonus, [bonusText(held)], ' to all gains');
  else
    setSentence(
      prestigeBonus,
      'Each adds ',
      [`${Math.round(isotopeRate(held, state.forks) * 100)}%`],
      ' to all gains'
    );

  if (ready) {
    const next = nextIsotopeAt(state.runLifetime);
    setText(prestigeGainValue, `+${gain}`);
    setText(prestigeTo, isotopeNoun(gain));
    // The gains before and after; with none held there is no before.
    prestigeFromWrap.hidden = held === 0;
    setText(prestigeFrom, bonusText(held));
    setText(prestigeAfter, bonusText(held + gain));
    setSentence(prestigeNext, 'Next isotope at ', [formatEnergy(next)], ' energy');
    setSentence(prestigeProgress, [formatEnergy(next - state.runLifetime)], ' to go');
  } else {
    setSentence(prestigeNext, 'Reset opens at ', [formatEnergy(PRESTIGE_UNLOCK)], ' energy');
    setSentence(prestigeProgress, [formatEnergy(PRESTIGE_UNLOCK - state.runLifetime)], ' to go');
  }
  // Open, what this reset unlocks; closed, what any reset would: the next rung.
  const steps = ready ? stepsReached(held, held + gain) : nextSteps(held, 1);
  renderResetUnlocks(steps, ready);
  isotopeMeter.style.transform = `scaleX(${isotopeFill(state.runLifetime)})`;
  renderTrack();
}

/** The steps the unlock line names, so it is rebuilt only when they change. */
let unlocksShown = '';

/**
 * In the card, what a reset unlocks, its rungs named in the isotopes' blue:
 * "Unlocks Lucky Find." once one is open, "The next reset unlocks Lucky
 * Find." before.
 */
function renderResetUnlocks(steps: readonly TrackStep[], open: boolean): void {
  const key = `${open}:${steps.map((s) => s.isotopes).join()}`;
  if (key === unlocksShown) return;
  unlocksShown = key;
  prestigeUnlocks.hidden = steps.length === 0;
  const lead = open ? 'Unlocks ' : 'The next reset unlocks ';
  prestigeUnlocks.replaceChildren(
    ...(steps.length > 0 ? [text(lead), ...unlockNodes(steps), text('.')] : [])
  );
}

// The isotope track in the Isotopes tab (SPACEBAR-CLICKER.md §8.5.19): a rail
// of twelve rungs and one card that reads a rung, as the Perks tab's codex
// board and its reading card do.

type RungStatus = 'lit' | 'next' | 'hidden';

/** A rung on the rail: its step, where it stands, and its button. */
interface RailNode {
  step: TrackStep;
  status: RungStatus;
  /** A held fork's pick, if one is saved. */
  pick: RungId | undefined;
  button: HTMLButtonElement;
}

let railNodes: RailNode[] = [];

/** What the track shows, as the isotopes held and the picks. */
let trackShown = '';

/**
 * Which rung the reading card shows: the one under the mouse, else the one
 * picked by a click, a tap or keyboard focus, else the next unlock, or the
 * last rung once every one is held.
 */
let trackHover: number | null = null;
let trackPicked: number | null = null;
/** What the reading card last drew, so it is rebuilt only on a change. */
let trackReadShown = '';

/** A node whose words only the eye needs. */
function visualLine(className: string, content: string | Node[]): HTMLElement {
  const node = cardLine(className, content);
  node.setAttribute('aria-hidden', 'true');
  return node;
}

/** A rung's gem with its number: a circle, or a fork's diamond. */
function trackGem(step: TrackStep): HTMLElement {
  return visualLine('track-gem', [cardLine('track-gem-num', String(step.isotopes))]);
}

/** The words under a rung on the rail: its name, a fork's pick, or both of a fork's names. */
function railName(step: TrackStep, status: RungStatus, pick: RungId | undefined): string {
  if (status === 'hidden') return '';
  if (!isFork(step)) return step.rungs[0].name;
  return pick ? rung(pick).name : stepName(step);
}

/** A rung's name for a screen reader: where it sits, its state, and what it does. */
function railLabel(step: TrackStep, status: RungStatus, pick: RungId | undefined): string {
  const where = `At ${isotopeCount(step.isotopes)}`;
  if (status === 'hidden') return `${where}: not revealed yet.`;
  const lead = `${where}, ${status === 'lit' ? 'unlocked' : 'next'}: `;
  if (!isFork(step)) return `${lead}${step.rungs[0].name}. ${rungSentence(step.rungs[0].id)}`;
  return (
    lead +
    step.rungs
      .map((r) => `${r.name}${r.id === pick ? ', your pick' : ''}. ${rungSentence(r.id)}`)
      .join(' Or ')
  );
}

/**
 * The rail, rebuilt when the isotopes held or the picks change: a rung a
 * column, in order, lit to the isotopes held, the next two rimmed and named,
 * the rest dashed with only their number.
 */
function renderTrack(): void {
  const held = state.isotopes;
  const key = `${held}:${JSON.stringify(state.forks)}`;
  if (key === trackShown) return;
  trackShown = key;

  const next = nextSteps(held);
  const unlocked = ISOTOPE_TRACK.filter((s) => s.isotopes <= held).length;
  trackCount.textContent = `${unlocked} of ${ISOTOPE_TRACK.length}`;
  // The line is lit from the first rung to the last one held.
  trackGrid.style.setProperty(
    '--done',
    String(Math.max(0, unlocked - 1) / (ISOTOPE_TRACK.length - 1))
  );

  railNodes = ISOTOPE_TRACK.map((step, i) => {
    const status: RungStatus =
      step.isotopes <= held ? 'lit' : next.includes(step) ? 'next' : 'hidden';
    const saved = state.forks[step.isotopes];
    const pick = status === 'lit' && saved && isPickFor(step.isotopes, saved) ? saved : undefined;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'track-node';
    button.tabIndex = -1;
    button.setAttribute('aria-label', railLabel(step, status, pick));
    button.append(trackGem(step), visualLine('track-card-name', railName(step, status, pick)));
    wireRailNode(button, i);
    return { step, status, pick, button };
  });
  trackGrid.replaceChildren(
    ...railNodes.map((node) => {
      const item = document.createElement('li');
      item.className = `track-card is-${node.status}`;
      item.dataset.isotopes = String(node.step.isotopes);
      if (isFork(node.step)) item.dataset.fork = '';
      item.append(node.button);
      return item;
    })
  );
  trackHover = null;
  trackPicked = null;
  trackReadShown = '';
  renderTrackRead();
}

/** The rung read when none is pointed at or picked: the next unlock, else the last rung. */
function defaultRung(): number {
  const next = railNodes.findIndex((n) => n.status === 'next');
  return next >= 0 ? next : railNodes.length - 1;
}

function renderTrackRead(): void {
  if (railNodes.length === 0) return;
  const shown = trackHover ?? trackPicked ?? defaultRung();
  // One Tab stop for the rail: the picked rung, else the one read.
  const stop = trackPicked ?? shown;
  railNodes.forEach((node, i) => {
    node.button.classList.toggle('is-shown', i === shown);
    node.button.tabIndex = i === stop ? 0 : -1;
  });
  if (trackReadShown === String(shown)) return;
  trackReadShown = String(shown);
  fillTrackRead(railNodes[shown]!);
}

/**
 * The reading card for one rung: its gem, its name and state, and what it
 * does. A fork shows both options side by side, the pick marked, and when
 * it is picked. A rung not yet revealed says only where it sits.
 */
function fillTrackRead({ step, status, pick }: RailNode): void {
  trackRead.className = `track-read is-${status}`;
  if (isFork(step)) trackRead.dataset.fork = '';
  else delete trackRead.dataset.fork;
  const tag = (words: string) => cardLine('track-card-tag', words);
  const head = (name: string, standing: string) =>
    cardLine('track-read-head', [text(name), ...(standing ? [tag(standing)] : [])]);
  const standing = status === 'lit' ? 'Unlocked' : status === 'next' ? 'Next' : '';
  const lines: HTMLElement[] = [];

  if (status === 'hidden') {
    lines.push(
      head(`At ${isotopeCount(step.isotopes)}`, ''),
      cardLine('track-card-detail', 'Not revealed yet.')
    );
  } else if (!isFork(step)) {
    const r = step.rungs[0];
    lines.push(head(r.name, standing), cardLine('track-card-detail', rungSentence(r.id)));
  } else {
    const options = cardLine(
      'track-options',
      step.rungs.map((r) => {
        const option = cardLine('track-option', [
          cardLine('track-card-name', [
            text(r.name),
            ...(r.id === pick ? [cardLine('track-option-pick', 'Your pick')] : []),
          ]),
          cardLine('track-card-detail', rungSentence(r.id)),
        ]);
        option.dataset.rung = r.id;
        option.classList.toggle('is-picked', r.id === pick);
        return option;
      })
    );
    lines.push(
      head('A fork: a choice of two', standing),
      options,
      cardLine(
        'track-read-note',
        status === 'lit' && !pick
          ? 'Pick one when you next reset the experiment.'
          : 'You pick when a reset first reaches it, and can switch at any reset after.'
      )
    );
  }
  trackRead.replaceChildren(trackGem(step), cardLine('track-read-text', lines));
}

/** The rung an arrow key moves to along the rail, or null when the key is not one of ours. */
function railStep(i: number, key: string): number | null {
  const last = railNodes.length - 1;
  switch (key) {
    case 'ArrowRight':
      return Math.min(i + 1, last);
    case 'ArrowLeft':
      return Math.max(i - 1, 0);
    case 'Home':
      return 0;
    case 'End':
      return last;
    default:
      return null;
  }
}

/** A rung's button: hover reads it, a click, a tap or keyboard focus picks it. */
function wireRailNode(button: HTMLButtonElement, i: number): void {
  button.addEventListener('pointerenter', (e) => {
    if (e.pointerType !== 'mouse') return;
    trackHover = i;
    renderTrackRead();
  });
  button.addEventListener('focus', () => {
    if (!button.matches(':focus-visible')) return;
    trackPicked = i;
    renderTrackRead();
  });
  button.addEventListener('click', (e) => {
    // From the keyboard (no pointer), focus has already picked it.
    if (e.detail === 0) return;
    // A click or tap picks it; a second one lets go.
    trackPicked = trackPicked === i ? null : i;
    renderTrackRead();
    // Space is the game's input; a focused button would swallow it.
    button.blur();
  });
  button.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && trackPicked !== null) {
      trackPicked = null;
      renderTrackRead();
      return;
    }
    const next = railStep(i, e.key);
    if (next === null) return;
    e.preventDefault();
    railNodes[next]!.button.focus();
  });
}

trackGrid.addEventListener('pointerleave', (e) => {
  if (e.pointerType !== 'mouse' || trackHover === null) return;
  trackHover = null;
  renderTrackRead();
});

function renderPanels(): void {
  renderStats();
  renderAchievements();
  renderPerksPanel();
  renderPrestige();
}

/** What a reset paid when the badge last drew, so a rise can pop the tag; null before the first draw. */
let shelfGain: number | null = null;

/** The count the badge shows while a reset's isotopes fly to it; null otherwise. */
let badgeHold: number | null = null;

/**
 * The isotope badge: the count held (a waiting bead before the first), the
 * ring filling toward the next isotope, the "+N" tag once a reset is open,
 * and two lines: "13 isotopes" over "next in 600K", "First isotope" over
 * "600K to go" before any is held, and "Reset for +1" once a reset is open.
 * Runs on the panel tick, so it only touches what changed.
 */
function renderShelf(): void {
  const held = state.isotopes;
  const shown = badgeHold ?? held;
  const gain = prestigeGain(state.runLifetime);
  const open = gain > 0;
  isotopeBadge.classList.toggle('is-open', open);

  isotopeCountEl.hidden = shown === 0;
  isotopeSeed.hidden = shown > 0;
  const count = String(shown);
  if (isotopeCountEl.textContent !== count) {
    isotopeCountEl.textContent = count;
    isotopeCountEl.dataset.digits = String(count.length);
  }

  isotopeTag.hidden = !open;
  if (open) setText(isotopeTag, `+${gain}`);
  if (shelfGain !== null && gain > shelfGain) {
    // A reset just opened, or pays one more: the tag grows in, or pops. The
    // other motion's class goes first, since the tag keeps its last one
    // through a hidden run.
    isotopeTag.classList.remove('is-arriving', 'is-up');
    replay(isotopeTag, shelfGain === 0 ? 'is-arriving' : 'is-up');
  }

  const toGo = formatEnergy(nextIsotopeAt(state.runLifetime) - state.runLifetime);
  setText(isotopeNameEl, shown > 0 ? isotopeCount(shown) : 'First isotope');
  setText(
    isotopeProgressEl,
    open ? `Reset for +${gain}` : shown > 0 ? `next in ${toGo}` : `${toGo} to go`
  );

  const label = badgeLabel(held, gain);
  if (isotopeBadge.getAttribute('aria-label') !== label) {
    isotopeBadge.setAttribute('aria-label', label);
  }
  renderRing(gain);
  shelfGain = gain;
  fitShelves();
  renderTip();
}

/**
 * The badge's name for screen readers: what the isotopes held are worth, then
 * the next reset, by its thresholds rather than the energy to go, so the name
 * doesn't change with every press.
 */
function badgeLabel(held: number, gain: number): string {
  const worth =
    held > 0
      ? `${isotopeCount(held)}, ${bonusText(held)} to all gains, kept through every reset.`
      : 'No isotopes yet. Resetting the experiment pays them, and they last through every reset.';
  if (gain > 0) {
    const steps = stepsReached(held, held + gain);
    const unlocks = steps.length > 0 ? ` and unlocking ${unlockWords(steps)}` : '';
    const next = formatEnergy(nextIsotopeAt(state.runLifetime));
    return `${worth} Reset the experiment now for ${isotopeCount(gain)}, taking all gains to ${bonusText(held + gain)}${unlocks}. The next isotope comes at ${next} energy.`;
  }
  const step = nextSteps(held, 1)[0];
  const unlock = step
    ? ` Next unlock at ${isotopeCount(step.isotopes)}: ${unlockWords([step])}.`
    : '';
  return `${worth} A reset opens at ${formatEnergy(PRESTIGE_UNLOCK)} energy.${unlock}`;
}

/** The room the two shelves keep between them. */
const SHELF_GAP = 12;
/** The room the badge's lines take beside the ring: their gap and fixed width. */
const LINES_ROOM = 96;

/**
 * On a narrow face the perk shelf can come near the badge. Measured against
 * the ring, which never moves: when the lines wouldn't fit before the perk
 * shelf, they go and the ring stands alone; when even the ring wouldn't, the
 * wrap is marked stacked and the perk shelf drops below the badge.
 */
function fitShelves(): void {
  let compact = false;
  let stacked = false;
  if (!perkShelf.hidden) {
    const ring = isotopeDial.getBoundingClientRect().right;
    const perks = perkShelf.getBoundingClientRect().left;
    compact = ring + LINES_ROOM + SHELF_GAP > perks;
    stacked = ring + SHELF_GAP > perks;
  }
  reactorWrap.classList.toggle('is-compact', compact);
  reactorWrap.classList.toggle('is-stacked', stacked);
}

new ResizeObserver(fitShelves).observe(reactorWrap);

/**
 * The ring's fill toward the next isotope, on a cube-root scale before a
 * reset opens (`isotopeFill`). A fresh count starts it empty at once rather
 * than winding back.
 */
function renderRing(gain: number): void {
  if (!isotopeRing) return;
  const offset = (100 * (1 - isotopeFill(state.runLifetime))).toFixed(2);
  if (shelfGain !== null && gain > shelfGain) {
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
  renderHint();
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
  // The fastest million (§8.5.16), noted as the run first gets there.
  const record = opened ? recordMillion(state, Date.now()) : null;
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
  // Told only when it beats an earlier one: a first run's million is no record.
  if (record?.best && record.previous !== null) {
    const time = formatDuration(record.seconds);
    toast(`New record: a million in ${time}`);
    announce(`New record: a million in ${time}.`);
  }
  if (opened) {
    renderShelf();
    awardAchievements();
  }
  for (const id of updateReveals(state)) {
    toast(`New in the shop: ${autoTapper(id).name}`);
  }
}

function awardAchievements(ctx: AchievementContext = {}): void {
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

  // A faulted reactor takes presses toward its restart, and earns nothing.
  const wall = Date.now();
  if (isFaulted(state, wall)) {
    restartPress(now);
    return;
  }
  // A press tends the reactor: one that has run down comes straight back.
  const wasDown = powerShare(wall) < 1;
  tend(state, wall);
  if (wasDown) onRecovered();

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
  income.add(now, (value - surgePay(state, play, mods) * lucky) / pressBoost(play, mods));
  share.add(now, value, 0);
  state.totalPresses++;
  if (counted > state.bestCombo) {
    state.bestCombo = counted;
    renderHint();
  }
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
    window.setTimeout(() => {
      SOUND.perkDrop(def.rarity);
      awardAchievements(); // Collector, on the codex's last perk
    }, 450);
  } else {
    SOUND.perkDrop(def.rarity);
    toast(
      `${dropKind(offer)}: ${perkTitle(offer.id, offer.level)}${findThanks(offer)}`,
      def.family
    );
    announce(dropAnnouncement(offer));
    awardAchievements(); // Collector, on the codex's last perk
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
  // The run-down's label outranks it (renderPower).
  if (surge.phase === 'warning' || surge.phase === 'active' || power !== 'full') return;
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
  // A page that stalled in view, such as a laptop asleep with the game open,
  // is paid as time away, on the run-down's clock, rather than lost.
  if (Date.now() - state.lastSeen > STALL_MS) {
    settleAbsence();
    lastFrame = now;
  }
  const dt = Math.min((now - lastFrame) / 1000, 1);
  lastFrame = now;
  const mods = modsOf(state);
  const wall = Date.now();
  renderPower(wall);

  // Active play, the clock surges, perk drops and Self-Replicator run on: the
  // page in view and a press within the last minute. A faulted reactor has none.
  const visible = !document.hidden;
  const activeDt =
    visible && power !== 'fault' && now - lastPressAt < mods.surge.idleAfterS * 1000 ? dt : 0;
  if (visible) state.playedS += dt;
  activeS += activeDt;

  if (combo.tick(now)) onComboBroke();

  const play = playContext(now);
  // Left alone, the reactor runs down: its output falls to nothing at a fault.
  const output = powerShare(wall);
  // The machines' own output, and what the combo and a surge add: the share bar's two sides.
  const split = tapperSplit(state, play, mods);
  const eps = (split.machines + split.lift) * output;
  // Idle Hands at work: the per-second readout says so.
  epsEl.classList.toggle(
    'is-boosted',
    eps > 0 && mods.idleBoostMult > 1 && play.idleS! >= mods.idleBoostAfterS
  );
  if (eps > 0) {
    earn(state, eps * dt);
    share.add(now, split.lift * output * dt, split.machines * output * dt);
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
  renderShare(now);
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

  // Everything up to now is counted: time away starts from here.
  state.lastSeen = wall;
  requestAnimationFrame(frame);
}

// --- Time away (SPACEBAR-CLICKER.md §8.5) ----------------------------------------------

/** A gap up to this long is a tab switch: paid without a word. */
const QUIET_AWAY_S = 60;
/** A frame this long after the last, with the page in view, is a stall: paid as time away. */
const STALL_MS = 3000;

/**
 * Credit the time since energy was last counted (the save's lastSeen) on the
 * run-down's clock: full output for a while after the last press or
 * purchase, then less, then nothing once the reactor faults (rundown.ts).
 * There is no dialog. A short gap is paid silently; a longer one counts into
 * the readout, with a toast and an announcement, and Night Lab is credited
 * where it held the output up. Time away never runs a perk offer down.
 */
function settleAbsence(): void {
  const wall = Date.now();
  const mods = modsOf(state);
  const { awayS, energy } = untendedAward(state, wall, mods);
  // The stretch of the run-down the absence covered, in seconds untended.
  const fromS = Math.max(0, (state.lastSeen - state.tendedAt) / 1000);
  state.lastSeen = wall;
  if (energy > 0) {
    earn(state, energy);
    deferPerks(state, energy);
    dirty = true;
  }
  renderPower(wall, false);
  if (awayS > QUIET_AWAY_S && energy > 0) announceReturn(awayS, energy, fromS, wall);
  // After the return's notice, so a stage the energy reached is told second.
  if (energy > 0) afterEarn();
}

/** A real absence: the energy counts into the readout, told by a toast and the announcer. */
function announceReturn(awayS: number, energy: number, fromS: number, wall: number): void {
  const mods = modsOf(state);
  if (!reducedMotion()) energyRoll = { amount: energy, start: performance.now() };
  const untended = formatDuration(untendedS(state, wall));
  toast(`Untended ${untended}: +${formatEnergy(energy)} energy`);
  const words = [`Untended for ${untended}: ${formatEnergy(energy)} energy came in.`];
  if (power === 'fault') words.push('The reactor faulted: press on a steady beat to restart it.');
  if (power === 'down') words.push(`The reactor is at ${powerPct}%: press once to bring it back.`);
  // Night Lab, where it held full output past the usual half hour.
  if (hasRung(state, 'night-lab') && fromS < mods.rundown.fullS && fromS + awayS > RUNDOWN.fullS) {
    const credit = `${rung('night-lab').name} held full output for ${spanWords(mods.rundown.fullS)}`;
    toast(credit, 'track');
    words.push(`${credit}.`);
  }
  const waiting = state.perks.offers.map((o) => perkTitle(o.id, o.level));
  if (waiting.length) words.push(`Still on offer: ${listWords(waiting)}.`);
  announce(words.join(' '));
}

/** A length of time in words for a sentence: "an hour", "45 minutes". */
function spanWords(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes === 60) return 'an hour';
  return minutes % 60 === 0 ? `${minutes / 60} hours` : `${minutes} minutes`;
}

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
  return !resetModal.hidden || !prestigeModal.hidden || !swapModal.hidden;
}

for (const modal of [resetModal, prestigeModal, swapModal]) {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeDialog(modal);
  });
}

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  // A past pick's tooltip goes first, so dismissing it leaves the dialog open.
  if (!pickTip.hidden) {
    hidePickTip();
    return;
  }
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
  share.reset();
  sharePct = -1;
  afterglowUntil = 0;
  replicateClock = 0;
  reactor.classList.remove('is-afterglow');
  // A reset tends the reactor (save.ts), so a fault or a run-down clears.
  restart.reset();
  restartRing?.classList.remove('is-complete');
  lightMarks(0);
  renderPower(Date.now(), false);
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
/** How long the unlock card stays over the core, and a second more for each line past two. */
const UNLOCK_MS = 5000;
/** Rungs the unlock card lists. A reset that lands more names the first few and points to the rest. */
const UNLOCK_LISTED = 4;
let unlockTimer = 0;
/** True while the core collapses; presses are ignored for that half second. */
let imploding = false;

/**
 * The core collapses to a point while the rest of the face dims, then blooms
 * back as a Dormant reactor while the isotopes just earned fly from the core
 * into the badge. The save has already been reset; this only holds the reactor's
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
  // The badge keeps its old count until the reset's isotopes land in it.
  badgeHold = isotopesBefore;
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
  const listed = unlocked.length > UNLOCK_LISTED ? unlocked.slice(0, UNLOCK_LISTED - 1) : unlocked;
  const more = unlocked.length - listed.length;
  unlockMore.hidden = more === 0;
  if (more > 0) setSentence(unlockMore, [`+${more}`], ' more in the Isotopes tab');
  unlockList.replaceChildren(
    ...listed.map((id) => {
      const item = document.createElement('li');
      item.append(
        cardLine('unlock-name', rung(id).name),
        cardLine('unlock-detail', rungSentence(id))
      );
      return item;
    })
  );
  unlockCard.hidden = false;
  const lines = listed.length + (more > 0 ? 1 : 0);
  unlockTimer = window.setTimeout(
    () => {
      unlockCard.hidden = true;
    },
    UNLOCK_MS + Math.max(0, lines - 2) * 1000
  );
}

/**
 * The reset's isotopes fly from the core into the badge as beads, up to three
 * for any number, and its count steps up as each lands. Returns ms until the
 * last lands.
 */
function flyIsotopes(before: number): number {
  const gain = state.isotopes - before;
  const flights = Math.min(3, gain);
  const face = reactor.getBoundingClientRect();
  const core = coreEl.getBoundingClientRect();
  const dial = isotopeDial.getBoundingClientRect();
  const fx = core.left - face.left + core.width / 2 - 4;
  const fy = core.top - face.top + core.height / 2 - 4;
  const tx = dial.left - face.left + dial.width / 2 - 4;
  const ty = dial.top - face.top + dial.height / 2 - 4;
  const land = (count: number | null) => {
    badgeHold = count;
    renderShelf();
    replay(isotopeDial, 'is-landed');
  };

  for (let i = 0; i < flights; i++) {
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
      land(i === flights - 1 ? null : before + Math.round((gain * (i + 1)) / flights));
    };
  }
  const total = 150 + Math.max(0, flights - 1) * 90 + FLY_MS;
  // Should a flight never finish (a hidden tab), the count still catches up.
  window.setTimeout(() => {
    if (badgeHold !== null) land(null);
  }, total + 400);
  return total;
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

/** Whether the dialog shows the past picks' switches, opened by "Change". */
let picksOpen = false;

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

/** A radio for one of the dialog's choices; it fills the label it sits in. */
function radio(name: string, value: string): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'radio';
  input.name = name;
  input.value = value;
  return input;
}

/** A radio as an option card: its name, then what it does. */
function resetOption(name: string, value: string, label: string, detail: string): HTMLLabelElement {
  const option = document.createElement('label');
  option.className = 'reset-option';
  option.append(
    radio(name, value),
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
 * A fork picked before, as a two-way switch: "At 3", then both rungs by
 * name, the pick lit. What each does is its radio's description, and the
 * tooltip's words on hover or focus.
 */
function pickSwitch(step: TrackStep, picked: RungId | null): HTMLFieldSetElement {
  const pick = document.createElement('fieldset');
  pick.className = 'reset-pick';
  pick.dataset.fork = String(step.isotopes);
  const legend = document.createElement('legend');
  const count = document.createElement('b');
  count.textContent = String(step.isotopes);
  legend.append(text('At '), count, cardLine('visually-hidden', ` ${isotopeNoun(step.isotopes)}`));
  const seg = document.createElement('div');
  seg.className = 'reset-seg';
  for (const r of step.rungs) {
    const option = document.createElement('label');
    option.className = 'reset-seg-option';
    option.dataset.rung = r.id;
    const input = radio(`fork-${step.isotopes}`, r.id);
    input.checked = r.id === picked;
    const detail = cardLine('visually-hidden', rungSentence(r.id));
    detail.id = `sc-pick-detail-${r.id}`;
    input.setAttribute('aria-describedby', detail.id);
    option.append(input, cardLine('reset-seg-name', r.name), detail);
    seg.append(option);
  }
  pick.append(legend, seg);
  return pick;
}

/**
 * Build the dialog's track part for a reset to `resetTo`: the rungs it
 * unlocks, then each fork reached for the first time as cards, then the
 * keeping rung's perks, then the forks picked before as switches, each with
 * `chosen`'s pick.
 */
function buildResetChoices(chosen: ForkPicks): void {
  hidePickTip();
  const groups: HTMLElement[] = [];
  const fresh = stepsReached(state.isotopes, resetTo).filter((s) => !isFork(s));
  if (fresh.length > 0) {
    const group = resetGroup('You unlock', false);
    const list = document.createElement('ul');
    list.className = 'reset-unlocks';
    for (const step of fresh) {
      const item = document.createElement('li');
      const id = step.rungs[0].id;
      item.append(
        visualLine('reset-unlock-bead', ''),
        cardLine('reset-option-name', rung(id).name),
        text(' '),
        cardLine('reset-option-detail', rungSentence(id))
      );
      list.append(item);
    }
    group.append(list);
    groups.push(group);
  }

  const forks = ISOTOPE_TRACK.filter((s) => isFork(s) && s.isotopes <= resetTo);
  const isNew = (step: TrackStep): boolean => !isPickFor(step.isotopes, state.forks[step.isotopes]);
  const pickOf = (step: TrackStep): RungId | null =>
    isPickFor(step.isotopes, chosen[step.isotopes]) ? chosen[step.isotopes]! : null;

  for (const step of forks.filter(isNew)) {
    const group = resetGroup(`At ${isotopeCount(step.isotopes)}: pick one`, true);
    group.dataset.fork = String(step.isotopes);
    const options = document.createElement('div');
    options.className = 'reset-options';
    for (const r of step.rungs) {
      const option = resetOption(`fork-${step.isotopes}`, r.id, r.name, rungSentence(r.id));
      option.querySelector('input')!.checked = r.id === pickOf(step);
      options.append(option);
    }
    const after = document.createElement('p');
    after.className = 'reset-group-note';
    after.textContent = 'You can switch at any reset after.';
    group.append(options, after);
    groups.push(group);
  }

  const keep = document.createElement('div');
  keep.id = 'sc-reset-keep';
  groups.push(keep);

  // The forks picked before come last and quieter: most resets keep them.
  const past = forks.filter((step) => !isNew(step));
  if (past.length > 0) {
    const group = document.createElement('div');
    group.className = 'reset-group is-quiet';
    const head = document.createElement('div');
    head.className = 'reset-group-head';
    const title = document.createElement('p');
    title.className = 'reset-group-title';
    title.textContent = 'Your picks';
    // On one line, by name; "Change" opens the switches under it.
    const names = document.createElement('p');
    names.className = 'reset-picks-names';
    names.id = 'sc-reset-picks-names';
    const body = document.createElement('div');
    body.className = 'reset-picks-body';
    body.id = 'sc-reset-picks';
    body.hidden = !picksOpen;
    const change = document.createElement('button');
    change.type = 'button';
    change.className = 'reset-link';
    change.id = 'sc-reset-picks-toggle';
    change.textContent = 'Change';
    change.setAttribute('aria-controls', body.id);
    change.setAttribute('aria-expanded', String(picksOpen));
    change.addEventListener('click', () => {
      picksOpen = !picksOpen;
      body.hidden = !picksOpen;
      change.setAttribute('aria-expanded', String(picksOpen));
      hidePickTip();
    });
    head.append(title, names, change);
    const note = document.createElement('p');
    note.className = 'reset-group-note';
    note.textContent = 'Switch at any reset';
    const list = document.createElement('div');
    list.className = 'reset-picks';
    for (const step of past) list.append(pickSwitch(step, pickOf(step)));
    body.append(note, list);
    group.append(head, body);
    groups.push(group);
  }

  resetChoices.replaceChildren(...groups);
  renderPickNames();
  renderKeep();
}

/** The past picks by name, on their line: "Sixth Slot · Reroll". */
function renderPickNames(): void {
  const names = resetChoices.querySelector<HTMLElement>('#sc-reset-picks-names');
  if (!names) return;
  const picked = Array.from(
    resetChoices.querySelectorAll<HTMLInputElement>('.reset-pick input:checked')
  ).map((input) => rung(input.value as RungId).name);
  setText(names, picked.join(' · '));
}

/**
 * The keeping rung's perks, for the picks the dialog shows: Heirloom offers
 * the perks held that aren't keystones, Cornerstone the keystones. Each is a
 * chip with its glyph, then "Keep none" as the last of them. The best comes
 * chosen, or the choice made before if it is still on offer.
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
  group.classList.add('reset-keep-group');
  const none = document.createElement('label');
  none.className = 'reset-keep-none';
  none.append(radio('keep', ''), text('Keep none'));
  const note = document.createElement('p');
  note.className = 'reset-keep-note';
  note.textContent = 'It starts the next run in its slot, at level I.';
  const chips = document.createElement('div');
  chips.className = 'reset-chips';
  for (const held of perks) {
    const def = perk(held.id);
    const chip = document.createElement('label');
    chip.className = 'reset-chip';
    chip.dataset.family = def.family;
    chip.dataset.rarity = def.rarity;
    const tile = document.createElement('span');
    tile.className = 'perk-tile';
    tile.append(perkGlyph(held.id));
    const name = cardLine('reset-chip-name', def.name);
    if (held.level > 1) name.append(text(' '), cardLine('reset-chip-level', ROMAN[held.level]!));
    // What it does at level I, the level it is kept at: the radio's
    // description, and the tooltip's words on hover or focus.
    const input = radio('keep', held.id);
    const detail = cardLine('visually-hidden', `At level I: ${perkDetail(def, 1)}`);
    detail.id = `sc-keep-detail-${held.id}`;
    input.setAttribute('aria-describedby', detail.id);
    chip.append(input, tile, name, detail);
    chips.append(chip);
  }
  // "Keep none" is the last choice in the grid, so the choices fill it.
  chips.append(none);
  group.append(note, chips);
  keep.replaceChildren(group);
  const chosen = before === '' || perks.some((o) => o.id === before) ? before : perks[0]!.id;
  for (const input of group.querySelectorAll('input')) input.checked = input.value === chosen;
}

/** The dialog's numbers, and the head start the new run begins with. */
function renderResetSummary(): void {
  const held = state.isotopes;
  const gain = resetTo - held;
  const picks = dialogPicks();
  const rungs = activeRungs(resetTo, picks);
  resetSumGain.textContent = `+${gain}`;
  resetSumTo.textContent = isotopeNoun(gain);
  // The gains before and after; with none held there is no before.
  resetSumFromWrap.hidden = held === 0;
  resetSumFrom.textContent = bonusText(held);
  resetSumBonus.textContent = bonusText(resetTo, picks);
  const energy = `${TRACK_EFFECT.warmStartEnergy.toLocaleString('en-US')} energy`;
  const finger = `Finger Strength ${ROMAN[TRACK_EFFECT.hotStartFinger]}`;
  resetHeadRow.hidden = !rungs.includes('warm-start');
  resetHead.textContent = rungs.includes('hot-start')
    ? `${energy}, a Lab Assistant, a Pneumatic Key and ${finger}`
    : `${energy} and a Lab Assistant`;
}

// The dialog's tooltip, on hover or keyboard focus. Over a past pick: what the
// rung does, in the isotopes' blue. Over a perk to keep: what the perk does
// at level I, the level it is kept at, in its family's hue. Touch has no
// hover, and a tap there makes the choice, so it shows none; the Isotopes tab
// reads every rung and the Perks tab every perk.
let pickTipFor: HTMLElement | null = null;
let pickTipBy: 'hover' | 'focus' = 'hover';

/** What in the dialog has a tooltip: a past pick's half, or a perk to keep. */
const TIPPED = '.reset-seg-option, .reset-chip';

function showPickTip(option: HTMLElement, by: 'hover' | 'focus'): void {
  const keep = option.matches('.reset-chip');
  pickTip.classList.toggle('is-perk', keep);
  if (keep) {
    const def = perk(option.querySelector('input')!.value as PerkId);
    pickTip.dataset.family = def.family;
    pickTipName.textContent = `${def.name}, at level I`;
    pickTipDetail.replaceChildren(...perkEffect(def, 1));
  } else {
    const id = option.dataset.rung as RungId;
    delete pickTip.dataset.family;
    pickTipName.textContent = rung(id).name;
    pickTipDetail.textContent = rungSentence(id);
  }
  pickTip.hidden = false;
  pickTipFor = option;
  pickTipBy = by;
  placePickTip(option);
}

/** Over the switch's half, or under it with no room above, kept on screen. */
function placePickTip(option: HTMLElement): void {
  const at = option.getBoundingClientRect();
  const tip = pickTip.getBoundingClientRect();
  const below = at.top - tip.height < 8;
  pickTip.classList.toggle('is-below', below);
  const centre = at.left + at.width / 2;
  const left = Math.min(Math.max(8, centre - tip.width / 2), window.innerWidth - tip.width - 8);
  pickTip.style.left = `${left}px`;
  pickTip.style.top = `${below ? at.bottom : at.top - tip.height}px`;
  pickTip.style.setProperty('--caret', `${centre - left}px`);
}

function hidePickTip(): void {
  pickTip.hidden = true;
  pickTipFor = null;
}

resetChoices.addEventListener('pointerover', (e) => {
  if (e.pointerType !== 'mouse') return;
  const option = (e.target as Element).closest<HTMLElement>(TIPPED);
  if (option && option !== pickTipFor) showPickTip(option, 'hover');
});
// Leaving the half hides it, unless the pointer crossed onto the tooltip.
resetChoices.addEventListener('pointerout', (e) => {
  if (e.pointerType !== 'mouse' || !pickTipFor || pickTipBy !== 'hover') return;
  const to = e.relatedTarget as Node | null;
  if (to && (pickTipFor.contains(to) || pickTip.contains(to))) return;
  hidePickTip();
});
pickTip.addEventListener('pointerleave', (e) => {
  const to = e.relatedTarget as Node | null;
  if (to && pickTipFor?.contains(to)) return;
  hidePickTip();
});
resetChoices.addEventListener('focusin', (e) => {
  const input = e.target as HTMLElement;
  const option = input.closest<HTMLElement>(TIPPED);
  if (option && input.matches(':focus-visible')) showPickTip(option, 'focus');
});
resetChoices.addEventListener('focusout', () => {
  if (pickTipBy === 'focus') hidePickTip();
});
resetBody.addEventListener('scroll', hidePickTip, { passive: true });

/** What is kept shows on a first reset, and behind "What's kept?" after. */
function showKept(open: boolean): void {
  resetKeptRow.hidden = !open;
  resetKeptToggle.setAttribute('aria-expanded', String(open));
}

resetKeptToggle.addEventListener('click', () => showKept(resetKeptRow.hidden !== false));

prestigeBtn.addEventListener('click', () => {
  resetTo = state.isotopes + prestigeGain(state.runLifetime);
  picksOpen = false;
  buildResetChoices(state.forks);
  renderResetSummary();
  const first = state.prestiges === 0 && state.isotopes === 0;
  resetKeptToggle.hidden = first;
  showKept(first);
  resetPickHint.hidden = true;
  openDialog(prestigeModal, prestigeCancel);
  // It opens at the top, so the numbers come first however long it runs.
  resetBody.scrollTop = 0;
});
resetChoices.addEventListener('change', (e) => {
  // A fork pick can change which perks a keeping rung offers, and the bonus.
  if ((e.target as HTMLInputElement).name !== 'keep') renderKeep();
  renderPickNames();
  renderResetSummary();
  if (unpickedForks(resetTo, dialogPicks()).length === 0) resetPickHint.hidden = true;
  // The keep group above may have grown or shrunk under a tooltip.
  if (pickTipFor) placePickTip(pickTipFor);
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
    renderResetSummary();
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
  awardAchievements({ resetGain: gain });
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
    tendReactor();
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

  tendReactor();
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
  swapIncoming.replaceChildren(swapCard(offer.id, offer.level, false, offer.price));
  swapList.replaceChildren();
  swapListLabel.textContent = mode === 'slot' ? 'Drop one' : 'Swapped out';

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

hintEl.textContent = HINT;
renderHint();
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
