/**
 * Spacebar Clicker: a whole surge on a fake clock, so 90+ seconds of play run
 * in a few real ones. The countdown in the core, gold overdrive and sparks,
 * the tallied results card, the dial as the surge's clock, and the rhythm
 * scope; then the same surge under reduced motion.
 */

import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';

// Minutes of fake time, frame by frame, take a few real minutes.
test.describe.configure({ timeout: 300_000 });

const GOLD = 'rgb(252, 211, 77)';
const GREEN = 'rgb(34, 197, 94)';

/** Load the game on a paused fake clock. Only `runFor` moves time after this. */
async function openOnClock(page: Page) {
  await page.clock.install({ time: new Date('2026-10-22T12:00:00Z') });
  await page.goto('/spacebar-clicker', { waitUntil: 'networkidle' });
  // A paused clock never drifts with real time, so real-time waits for CSS
  // can't eat into a timed window.
  await page.clock.pauseAt(new Date('2026-10-22T12:01:00Z'));
  await page.clock.runFor(100);
  await page.focus('#sc-reactor');

  const h = {
    text: async (sel: string) => (await page.textContent(sel))!.trim(),
    phase: () =>
      page.evaluate(() => document.getElementById('sc-reactor')!.dataset.surge ?? 'idle'),
    stage: () =>
      page.evaluate(() =>
        getComputedStyle(document.getElementById('sc-reactor')!).getPropertyValue('--stage').trim()
      ),
    pressFor: async (seconds: number, intervalMs: number) => {
      const n = Math.round((seconds * 1000) / intervalMs);
      for (let i = 0; i < n; i++) {
        await page.keyboard.press('Space');
        await page.clock.runFor(intervalMs);
      }
    },
    waitPhase: async (want: string, stepMs = 50, limit = 400) => {
      for (let i = 0; i < limit && (await h.phase()) !== want; i++) await page.clock.runFor(stepMs);
      return (await h.phase()) === want;
    },
    /** Keep a steady beat until the countdown starts, up to the longest gap. */
    pressUntilWarning: async () => {
      for (let i = 0; i < 100; i++) {
        await h.pressFor(1, 250);
        if ((await h.phase()) === 'warning') return true;
      }
      return false;
    },
  };
  return h;
}

test('a surge: countdown, overdrive, results, and back', async ({ page }) => {
  const g = await openOnClock(page);

  await g.pressFor(85, 250);
  expect(await g.phase(), 'no surge before 90 s of active play').toBe('idle');

  const litScope = await page.evaluate(() => {
    const c = document.getElementById('sc-scope') as HTMLCanvasElement;
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let lit = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i]! > 40) lit++;
    return lit;
  });
  expect(litScope, 'the rhythm scope draws a trace').toBeGreaterThan(100);

  expect(await g.pressUntilWarning(), 'a warning within 180 s').toBe(true);
  expect(await g.text('#sc-core-num')).toMatch(/^[123]$/);
  await expect(page.locator('#sc-surge-label')).toBeVisible();
  await expect(page.locator('#sc-state-label')).toBeHidden();
  expect(await g.text('#sc-surge-label')).toBe('Surge incoming');
  await page.clock.runFor(300);
  expect(
    await page.evaluate(() => getComputedStyle(document.getElementById('sc-arc')!).stroke),
    'the dial turns gold for the countdown'
  ).toBe(GOLD);

  expect(await g.waitPhase('active')).toBe(true);
  expect(await g.text('#sc-surge-label')).toBe('Surge x10');
  expect(await g.text('#sc-core-unit')).toBe('per second');

  // 40 presses inside the five seconds: 8.0 a second.
  const before = Number((await g.text('#sc-energy')).replace(/,/g, ''));
  await g.pressFor(2.4, 120);
  await page.waitForTimeout(300); // real time, for the color fade and the sparks
  expect(await g.stage(), 'the core runs gold').toBe(GOLD);
  expect(await page.locator('.spark').count()).toBeGreaterThan(0);
  expect(Number(await g.text('#sc-core-num'))).toBeGreaterThan(0);
  await g.pressFor(2.4, 120);

  let midTally = '';
  for (let i = 0; i < 60 && (await g.phase()) !== 'summary'; i++) await page.clock.runFor(20);
  expect(await g.phase()).toBe('summary');
  midTally = await g.text('#sc-surge-presses');
  expect(Number(midTally), 'results count up from low').toBeLessThan(40);
  await expect(page.locator('#sc-surge-summary')).toBeVisible();
  await expect(page.locator('#sc-state-label')).toBeVisible();
  await expect(page.locator('#sc-arc')).toHaveClass(/is-sweeping/);

  await page.clock.runFor(1000);
  expect(await g.text('#sc-surge-presses')).toBe('40');
  expect(await g.text('#sc-surge-rate')).toBe('8.0');
  const after = Number((await g.text('#sc-energy')).replace(/,/g, ''));
  expect(after - before, 'surge presses paid at least 10x').toBeGreaterThanOrEqual(400);
  await expect(page.locator('#sc-surge-best')).toBeVisible();
  await expect(page.locator('#sc-surge-best')).toHaveClass(/is-shining/);
  await expect(page.locator('.achievement[data-id="fast-fingers"]')).toHaveClass(/is-unlocked/);

  await page.clock.runFor(3200);
  expect(await g.phase()).toBe('idle');
  await expect(page.locator('#sc-surge-summary')).toBeHidden();
  await page.waitForTimeout(1000); // real time for the 0.8 s fade back
  expect(await g.stage(), 'the core fades back to its stage color').toBe(GREEN);
  expect(await g.text('#sc-stat-best-surge')).toBe('8.0');

  await page.clock.runFor(200_000);
  expect(await g.phase(), 'no surge while idle').toBe('idle');
});

test.describe('under reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('a surge still runs, without sparks or count-ups', async ({ page }) => {
    const g = await openOnClock(page);
    await g.pressFor(85, 250);
    expect(await g.pressUntilWarning()).toBe(true);
    expect(await g.waitPhase('active')).toBe(true);
    await g.pressFor(2.4, 120);
    expect(await page.locator('.spark').count()).toBe(0);
    expect(await g.stage(), 'the core still turns gold').toBe(GOLD);
    expect(await g.waitPhase('summary', 20)).toBe(true);
    expect(await g.text('#sc-surge-presses'), 'totals shown at once').toBe('20');
  });
});
