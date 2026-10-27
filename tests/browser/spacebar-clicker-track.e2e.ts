/**
 * Spacebar Clicker: the isotope track in play (SPACEBAR-CLICKER.md §8.3). The
 * tooltips naming unlocks, the track in the Reset tab, fork picks and a kept
 * perk in the reset dialog, the unlock card, the reroll, Prodigy's offers,
 * six sockets and two keystones, reduced motion, and the phone layout.
 */

import type { PerkId } from '../../src/games/spacebar-clicker/config';
import type { PerkOffer } from '../../src/games/spacebar-clicker/save';
import { expect, openGame, seedSave, test, type Staged } from './fixtures';

/** Drops stay away, so nothing else lands in the shop or the announcer. */
const noDrops = { rng: 7, activeS: 0, nextDropAtS: 99_999 };

/** An offer that has been seen, with a long window. */
const offer = (id: PerkId, level = 1, price = 500): PerkOffer => ({
  id,
  level,
  price,
  droppedAt: 0,
  expiresAt: 10_000_000,
  seen: true,
  seenAffordable: true,
});

/** A run with a reset open for `gain` isotopes, so the dialog can be opened. */
const resetFor = (gain: number): Staged => ({
  energy: 50,
  runLifetime: gain * gain * 1_000_000 + 1000,
  totalLifetime: 20_000_000,
});

test('the tooltips name the next unlock, and what a reset unlocks', async ({ page }) => {
  await seedSave(page, { ...resetFor(2), isotopes: 4, forks: { 3: 'prodigy' }, perks: noDrops });
  await openGame(page);
  const unlock = page.locator('#sc-isotope-tip-unlock');

  await page.hover('#sc-isotopes-held');
  await expect(unlock).toHaveText('Next at 5 isotopes: Lucky Find.');
  await page.hover('#sc-isotope-next');
  await expect(unlock).toHaveText('Unlocks Lucky Find and a choice of Reroll or Patience.');
  // On the ring, what the reset unlocks comes before the energy line.
  const order = await page.evaluate(
    () =>
      document
        .getElementById('sc-isotope-tip-unlock')!
        .compareDocumentPosition(document.getElementById('sc-isotope-tip-detail')!) &
      Node.DOCUMENT_POSITION_FOLLOWING
  );
  expect(order).toBeTruthy();
});

test('the Reset tab draws the track: held, picked, and the next two', async ({ page }) => {
  await seedSave(page, {
    energy: 50,
    runLifetime: 5000,
    isotopes: 7,
    forks: { 3: 'prodigy', 6: 'patience' },
    perks: noDrops,
  });
  await openGame(page);
  await page.click('[data-tab="prestige"]');

  await expect(page.locator('#sc-track-count')).toHaveText('7 of 12');
  await expect(page.locator('.track-socket.is-lit')).toHaveCount(7);
  await expect(page.locator('.track-half.is-picked')).toHaveCount(2);
  await expect(page.locator('.track-half[data-rung="prodigy"]')).toHaveClass(/is-picked/);
  await expect(page.locator('.track-socket.is-next')).toHaveCount(2);

  const cards = page.locator('#sc-track-list .track-rung');
  await expect(cards).toHaveCount(9);
  await expect(cards.nth(2)).toContainText('At 3 isotopes · your pick');
  await expect(cards.nth(2)).toContainText('Prodigy');
  await expect(cards.nth(2)).toContainText('Or Sixth Slot: switch at any reset.');
  await expect(cards.nth(7)).toContainText('Next at 8 isotopes');
  await expect(cards.nth(8)).toContainText('Heirloom or Cornerstone');
  await expect(page.locator('#sc-track-list .track-rung.is-next')).toHaveCount(2);
});

