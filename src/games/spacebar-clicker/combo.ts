/**
 * Spacebar Clicker — the rhythm combo (spec §4).
 *
 * The combo rewards a steady cadence, not speed. A press keeps rhythm when its
 * interval sits within 25% of the rolling mean of the last five intervals and
 * under 600 ms. Up to two off-rhythm presses in a row are forgiven (they add
 * nothing); the third breaks the combo. A pause past 800 ms breaks it too.
 * The first five presses after a break always count, so a combo can start.
 *
 * With the Stabiliser a break drops the combo to the start of the tier below
 * instead of to zero, and a pause past ten seconds ends it even so
 * (SPACEBAR-CLICKER.md §8.5), so walking away keeps no tier.
 *
 * Timestamps come from the caller (performance.now() in the browser, plain
 * numbers in tests), so the tracker has no clock of its own. So do the rules:
 * a run's perks can bend them (mods.ts), and the tracker reads them on every
 * press, so a perk bought mid-combo applies from the next press.
 *
 * The restart of a faulted reactor (RestartTracker, below) judges its beat by
 * the same rules.
 */

import { COMBO, COMBO_TIERS, RESTART_PRESSES, type ComboRules, type ComboTierDef } from './config';

export interface PressResult {
  combo: number;
  /** The press added to the combo. */
  kept: boolean;
  /** This press ended the previous combo (a pause past the grace window). */
  broke: boolean;
  /**
   * How far the interval sat from the rolling mean, as a share of it: 0.27 is
   * 27% off the beat. Null when the window didn't judge the press: a free
   * start, a rest, or the first press.
   */
  drift: number | null;
}

/** Where the Stabiliser drops a broken combo: the start of the tier below its own. */
function tierBelow(combo: number, tiers: readonly ComboTierDef[]): number {
  const i = tiers.findIndex((t) => combo >= t.min);
  return i < 0 ? 0 : (tiers[i + 1]?.min ?? 0);
}

export class ComboTracker {
  combo = 0;
  private intervals: number[] = [];
  private lastPressAt: number | null = null;
  /**
   * The last press before a pause the grace window broke. A pause running on
   * past `pauseEndsMs` from it ends whatever the Stabiliser kept.
   */
  private pausedFrom: number | null = null;
  private misses = 0;
  /** Presses since the last break, for the free starts. */
  private sinceBreak = 0;

  constructor(
    private readonly stabiliser: () => boolean = () => false,
    private readonly rules: () => Readonly<ComboRules> = () => COMBO,
    private readonly tiers: () => readonly ComboTierDef[] = () => COMBO_TIERS
  ) {}

  press(now: number): PressResult {
    const rules = this.rules();
    let broke = false;

    if (this.lastPressAt !== null && now - this.lastPressAt > rules.graceMs) {
      // tick() normally catches this first; a press after a long pause may
      // arrive before the next frame does.
      this.break(now - this.lastPressAt > rules.pauseEndsMs);
      broke = true;
    } else if (
      this.pausedFrom !== null &&
      now - this.pausedFrom > rules.pauseEndsMs &&
      this.combo > 0
    ) {
      // The grace window broke the combo already, and the pause ran on past
      // the limit with no frame to end it.
      this.combo = 0;
      broke = true;
    }
    this.pausedFrom = null;

    const interval = this.lastPressAt === null ? null : now - this.lastPressAt;
    this.lastPressAt = now;

    let kept: boolean;
    let drift: number | null = null;
    // A rest (a perk allows them) neither keeps nor misses, and stays out of
    // the mean, so the beat picks up where it left off.
    let rest = false;
    if (interval === null || this.sinceBreak < rules.freeStarts) {
      kept = true;
    } else if (interval > rules.restMs) {
      kept = false;
      rest = true;
    } else {
      const mean = this.intervals.reduce((a, b) => a + b, 0) / this.intervals.length;
      drift = Math.abs(interval - mean) / mean;
      kept = interval < rules.maxIntervalMs && drift <= rules.tolerance;
    }

    if (interval !== null && !rest) {
      this.intervals.push(interval);
      if (this.intervals.length > rules.window) this.intervals.shift();
    }
    this.sinceBreak++;

    if (kept) {
      this.combo++;
      this.misses = 0;
    } else if (!rest) {
      this.misses++;
      if (this.misses >= rules.missesToBreak) {
        this.break();
        broke = true;
      }
    }

    return { combo: this.combo, kept, broke, drift };
  }

