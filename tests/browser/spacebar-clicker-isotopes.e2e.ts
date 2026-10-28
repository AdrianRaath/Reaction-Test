/**
 * Spacebar Clicker: isotopes. The shelf and its tooltips, the ring for the
 * next reset and the notice when one opens, the Reset the experiment tab and
 * its dialog, and the two shelves sharing a narrow face.
 */

import { energy, expect, openGame, seedSave, test } from './fixtures';

/** Drops stay away, so nothing else lands in the shop or the announcer. */
const noDrops = { rng: 7, activeS: 0, nextDropAtS: 99_999 };

test('the beads say what they are worth, on hover and on focus, and never press', async ({
  page,
}) => {
  await seedSave(page, { energy: 100, runLifetime: 5000, isotopes: 3, perks: noDrops });
  await openGame(page);

  const held = page.locator('#sc-isotopes-held');
  await expect(held).toHaveAttribute(
    'aria-label',
    '3 isotopes, +30% to all gains, kept through every reset. Next unlock at 4 isotopes: Night Lab.'
  );
  await expect(page.locator('#sc-isotope-next'), 'no reset open yet').toBeHidden();

  // Hover shows it, and the pointer can cross onto it.
  const tip = page.locator('#sc-isotope-tip');
  await held.hover();
  await expect(tip).toBeVisible();
  await expect(page.locator('#sc-isotope-tip-name')).toHaveText('3 isotopes');
  await expect(page.locator('#sc-isotope-tip-kind')).toHaveText('+30% to all gains');
  await tip.hover();
  await expect(tip).toBeVisible();
  await page.mouse.move(5, 5);
  await expect(tip).toBeHidden();

  // A click is never a press, and lets go of focus so Space keeps pressing.
  const before = await energy(page);
  await held.click();
  await page.waitForTimeout(200);
  expect(await energy(page)).toBe(before);
  expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('BUTTON');
  await page.mouse.move(5, 5);

  // From the reactor, Tab reaches the beads; Escape dismisses the tooltip.
  await page.focus('#sc-reactor');
  await page.keyboard.press('Tab');
  await expect(held).toBeFocused();
  await expect(tip).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(tip).toBeHidden();

  await page.click('[data-tab="stats"]');
  await expect(page.locator('#sc-stat-isotopes')).toHaveText('3, +30%');
});

