/**
 * Spacebar Clicker: the main flows in a real browser. Input, the combo,
 * buying, the shop tabs and their "New" tag, saving, away progress,
 * prestige, the full reset, the panel tabs, and the phone layout.
 */

import type { Page } from '@playwright/test';

import { ISOTOPE_TRACK, PERKS, REACTOR_STATES } from '../../src/games/spacebar-clicker/config';
import { editSave, energy, expect, openGame, pressSteady, seedSave, test } from './fixtures';

test('page shell: title, heading, no top-bar telemetry', async ({ page }) => {
  await page.goto('/spacebar-clicker');
  await expect(page).toHaveTitle('Spacebar Clicker Game - Play Free Online');
  // By role: Astro's dev toolbar adds h1s of its own.
  await expect(
    page.getByRole('heading', { level: 1, name: 'Spacebar Clicker', exact: true })
  ).toBeVisible();
  // No rig readout: the page passes the top bar its own (next check).
  await expect(page.locator('#topbar-stats')).toHaveCount(0);
  // Newly launched: the sidebar tags it with the shop's amber "New".
  await expect(page.locator('#sidebar a[href="/spacebar-clicker"] .nav-new-tag')).toBeVisible();
  await expect(page.locator('#sidebar .nav-new-tag')).toHaveCount(1);
});

test('the top bar reads isotopes, lifetime energy and the best combo', async ({ page }) => {
  await openGame(page);
  const isotopes = page.locator('#sc-tb-isotopes');
  const lifetime = page.locator('#sc-tb-lifetime');
  const bestCombo = page.locator('#sc-tb-best-combo');
  // A new save: a dimmed zero and dashes, as the tools' readout before a run.
  await expect(isotopes).toHaveText('0');
  await expect(isotopes).toHaveClass(/is-empty/);
  await expect(lifetime).toHaveText('—');
  await expect(bestCombo).toHaveText('—');

  await editSave(page, (s) => {
    s.isotopes = 3;
    s.totalLifetime = 4_820_000;
    s.runLifetime = 2_400_000;
    s.bestCombo = 214;
    s.lastSeen = Date.now();
  });
  await expect(isotopes).toHaveText('3');
  await expect(isotopes).not.toHaveClass(/is-empty/);
  await expect(page.locator('#sc-tb-iso')).toHaveClass(/has-isotopes/);
  await expect(lifetime).toHaveText('4.82M');
  await expect(bestCombo).toHaveText('214');
  await expect(bestCombo).toHaveClass(/tb-best/);
  // The ring is part of the way to the next isotope.
  const offset = await page
    .locator('#sc-tb-iso-ring')
    .evaluate((c) => parseFloat((c as SVGCircleElement).style.strokeDashoffset));
  expect(offset).toBeGreaterThan(0);
  expect(offset).toBeLessThan(100);

  // Like the tools' readout, it gives way below 1100px.
  await page.setViewportSize({ width: 1000, height: 800 });
  await expect(page.locator('.topbar-stats')).toBeHidden();
});

test('a toast takes the keycap’s place, and the hint retires once a combo is held', async ({
  page,
}) => {
  await openGame(page);
  const hint = page.locator('#sc-hint');
  const face = page.locator('#sc-reactor');
  const toast = page.locator('#sc-toast');
  await expect(hint).toBeVisible();
  const faceHeight = (await face.boundingBox())!.height;
  const coreTop = (await page.locator('.core-wrap').boundingBox())!.y;

  // The first press earns an achievement. Its toast covers the key, lip and
  // all, and leaves the hint alone.
  await page.keyboard.press('Space');
  await expect(toast).toBeVisible();
  await page.waitForTimeout(400); // the toast settles in, and the key comes back up
  const key = (await page.locator('#sc-keycap').boundingBox())!;
  const note = (await toast.boundingBox())!;
  expect(note.x).toBeLessThanOrEqual(key.x + 0.5);
  expect(note.x + note.width).toBeGreaterThanOrEqual(key.x + key.width - 0.5);
  expect(note.y).toBeLessThanOrEqual(key.y + 0.5);
  expect(note.y + note.height).toBeGreaterThanOrEqual(key.y + key.height + 1.5);
  await expect(hint).toHaveCSS('opacity', '1');
  await expect(toast).toBeHidden({ timeout: 8000 });

  // Steady, the first tier: the hint has done its work, and its line closes.
  // The face keeps its height, and the room goes above: the core sits lower.
  await pressSteady(page, 10, 300);
  await expect(page.locator('#sc-combo-tier')).toHaveText('Steady');
  await expect(hint).toHaveClass(/is-retired/);
  await expect(face).toHaveClass(/is-roomy/);
  await expect.poll(async () => (await hint.boundingBox())!.height).toBe(0);
  await expect
    .poll(async () => Math.abs((await face.boundingBox())!.height - faceHeight))
    .toBeLessThan(1);
  expect((await page.locator('.core-wrap').boundingBox())!.y).toBeGreaterThan(coreTop + 10);

  // And it stays gone on the next visit.
  await page.reload({ waitUntil: 'networkidle' });
  await expect(hint).toHaveClass(/is-retired/);
  expect(Math.abs((await face.boundingBox())!.height - faceHeight)).toBeLessThan(1);
});

