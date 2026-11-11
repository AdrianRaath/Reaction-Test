/**
 * Spacebar Clicker: the run-down (SPACEBAR-CLICKER.md §8.5). A reactor left
 * alone gives full output for half an hour, then runs down to nothing over 90
 * minutes and faults, until ten presses on a beat restart it. Returns to a
 * run-down and to a fault, the restart and a stumble, the run-down and the
 * fault arriving in view, a stalled page, and the Stabiliser's tier drop.
 */

import { energy, expect, openGame, pressSteady, seedSave, test } from './fixtures';

const MIN = 60_000;
const noDrops = { rng: 7, activeS: 0, nextDropAtS: 99_999 };
/** A small run with machines: about 2 a second, so the energy reads as a whole number. */
const run = {
  energy: 1000,
  runLifetime: 5000,
  totalLifetime: 5000,
  tappers: { assistant: 4 },
  perks: noDrops,
};
const CLOCK = new Date('2026-11-09T12:00:00Z');

/** The per-second readout as a number. */
const eps = async (page: import('@playwright/test').Page) =>
  Number((await page.textContent('#sc-eps'))!.trim().replace(/,/g, ''));

test('back to a reactor left alone 75 minutes: half output, and a press brings it back', async ({
  page,
}) => {
  await seedSave(page, run, 75 * MIN);
  await openGame(page);
  const face = page.locator('#sc-reactor');

  await expect(face).toHaveAttribute('data-power', 'down');
  await expect(page.locator('#sc-state-label')).toBeHidden();
  await expect(page.locator('#sc-power-name')).toHaveText('Running down');
  await expect(page.locator('#sc-power-detail')).toHaveText('50%');
  await expect(page.locator('#sc-hint')).toHaveText(
    'Press once to bring the reactor back to full power.'
  );
  const half = await eps(page);

  await page.keyboard.press('Space');
  await expect(face).not.toHaveAttribute('data-power');
  await expect(page.locator('#sc-power-label')).toBeHidden();
  await expect(page.locator('#sc-state-label')).toBeVisible();
  await expect(page.locator('#sc-announce')).toContainText('Back to full power.');
  expect((await eps(page)) / half, 'the output doubles').toBeCloseTo(2, 1);
});

test('back to a fault: nothing earns until ten presses on a beat restart it', async ({ page }) => {
  await seedSave(page, run, 3 * 60 * MIN);
  await openGame(page);
  const face = page.locator('#sc-reactor');

  await expect(face).toHaveAttribute('data-power', 'fault');
  await expect(face).toHaveAttribute('aria-label', /faulted/);
  await expect(page.locator('#sc-power-name')).toHaveText('Fault');
  await expect(page.locator('#sc-power-detail')).toHaveText('10 presses on a beat to restart');
  await expect(page.locator('#sc-hint')).toHaveText(
    'Press the spacebar on a steady beat to restart the reactor.'
  );
  await expect(page.locator('#sc-eps')).toHaveText('0.0');
  await expect(page.locator('#sc-epp')).toHaveText('0');
  await expect(page.locator('#sc-combo-next')).toHaveText('after the restart');
  // No combo to show in a fault: the row and its bar go, the scope stays.
  await expect(page.locator('.combo-row')).toHaveCSS('opacity', '0');
  await expect(page.locator('.combo-track')).toHaveCSS('opacity', '0');
  await expect(page.locator('#sc-scope')).toBeVisible();
  await page.waitForTimeout(1200); // the return's energy counts in
  const held = await energy(page);
  await page.waitForTimeout(800);
  expect(await energy(page), 'a faulted reactor earns nothing').toBe(held);

  await pressSteady(page, 6, 220);
  await expect(page.locator('.restart-mark.is-lit')).toHaveCount(6);
  await expect(page.locator('#sc-power-detail')).toHaveText('4 to restart');
  expect(await energy(page), 'and its presses earn nothing').toBe(held);

  // The checks above may break the beat; the restart then starts over and
  // still finishes inside these presses.
  await pressSteady(page, 11, 220);
  await expect(face).not.toHaveAttribute('data-power');
  // The presses after the restart earn, and this save's first earns an
  // achievement, whose announcement follows; the toast queue keeps both.
  await expect(page.locator('#sc-toast-text')).toHaveText('Reactor restarted', { timeout: 6000 });
  await expect(page.locator('#sc-state-label')).toBeVisible();
  await page.waitForTimeout(600);
  expect(await energy(page), 'it earns again').toBeGreaterThan(held);
});

