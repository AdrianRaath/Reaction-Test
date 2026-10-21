/**
 * Spacebar Clicker — the rhythm combo (spec §4).
 *
 * The combo rewards a steady cadence, not speed. A press keeps rhythm when its
 * interval sits within 25% of the rolling mean of the last five intervals and
 * under 600 ms. Up to two off-rhythm presses in a row are forgiven (they add
 * nothing); the third breaks the combo. A pause past 800 ms breaks it too.
 * The first five presses after a break always count, so a combo can start.
 *
 * Timestamps come from the caller (performance.now() in the browser, plain
 * numbers in tests), so the tracker has no clock of its own.
 */

import { COMBO } from './config';

export interface PressResult {
  combo: number;
  /** The press added to the combo. */
  kept: boolean;
  /** This press ended the previous combo (a pause past the grace window). */
  broke: boolean;
}

export class ComboTracker {
  combo = 0;
  private intervals: number[] = [];
  private lastPressAt: number | null = null;
  private misses = 0;
  /** Presses since the last break, for the free starts. */
  private sinceBreak = 0;

  constructor(private readonly stabiliser: () => boolean = () => false) {}

  press(now: number): PressResult {
    let broke = false;

    if (this.lastPressAt !== null && now - this.lastPressAt > COMBO.graceMs) {
      // tick() normally catches this first; a press after a long pause may
      // arrive before the next frame does.
      this.break();
      broke = true;
    }

    const interval = this.lastPressAt === null ? null : now - this.lastPressAt;
    this.lastPressAt = now;

    let kept: boolean;
    if (interval === null || this.sinceBreak < COMBO.freeStarts) {
      kept = true;
    } else {
      const mean = this.intervals.reduce((a, b) => a + b, 0) / this.intervals.length;
      kept = interval < COMBO.maxIntervalMs && Math.abs(interval - mean) <= COMBO.tolerance * mean;
    }

    if (interval !== null) {
      this.intervals.push(interval);
      if (this.intervals.length > COMBO.window) this.intervals.shift();
    }
    this.sinceBreak++;

    if (kept) {
      this.combo++;
      this.misses = 0;
    } else {
      this.misses++;
      if (this.misses >= COMBO.missesToBreak) {
        this.break();
        broke = true;
      }
    }

    return { combo: this.combo, kept, broke };
  }

  /** Call every frame. Returns true on the frame the grace window expires. */
  tick(now: number): boolean {
    if (this.lastPressAt === null) return false;
    if (now - this.lastPressAt <= COMBO.graceMs) return false;
    const had = this.combo > 0;
    this.break();
    this.lastPressAt = null;
    return had;
  }

  /** 1 right after a press, falling to 0 as the grace window runs out. */
  graceRemaining(now: number): number {
    if (this.lastPressAt === null) return 0;
    return Math.max(0, 1 - (now - this.lastPressAt) / COMBO.graceMs);
  }

  /** Spec §4 + §6a: reset to zero, or drop by ten with the Stabiliser. */
  private break(): void {
    this.combo = this.stabiliser() ? Math.max(0, this.combo - COMBO.stabiliserDrop) : 0;
    this.intervals = [];
    this.misses = 0;
    this.sinceBreak = 0;
  }

  reset(): void {
    this.combo = 0;
    this.intervals = [];
    this.lastPressAt = null;
    this.misses = 0;
    this.sinceBreak = 0;
  }
}
