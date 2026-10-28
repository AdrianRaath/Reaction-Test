/**
 * Spacebar Clicker: the main flows in a real browser. Input, the combo,
 * buying, the shop tabs and their "New" tag, saving, away progress,
 * prestige, the full reset, the panel tabs, and the phone layout.
 */

import type { Page } from '@playwright/test';

import { ISOTOPE_TRACK, PERKS } from '../../src/games/spacebar-clicker/config';
import { editSave, energy, expect, openGame, pressSteady, test } from './fixtures';

test('page shell: title, heading, no top-bar telemetry', async ({ page }) => {
  await page.goto('/spacebar-clicker');
  await expect(page).toHaveTitle('Spacebar Clicker - Free Online Idle Spacebar Game');
  // By role: Astro's dev toolbar adds h1s of its own.
  await expect(
    page.getByRole('heading', { level: 1, name: 'Spacebar Clicker', exact: true })
  ).toBeVisible();
  await expect(page.locator('#topbar-stats')).toHaveCount(0);
});

test('the page lists every perk and the drop odds, straight from the config', async ({ page }) => {
  await page.goto('/spacebar-clicker');
  const tables = page.locator('#perks .spec-table');
  const rows = (i: number) => tables.nth(i).locator('.spec-row:not(.spec-head)');
  await expect(rows(0)).toHaveCount(3);
  await expect(rows(0).first()).toContainText('65%');
  await expect(rows(1)).toHaveCount(PERKS.filter((p) => p.tab === 'press').length);
  await expect(rows(2)).toHaveCount(PERKS.filter((p) => p.tab === 'auto').length);
  await expect(rows(1).first()).toContainText(
    'Rhythm tolerance widens from 25% to 40% / 55% / 70%.'
  );

  const faq = await page
    .locator('script[type="application/ld+json"]')
    .evaluateAll((nodes) =>
      nodes.map((n) => n.textContent ?? '').find((t) => t.includes('FAQPage'))
    );
  expect(faq).toContain('How do perks work?');
  expect(faq).toContain('What does the isotope track unlock?');
  await expect(page.locator('#faq summary').last()).toHaveText(
    'What does the isotope track unlock?'
  );
});

test('the page lists the isotope track, straight from the config', async ({ page }) => {
  await page.goto('/spacebar-clicker');
  const rows = page.locator('#isotope-track ~ .spec-table .spec-row:not(.spec-head)');
  await expect(rows).toHaveCount(ISOTOPE_TRACK.length);
  await expect(rows.first()).toContainText('Warm Start');
  await expect(rows.nth(2)).toContainText('Sixth Slot or Prodigy');
  await expect(rows.nth(2)).toContainText('Pick one, and change it at any reset.');
  await expect(rows.last()).toContainText('Enrichment: Each isotope adds 13% to all gains');
});

test('the spacebar speed test keeps its telemetry and its retitle', async ({ page }) => {
  await page.goto('/spacebar-speed-test');
  await expect(page).toHaveTitle('Spacebar Speed Test - Free Online Spacebar Counter');
  await expect(page.locator('#topbar-stats')).toHaveCount(1);
});

test('steady presses build energy and a combo; a pause breaks it', async ({ page }) => {
  await openGame(page);
  const scrollBefore = await page.evaluate(() => window.scrollY);
  await pressSteady(page, 30, 200);
  await page.waitForTimeout(100);

  expect(await energy(page)).toBeGreaterThanOrEqual(30);
  expect(Number(await page.textContent('#sc-combo'))).toBeGreaterThanOrEqual(20);
  expect(['Steady', 'Locked in']).toContain((await page.textContent('#sc-combo-tier'))!.trim());
  expect(await page.evaluate(() => window.scrollY), 'Space never scrolls the page').toBe(
    scrollBefore
  );

  await page.waitForTimeout(1000);
  await expect(page.locator('#sc-combo')).toHaveText('0');
});

test('a click on the reactor counts as a press', async ({ page }) => {
  await openGame(page);
  const before = await energy(page);
  await page.click('#sc-reactor', { position: { x: 300, y: 250 } });
  await expect.poll(() => energy(page)).toBeGreaterThan(before);
});

