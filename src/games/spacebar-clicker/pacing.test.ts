/**
 * Pacing bands (SPACEBAR-CLICKER.md §4.12, §8.1). The simulation (sim.ts)
 * plays whole first runs against the real rules; these tests hold the results
 * inside the bands agreed with the maintainer, so a change to a price, a cost
 * or a perk that breaks the game's pace fails here.
 *
 * Set PACING_REPORT to a file path to write the whole table there, as the doc
 * quotes it: PACING_REPORT=pacing.txt npx vitest run pacing
 */

import { writeFileSync } from 'node:fs';

import { beforeAll, describe, expect, it } from 'vitest';

import { PERKS, type PerkId } from './config';
import { BUILDS, PLAYERS, summarize, type PerkPolicy, type Summary } from './sim';

type Who = keyof typeof PLAYERS;

const SEEDS = Array.from({ length: 8 }, (_, i) => 1000 + i * 7919);

/** The player each perk is for, where it isn't the steady tapper. */
const PLAYER_FOR: Partial<Record<PerkId, Who>> = {
  'brute-force': 'masher',
  'idle-hands': 'idler',
  autopilot: 'idler',
  metronome: 'sloppy',
  'held-breath': 'sloppy',
};

/** Only pays for time away, which the simulation doesn't play. */
const OFFLINE_ONLY: readonly PerkId[] = ['night-shift'];

const run = (who: Who, policy: PerkPolicy): Summary => summarize(PLAYERS[who], policy, SEEDS);
/** How much faster than `base`, as a share: 0.2 is 20% faster. */
const faster = (base: Summary, s: Summary) => (base.median - s.median) / base.median;

const base = {} as Record<Who, Summary>;
let takesAny: Summary;
const dreams = {} as Record<keyof typeof BUILDS, Summary>;
const single = new Map<PerkId, [Summary, Summary]>();

beforeAll(() => {
  for (const who of Object.keys(PLAYERS) as Who[]) base[who] = run(who, { kind: 'none' });
  takesAny = run('steady', { kind: 'any', keystones: ['glass-rhythm', 'storm-front'] });
  for (const [name, build] of Object.entries(BUILDS)) {
    dreams[name as keyof typeof BUILDS] = run(build.player, { kind: 'build', perks: build.perks });
  }
  for (const p of PERKS) {
    const who = PLAYER_FOR[p.id] ?? 'steady';
    single.set(p.id, [
      run(who, { kind: 'holding', perks: [[p.id, 1]] }),
      run(who, { kind: 'holding', perks: [[p.id, 3]] }),
    ]);
  }
  if (process.env.PACING_REPORT) writeFileSync(process.env.PACING_REPORT, report());
}, 120_000);

function report(): string {
  const pct = (b: Summary, s: Summary) => `${Math.round(faster(b, s) * 100)}%`.padStart(4);
  const lines = ['First prestige (1M energy this run), median minutes over 8 runs', ''];
  for (const who of Object.keys(PLAYERS) as Who[]) {
    lines.push(`${PLAYERS[who].name.padEnd(16)} no perks  ${base[who].median.toFixed(1)}`);
  }
  lines.push(
    '',
    `Steady tapper, takes every perk that suits it: ${takesAny.median.toFixed(1)} (${pct(base.steady, takesAny)} faster), ${takesAny.bought.toFixed(1)} bought`
  );
  for (const [name, build] of Object.entries(BUILDS)) {
    const s = dreams[name as keyof typeof BUILDS];
    lines.push(
      `${name.padEnd(7)} perfect run (${build.player}): ${s.median.toFixed(1)} (${pct(base[build.player], s)} faster)`
    );
  }
  lines.push('', 'One perk held all run, for its player: % faster at level I / III');
  for (const p of PERKS) {
    const who = PLAYER_FOR[p.id] ?? 'steady';
    const [one, three] = single.get(p.id)!;
    lines.push(
      `${p.name.padEnd(16)} ${p.rarity.padEnd(9)} ${who.padEnd(7)} ${pct(base[who], one)} ${pct(base[who], three)}`
    );
  }
  return lines.join('\n');
}

describe('pacing without perks', () => {
  it('takes a steady tapper 20 to 28 minutes to reach a million', () => {
    expect(base.steady.median).toBeGreaterThan(20);
    expect(base.steady.median).toBeLessThan(28);
  });

  it('pays for rhythm: a masher takes at least 40% longer', () => {
    expect(base.masher.median).toBeGreaterThan(base.steady.median * 1.4);
  });
});

describe('pacing with perks', () => {
  it('helps a player who takes every perk that suits them, modestly', () => {
    const f = faster(base.steady, takesAny);
    expect(f).toBeGreaterThan(0.03);
    expect(f).toBeLessThan(0.25);
  });

  it('makes every build’s perfect run 15% to 40% faster for its player', () => {
    for (const [name, build] of Object.entries(BUILDS)) {
      const f = faster(base[build.player], dreams[name as keyof typeof BUILDS]);
      expect(f, name).toBeGreaterThan(0.15);
      expect(f, name).toBeLessThan(0.4);
    }
  });

  it('never lets a masher or an idler outpace a steady tapper, even on a perfect run', () => {
    expect(dreams.masher.median).toBeGreaterThan(base.steady.median);
    expect(dreams.idle.median).toBeGreaterThan(base.steady.median);
  });

  it('keeps any one perk within reach: at most 35% at level I, 45% at level III', () => {
    for (const p of PERKS) {
      const who = PLAYER_FOR[p.id] ?? 'steady';
      const [one, three] = single.get(p.id)!;
      expect(faster(base[who], one), p.id).toBeLessThan(0.35);
      expect(faster(base[who], three), p.id).toBeLessThan(0.45);
    }
  });

  it('gives every perk something to offer at level III, for its player', () => {
    for (const p of PERKS) {
      if (OFFLINE_ONLY.includes(p.id)) continue;
      const who = PLAYER_FOR[p.id] ?? 'steady';
      expect(faster(base[who], single.get(p.id)![1]), p.id).toBeGreaterThan(0.02);
    }
  });
});
