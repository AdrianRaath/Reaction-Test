/**
 * Spacebar Clicker: where the energy comes from (SPACEBAR-CLICKER.md
 * §8.5.10). The bar under the readouts, the player's share against the
 * auto-tappers' own, and the line under the combo multiplier for what
 * Synchronisation gives the auto-tappers. The bar waiting for auto-tappers,
 * rising with presses and draining after, the line opening with
 * Synchronisation and following the combo, a fault standing the bar down,
 * and the face still fitting a 1440x900 screen with every line showing.
 */

import { expect, openGame, pressSteady, seedSave, test } from './fixtures';

const MIN = 60_000;
const noDrops = { rng: 7, activeS: 0, nextDropAtS: 99_999 };
/** A small run with machines: about 2 a second, against a press's 1 at 5 a second. */
const run = {
  energy: 1000,
  runLifetime: 5000,
  totalLifetime: 5000,
  tappers: { assistant: 4 },
  perks: noDrops,
};

/** The player's share as the bar's number reads it. */
const youPct = async (page: import('@playwright/test').Page) =>
  Number((await page.textContent('#sc-share-you'))!.replace('%', ''));

test('the share bar waits for auto-tappers', async ({ page }) => {
  await seedSave(page, { ...run, tappers: {} });
  await openGame(page);
  await pressSteady(page, 12, 200);

  await expect(page.locator('#sc-share')).not.toHaveClass(/is-shown/);
  await expect(page.locator('#sc-share')).toHaveCSS('opacity', '0');
  // All of it is the player's, and the Stats panel says so.
  await expect(page.locator('#sc-stat-share')).toHaveText('100%');
});

test('the player’s share rises with presses and drains after them', async ({ page }) => {
  await seedSave(page, run);
  await openGame(page);
  const bar = page.locator('#sc-share');

  // Nothing pressed yet: the machines' all of it.
  await expect(bar).toHaveClass(/is-shown/);
  await expect(page.locator('#sc-share-you')).toHaveText('0%');
  await expect(page.locator('#sc-share-machines')).toHaveText('100%');

  await pressSteady(page, 30, 200);
  const pressing = await youPct(page);
  expect(pressing, 'presses outearn four Lab Assistants').toBeGreaterThan(60);
  await expect(page.locator('#sc-share-machines')).toHaveText(`${100 - pressing}%`);
  // The bar's edge stands where the number says.
  const fraction = Number(await bar.evaluate((n) => n.style.getPropertyValue('--share')));
  expect(Math.abs(fraction * 100 - pressing)).toBeLessThanOrEqual(1);

  // Stopped, the share drains over a few seconds rather than at once.
  await page.waitForTimeout(800);
  expect(await youPct(page)).toBeGreaterThan(pressing - 20);
  await page.waitForTimeout(4000);
  expect(await youPct(page)).toBeLessThan(pressing - 20);
});

test('Synchronisation opens the auto-tapper line, which follows the combo', async ({ page }) => {
  await seedSave(page, { ...run, energy: 200_000, runLifetime: 300_000 });
  await openGame(page);
  const meter = page.locator('#sc-combo-meter');
  const line = page.locator('#sc-combo-sync');

  await expect(meter).not.toHaveClass(/is-synced/);
  expect((await line.boundingBox())!.height, 'closed').toBeLessThan(1);

  await page.locator('.shop-item[data-id="sync"] .shop-buy').click();
  await expect(meter).toHaveClass(/is-synced/);
  await expect(page.locator('#sc-combo-sync-mult')).toHaveText('x1');
  await expect.poll(async () => (await line.boundingBox())!.height).toBeGreaterThan(10);
  await expect(line).toContainText('auto-tappers');

  // Steady's x1.5 gives the auto-tappers x1.25; Locked in's x2 gives them x1.5.
  await page.focus('#sc-reactor');
  await pressSteady(page, 12, 200);
  await expect(page.locator('#sc-combo-mult')).toHaveText('x1.5');
  await expect(page.locator('#sc-combo-sync-mult')).toHaveText('x1.25');
  await pressSteady(page, 15, 200);
  await expect(page.locator('#sc-combo-mult')).toHaveText('x2');
  await expect(page.locator('#sc-combo-sync-mult')).toHaveText('x1.5');
});

test('a fault stands the share bar down', async ({ page }) => {
  await seedSave(page, run, 3 * 60 * MIN);
  await openGame(page);

  await expect(page.locator('#sc-reactor')).toHaveAttribute('data-power', 'fault');
  await expect(page.locator('#sc-share')).toHaveCSS('opacity', '0');
  await expect(page.locator('#sc-stat-share')).toHaveText('—');
});

test('the face fits a 1440x900 screen with the share bar and the auto-tapper line', async ({
  page,
}) => {
  await seedSave(page, { ...run, upgrades: { sync: 1, stabiliser: 1 } });
  await openGame(page);
  await pressSteady(page, 12, 200);

  await expect(page.locator('#sc-share')).toHaveClass(/is-shown/);
  await expect(page.locator('#sc-combo-meter')).toHaveClass(/is-synced/);
  // The hint takes one line on a face this wide, which pays for the bar.
  expect((await page.locator('#sc-hint').boundingBox())!.height).toBeLessThan(26);
  expect((await page.locator('#sc-reactor').boundingBox())!.height).toBeLessThanOrEqual(588.5);
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('"auto-tappers" shortens to "auto", and the bar keeps its length', async ({ page }) => {
    await seedSave(page, { ...run, upgrades: { sync: 1 } });
    await openGame(page);
    await pressSteady(page, 12, 200);

    for (const id of ['#sc-share', '#sc-combo-sync']) {
      await expect(page.locator(`${id} .word-short`)).toBeVisible();
      await expect(page.locator(`${id} .word-long`)).toBeHidden();
    }
    expect((await page.locator('.share-bar').boundingBox())!.width).toBeGreaterThan(140);
    // Nothing in the combo row wraps.
    const row = page.locator('.combo-row');
    expect(await row.evaluate((n) => n.scrollWidth <= n.clientWidth)).toBe(true);
    expect((await page.locator('#sc-combo-tier').boundingBox())!.height).toBeLessThan(22);
  });
});