test('achievements show the way to a badge that has a count', async ({ page }) => {
  await seedSave(page, {
    totalPresses: 4821,
    bestCombo: 61,
    achievements: ['first-press', 'warmed-up', 'thousand-taps', 'steady-hands', 'resonance'],
  });
  await openGame(page);
  await page.click('[data-tab="achievements"]');
  const badge = (id: string) => page.locator(`.achievement[data-id="${id}"]`);

  // Not yet earned, with a count: a bar and the count, and no cross.
  await expect(badge('ten-thousand-taps').locator('.achievement-count')).toHaveText(
    '4,821 of 10,000'
  );
  await expect(badge('harmonic').locator('.achievement-count')).toHaveText('61 of 100');
  await expect(badge('harmonic').locator('.achievement-state')).toHaveText(', locked');
  await expect(badge('harmonic').locator('.achievement-mark')).toHaveText('');
  const bar = (await badge('harmonic').locator('.achievement-bar').boundingBox())!;
  const fill = (await badge('harmonic').locator('.achievement-fill').boundingBox())!;
  expect(fill.width / bar.width).toBeCloseTo(0.61, 1);

  // Earned, or earned by a moment: nothing to count.
  await expect(badge('thousand-taps').locator('.achievement-progress')).toBeHidden();
  await expect(badge('thousand-taps').locator('.achievement-state')).toHaveText(', unlocked');
  await expect(badge('critical-mass').locator('.achievement-progress')).toBeHidden();
  await expect(badge('fresh-start').locator('.achievement-progress')).toBeHidden();
});

test('a new player’s track is one rail, and the first isotope is 1.00M away', async ({ page }) => {
  await openGame(page);
  await page.keyboard.press('Space');
  await page.click('[data-tab="prestige"]');
  await expect(page.locator('#sc-prestige-progress')).toHaveText('1.00M to go');
  await expect(page.locator('#sc-prestige-held-title')).toHaveText('No isotopes yet');
  await expect(page.locator('#sc-prestige-bonus')).toHaveText('Each adds 10% to all gains');
  const tops = await page
    .locator('#sc-track .track-card')
    .evaluateAll((cards) => cards.map((c) => Math.round(c.getBoundingClientRect().top)));
  expect(tops).toHaveLength(12);
  expect(new Set(tops).size, 'one row').toBe(1);
  await expect(page.locator('#sc-track .track-card.is-hidden')).toHaveCount(10);
  // With nothing pointed at, the card under the rail reads the next unlock.
  await expect(page.locator('#sc-track-read .track-read-head')).toContainText('Warm Start');
});

test('the energy number and the share bar sit on the axis of the core', async ({ page }) => {
  await seedSave(page, { energy: 32_454, runLifetime: 40_000, tappers: { assistant: 5 } });
  await openGame(page);
  await expect(page.locator('#sc-share')).toHaveClass(/is-shown/);
  const centre = async (selector: string) => {
    const box = (await page.locator(selector).boundingBox())!;
    return box.x + box.width / 2;
  };
  const axis = await centre('.core-wrap');
  expect(Math.abs((await centre('#sc-energy')) - axis)).toBeLessThanOrEqual(1);
  expect(Math.abs((await centre('.share-bar')) - axis)).toBeLessThanOrEqual(1);
});