test('buying, the shop tabs, and row alignment', async ({ page }) => {
  await openGame(page);
  await pressSteady(page, 55, 200); // Finger Strength costs 75
  const e1 = await energy(page);

  const finger = page.locator('.shop-item[data-id="finger"] .shop-buy');
  await expect(finger).toHaveClass(/is-affordable/);
  await finger.click();
  await expect(page.locator('.shop-item[data-id="finger"] [data-level]')).toHaveText('1/20');
  expect(await energy(page)).toBe(e1 - 75);

  // The open tab never wears a tag, and nothing is new on the closed one yet.
  await expect(page.locator('#sc-new-press')).toBeHidden();
  await expect(page.locator('#sc-new-auto')).toBeHidden();
  await expect(page.locator('#sc-shop-auto')).toBeHidden();

  // Shop tabs share the site's setting-button styling.
  const border = (sel: string) =>
    page.evaluate((q) => getComputedStyle(document.querySelector(q)!).borderTopColor, sel);
  expect(await border('#sc-shop-tab-press')).toBe('rgb(34, 197, 94)');
  expect(await border('#sc-shop-tab-auto')).toBe('rgb(39, 39, 42)');

  await page.click('[data-shop-tab="auto"]');
  await expect(page.locator('#sc-shop-auto')).toBeVisible();
  expect(
    await page.evaluate(() => document.activeElement?.tagName),
    'the tab blurs so Space still presses'
  ).not.toBe('BUTTON');

  // Every row's name starts at the same x, on both tabs.
  const nameColumns = (panel: string) =>
    page.evaluate((p) => {
      const xs = [...document.querySelectorAll<HTMLElement>(`${p} .shop-name`)]
        .filter((n) => n.offsetParent)
        .map((n) => Math.round(n.getBoundingClientRect().left));
      return new Set(xs).size;
    }, panel);
  expect(await nameColumns('#sc-shop-auto')).toBe(1);
  await page.click('[data-shop-tab="press"]');
  expect(await nameColumns('#sc-shop-press')).toBe(1);
  await expect(page.locator('.shop-icon svg')).toHaveCount(10);
});

test('the save survives a reload', async ({ page }) => {
  await openGame(page);
  await editSave(page, (s) => {
    s.energy = 200;
    s.lastSeen = Date.now();
  });
  await page.locator('.shop-item[data-id="finger"] .shop-buy').click();
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.locator('.shop-item[data-id="finger"] [data-level]')).toHaveText('1/20');
});

test('away progress: the dialog, the award, and Collect', async ({ page }) => {
  await openGame(page);
  await editSave(page, (s) => {
    s.tappers = { ...s.tappers, pneumatic: 2 };
    s.runLifetime = 4000;
    s.totalLifetime = 4000;
    s.revealed = ['assistant', 'pneumatic', 'arm'];
    s.seen = ['assistant', 'pneumatic'];
    s.lastSeen = Date.now() - 600_000;
  });

  await expect(page.locator('#sc-new-auto'), 'a newly revealed tapper tags its tab').toBeVisible();
  await expect(page.locator('#sc-away-modal')).toBeVisible();
  // 6 a second for 600 s at half rate, x1.05 for Warming.
  await expect(page.locator('#sc-away-energy')).toHaveText('1,890');

  const before = await energy(page);
  await page.click('#sc-away-collect');
  await page.waitForTimeout(1100); // the energy counts in over 0.9 s
  expect(await energy(page)).toBeGreaterThanOrEqual(before + 1890);
  expect(await page.evaluate(() => document.activeElement?.id)).toBe('sc-reactor');

  await page.click('[data-shop-tab="auto"]');
  await expect(page.locator('#sc-new-auto'), 'opening the tab clears its tag').toBeHidden();
  await expect(page.locator('.shop-item[data-id="arm"]')).toBeVisible();
  await page.click('[data-shop-tab="press"]');

  const offset = await page.evaluate(() =>
    parseFloat(document.getElementById('sc-arc')!.style.strokeDashoffset)
  );
  expect(offset, 'the progress arc is partly filled').toBeGreaterThan(0);
  expect(offset).toBeLessThan(295);
  await expect(page.locator('#sc-combo-next')).toHaveText(/to Steady$/);
});