test('a new fork waits for a pick, and the reset unlocks it with a card', async ({ page }) => {
  await seedSave(page, { ...resetFor(1), isotopes: 2, perks: noDrops });
  await openGame(page);
  await page.click('[data-tab="prestige"]');
  await page.click('#sc-prestige-btn');

  const fork = page.locator('[data-fork="3"]');
  await expect(fork.locator('legend')).toHaveText('At 3 isotopes: pick one');
  await expect(fork.locator('input:checked')).toHaveCount(0);
  await expect(page.locator('#sc-prestige-modal-message')).toContainText(
    'Warm Start begins the new run with 500 energy and a Lab Assistant.'
  );

  // No pick yet: the reset waits, and says why.
  await page.click('#sc-prestige-confirm');
  await expect(page.locator('#sc-prestige-modal')).toBeVisible();
  await expect(page.locator('#sc-reset-pick-hint')).toHaveText(
    'Pick one at 3 isotopes to reset: Sixth Slot or Prodigy.'
  );
  await expect(fork.locator('input').first()).toBeFocused();

  await fork.locator('input[value="prodigy"]').check();
  await expect(page.locator('#sc-reset-pick-hint')).toBeHidden();
  await page.click('#sc-prestige-confirm');
  await expect(page.locator('#sc-prestige-modal')).toBeHidden();

  const card = page.locator('#sc-unlock-card');
  await expect(card).toBeVisible();
  await expect(card.locator('.unlock-name')).toHaveText(['Prodigy']);
  await expect(page.locator('#sc-announce')).toContainText('Unlocked Prodigy:');

  // The pick is the save's now, and the next dialog starts from it.
  await page.click('[data-tab="prestige"]');
  await expect(page.locator('.track-half[data-rung="prodigy"]')).toHaveClass(/is-picked/);
  const forks = await page.evaluate(
    () => JSON.parse(localStorage.getItem('reflexlab:spacebar-clicker:save')!).forks
  );
  expect(forks).toEqual({ 3: 'prodigy' });
});

test('Heirloom and Cornerstone carry a perk through the reset, at level I', async ({ page }) => {
  await seedSave(page, {
    ...resetFor(1),
    isotopes: 8,
    forks: { 3: 'prodigy', 6: 'reroll' },
    perks: {
      ...noDrops,
      owned: [
        { id: 'overtone', level: 1 },
        { id: 'self-replicator', level: 3 },
        { id: 'glass-rhythm', level: 2 },
      ],
      codex: { overtone: 1, 'self-replicator': 3, 'glass-rhythm': 2 },
    },
  });
  await openGame(page);
  await page.click('[data-tab="prestige"]');
  await page.click('#sc-prestige-btn');

  const keep = page.locator('#sc-reset-keep');
  await expect(keep).toBeEmpty();
  await page.locator('input[value="heirloom"]').check();
  await expect(keep.locator('legend')).toHaveText('Heirloom: keep a perk');
  await expect(keep.locator('.reset-option-name')).toHaveText([
    'Self-Replicator III',
    'Overtone',
    'Keep none',
  ]);
  await expect(keep.locator('input[value="self-replicator"]')).toBeChecked();

  // Cornerstone offers the keystone instead.
  await page.locator('input[value="cornerstone"]').check();
  await expect(keep.locator('legend')).toHaveText('Cornerstone: keep your keystone');
  await expect(keep.locator('.reset-option-name')).toHaveText(['Glass Rhythm II', 'Keep none']);

  await page.locator('input[value="heirloom"]').check();
  await keep.locator('input[value="overtone"]').check();
  await page.click('#sc-prestige-confirm');
  await expect(page.locator('#sc-perk-shelf')).toBeVisible();
  await expect(page.locator('.perk-chip:not([hidden])')).toHaveCount(1);
  await expect(page.locator('.perk-chip').first()).toHaveAttribute(
    'aria-label',
    /^Overtone, level 1/
  );
  await expect(page.locator('#sc-announce')).toContainText('Overtone stays with you, at level I.');
});

test('Reroll swaps an offer for another perk, once a run', async ({ page }) => {
  await seedSave(page, {
    energy: 50,
    runLifetime: 5000,
    isotopes: 6,
    forks: { 3: 'prodigy', 6: 'reroll' },
    perks: { ...noDrops, offers: [offer('momentum', 2)], codex: { momentum: 0 } },
  });
  await openGame(page);
  const row = page.locator('#sc-offer-press');
  const reroll = row.locator('.perk-reroll');
  await expect(row.locator('[data-perk-name]')).toHaveText('Momentum');
  await expect(reroll).toBeVisible();

  await reroll.click();
  await expect(row.locator('[data-perk-name]')).not.toHaveText('Momentum');
  await expect(reroll, 'one a run').toBeHidden();
  await expect(page.locator('#sc-announce')).toContainText('Rerolled Momentum II.');
  expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('BUTTON');
});