test('a reset opening: one notice, the ring, and its way into the tab', async ({ page }) => {
  // Ten Particle Colliders cross a million within a second of loading.
  await seedSave(page, {
    runLifetime: 999_000,
    totalLifetime: 999_000,
    isotopes: 2,
    tappers: { collider: 10 },
    perks: noDrops,
  });
  await openGame(page);

  const ring = page.locator('#sc-isotope-next');
  await expect(ring).toBeVisible();
  await expect(page.locator('#sc-toast')).toHaveText(
    'Reactor is now Unstable. You can reset the experiment.'
  );
  await expect(page.locator('#sc-isotope-next-count')).toHaveText('+1');
  await expect(ring).toHaveAttribute(
    'aria-label',
    'Reset the experiment now for 1 isotope, taking all gains to +30% and unlocking a choice of Sixth Slot or Prodigy. The next isotope comes at 4.00M energy.'
  );

  await ring.hover();
  await expect(page.locator('#sc-isotope-tip-name')).toHaveText('Reset now for 1 isotope');
  await expect(page.locator('#sc-isotope-tip-kind')).toHaveText('+20% now, +30% after');

  // A click opens the tab and brings it into view, without taking focus.
  await ring.click();
  await expect(page.locator('#sc-tab-prestige')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#sc-prestige-btn')).toBeInViewport();
  await expect(page.locator('#sc-isotope-tip')).toBeHidden();
  expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('BUTTON');

  // From the keyboard, focus follows to the tab.
  await page.click('[data-tab="stats"]');
  await page.focus('#sc-reactor');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(ring).toBeFocused();
  await expect(page.locator('#sc-isotope-tip-name')).toHaveText('Reset now for 1 isotope');
  await page.keyboard.press('Enter');
  await expect(page.locator('#sc-tab-prestige')).toBeFocused();
  await expect(page.locator('#sc-tab-prestige')).toHaveAttribute('aria-selected', 'true');
});

test('the ring counts up as the run passes the next isotope', async ({ page }) => {
  await seedSave(page, {
    runLifetime: 3_998_000,
    totalLifetime: 3_998_000,
    tappers: { collider: 10 },
    perks: noDrops,
  });
  await openGame(page);
  await expect(page.locator('#sc-isotope-next-count')).toHaveText('+2');
  await expect(page.locator('#sc-isotope-next')).toHaveClass(/is-up/);
  const offset = await page.evaluate(() =>
    parseFloat(document.getElementById('sc-isotope-ring')!.style.strokeDashoffset)
  );
  expect(offset, 'a fresh count starts the ring near empty').toBeGreaterThan(95);
});

test('the Reset the experiment tab before a reset opens: the cost, the pay, the way there', async ({
  page,
}) => {
  await seedSave(page, { energy: 50, runLifetime: 420_000, isotopes: 1, perks: noDrops });
  await openGame(page);
  await page.click('[data-tab="prestige"]');

  await expect(page.locator('#sc-prestige-held')).toHaveText('1');
  await expect(page.locator('#sc-prestige-bonus')).toHaveText('+10% to all gains');
  await expect(page.locator('#sc-prestige-next')).toHaveText('Reset opens at 1.00M');
  await expect(page.locator('#sc-prestige-progress')).toHaveText('580K to go');
  await expect(page.locator('#sc-prestige-pays'), 'nothing to pay yet').toBeHidden();
  await expect(page.locator('#sc-prestige-btn')).toBeHidden();
  await expect(page.locator('.prestige-terms')).toContainText("This run's perks and offers");
  await expect(page.locator('.prestige-terms')).toContainText('The perk codex');
});

test('resetting: the dialog, the toast and the shelf say what changed', async ({ page }) => {
  await seedSave(page, {
    energy: 50,
    runLifetime: 2_600_000,
    totalLifetime: 2_600_000,
    isotopes: 1,
    perks: noDrops,
  });
  await openGame(page);
  await page.click('[data-tab="prestige"]');

  await expect(page.locator('#sc-prestige-gain')).toHaveText('+1');
  await expect(page.locator('#sc-prestige-after')).toHaveText('+20% after');
  await expect(page.locator('#sc-prestige-next')).toHaveText('Next isotope at 4.00M');
  await expect(page.locator('#sc-prestige-progress')).toHaveText('1.40M to go');
  await expect(page.locator('#sc-reset-unlocks'), 'the hook, beside the button').toHaveText(
    'Unlocks Capacitor.'
  );
  const meter = await page.evaluate(
    () => document.getElementById('sc-isotope-meter')!.style.transform
  );
  expect(meter, 'from 1M to 4M, the run is halfway').toMatch(/^scaleX\(0\.53/);

  await page.click('#sc-prestige-btn');
  await expect(page.locator('#sc-prestige-modal-message')).toHaveText(
    "Your energy, upgrades, auto-tappers, reactor state and this run's perks are wiped. You gain 1 isotope, taking all gains from +10% to +20%, and keep your achievements, records and perk codex. Warm Start begins the new run with 500 energy and a Lab Assistant."
  );
  await page.click('#sc-prestige-confirm');
  await expect(page.locator('#sc-toast')).toHaveText(
    'Experiment reset. 1 isotope gained: +20% to all gains.'
  );
  await expect(page.locator('#sc-isotopes-held')).toHaveAttribute(
    'aria-label',
    '2 isotopes, +20% to all gains, kept through every reset. Next unlock at 3 isotopes: a choice of Sixth Slot or Prodigy.'
  );
  await expect(page.locator('#sc-isotope-next'), 'a new run has no reset open').toBeHidden();
});

test.describe('on a touchscreen', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  test('a tap on the beads pins their tooltip; a tap on the ring opens the tab', async ({
    page,
  }) => {
    await seedSave(page, { energy: 100, runLifetime: 1_500_000, isotopes: 2, perks: noDrops });
    await openGame(page);
    const tip = page.locator('#sc-isotope-tip');
    const before = await energy(page);

    await page.locator('#sc-isotopes-held').tap();
    await expect(tip).toBeVisible();
    await expect(page.locator('#sc-isotope-tip-name')).toHaveText('2 isotopes');
    expect(await energy(page), 'a tap on the shelf is never a press').toBe(before);
    await page.locator('#sc-isotopes-held').tap();
    await expect(tip, 'a second tap closes it').toBeHidden();

    await page.locator('#sc-isotope-next').tap();
    await expect(page.locator('#sc-tab-prestige')).toHaveAttribute('aria-selected', 'true');
    await expect(tip).toBeHidden();
  });
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  const perks = [
    { id: 'glass-rhythm', level: 1 },
    { id: 'held-breath', level: 2 },
    { id: 'overtime', level: 3 },
    { id: 'loaded-dice', level: 1 },
    { id: 'self-replicator', level: 1 },
  ] as const;

  for (const isotopes of [4, 9, 12]) {
    test(`the ring, ${isotopes} beads and the perk shelf keep clear of each other and the readout`, async ({
      page,
    }) => {
      await seedSave(page, {
        energy: 2000,
        runLifetime: 2_600_000,
        isotopes,
        perks: { ...noDrops, owned: perks.map((p) => ({ ...p })) },
      });
      await openGame(page);
      const fit = await page.evaluate(() => {
        const r = (sel: string) => document.querySelector(sel)!.getBoundingClientRect();
        const ring = r('.isotope-ring');
        const perks = r('#sc-perk-shelf');
        const readout = r('.energy-row');
        return {
          apart: ring.right + 12 <= perks.left || ring.bottom <= perks.top,
          readout: readout.top >= Math.max(ring.bottom, perks.bottom),
          noScroll: document.documentElement.scrollWidth <= window.innerWidth,
        };
      });
      expect(fit).toEqual({ apart: true, readout: true, noScroll: true });
    });
  }
});