  /**
   * Call every frame. Returns true on a frame that breaks the combo: the grace
   * window running out, or the pause running past `pauseEndsMs` and ending
   * what the Stabiliser kept.
   */
  tick(now: number): boolean {
    const rules = this.rules();
    if (this.lastPressAt !== null) {
      if (now - this.lastPressAt <= rules.graceMs) return false;
      const had = this.combo > 0;
      // A frame long after the press (a hidden tab) may find the pause over already.
      this.break(now - this.lastPressAt > rules.pauseEndsMs);
      this.pausedFrom = this.lastPressAt;
      this.lastPressAt = null;
      return had;
    }
    if (this.pausedFrom === null || now - this.pausedFrom <= rules.pauseEndsMs) return false;
    this.pausedFrom = null;
    const had = this.combo > 0;
    this.combo = 0;
    return had;
  }

  /** 1 right after a press, falling to 0 as the grace window runs out. */
  graceRemaining(now: number): number {
    if (this.lastPressAt === null) return 0;
    return Math.max(0, 1 - (now - this.lastPressAt) / this.rules().graceMs);
  }

  /**
   * Spec §4 + §6a: reset to zero, or with the Stabiliser drop to the start of
   * the tier below. `end` is a pause past `pauseEndsMs`, which the Stabiliser
   * doesn't soften.
   */
  private break(end = false): void {
    this.combo = this.stabiliser() && !end ? tierBelow(this.combo, this.tiers()) : 0;
    this.intervals = [];
    this.misses = 0;
    this.sinceBreak = 0;
  }

  reset(): void {
    this.combo = 0;
    this.intervals = [];
    this.lastPressAt = null;
    this.pausedFrom = null;
    this.misses = 0;
    this.sinceBreak = 0;
  }
}

export interface RestartResult {
  /** Presses on the beat so far, this one included. */
  count: number;
  /** This press restarted the reactor. */
  done: boolean;
  /** This press lost a count of two or more: it was off the beat, or came after a pause. */
  startedOver: boolean;
}

/**
 * The restart of a faulted reactor (SPACEBAR-CLICKER.md §8.5): it comes back
 * on RESTART_PRESSES presses on a steady beat. The first two presses set the
 * beat, and each press after must keep it by the run's rhythm rules, the test
 * the combo uses, so Metronome and Perfect Pitch widen it. A press off the
 * beat, or one after a pause, starts the count over from itself.
 */
export class RestartTracker {
  count = 0;
  private intervals: number[] = [];
  private lastPressAt: number | null = null;

  constructor(private readonly rules: () => Readonly<ComboRules> = () => COMBO) {}

  press(now: number): RestartResult {
    const rules = this.rules();
    const before = this.count;
    const interval = this.lastPressAt === null ? null : now - this.lastPressAt;
    this.lastPressAt = now;

    let onBeat = false;
    if (interval !== null && interval < rules.maxIntervalMs) {
      if (this.intervals.length === 0) {
        onBeat = true;
      } else {
        const mean = this.intervals.reduce((a, b) => a + b, 0) / this.intervals.length;
        onBeat = Math.abs(interval - mean) / mean <= rules.tolerance;
      }
    }

    if (onBeat) {
      this.count++;
      this.intervals.push(interval!);
      if (this.intervals.length > rules.window) this.intervals.shift();
    } else {
      this.count = 1;
      this.intervals = [];
    }

    const count = this.count;
    const done = count >= RESTART_PRESSES;
    if (done) this.reset();
    return { count, done, startedOver: before >= 2 && count === 1 };
  }

  reset(): void {
    this.count = 0;
    this.intervals = [];
    this.lastPressAt = null;
  }
}