test('a press off the beat starts the restart over', async ({ page }) => {
  await seedSave(page, run, 3 * 60 * MIN);
  await openGame(page);
  await pressSteady(page, 5, 220);
  await expect(page.locator('.restart-mark.is-lit')).toHaveCount(5);

  await page.waitForTimeout(900);
  await page.keyboard.press('Space');
  await expect(page.locator('.restart-mark.is-lit')).toHaveCount(1);
  await expect(page.locator('#sc-power-detail')).toHaveText('Off the beat: 9 to restart');
  await expect(page.locator('#sc-announce')).toContainText('Off the beat.');
  await expect(page.locator('#sc-reactor')).toHaveAttribute('data-power', 'fault');
});

test('left alone in view, the reactor starts to run down at half an hour', async ({ page }) => {
  await page.clock.install({ time: CLOCK });
  // Never away, but untouched for 29.5 minutes as the page opens.
  await seedSave(page, run, 0, 29.5 * MIN);
  await openGame(page);
  const face = page.locator('#sc-reactor');
  await expect(face).not.toHaveAttribute('data-power');

  await page.clock.runFor(60_000);
  await expect(face).toHaveAttribute('data-power', 'down');
  await expect(page.locator('#sc-power-detail')).toHaveText('99%');
});

test('left alone in view, the reactor faults where you can see it, quietly', async ({ page }) => {
  await page.clock.install({ time: CLOCK });
  await seedSave(page, run, 0, 120 * MIN - 20_000);
  await openGame(page);
  const face = page.locator('#sc-reactor');
  await expect(face).toHaveAttribute('data-power', 'down');

  await page.clock.runFor(30_000);
  await expect(face).toHaveAttribute('data-power', 'fault');
  await expect(page.locator('#sc-announce')).toHaveText(
    'The reactor has faulted. Press on a steady beat to restart it.'
  );
  await expect(page.locator('#sc-toast'), 'no notice of its own').toBeHidden();
});

test('a page that stalls in view, such as a laptop asleep, is paid as time away', async ({
  page,
}) => {
  await page.clock.install({ time: CLOCK });
  await seedSave(page, run);
  await openGame(page);

  await page.clock.fastForward('03:00:00');
  await expect(page.locator('#sc-toast-text')).toHaveText(/^Untended 3h 00m: \+9,\d{3} energy$/);
  await expect(page.locator('#sc-reactor')).toHaveAttribute('data-power', 'fault');
});

test('the Stabiliser drops a broken combo one tier, and a pause past ten seconds ends it', async ({
  page,
}) => {
  await page.clock.install({ time: CLOCK });
  await seedSave(page, {
    energy: 0,
    runLifetime: 0,
    upgrades: { finger: 0, double: 0, spring: 0, stabiliser: 1, sync: 0 },
    perks: noDrops,
  });
  await openGame(page);
  await pressSteady(page, 30, 200);
  // Locked in, at 25 or more (a press the browser delays is forgiven, not counted).
  await expect(page.locator('#sc-combo')).toHaveText(/^(2[5-9]|30)$/);

  await page.waitForTimeout(1000);
  await expect(page.locator('#sc-combo'), 'a pause: down to Steady').toHaveText('10');
  await expect(page.locator('#sc-combo-tier')).toHaveText('Steady');

  await page.clock.fastForward(10_000);
  await expect(page.locator('#sc-combo'), 'past ten seconds: gone').toHaveText('0');
});
