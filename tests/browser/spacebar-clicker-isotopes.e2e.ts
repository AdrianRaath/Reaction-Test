/**
 * Spacebar Clicker: isotopes. The badge, its ring, lines and tooltip, the
 * tag when a reset opens and the notice with it, the Isotopes tab and the
 * reset dialog, and the badge sharing a narrow face with the perk shelf.
 */

import { energy, expect, openGame, seedSave, test } from './fixtures';

/** Drops stay away, so nothing else lands in the shop or the announcer. */
const noDrops = { rng: 7, activeS: 0, nextDropAtS: 99_999 };

test('the badge says what isotopes are worth, on hover and on focus, and never presses', async ({
  page,
}) => {
  await seedSave(page, { energy: 100, runLifetime: 5000, isotopes: 3, perks: noDrops });
  await openGame(page);

  const badge = page.locator('#sc-isotope-badge');
  await expect(badge).toHaveAttribute(
    'aria-label',
    '3 isotopes, +30% to all gains, kept through every reset. A reset opens at 1.00M energy. Next unlock at 4 isotopes: Night Lab.'
  );
  await expect(page.locator('#sc-isotope-count')).toHaveText('3');
  await expect(page.locator('#sc-isotope-name')).toHaveText('3 isotopes');
  await expect(page.locator('#sc-isotope-progress')).toHaveText('next in 995K');
  await expect(page.locator('#sc-isotope-tag'), 'no reset open yet').toBeHidden();

  // Hover shows it, and the pointer can cross onto it.
  const tip = page.locator('#sc-isotope-tip');
  await badge.hover();
  await expect(tip).toBeVisible();
  await expect(page.locator('#sc-isotope-tip-name')).toHaveText('3 isotopes');
  await expect(page.locator('#sc-isotope-tip-kind')).toHaveText('+30% to all gains');
  await expect(page.locator('#sc-isotope-tip-detail')).toHaveText(
    'Each one adds 10% to everything you earn, and they last through every reset. A reset opens at 1.00M energy: 995K to go.'
  );
  await tip.hover();
  await expect(tip).toBeVisible();
  await page.mouse.move(5, 5);
  await expect(tip).toBeHidden();

  // A click opens the Isotopes tab, is never a press, and lets go of focus
  // so Space keeps pressing.
  const before = await energy(page);
  await badge.click();
  await expect(page.locator('#sc-tab-prestige')).toHaveAttribute('aria-selected', 'true');
  expect(await energy(page)).toBe(before);
  expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('BUTTON');
  await page.mouse.move(5, 5);

  // From the reactor, Tab reaches the badge; Escape dismisses the tooltip.
  await page.focus('#sc-reactor');
  await page.keyboard.press('Tab');
  await expect(badge).toBeFocused();
  await expect(tip).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(tip).toBeHidden();

  await page.click('[data-tab="stats"]');
  await expect(page.locator('#sc-stat-isotopes')).toHaveText('3, +30%');
});