test('reset the experiment: isotopes paid, the run wiped', async ({ page }) => {
  await openGame(page);
  await editSave(page, (s) => {
    s.tappers = { ...s.tappers, pneumatic: 2 };
    s.runLifetime = 4_000_000;
    s.totalLifetime = 4_000_000;
    s.lastSeen = Date.now();
  });
  await expect(page.locator('#sc-state')).toHaveText('Unstable');
  await expect(page.locator('#sc-reactor')).toHaveAttribute('data-state', 'unstable');

  await page.click('[data-tab="prestige"]');
  await expect(page.locator('#sc-prestige-held')).toHaveText('0');
  await expect(page.locator('#sc-prestige-bonus'), 'none held: what one is worth').toHaveText(
    'each adds 10%'
  );
  await expect(page.locator('#sc-prestige-gain')).toHaveText('+2');
  await expect(page.locator('#sc-prestige-after')).toHaveText('+20% after');
  await expect(page.locator('#sc-reset-unlocks')).toHaveText('Unlocks Warm Start and Capacitor.');
  await page.click('#sc-prestige-btn');
  await expect(page.locator('#sc-prestige-modal')).toBeVisible();
  await page.click('#sc-prestige-confirm');
  await page.waitForTimeout(1600); // implode, then bloom

  await expect(page.locator('#sc-prestige-held')).toHaveText('2');
  await expect(page.locator('#sc-prestige-bonus')).toHaveText('+20% to all gains');
  // Two isotopes hold Warm Start: the new run begins Warming, with 500 energy
  // and a Lab Assistant, which has earned a little since.
  expect(await energy(page)).toBeGreaterThanOrEqual(500);
  expect(await energy(page)).toBeLessThan(510);
  await expect(page.locator('#sc-state')).toHaveText('Warming');
  await expect(page.locator('.shop-item[data-id="assistant"] [data-owned]')).toHaveText('1');
  await expect(page.locator('.shop-item[data-id="pneumatic"] [data-owned]')).toHaveText('0');
  await page.click('[data-tab="achievements"]');
  await expect(page.locator('.achievement[data-id="fresh-start"]')).toHaveClass(/is-unlocked/);
});

test('the top-bar reset erases everything, isotopes included', async ({ page }) => {
  await openGame(page);
  await editSave(page, (s) => {
    s.isotopes = 2;
    s.totalPresses = 500;
    s.lastSeen = Date.now();
  });
  await page.click('#reset-btn');
  await expect(page.locator('#reset-modal')).toBeVisible();
  await page.click('#modal-confirm-btn');
  await page.click('[data-tab="stats"]');
  await expect(page.locator('#sc-stat-isotopes')).toHaveText('0');
  await expect(page.locator('#sc-stat-presses')).toHaveText('0');
});

test('Space on a focused control does not press the reactor', async ({ page }) => {
  await openGame(page);
  const before = await energy(page);
  await page.focus('.shop-item[data-id="finger"] .shop-buy');
  await page.keyboard.press('Space');
  await page.waitForTimeout(100);
  expect(await energy(page)).toBe(before);
});

test('an item turning affordable tags its closed tab, once', async ({ page }) => {
  await openGame(page);
  await expect(page.locator('#sc-new-auto')).toBeHidden();
  await pressSteady(page, 55, 170);
  await page.waitForTimeout(200);
  expect(await energy(page), 'a Lab Assistant is affordable').toBeGreaterThanOrEqual(75);

  await expect(page.locator('#sc-new-auto')).toBeVisible();
  await expect(page.locator('#sc-new-press'), 'the open tab never wears one').toBeHidden();
  const pinned = await page.evaluate(() => {
    const tab = document.getElementById('sc-shop-tab-auto')!.getBoundingClientRect();
    const tag = document.getElementById('sc-new-auto')!.getBoundingClientRect();
    return tag.top < tab.top && tag.right > tab.right - 2;
  });
  expect(pinned, 'the tag sits on the tab top-right corner').toBe(true);

  await page.click('[data-shop-tab="auto"]');
  await expect(page.locator('#sc-new-auto')).toBeHidden();
  await page.click('[data-shop-tab="press"]');
  await page.waitForTimeout(300);
  await expect(page.locator('#sc-new-auto'), 'it stays cleared').toBeHidden();
});

/** The panel tabs' rows (by top edge) and widths, rounded to the pixel. */
function panelTabs(page: Page): Promise<{ rows: number; widths: number[] }> {
  return page.evaluate(() => {
    const boxes = [...document.querySelectorAll('.tabs .tab')].map((t) =>
      t.getBoundingClientRect()
    );
    return {
      rows: new Set(boxes.map((b) => Math.round(b.top))).size,
      widths: boxes.map((b) => Math.round(b.width)),
    };
  });
}

test('the panel tabs sit in one row', async ({ page }) => {
  await page.goto('/spacebar-clicker', { waitUntil: 'networkidle' });
  expect((await panelTabs(page)).rows).toBe(1);
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('no horizontal scroll, and the reactor is on screen', async ({ page }) => {
    await page.goto('/spacebar-clicker', { waitUntil: 'networkidle' });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
    ).toBe(true);
    await expect(page.locator('#sc-reactor')).toBeVisible();
  });

  test('the panel tabs sit two by two, at equal widths', async ({ page }) => {
    await page.goto('/spacebar-clicker', { waitUntil: 'networkidle' });
    const { rows, widths } = await panelTabs(page);
    expect(rows, 'two rows, not three tabs and one left over').toBe(2);
    expect(new Set(widths).size, `widths ${widths.join(', ')}`).toBe(1);
  });
});
