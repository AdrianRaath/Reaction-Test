/**
 * Spacebar Clicker: every reactor state at rest, then a live stage change.
 * The Cherenkov ramp (DESIGN.md, Reactor-Ramp Exception), the dial lights,
 * the one-shot stage-change sequence, and the core's press pulse after it.
 */

import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';

const STAGES: [id: string, from: number, to: number, color: string][] = [
  ['dormant', 0, 500, 'rgb(34, 197, 94)'],
  ['warming', 500, 1e4, 'rgb(34, 197, 94)'],
  ['stable', 1e4, 1e5, 'rgb(34, 197, 94)'],
  ['charged', 1e5, 1e6, 'rgb(45, 212, 191)'],
  ['unstable', 1e6, 1e7, 'rgb(34, 211, 238)'],
  ['critical', 1e7, 1e8, 'rgb(56, 189, 248)'],
  ['supercritical', 1e8, 2e8, 'rgb(224, 242, 254)'],
];

/** A save at a given run lifetime, with nothing owned. */
async function setRun(page: Page, lifetime: number): Promise<void> {
  await page.evaluate((lt) => {
    const key = 'reflexlab:spacebar-clicker:save';
    const s = JSON.parse(localStorage.getItem(key) ?? '{}');
    Object.assign(s, { runLifetime: lt, totalLifetime: lt, energy: 0, tappers: {} });
    s.lastSeen = Date.now();
    localStorage.setItem(key, JSON.stringify(s));
    Storage.prototype.setItem = () => {};
  }, lifetime);
  await page.reload({ waitUntil: 'networkidle' });
}

/** The animations running on the core itself, by name. */
function coreAnimations(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    document
      .getElementById('sc-core')!
      .getAnimations()
      .filter((a) => a.playState === 'running')
      .map((a) => (a as CSSAnimation).animationName)
  );
}

test('every reactor state wears its color and its dial lights', async ({ page }) => {
  await page.goto('/spacebar-clicker', { waitUntil: 'networkidle' });
  for (const [i, [id, from, to, color]] of STAGES.entries()) {
    await setRun(page, from + (to - from) * 0.6);
    await page.waitForTimeout(400);
    const got = await page.evaluate(() => {
      const r = document.getElementById('sc-reactor')!;
      return {
        state: r.dataset.state,
        stage: getComputedStyle(r).getPropertyValue('--stage').trim(),
        lit: document.querySelectorAll('.dial-led.is-lit').length,
        booting: r.classList.contains('is-booting'),
      };
    });
    expect(got, id).toEqual({ state: id, stage: color, lit: i, booting: false });
  }
});

test('crossing into Stable plays the stage-change sequence', async ({ page }) => {
  await page.goto('/spacebar-clicker', { waitUntil: 'networkidle' });
  await setRun(page, 9_990);
  await page.focus('#sc-reactor');

  let crossed = false;
  for (let i = 0; i < 40 && !crossed; i++) {
    await page.keyboard.press('Space');
    await page.waitForTimeout(160);
    crossed = (await page.getAttribute('#sc-reactor', 'data-state')) === 'stable';
  }
  expect(crossed, 'pressing across 10,000 reaches Stable').toBe(true);

  const fired = await page.evaluate(() => ({
    shockwave: document.getElementById('sc-shockwave')!.classList.contains('is-firing'),
    wash: document.getElementById('sc-wash')!.classList.contains('is-washing'),
    light: document.querySelector('.dial-led[data-led="stable"]')!.classList.contains('is-new'),
    name: document.getElementById('sc-state')!.classList.contains('is-settling'),
    dialFull: document.getElementById('sc-arc')!.classList.contains('is-complete'),
  }));
  expect(fired).toEqual({ shockwave: true, wash: true, light: true, name: true, dialFull: true });

  await page.waitForTimeout(1500);
  expect(
    await page.evaluate(() => {
      const a = document.getElementById('sc-arc')!;
      return a.classList.contains('is-sweeping') || !a.classList.contains('is-complete');
    }),
    'the dial sweeps back after its hold'
  ).toBe(true);
});

// The press pulse and stage snap used to stay on the core once played, so the
// snap masked every later press and the core stopped breathing until a reload.
test('a press still pulses after a stage change, and the core breathes between presses', async ({
  page,
}) => {
  await page.goto('/spacebar-clicker', { waitUntil: 'networkidle' });
  await setRun(page, 9_990);
  await page.focus('#sc-reactor');
  expect(await coreAnimations(page), 'Warming breathes at rest').toEqual(['core-breathe']);

  let crossed = false;
  for (let i = 0; i < 40 && !crossed; i++) {
    await page.keyboard.press('Space');
    await page.waitForTimeout(160);
    crossed = (await page.getAttribute('#sc-reactor', 'data-state')) === 'stable';
  }
  expect(crossed, 'pressing across 10,000 reaches Stable').toBe(true);
  expect(await coreAnimations(page), 'the stage snap').toEqual(['core-step']);

  await page.waitForTimeout(600);
  expect(await coreAnimations(page), 'Stable breathes once the snap has played').toEqual([
    'core-breathe',
  ]);
  await page.keyboard.press('Space');
  expect(await coreAnimations(page), 'a press after the stage change').toEqual(['core-press']);
  await page.waitForTimeout(400);
  expect(await coreAnimations(page), 'the core breathes again after the press').toEqual([
    'core-breathe',
  ]);
});
