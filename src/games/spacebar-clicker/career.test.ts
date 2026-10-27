/**
 * Career bands (SPACEBAR-CLICKER.md §8.3.5). The simulation (sim.ts) plays a
 * steady tapper who buys perks run after run, resetting by habit, with the
 * isotope track applied; these tests hold the results to the targets agreed
 * with the maintainer.
 *
 * Each habit plays every fork on its first side, then each fork flipped
 * alone, so the two sides of a fork are compared with everything else equal.
 *
 * Set CAREER_REPORT to a file path to write the whole table there, as the doc
 * quotes it: CAREER_REPORT=career.txt npx vitest run career
 */

import { writeFileSync } from 'node:fs';

import { beforeAll, describe, expect, it } from 'vitest';

import { ISOTOPE_TRACK } from './config';
import {
  HABITS,
  PLAYERS,
  simulateCareer,
  simulateRun,
  type CareerResult,
  type Habit,
  type PerkPolicy,
} from './sim';
import { isFork, type ForkPicks } from './track';

const SEEDS = Array.from({ length: 8 }, (_, i) => 1000 + i * 7919);
const POLICY: PerkPolicy = { kind: 'any', keystones: ['glass-rhythm', 'storm-front'] };
/** Three past the capstone, so its two sides have runs to differ on. */
const UNTIL = 15;

const FORKS = ISOTOPE_TRACK.filter(isFork);
const FIRST: ForkPicks = Object.fromEntries(FORKS.map((s) => [s.isotopes, s.rungs[0].id]));
/** Every fork on its second side: Prodigy with Cornerstone gives the fastest runs. */
const SECOND: ForkPicks = Object.fromEntries(FORKS.map((s) => [s.isotopes, s.rungs[1]!.id]));
const flipped = (isotopes: number): ForkPicks => ({ ...FIRST, [isotopes]: SECOND[isotopes] });

const HABIT_NAMES = Object.keys(HABITS) as Habit[];
/** Careers by habit, then by pick set: 'first', 'second', or the fork flipped. */
const careers = {} as Record<Habit, Record<string, CareerResult[]>>;
const firstRuns: number[] = [];

const play = (habit: Habit, picks: ForkPicks) =>
  SEEDS.map((seed) => simulateCareer(PLAYERS.steady, POLICY, seed, habit, picks, UNTIL));

beforeAll(() => {
  for (const habit of HABIT_NAMES) {
    careers[habit] = { first: play(habit, FIRST), second: play(habit, SECOND) };
    for (const step of FORKS) careers[habit][step.isotopes] = play(habit, flipped(step.isotopes));
  }
  for (const seed of SEEDS) firstRuns.push(simulateRun(PLAYERS.steady, POLICY, seed).millionS!);
  if (process.env.CAREER_REPORT) writeFileSync(process.env.CAREER_REPORT, report());
}, 120_000);

const all = (habit: Habit) => Object.values(careers[habit]).flat();
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return (s[(s.length - 1) >> 1]! + s[s.length >> 1]!) / 2;
};

/** Minutes from the reset that reaches a fork to the career's end, averaged over seeds. */
const fromFork = (cs: CareerResult[], isotopes: number) =>
  mean(cs.map((c) => c.reachedAt[UNTIL]! - c.reachedAt[isotopes]!));

/** The two sides of a fork: minutes from it to the end, first side then second. */
function sides(habit: Habit, isotopes: number): [number, number] {
  return [fromFork(careers[habit].first, isotopes), fromFork(careers[habit][isotopes]!, isotopes)];
}

/** How far apart two times are, as a share of the longer. */
const apart = ([a, b]: [number, number]) => Math.abs(a - b) / Math.max(a, b);

/** Minutes to each run's first million before the capstone, fastest first. */
const millionsBeforeCapstone = (habit: Habit) =>
  all(habit)
    .flatMap((c) => c.runs.filter((r) => r.isotopes < 12).map((r) => r.millionMinutes))
    .sort((a, b) => a - b);

