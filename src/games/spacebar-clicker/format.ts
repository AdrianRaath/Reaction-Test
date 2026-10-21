/**
 * Spacebar Clicker — number formatting.
 *
 * Energy climbs past a billion in a long run, so readouts switch to a suffix
 * at a hundred thousand and keep three significant figures: 99,999 → 123K →
 * 1.23M. Below that, whole numbers with a thousands separator, so a shop
 * price like 75,000 reads as a price. Every value formatted here is rendered
 * in the monospace readout face.
 */

const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi'];

export function formatEnergy(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const n = Math.floor(Math.max(0, value));
  if (n < 100_000) return n.toLocaleString('en-US');

  let tier = 0;
  let scaled = n;
  while (scaled >= 1000 && tier < SUFFIXES.length - 1) {
    scaled /= 1000;
    tier++;
  }
  const digits = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
  return `${scaled.toFixed(digits)}${SUFFIXES[tier]}`;
}

/** Per-second rates: one decimal under 100, then the energy format. */
export function formatRate(value: number): string {
  if (!Number.isFinite(value)) return '—';
  if (value < 100) return value.toFixed(1);
  return formatEnergy(value);
}

/** A combo multiplier: x1, x1.5, x2, x2.5, x3. */
export function formatMultiplier(value: number): string {
  return `x${Number.isInteger(value) ? value : value.toFixed(1)}`;
}

/** Elapsed time: 45s, 12m 05s, 4h 12m. */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(sec).padStart(2, '0')}s`;
  return `${sec}s`;
}
