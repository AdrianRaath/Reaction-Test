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