test('without the Reroll rung, there is no reroll', async ({ page }) => {
  await seedSave(page, {
    energy: 50,
    runLifetime: 5000,
    isotopes: 6,
    // Sixth Slot, so a fresh offer is level I.
    forks: { 3: 'sixth-slot', 6: 'patience' },
    perks: { ...noDrops, offers: [offer('momentum')] },
  });
  await openGame(page);
  await expect(page.locator('#sc-offer-press')).toBeVisible();
  await expect(page.locator('#sc-offer-press .perk-reroll')).toBeHidden();
});

test('Prodigy’s level II drop shows as a new perk, not an upgrade', async ({ page }) => {
  await seedSave(page, {
    energy: 50,
    runLifetime: 5000,
    isotopes: 3,
    forks: { 3: 'prodigy' },
    perks: { ...noDrops, offers: [offer('momentum', 2)], codex: { momentum: 0 } },
  });
  await openGame(page);
  const row = page.locator('#sc-offer-press');
  await expect(row.locator('[data-perk-level]')).toContainText('II');
  await expect(row.locator('[data-perk-rarity]')).toHaveText('Rare');
  await expect(row.locator('.perk-was'), 'nothing held to strike out').toHaveCount(0);
});

test('Sixth Slot shows a sixth socket; Twin Keystones asks which keystone to drop', async ({
  page,
}) => {
  await seedSave(page, {
    energy: 5000,
    runLifetime: 5000,
    isotopes: 12,
    forks: { 3: 'sixth-slot', 6: 'reroll', 9: 'heirloom', 12: 'twin-keystones' },
    perks: {
      ...noDrops,
      owned: [
        { id: 'glass-rhythm', level: 1 },
        { id: 'storm-front', level: 1 },
        { id: 'overtone', level: 1 },
        { id: 'momentum', level: 1 },
        { id: 'overtime', level: 1 },
      ],
      offers: [offer('brute-force')],
    },
  });
  await openGame(page);
  await expect(page.locator('.perk-slot:not([hidden])')).toHaveCount(6);
  await expect(page.locator('#sc-perk-slots')).toHaveAttribute(
    'aria-label',
    'Perks this run, 5 of 6 slots'
  );
  await expect(page.locator('#sc-offer-press [data-perk-note]')).toHaveText(
    "Both keystone slots are full: you'll pick one to drop"
  );

  await page.click('#sc-offer-press .perk-buy');
  await expect(page.locator('#sc-swap-title')).toHaveText('Both keystone slots are full');
  await expect(page.locator('#sc-swap-list .perk-card-name')).toHaveText([
    'Glass Rhythm',
    'Storm Front',
  ]);
  await page.locator('#sc-swap-list button', { hasText: 'Storm Front' }).click();
  await expect(page.locator('#sc-swap-modal')).toBeHidden();
  await expect(page.locator('.perk-chip[aria-label^="Brute Force"]')).toHaveCount(1);
  await expect(page.locator('.perk-chip[aria-label^="Storm Front"]')).toHaveCount(0);
  await expect(page.locator('.perk-chip[aria-label^="Glass Rhythm"]')).toHaveCount(1);
});

test('an offer credits the rungs that shaped it', async ({ page }) => {
  await seedSave(page, {
    energy: 50,
    runLifetime: 6000,
    isotopes: 7,
    forks: { 3: 'prodigy', 6: 'patience' },
    perks: {
      ...noDrops,
      owned: [{ id: 'overtime', level: 1 }],
      codex: { momentum: 0, overtime: 1 },
      offers: [
        // Past half its window: without Patience it would be gone.
        { ...offer('momentum', 2), expiresAt: 10_000, lifted: true },
        offer('overtime', 2),
      ],
    },
  });
  await openGame(page);
  await expect(page.locator('#sc-offer-press .credit')).toHaveText([
    'Prodigy: level II for the level I price',
    'Lucky Find: a rare, not a common',
    'Patience: still on offer',
  ]);
  // Read with the offer, as sentences.
  await expect(page.locator('#sc-offer-press .perk-buy')).toHaveAccessibleName(
    /level I price\s*\.\s*Lucky Find: a rare, not a common\s*\.\s*Patience: still on offer/
  );
  await expect(page.locator('#sc-offer-auto .credit')).toHaveText(['Familiar: 25% off']);
});

test('an offer with nothing from the track has no credit line', async ({ page }) => {
  await seedSave(page, {
    energy: 50,
    runLifetime: 6000,
    perks: { ...noDrops, offers: [offer('momentum')] },
  });
  await openGame(page);
  await expect(page.locator('#sc-offer-press')).toBeVisible();
  await expect(page.locator('#sc-offer-press [data-perk-credit]')).toBeHidden();
});

