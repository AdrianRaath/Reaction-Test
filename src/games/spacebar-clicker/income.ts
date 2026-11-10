/**
 * Spacebar Clicker — the income meter.
 *
 * What the player is earning right now, presses and auto-tappers together, as
 * energy per second over the last few seconds. Perk prices and offer windows
 * are set in seconds of this income at the moment a perk drops
 * (SPACEBAR-CLICKER.md §8.1), because energy grows too fast for a fixed amount
 * to mean the same thing for long. Away awards are never fed in: a lump of
 * collected energy is not a pace.
 *
 * Whole-second buckets in a ring, so adding and reading cost the same however
 * fast the presses come. Timestamps come from the caller, like the combo.
 */

export class IncomeMeter {
  private readonly sums: number[];
  private readonly secs: number[];
  /** The second of the first gain, so a fresh run is not averaged over empty time. */
  private startSec: number | null = null;

  constructor(private readonly windowS = 10) {
    this.sums = new Array<number>(windowS).fill(0);
    this.secs = new Array<number>(windowS).fill(-Infinity);
  }

  add(nowMs: number, amount: number): void {
    if (!(amount > 0)) return;
    const sec = Math.floor(nowMs / 1000);
    this.startSec ??= sec;
    const i = ((sec % this.windowS) + this.windowS) % this.windowS;
    if (this.secs[i] !== sec) {
      this.secs[i] = sec;
      this.sums[i] = 0;
    }
    this.sums[i]! += amount;
  }

  /**
   * Energy per second over the window, or over the time since the first gain
   * when that is shorter.
   */
  rate(nowMs: number): number {
    if (this.startSec === null) return 0;
    const sec = Math.floor(nowMs / 1000);
    let total = 0;
    for (let i = 0; i < this.windowS; i++) {
      const at = this.secs[i]!;
      if (at > sec - this.windowS && at <= sec) total += this.sums[i]!;
    }
    const span = Math.min(this.windowS, Math.max(1, sec - this.startSec + 1));
    return total / span;
  }

  reset(): void {
    this.sums.fill(0);
    this.secs.fill(-Infinity);
    this.startSec = null;
  }
}

/**
 * The player's share of recent energy (SPACEBAR-CLICKER.md §8.5.10): their
 * presses, surges, and what their combo adds to the auto-tappers, against
 * what the auto-tappers make alone. The face draws it as a bar.
 *
 * Both sums fade exponentially over `fadeS`, so a broken combo or a stop
 * shows over a few seconds rather than in one jump. A press lands as a lump
 * between frames of steady machine output, so the share read out is eased
 * again over `easeS`, which keeps single presses from making it flicker.
 * Energy from time away is never fed in. Timestamps come from the caller.
 */
export class ShareMeter {
  private you = 0;
  private machines = 0;
  private at: number | null = null;
  private shown: number | null = null;
  private shownAt = 0;

  constructor(
    private readonly fadeS = 4,
    private readonly easeS = 0.8
  ) {}

  /** Fade both sums to `nowMs`. Fading in steps is the same as fading once. */
  private fade(nowMs: number): void {
    if (this.at !== null && nowMs > this.at) {
      const keep = Math.exp(-(nowMs - this.at) / 1000 / this.fadeS);
      this.you *= keep;
      this.machines *= keep;
    }
    if (this.at === null || nowMs > this.at) this.at = nowMs;
  }

  add(nowMs: number, you: number, machines: number): void {
    this.fade(nowMs);
    if (you > 0) this.you += you;
    if (machines > 0) this.machines += machines;
  }

  /** The player's share at `nowMs`, 0 to 1, as earned; null before anything is. */
  raw(nowMs: number): number | null {
    this.fade(nowMs);
    const all = this.you + this.machines;
    return all > 0 ? this.you / all : null;
  }

  /** The share for display: it follows `raw`, eased over about `easeS`. */
  share(nowMs: number): number | null {
    const target = this.raw(nowMs);
    if (target === null || this.shown === null) {
      this.shown = target;
    } else if (nowMs > this.shownAt) {
      const follow = 1 - Math.exp(-(nowMs - this.shownAt) / 1000 / this.easeS);
      this.shown += (target - this.shown) * follow;
    }
    this.shownAt = Math.max(this.shownAt, nowMs);
    return this.shown;
  }

  reset(): void {
    this.you = 0;
    this.machines = 0;
    this.at = null;
    this.shown = null;
    this.shownAt = 0;
  }
}
