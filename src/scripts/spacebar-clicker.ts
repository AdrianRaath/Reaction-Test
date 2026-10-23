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
import { ComboTracker } from '../games/spacebar-clicker/combo';
import {
  ACHIEVEMENTS,
  AUTO_TAPPERS,
  MIN_PRESS_GAP_MS,
  PERK_SLOTS,
  PRESS_UPGRADES,
  PRESTIGE_UNLOCK,
  REACTOR_STATES,
  SAVE_INTERVAL_MS,
  type AutoTapperId,
  type PerkDef,
  type PerkFamily,
  type PerkId,
  type PerkRarity,
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
  earn,
  energyPerPress,
  energyPerSecond,
  isotopeBonus,
  luckyMultiplier,
  markShopTabSeen,
  nextComboTier,
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
  offerRemaining,
  perkLevel,
  perkTick,
  replicate,
  surgeDrop,
} from '../games/spacebar-clicker/perks';
import {
  defaultSave,
  parseSave,
  prestigeReset,
  serializeSave,
  type PerkOffer,
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
const shelfEl = el('sc-shelf');
const pelletsEl = el('sc-pellets');
const shelfMoreEl = el('sc-shelf-more');
const surgeSummary = el('sc-surge-summary');
const surgePresses = el('sc-surge-presses');
const surgeRate = el('sc-surge-rate');
const surgeEarned = el('sc-surge-earned');
const surgeBest = el('sc-surge-best');
const surgeDropEl = el('sc-surge-drop');
const surgeDropKind = el('sc-surge-drop-kind');
const surgeDropName = el('sc-surge-drop-name');

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
  window: HTMLElement;
  cost: HTMLElement;
  rarity: HTMLElement;
  /** The offer the row shows, as "id:level"; empty when none. */
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
    window: part('[data-perk-window]'),
    cost: part('[data-perk-cost]'),
    rarity: part('[data-perk-rarity]'),
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
const awayRate = el('sc-away-rate');
const awayEnergy = el('sc-away-energy');
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

function announce(text: string): void {
  announceEl.textContent = text;
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

const RARITY_NAME: Record<PerkRarity, string> = {
  common: 'Common',
  rare: 'Rare',
  keystone: 'Keystone',
};
const ROMAN = ['', 'I', 'II', 'III'];

/** A fresh copy of a perk's glyph. */
function perkGlyph(id: PerkId): Node {
  return perkGlyphs.content.querySelector(`[data-glyph="${id}"]`)!.cloneNode(true);
}

/** A perk's name with its level, past the first: "Overtone II". */
function perkTitle(id: PerkId, level: number): string {
  return level > 1 ? `${perk(id).name} ${ROMAN[level]}` : perk(id).name;
}

/** What a drop is called: "Perk drop", "Rare drop", "Keystone drop", "Upgrade drop". */
function dropKind(offer: PerkOffer): string {
  if (offer.level > 1) return 'Upgrade drop';
  const { rarity } = perk(offer.id);
  return rarity === 'common' ? 'Perk drop' : `${RARITY_NAME[rarity]} drop`;
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

/** A perk as a card for the swap dialog: its tile, its name and level, its effect. */
function perkCard(id: PerkId, level: number, asButton: boolean): HTMLElement {
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
  const detail = document.createElement('span');
  detail.className = 'perk-card-detail';
  detail.append(...perkEffect(def, level));
  text.append(name, detail);
  card.append(tile, text);
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
  const key = `${offer.id}:${offer.level}`;
  if (row.shown !== key) {
    row.shown = key;
    row.li.dataset.family = def.family;
    row.li.dataset.rarity = def.rarity;
    row.li.classList.toggle('is-upgrade', offer.level > 1);
    row.glyph.replaceChildren(perkGlyph(def.id));
    row.name.textContent = def.name;
    setLevelBadge(row.level, offer.level);
    row.detail.replaceChildren(...perkEffect(def, offer.level, offer.level - 1));
    row.rarity.textContent = offer.level > 1 ? 'Upgrade' : RARITY_NAME[def.rarity];
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
  const note = out
    ? `Swaps out your keystone, ${perkTitle(out, perkLevel(state, out))}`
    : needsSlot(state, tab)
      ? `All ${PERK_SLOTS} slots are full: you'll pick one to drop`
      : '';
  row.note.hidden = !note;
  setText(row.note, note);
  row.li.hidden = false;
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

function renderStats(): void {
  const play = { combo: combo.combo };
  statEls.presses.textContent = state.totalPresses.toLocaleString('en-US');
  statEls.run.textContent = formatEnergy(state.runLifetime);
  statEls.lifetime.textContent = formatEnergy(state.totalLifetime);
  statEls.eps.textContent = formatRate(energyPerSecond(state, play));
  statEls.epp.textContent = formatEnergy(energyPerPress(state, play));
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

/** Pellets shown on the shelf before the rest collapse into "+N". */
const SHELF_MAX = 10;

/** The trophy shelf: one bead per isotope, kept across every reset. */
function renderShelf(): void {
  const count = state.isotopes;
  shelfEl.hidden = count === 0;
  const label = `${count} isotope${count === 1 ? '' : 's'}, +${count * 10}% to all gains`;
  shelfEl.setAttribute('aria-label', count ? label : 'No isotopes yet');
  shelfEl.title = count ? label : '';

  const shown = Math.min(count, SHELF_MAX);
  while (pelletsEl.childElementCount < shown) {
    const pellet = document.createElement('span');
    pellet.className = 'pellet';
    pelletsEl.appendChild(pellet);
  }
  while (pelletsEl.childElementCount > shown) pelletsEl.lastElementChild!.remove();
  shelfMoreEl.hidden = count <= SHELF_MAX;
  shelfMoreEl.textContent = `+${count - SHELF_MAX}`;
}

function renderAll(now = performance.now()): void {
  renderReadouts();
  renderReactor();
  renderArc();
  renderCombo(now);
  renderShop();
  renderPanels();
  renderShelf();
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
function spawnRimFloat(text: string, family?: PerkFamily): void {
  if (reducedMotion() || floats.childElementCount >= MAX_FLOATS) return;
  const box = floats.getBoundingClientRect();
  const core = coreEl.getBoundingClientRect();
  // Somewhere on the upper half of the rim, so it drifts up and away.
  const angle = (-160 + Math.random() * 140) * (Math.PI / 180);
  const r = core.width * 0.48;
  const span = document.createElement('span');
  span.className = family ? 'float is-idle is-perk' : 'float is-idle readout';
  if (family) span.dataset.family = family;
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
const blips: { t: number; kept: boolean }[] = [];
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
  ctx.shadowBlur = 0;
  scopeFlat = false;
}

if (scopeEl) new ResizeObserver(sizeScope).observe(scopeEl);

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
  if (imploding) return; // the reset sequence owns the core for half a second
  if (now - lastPressAt < MIN_PRESS_GAP_MS) return; // 30 per second cap (spec §2)
  lastPressAt = now;
  beeper.unlock();
  replay(keycapEl, 'is-down');

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
    spawnSparks();
  }

  blips.push({ t: now, kept: result.kept });
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

  announce(
    `Surge over. ${surge.presses} presses, ${cps.toFixed(1)} per second, ${formatEnergy(surge.earned)} energy.` +
      (isBest ? ' New best.' : '')
  );
  SOUND.surgeEnd();
  awardAchievements({ surgeCps: cps });
  renderStats();
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
  if (fromSurge) {
    window.setTimeout(() => SOUND.perkDrop(def.rarity), 450);
  } else {
    SOUND.perkDrop(def.rarity);
    toast(`${dropKind(offer)}: ${perkTitle(offer.id, offer.level)}`, def.family);
  }
  dirty = true;
}

/** An offer's window ran out: its row fades away, quietly. */
function onOfferExpired(offer: PerkOffer): void {
  const { tab } = perk(offer.id);
  if (!swapModal.hidden && swapTab === tab) closeDialog(swapModal);
  leaveOffer(tab, false);
  renderShopNotices();
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
    const { rate } = modsOf(state).offline;
    awayTime.textContent = formatDuration(award.seconds);
    // Night Shift pays all of it.
    awayRate.textContent =
      rate >= 1 ? 'full speed' : rate === 0.5 ? 'half speed' : `${Math.round(rate * 100)}% speed`;
    awayEnergy.textContent = formatEnergy(award.energy);
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
});

/** Return the live state to a fresh run's starting point (reset or prestige). */
function restartRun(): void {
  combo.reset();
  lastTierMultiplier = 1;
  reactorIdx = reactorIndex(state.runLifetime);
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
/** True while the core collapses; presses are ignored for that half second. */
let imploding = false;

/**
 * The core collapses to a point while the rest of the face dims, then blooms
 * back as a Dormant reactor while the isotopes just earned fly from the core
 * to the shelf. The save has already been reset; this only holds the reactor's
 * old look until the collapse completes. Reduced motion shows the result.
 */
function playReset(isotopesBefore: number): void {
  if (reducedMotion()) {
    renderAll();
    return;
  }
  imploding = true;
  reactor.classList.remove('is-blooming');
  reactor.classList.add('is-imploding');
  // Everything off the reactor face updates now; the face waits.
  renderReadouts();
  renderShop();
  renderPanels();

  window.setTimeout(() => {
    imploding = false;
    renderAll();
    reactor.classList.replace('is-imploding', 'is-blooming');
    flyIsotopes(isotopesBefore);
    window.setTimeout(() => reactor.classList.remove('is-blooming'), BLOOM_MS);
  }, IMPLODE_MS);
}

/** Beads fly from the core to each new slot on the shelf, then land. */
function flyIsotopes(before: number): void {
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
  const isotopesBefore = state.isotopes;
  state = prestigeReset(state, gain, Date.now());
  restartRun();
  closeDialog(prestigeModal);
  playReset(isotopesBefore);
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

/** Buy the offer on a tab, dropping `replace` from its slot if every slot is full. */
function buyOffer(tab: ShopTab, replace?: PerkId): void {
  const offer = offerOn(state, tab);
  if (!offer) return;
  const out = replace ?? keystoneSwap(state, tab);
  const gapBefore = modsOf(state).surge.maxGapS;
  const result = buyPerk(state, tab, replace);
  if (result !== 'bought' && result !== 'upgraded' && result !== 'swapped') return;

  SOUND.perkBuy();
  leaveOffer(tab, true);
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
 * The swap dialog. 'slot': every slot is full, so pick a perk to drop. Each
 * held perk is a button, and choosing one buys. 'keystone': one keystone at
 * a time, so confirm the swap.
 */
function openSwap(tab: ShopTab, mode: 'slot' | 'keystone'): void {
  const offer = offerOn(state, tab);
  if (!offer) return;
  const incoming = perk(offer.id);
  swapTab = tab;
  swapIncoming.replaceChildren(perkCard(offer.id, offer.level, false));
  swapList.replaceChildren();

  if (mode === 'slot') {
    swapTitle.textContent = `All ${PERK_SLOTS} slots are full`;
    swapMessage.textContent = `Pick a perk to drop for ${incoming.name}. The one you drop is gone for the rest of this run.`;
    for (const held of state.perks.owned) {
      const card = perkCard(held.id, held.level, true);
      card.addEventListener('click', () => {
        closeDialog(swapModal);
        buyOffer(tab, held.id);
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
    const card = perkCard(held, level, false);
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