test('the away dialog credits Night Lab’s rate and its longer cap', async ({ page }) => {
  await seedSave(
    page,
    {
      energy: 50,
      runLifetime: 5000,
      isotopes: 4,
      forks: { 3: 'prodigy' },
      tappers: { assistant: 4 },
      perks: noDrops,
    },
    5 * 3600 * 1000
  );
  await openGame(page);
  await expect(page.locator('#sc-away-modal')).toBeVisible();
  await expect(page.locator('#sc-away-rate')).toHaveText('60% speed with Night Lab');
  await expect(page.locator('#sc-away-credit')).toContainText(
    'Night Lab kept them running past the usual 4 hours.'
  );
});

test('Perfect Pitch: a press it catches floats its name', async ({ page }) => {
  await seedSave(page, {
    energy: 50,
    runLifetime: 5000,
    isotopes: 11,
    forks: { 3: 'prodigy', 6: 'reroll', 9: 'heirloom' },
    perks: noDrops,
  });
  // A fake clock, so the beat is exact.
  await page.clock.install({ time: new Date('2026-10-22T12:00:00Z') });
  await page.goto('/spacebar-clicker', { waitUntil: 'networkidle' });
  await page.clock.pauseAt(new Date('2026-10-22T12:01:00Z'));
  await page.clock.runFor(100);
  await page.focus('#sc-reactor');
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Space');
    await page.clock.runFor(200);
  }
  await expect(page.locator('#sc-floats .float.is-track'), 'on the beat').toHaveCount(0);
  // 255 ms after a 200 ms beat: 27.5% off it, inside Perfect Pitch's 30% only.
  await page.clock.runFor(55);
  await page.keyboard.press('Space');
  await expect(page.locator('#sc-floats .float.is-track')).toHaveText('Perfect Pitch');
});

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('the unlock card shows at once, without its rise', async ({ page }) => {
    await seedSave(page, { ...resetFor(1), isotopes: 0, perks: noDrops });
    await openGame(page);
    await page.click('[data-tab="prestige"]');
    await page.click('#sc-prestige-btn');
    await page.click('#sc-prestige-confirm');
    const card = page.locator('#sc-unlock-card');
    await expect(card).toBeVisible({ timeout: 200 });
    await expect(card.locator('.unlock-name')).toHaveText(['Warm Start']);
    expect(await card.evaluate((n) => getComputedStyle(n).animationName)).toBe('none');
  });
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the reset dialog with every fork fits the width and scrolls inside', async ({ page }) => {
    await seedSave(page, {
      ...resetFor(2),
      isotopes: 11,
      forks: { 3: 'prodigy', 6: 'reroll', 9: 'heirloom' },
      perks: { ...noDrops, owned: [{ id: 'overtone', level: 2 }], codex: { overtone: 2 } },
    });
    await openGame(page);
    await page.click('[data-tab="prestige"]');
    await page.click('#sc-prestige-btn');
    await expect(page.locator('#sc-reset-choices fieldset')).toHaveCount(5);
    const fit = await page.evaluate(() => {
      const modal = document.querySelector('#sc-prestige-modal .modal')!;
      const box = modal.getBoundingClientRect();
      return {
        inside: box.left >= 0 && box.right <= window.innerWidth && box.bottom <= window.innerHeight,
        scrolls: modal.scrollHeight > modal.clientHeight,
        noScroll: document.documentElement.scrollWidth <= window.innerWidth,
      };
    });
    expect(fit).toEqual({ inside: true, scrolls: true, noScroll: true });
    await page.locator('input[value="twin-keystones"]').check();
    await page.locator('#sc-prestige-confirm').scrollIntoViewIfNeeded();
    await page.click('#sc-prestige-confirm');
    // From 11 to 13 isotopes, the capstone is the only rung reached.
    await expect(page.locator('#sc-unlock-card .unlock-name')).toHaveText(['Twin Keystones']);
  });

  test('six sockets, twelve beads and the ring keep clear of each other', async ({ page }) => {
    await seedSave(page, {
      energy: 2000,
      runLifetime: 2_600_000,
      isotopes: 12,
      forks: { 3: 'sixth-slot' },
      perks: {
        ...noDrops,
        owned: (
          [
            'glass-rhythm',
            'held-breath',
            'overtime',
            'loaded-dice',
            'self-replicator',
            'momentum',
          ] as const
        ).map((id) => ({ id, level: 1 })),
      },
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
});
