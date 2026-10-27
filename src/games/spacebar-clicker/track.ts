/**
 * Spacebar Clicker — the isotope track (SPACEBAR-CLICKER.md §8.3).
 *
 * One unlock for each isotope held, up to twelve (config.ts, ISOTOPE_TRACK).
 * Every third step is a fork: two rungs, of which the player picks one. Picks
 * live in the save and change only at a reset, so a run's rules never shift
 * under it. Nothing is spent: holding the isotopes is what unlocks a rung.
 *
 * Pure, like the economy. The run's rules read the rungs in force through
 * mods.ts; a reset applies the head starts and any kept perk (save.ts).
 */

import {
  ISOTOPE_BONUS,
  ISOTOPE_TRACK,
  TRACK_EFFECT,
  type RungDef,
  type RungId,
  type TrackStep,
} from './config';

/** Fork picks, keyed by the fork's isotope count. */
export type ForkPicks = Partial<Record<number, RungId>>;

const STEP_BY_ISOTOPES = new Map(ISOTOPE_TRACK.map((step) => [step.isotopes, step]));
const RUNG_BY_ID = new Map(ISOTOPE_TRACK.flatMap((step) => step.rungs.map((r) => [r.id, r])));

export function rung(id: RungId): RungDef {
  return RUNG_BY_ID.get(id)!;
}

/** The track's step at an isotope count, if it has one. */
export function trackStep(isotopes: number): TrackStep | undefined {
  return STEP_BY_ISOTOPES.get(isotopes);
}

export function isFork(step: TrackStep): boolean {
  return step.rungs.length > 1;
}

/** True when `id` is one of the two rungs at the fork `isotopes`. */
export function isPickFor(isotopes: number, id: unknown): id is RungId {
  const step = trackStep(isotopes);
  return !!step && isFork(step) && step.rungs.some((r) => r.id === id);
}

/**
 * The rungs in force with this many isotopes and these picks, in track order.
 * A fork counts only once it is picked.
 */
export function activeRungs(isotopes: number, forks: ForkPicks): RungId[] {
  const out: RungId[] = [];
  for (const step of ISOTOPE_TRACK) {
    if (step.isotopes > isotopes) break;
    if (!isFork(step)) out.push(step.rungs[0].id);
    else if (isPickFor(step.isotopes, forks[step.isotopes])) out.push(forks[step.isotopes]!);
  }
  return out;
}

export function hasRung(state: { isotopes: number; forks: ForkPicks }, id: RungId): boolean {
  return activeRungs(state.isotopes, state.forks).includes(id);
}

/**
 * What each isotope adds to every gain with this many isotopes and these
 * picks: Enrichment's rate once picked, else the usual. The run's own rate is
 * `modsOf(state).isotopeRate`; this answers for a reset not yet made.
 */
export function isotopeRate(isotopes: number, forks: ForkPicks): number {
  return activeRungs(isotopes, forks).includes('enrichment')
    ? TRACK_EFFECT.enrichmentRate
    : ISOTOPE_BONUS;
}

/** The steps a reset from `from` isotopes to `to` reaches for the first time. */
export function stepsReached(from: number, to: number): TrackStep[] {
  return ISOTOPE_TRACK.filter((step) => step.isotopes > from && step.isotopes <= to);
}

/** The forks reached by `isotopes` that have no pick yet: a reset there asks for these. */
export function unpickedForks(isotopes: number, forks: ForkPicks): TrackStep[] {
  return ISOTOPE_TRACK.filter(
    (step) =>
      step.isotopes <= isotopes && isFork(step) && !isPickFor(step.isotopes, forks[step.isotopes])
  );
}

/** Steps past `isotopes` the player can see: the next two, as the Reset tab shows them. */
export function nextSteps(isotopes: number, count = 2): TrackStep[] {
  return ISOTOPE_TRACK.filter((step) => step.isotopes > isotopes).slice(0, count);
}

/** Valid picks only: each key a fork, each value one of that fork's rungs. */
export function cleanPicks(value: unknown): ForkPicks {
  const out: ForkPicks = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
  for (const [key, id] of Object.entries(value)) {
    const isotopes = Number(key);
    if (isPickFor(isotopes, id)) out[isotopes] = id;
  }
  return out;
}