test('the page lists every perk, straight from the config', async ({ page }) => {
  await page.goto('/spacebar-clicker');
  // About is three paragraphs, apart; the pictures are How to play's.
  const lede = page.locator('#about .sc-lede p');
  await expect(lede).toHaveCount(3);
  const [first, second] = await lede.evaluateAll((ps) => ps.map((p) => p.getBoundingClientRect()));
  expect(second.top - first.bottom, 'a gap between the paragraphs').toBeGreaterThan(8);

  const rows = page.locator('#perks .sc-perk');
  await expect(rows).toHaveCount(PERKS.length);
  await expect(rows.first().locator('h4')).toHaveText('Metronome');
  await expect(rows.first().locator('.sc-perk-rarity')).toHaveText('Common');
  await expect(rows.first().locator('.sc-perk-effect')).toHaveText(
    'Rhythm tolerance widens from 25% to 40% / 55% / 70%'
  );

  // The chips filter by family and by rarity, and a chip pressed again lets go.
  const shown = page.locator('#perks .sc-perk:visible');
  const chip = (name: string) => page.locator('#sc-perk-filter button').filter({ hasText: name });
  await chip('Machines').click();
  await expect(shown).toHaveCount(PERKS.filter((p) => p.family === 'machines').length);
  await expect(page.locator('#perks .sc-family:visible')).toHaveCount(1);
  await chip('Keystone').click();
  await expect(shown).toHaveCount(1);
  await expect(shown.locator('h4')).toHaveText('Autopilot');
  await chip('Machines').click();
  await expect(shown).toHaveCount(PERKS.filter((p) => p.rarity === 'keystone').length);
  await chip('Keystone').click();
  await expect(shown).toHaveCount(PERKS.length);
  // A chip is a button: Space on it filters, and doesn't press the reactor.
  await chip('Luck').focus();
  await page.keyboard.press('Space');
  await expect(shown).toHaveCount(PERKS.filter((p) => p.family === 'luck').length);
  await expect(page.locator('#sc-energy')).toHaveText('0');

  const faq = await page
    .locator('script[type="application/ld+json"]')
    .evaluateAll((nodes) =>
      nodes.map((n) => n.textContent ?? '').find((t) => t.includes('FAQPage'))
    );
  expect(faq).toContain('How do perks work?');
  expect(faq).toContain('What does the isotope track unlock?');
  expect(faq).toContain('What happens when I leave the game?');
  expect(faq).toContain('What should I buy first?');
  expect(faq).not.toContain('no ads');
  // The schema and the page carry the same questions, in the same order.
  const asked = JSON.parse(faq ?? '{}').mainEntity.map((q: { name: string }) => q.name);
  await expect(page.locator('#faq summary')).toHaveText(asked);
  await expect(page.locator('#faq summary').last()).toHaveText(
    'Does Spacebar Clicker have an end?'
  );
});

test('the spacebar speed test links to the clicker from its body copy', async ({ page }) => {
  // The speed test catches "spacebar counter" searches; this link sends
  // game-seekers on and names the page that owns "spacebar clicker".
  await page.goto('/spacebar-speed-test');
  await expect(page.locator('#what-is a[href="/spacebar-clicker"]')).toHaveText('spacebar clicker');
});

test('the page draws the reactor states and the run-down from the config', async ({ page }) => {
  await page.goto('/spacebar-clicker');
  const states = page.locator('#reactor .sc-state');
  await expect(states).toHaveCount(REACTOR_STATES.length);
  await expect(states.first().locator('h3')).toHaveText('Dormant');
  await expect(states.first().locator('.sc-state-lamp.is-lit')).toHaveCount(0);
  await expect(states.last().locator('.sc-state-lamp.is-lit')).toHaveCount(
    REACTOR_STATES.length - 1
  );
  await expect(states.nth(4).locator('.sc-state-note')).toHaveText('A reset opens, for 1 isotope');
  await expect(states.nth(5).locator('.sc-state-note')).toHaveText('A reset pays 3 isotopes');
  await expect(states.nth(1).locator('.sc-state-note')).toContainText('Robot Arm');
  await expect(states.nth(1).locator('.sc-state-bonus')).toHaveText('+5%');

  // The shop shows prices and effects, and an upgrade's level cap, but no
  // price multipliers (SPACEBAR-CLICKER.md §8.5.21).
  const [upgrades, tappers] = [0, 1].map((i) => page.locator('#shop .sc-shop > div').nth(i));
  await expect(upgrades.locator('.sc-shop-note').first()).toHaveText('20 levels');
  await expect(tappers.locator('.sc-shop-head span')).toHaveText('press for you');
  await expect(tappers.locator('.sc-shop-note')).toHaveCount(0);
  await expect(page.locator('#shop')).not.toContainText('per purchase');

  const stages = page.locator('#rundown .sc-run-stages > div');
  await expect(stages).toHaveCount(4);
  await expect(stages.nth(0)).toContainText('30 minutes');
  await expect(stages.nth(1)).toContainText('One press brings it back.');
  await expect(stages.nth(2)).toContainText('at 2 hours');
  await expect(stages.nth(3)).toContainText('10 presses on a steady beat restart it.');

  // Every link in the jump strip lands on a section.
  const targets = await page
    .locator('.sc-jump a')
    .evaluateAll((links) =>
      links.map((a) => document.querySelector(a.getAttribute('href')!) !== null)
    );
  expect(targets.length).toBe(8);
  expect(targets.every(Boolean)).toBe(true);
});