test('a new player sees the first isotope coming, on a scale that keeps pace with the clock', async ({
  page,
}) => {
  // An eighth of the way to a million is half the ring: the cube root.
  await seedSave(page, { energy: 100, runLifetime: 125_000, isotopes: 0, perks: noDrops });
  await openGame(page);

  const badge = page.locator('#sc-isotope-badge');
  await expect(badge).toBeVisible();
  await expect(page.locator('#sc-isotope-seed'), 'a bead waits in the ring').toBeVisible();
  await expect(page.locator('#sc-isotope-count')).toBeHidden();
  await expect(page.locator('#sc-isotope-name')).toHaveText('First isotope');
  await expect(page.locator('#sc-isotope-progress')).toHaveText('875K to go');
  await expect(badge).toHaveAttribute(
    'aria-label',
    'No isotopes yet. Resetting the experiment pays them, and they last through every reset. A reset opens at 1.00M energy. Next unlock at 1 isotope: Warm Start.'
  );
  await expect
    .poll(() =>
      page.evaluate(() =>
        parseFloat(document.getElementById('sc-isotope-ring')!.style.strokeDashoffset)
      )
    )
    .toBeCloseTo(50, 0);

  await badge.hover();
  await expect(page.locator('#sc-isotope-tip-name')).toHaveText('Isotopes');
  await expect(page.locator('#sc-isotope-tip-kind')).toHaveText('Each adds 10% to all gains');
  await expect(page.locator('#sc-isotope-tip-unlock')).toHaveText('Next at 1 isotope: Warm Start.');
  await page.mouse.move(5, 5);

  // The Isotopes tab's meter fills on the same scale.
  await page.click('[data-tab="prestige"]');
  const meter = await page.evaluate(
    () => document.getElementById('sc-isotope-meter')!.style.transform
  );
  expect(meter).toMatch(/^scaleX\(0\.5/);

  // At 1440x900 the badge's lines end clear of the readout, which stays put,
  // and the face keeps above the fold.
  const fit = await page.evaluate(() => {
    const r = (sel: string) => document.querySelector(sel)!.getBoundingClientRect();
    const lines = r('.isotope-lines');
    const readout = r('#sc-energy');
    return {
      apart: lines.right + 8 <= readout.left,
      face: r('#sc-reactor').height <= 588,
    };
  });
  expect(fit).toEqual({ apart: true, face: true });
});

test('a reset opening: one notice, the tag, and the way into the tab', async ({ page }) => {
  // Ten Particle Colliders cross a million within a second of loading.
  await seedSave(page, {
    runLifetime: 999_000,
    totalLifetime: 999_000,
    isotopes: 2,
    tappers: { collider: 10 },
    perks: noDrops,
  });
  await openGame(page);

  const badge = page.locator('#sc-isotope-badge');
  const tag = page.locator('#sc-isotope-tag');
  await expect(tag).toBeVisible();
  await expect(page.locator('#sc-toast')).toHaveText(
    'Reactor is now Unstable. You can reset the experiment.'
  );
  await expect(tag).toHaveText('+1');
  await expect(page.locator('#sc-isotope-progress')).toHaveText('Reset for +1');
  await expect(badge).toHaveClass(/is-open/);
  await expect(badge).toHaveAttribute(
    'aria-label',
    '2 isotopes, +20% to all gains, kept through every reset. Reset the experiment now for 1 isotope, taking all gains to +30% and unlocking a choice of Sixth Slot or Prodigy. The next isotope comes at 3.00M energy.'
  );

  await badge.hover();
  await expect(page.locator('#sc-isotope-tip-name')).toHaveText('Reset now for 1 isotope');
  await expect(page.locator('#sc-isotope-tip-kind')).toHaveText('+20% now, +30% after');

  // A click opens the tab and brings it into view, without taking focus.
  await badge.click();
  await expect(page.locator('#sc-tab-prestige')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#sc-prestige-btn')).toBeInViewport();
  await expect(page.locator('#sc-isotope-tip')).toBeHidden();
  expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('BUTTON');

  // From the keyboard, focus follows to the tab.
  await page.click('[data-tab="stats"]');
  await page.focus('#sc-reactor');
  await page.keyboard.press('Tab');
  await expect(badge).toBeFocused();
  await expect(page.locator('#sc-isotope-tip-name')).toHaveText('Reset now for 1 isotope');
  await page.keyboard.press('Enter');
  await expect(page.locator('#sc-tab-prestige')).toBeFocused();
  await expect(page.locator('#sc-tab-prestige')).toHaveAttribute('aria-selected', 'true');
});

test('the tag counts up as the run passes the next isotope', async ({ page }) => {
  await seedSave(page, {
    runLifetime: 2_998_000,
    totalLifetime: 2_998_000,
    tappers: { collider: 10 },
    perks: noDrops,
  });
  await openGame(page);
  await expect(page.locator('#sc-isotope-tag')).toHaveText('+2');
  await expect(page.locator('#sc-isotope-tag')).toHaveClass(/is-up/);
  const offset = await page.evaluate(() =>
    parseFloat(document.getElementById('sc-isotope-ring')!.style.strokeDashoffset)
  );
  expect(offset, 'a fresh count starts the ring near empty').toBeGreaterThan(95);
});

test('the Isotopes tab before a reset opens: the cost, the pay, the way there', async ({
  page,
}) => {
  await seedSave(page, { energy: 50, runLifetime: 420_000, isotopes: 1, perks: noDrops });
  await openGame(page);
  await page.click('[data-tab="prestige"]');

  await expect(page.getByRole('tab', { name: 'Isotopes' })).toHaveAttribute(
    'aria-selected',
    'true'
  );
  await expect(page.locator('#sc-reset-intro'), 'a player holding isotopes has reset').toBeHidden();
  await expect(page.locator('#sc-prestige-held')).toHaveText('1');
  await expect(page.locator('#sc-prestige-held-title')).toHaveText('1 isotope');
  await expect(page.locator('#sc-prestige-bonus')).toHaveText('+10% to all gains');
  await expect(page.locator('#sc-prestige-label')).toHaveText('Next reset');
  await expect(page.locator('#sc-prestige-next')).toHaveText('Reset opens at 1.00M energy');
  await expect(page.locator('#sc-prestige-progress')).toHaveText('580K to go');
  await expect(page.locator('#sc-prestige-pays'), 'nothing to pay yet').toBeHidden();
  await expect(page.locator('#sc-prestige-btn')).toBeHidden();
  await expect(page.locator('#sc-reset-unlocks')).toHaveText('The next reset unlocks Capacitor.');
  // The meter fills on the badge's cube-root scale: 0.42M is three quarters.
  const meter = await page.evaluate(
    () => document.getElementById('sc-isotope-meter')!.style.transform
  );
  expect(meter).toMatch(/^scaleX\(0\.74/);
  await expect(page.locator('.prestige-terms')).toContainText("this run's perks and offers");
  await expect(page.locator('.prestige-terms')).toContainText('the perk codex');
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
  await expect(page.locator('#sc-prestige-to')).toHaveText('isotope');
  // The gains before and after, side by side.
  await expect(page.locator('#sc-prestige-from')).toHaveText('+10%');
  await expect(page.locator('#sc-prestige-after')).toHaveText('+20%');
  await expect(page.locator('#sc-prestige-label'), 'open, the card shows the pay').toHaveText(
    'A reset now pays'
  );
  await expect(page.locator('#sc-prestige-next')).toHaveText('Next isotope at 3.00M energy');
  await expect(page.locator('#sc-prestige-progress')).toHaveText('400K to go');
  await expect(page.locator('#sc-reset-unlocks'), 'the hook, beside the button').toHaveText(
    'Unlocks Capacitor.'
  );
  const meter = await page.evaluate(
    () => document.getElementById('sc-isotope-meter')!.style.transform
  );
  expect(meter, 'from 1M to 3M, the run is four fifths along').toMatch(/^scaleX\(0\.8/);

  await page.click('#sc-prestige-btn');
  await expect(page.locator('#sc-reset-sum-gain')).toHaveText('+1');
  await expect(page.locator('#sc-reset-sum-to')).toHaveText('isotope');
  await expect(page.locator('#sc-reset-sum-from')).toHaveText('+10%');
  await expect(page.locator('#sc-reset-sum-bonus')).toHaveText('+20%');
  // What the reset unlocks, as a card; what is kept, behind its button.
  await expect(page.locator('#sc-reset-choices .reset-unlocks li')).toContainText([
    'Surges last a second longer',
  ]);
  await expect(page.locator('#sc-reset-choices .reset-unlocks .reset-option-name')).toHaveText([
    'Capacitor',
  ]);
  await expect(page.locator('#sc-reset-kept-row')).toBeHidden();
  await page.click('#sc-reset-kept-toggle');
  await expect(page.locator('#sc-reset-kept-row')).toContainText('the perk codex');
  await expect(page.locator('#sc-reset-head')).toHaveText('500 energy and a Lab Assistant');
  await page.click('#sc-prestige-confirm');
  await expect(page.locator('#sc-toast')).toHaveText(
    'Experiment reset. 1 isotope gained: +20% to all gains.'
  );
  await expect(page.locator('#sc-isotope-badge')).toHaveAttribute(
    'aria-label',
    '2 isotopes, +20% to all gains, kept through every reset. A reset opens at 1.00M energy. Next unlock at 3 isotopes: a choice of Sixth Slot or Prodigy.'
  );
  // The isotope lands in the badge, and its count steps up.
  await expect(page.locator('#sc-isotope-count')).toHaveText('2');
  await expect(page.locator('#sc-isotope-tag'), 'a new run has no reset open').toBeHidden();
});

test.describe('on a touchscreen', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  test('a tap on the badge opens the Isotopes tab, and is never a press', async ({ page }) => {
    await seedSave(page, { energy: 100, runLifetime: 5000, isotopes: 2, perks: noDrops });
    await openGame(page);
    const before = await energy(page);

    await page.locator('#sc-isotope-badge').tap();
    await expect(page.locator('#sc-tab-prestige')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#sc-isotope-tip')).toBeHidden();
    expect(await energy(page), 'a tap on the badge is never a press').toBe(before);
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

  test('the badge, its lines and the perk shelf keep clear of each other and the readout', async ({
    page,
  }) => {
    await seedSave(page, {
      energy: 2000,
      runLifetime: 2_600_000,
      isotopes: 12,
      perks: { ...noDrops, owned: perks.map((p) => ({ ...p })) },
    });
    await openGame(page);
    const fit = await page.evaluate(() => {
      const r = (sel: string) => document.querySelector(sel)!.getBoundingClientRect();
      const lines = r('.isotope-lines');
      const badge = r('#sc-isotope-badge');
      const perks = r('#sc-perk-shelf');
      const readout = r('.energy-row');
      return {
        lines: lines.width > 0,
        apart: lines.right + 12 <= perks.left,
        readout: readout.top >= Math.max(badge.bottom, perks.bottom),
        noScroll: document.documentElement.scrollWidth <= window.innerWidth,
      };
    });
    expect(fit, 'five sockets leave room for the lines at 390').toEqual({
      lines: true,
      apart: true,
      readout: true,
      noScroll: true,
    });
  });
});