function report(): string {
  const lines = [
    `Careers: a steady tapper who buys perks, ${SEEDS.length} seeds, to ${UNTIL} isotopes`,
  ];
  for (const habit of HABIT_NAMES) {
    const cs = all(habit);
    const goal = HABITS[habit] ** 2;
    lines.push('', `${habit}: resets at ${goal}M, for ${HABITS[habit]} isotope(s) a reset`);
    const reached = Array.from({ length: UNTIL }, (_, i) => i + 1)
      .filter((n) => cs[0]!.reachedAt[n] !== undefined)
      .map((n) => `${n}@${median(cs.map((c) => c.reachedAt[n]!)).toFixed(0)}`);
    lines.push(`  First holds n isotopes at minute (median): ${reached.join(' ')}`);
    const byIsotopes = new Map<number, number[]>();
    for (const c of cs) {
      for (const r of c.runs)
        byIsotopes.set(r.isotopes, [...(byIsotopes.get(r.isotopes) ?? []), r.millionMinutes]);
    }
    const runs = [...byIsotopes].map(([n, ms]) => `${n}:${median(ms).toFixed(1)}`);
    lines.push(`  Minutes to a million, by isotopes held (median): ${runs.join(' ')}`);
    const fast = millionsBeforeCapstone(habit);
    lines.push(
      `  Before the capstone: fastest million ${fast[0]!.toFixed(1)}, 10th percentile ${fast[Math.floor(fast.length / 10)]!.toFixed(1)}, under 8 minutes ${fast.filter((m) => m < 8).length} of ${fast.length}`
    );
    for (const step of FORKS) {
      const [a, b] = sides(habit, step.isotopes);
      const [ra, rb] = step.rungs.map((r) => r.name);
      lines.push(
        `  Fork ${step.isotopes}, minutes from it to ${UNTIL}: ${ra} ${a.toFixed(1)}, ${rb} ${b.toFixed(1)} (${Math.round(apart([a, b]) * 100)}% apart)`
      );
    }
  }
  return lines.join('\n');
}

describe('careers with the isotope track', () => {
  it('leaves a first run as it was: the track starts at the first reset', () => {
    for (const habit of HABIT_NAMES) {
      careers[habit].first.forEach((c, i) => {
        expect(c.runs[0]!.millionMinutes * 60, `${habit} seed ${i}`).toBeCloseTo(firstRuns[i]!, 6);
      });
    }
    expect(median(firstRuns) / 60).toBeGreaterThan(19);
    expect(median(firstRuns) / 60).toBeLessThan(25);
  });

  it('reaches 15 isotopes on every habit and every pick', () => {
    for (const habit of HABIT_NAMES) {
      for (const c of all(habit)) expect(c.finished, habit).toBe(true);
    }
  });

  it('gets faster as isotopes stack up', () => {
    for (const habit of HABIT_NAMES) {
      const runs = careers[habit].first.map((c) => c.runs);
      const first = median(runs.map((r) => r[0]!.millionMinutes));
      const last = median(runs.map((r) => r.at(-1)!.millionMinutes));
      expect(last, habit).toBeLessThan(first * 0.6);
    }
  });

  it('keeps the two sides of forks 3, 6 and 9 within 15% of each other', () => {
    for (const habit of HABIT_NAMES) {
      for (const step of FORKS.filter((s) => s.isotopes < 12)) {
        expect(apart(sides(habit, step.isotopes)), `${habit}, fork ${step.isotopes}`).toBeLessThan(
          0.15
        );
      }
    }
  });

  // Both miss today; SPACEBAR-CLICKER.md §8.3.7 has the numbers and the
  // proposals that wait on the maintainer.
  it.todo('keeps the capstone’s two sides within 15% of each other');
  it.todo('never brings a million in under 8 minutes before the capstone');
});