test('the page lists the isotope track, straight from the config', async ({ page }) => {
  await page.goto('/spacebar-clicker');
  const rungs = page.locator('#prestige .sc-rung');
  await expect(rungs).toHaveCount(ISOTOPE_TRACK.length);
  await expect(rungs.first().locator('h4')).toHaveText('Warm Start');
  await expect(rungs.nth(2).locator('h4')).toHaveText('Sixth Slot or Prodigy');
  // The intro says a fork switches at any reset; the card says it to a screen
  // reader only.
  await expect(rungs.nth(2)).toContainText('At 3 isotopes, pick one.');
  await expect(rungs.nth(2).locator('.visually-hidden')).toHaveCount(1);
  await expect(rungs.last()).toContainText('Enrichment. Each isotope adds 13% to all gains');
  // Three rungs to a row, each row ending in its fork.
  await expect(page.locator('#prestige .sc-track-row')).toHaveCount(ISOTOPE_TRACK.length / 3);
  await expect(page.locator('#prestige .sc-track-row > :last-child.is-fork')).toHaveCount(
    ISOTOPE_TRACK.length / 3
  );
  // What a reset pays: 1M, 3M, 9M and 27M for 1 to 4.
  await expect(page.locator('#prestige .sc-pays-at')).toHaveText([/^1M/, /^3M/, /^9M/, /^27M/]);
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

test('time away: paid on the run-down’s clock and counted in, with no dialog', async ({ page }) => {
  await openGame(page);
  await editSave(page, (s) => {
    s.tappers = { ...s.tappers, pneumatic: 2 };
    s.runLifetime = 4000;
    s.totalLifetime = 4000;
    s.revealed = ['assistant', 'pneumatic', 'arm'];
    s.seen = ['assistant', 'pneumatic'];
    s.lastSeen = Date.now() - 600_000;
    s.tendedAt = s.lastSeen;
  });

  await expect(page.locator('#sc-new-auto'), 'a newly revealed tapper tags its tab').toBeVisible();
  // Ten minutes is inside the half hour at full output: 6 a second, x1.05 for Warming.
  // Loading adds a moment, so the last digits may run on a little.
  await expect(page.locator('#sc-toast-text')).toHaveText(
    /^Untended 10m 0\ds: \+3,7[89]\d energy$/
  );
  await expect(page.locator('.modal-overlay:not([hidden])')).toHaveCount(0);
  await expect(page.locator('#sc-reactor')).not.toHaveAttribute('data-power');
  await page.waitForTimeout(1100); // the energy counts in over 0.9 s
  expect(await energy(page)).toBeGreaterThanOrEqual(3780);

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
  await expect(page.locator('#sc-reset-intro'), 'what a reset is, before the first').toBeVisible();
  await expect(page.locator('#sc-prestige-gain')).toHaveText('+2');
  await expect(page.locator('#sc-prestige-to')).toHaveText('isotopes');
  await expect(page.locator('#sc-prestige-after')).toHaveText('+20%');
  await expect(page.locator('#sc-prestige-from-wrap'), 'none held: no gains before').toBeHidden();
  await expect(page.locator('#sc-reset-unlocks')).toHaveText('Unlocks Warm Start and Capacitor.');
  await page.click('#sc-prestige-btn');
  await expect(page.locator('#sc-prestige-modal')).toBeVisible();
  await page.click('#sc-prestige-confirm');
  await page.waitForTimeout(1600); // implode, then bloom

  await expect(page.locator('#sc-prestige-held')).toHaveText('2');
  await expect(page.locator('#sc-prestige-bonus')).toHaveText('+20% to all gains');
  await expect(page.locator('#sc-reset-intro')).toBeHidden();
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
  await expect(page.locator('#sc-tb-isotopes')).toHaveText('0');
  await expect(page.locator('#sc-tb-isotopes')).toHaveClass(/is-empty/);
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
