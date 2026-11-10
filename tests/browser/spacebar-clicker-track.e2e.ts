/**
 * Spacebar Clicker: the isotope track in play (SPACEBAR-CLICKER.md §8.3). The
 * tooltips naming unlocks, the track in the Isotopes tab, fork picks and a kept
 * perk in the reset dialog, the unlock card, the reroll, Prodigy's offers,
 * six sockets and two keystones, reduced motion, and the phone layout.
 */

import type { PerkId } from '../../src/games/spacebar-clicker/config';
import type { PerkOffer } from '../../src/games/spacebar-clicker/save';
import {
  editSave,
  expect,
  openGame,
  recordToasts,
  seedSave,
  test,
  toastsSeen,
  type Staged,
} from './fixtures';

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

  // With a reset open, what it unlocks comes before the energy line.
  await page.hover('#sc-isotope-badge');
  await expect(unlock).toHaveText('Unlocks Lucky Find and a choice of Reroll or Patience.');
  const order = await page.evaluate(
    () =>
      document
        .getElementById('sc-isotope-tip-unlock')!
        .compareDocumentPosition(document.getElementById('sc-isotope-tip-detail')!) &
      Node.DOCUMENT_POSITION_FOLLOWING
  );
  expect(order).toBeTruthy();

  // Before one opens, the next unlock comes after it.
  await page.mouse.move(5, 5);
  await editSave(page, (s) => {
    s.runLifetime = 5000;
  });
  await page.hover('#sc-isotope-badge');
  await expect(unlock).toHaveText('Next at 5 isotopes: Lucky Find.');
});

test('the Isotopes tab draws the track: held, picked, and the next two', async ({ page }) => {
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
  // A card a rung, in order: seven lit, the next two named, the rest hidden.
  await expect(page.locator('#sc-track .track-card')).toHaveCount(12);
  await expect(page.locator('#sc-track .track-card.is-lit')).toHaveCount(7);
  await expect(page.locator('#sc-track .track-card.is-next')).toHaveCount(2);
  await expect(page.locator('#sc-track .track-card.is-hidden')).toHaveCount(3);
  await expect(page.locator('.track .panel-intro'), 'said once, not per fork').toContainText(
    'can switch at any reset after'
  );

  // A fork held: both options, the pick lit in the card and in its socket.
  const third = page.locator('.track-card[data-isotopes="3"]');
  await expect(third).toContainText('At 3 isotopes, unlocked');
  await expect(third.locator('.track-option .track-card-name')).toHaveText([
    'Sixth Slot',
    'Prodigy',
  ]);
  await expect(third.locator('.track-option.is-picked .track-card-name')).toHaveText('Prodigy');
  await expect(third.locator('.track-half.is-picked')).toHaveAttribute('data-rung', 'prodigy');
  await expect(
    page.locator('.track-card[data-isotopes="6"] .track-option.is-picked .track-card-name')
  ).toHaveText('Patience');

  // The next two, named, with what they do.
  const eighth = page.locator('.track-card[data-isotopes="8"]');
  await expect(eighth).toContainText('At 8 isotopes, next');
  await expect(eighth.locator('.track-card-name')).toHaveText('Hot Start');
  await expect(eighth.locator('.track-card-tag')).toHaveText('Next');
  const ninth = page.locator('.track-card[data-isotopes="9"]');
  await expect(ninth.locator('.track-card-name')).toHaveText(['Heirloom', 'Cornerstone']);
  await expect(ninth.locator('.track-option.is-picked')).toHaveCount(0);

  // Two ahead and no further: a socket and its number.
  const tenth = page.locator('.track-card[data-isotopes="10"]');
  await expect(tenth).toHaveClass(/is-hidden/);
  await expect(tenth.locator('.track-card-name')).toHaveCount(0);
  await expect(tenth).toContainText('At 10 isotopes: not revealed yet.');
});

test('with every rung held, the Isotopes tab has no next rungs and no unlock line', async ({
  page,
}) => {
  await seedSave(page, {
    energy: 50,
    runLifetime: 5_000_000,
    isotopes: 12,
    forks: { 3: 'sixth-slot', 6: 'reroll', 9: 'heirloom', 12: 'enrichment' },
    perks: noDrops,
  });
  await openGame(page);
  await page.click('[data-tab="prestige"]');

  await expect(page.locator('#sc-prestige-btn')).toBeVisible();
  await expect(page.locator('#sc-prestige-gain')).toHaveText('+2');
  await expect(page.locator('#sc-reset-unlocks')).toBeHidden();
  await expect(page.locator('#sc-track .track-card.is-next')).toHaveCount(0);
  await expect(page.locator('#sc-track .track-card.is-lit')).toHaveCount(12);
  await expect(page.locator('#sc-prestige-from'), 'at Enrichment’s 13%').toHaveText('from +156%');
  await expect(page.locator('#sc-prestige-after')).toHaveText('+182%');
});

test('a new fork waits for a pick, and the reset unlocks it with a card', async ({ page }) => {
  await seedSave(page, { ...resetFor(1), isotopes: 2, perks: noDrops });
  await openGame(page);
  await page.click('[data-tab="prestige"]');
  await page.click('#sc-prestige-btn');

  const fork = page.locator('[data-fork="3"]');
  await expect(fork.locator('legend')).toHaveText('At 3 isotopes: pick one');
  await expect(fork.locator('input:checked')).toHaveCount(0);
  await expect(page.locator('#sc-reset-head')).toHaveText('500 energy and a Lab Assistant');

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
  await expect(keep.locator('.reset-chip-name')).toHaveText(['Self-Replicator III', 'Overtone']);
  await expect(keep.locator('.reset-keep-none')).toHaveText('Keep none');
  await expect(keep.locator('input[value="self-replicator"]')).toBeChecked();

  // Cornerstone offers the keystone instead.
  await page.locator('input[value="cornerstone"]').check();
  await expect(keep.locator('legend')).toHaveText('Cornerstone: keep your keystone');
  await expect(keep.locator('.reset-chip-name')).toHaveText(['Glass Rhythm II']);

  // "Keep none" holds through a switch of a fork picked before.
  await keep.locator('input[value=""]').check();
  await page.locator('[data-fork="3"] input[value="sixth-slot"]').check();
  await expect(keep.locator('input[value=""]')).toBeChecked();

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

test('late in a career the reset dialog fits the screen, past picks as switches with tooltips', async ({
  page,
}) => {
  const held = [
    'overtone',
    'coiled-spring',
    'loaded-dice',
    'afterglow',
    'overtime',
    'assembly-line',
  ] as const;
  await seedSave(page, {
    ...resetFor(1),
    isotopes: 12,
    forks: { 3: 'sixth-slot', 6: 'reroll', 9: 'heirloom', 12: 'enrichment' },
    perks: {
      ...noDrops,
      owned: held.map((id) => ({ id, level: 2 })),
      codex: Object.fromEntries(held.map((id) => [id, 2])),
    },
  });
  await openGame(page);
  await page.click('[data-tab="prestige"]');
  await page.click('#sc-prestige-btn');

  await expect(page.locator('#sc-reset-sum-gain')).toHaveText('+1');
  await expect(page.locator('#sc-reset-sum-to')).toHaveText('isotope, to 13');
  await expect(page.locator('#sc-reset-sum-bonus'), 'at Enrichment’s 13%').toHaveText('+169%');
  await expect(page.locator('#sc-reset-sum-from')).toHaveText('from +156%');
  await expect(page.locator('#sc-reset-head')).toHaveText(
    '500 energy, a Lab Assistant, a Pneumatic Key and Finger Strength III'
  );
  await expect(page.locator('#sc-reset-keep .reset-chip')).toHaveCount(6);
  const picks = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLInputElement>('.reset-pick input:checked')).map(
      (input) => input.value
    )
  );
  expect(picks).toEqual(['sixth-slot', 'reroll', 'heirloom', 'enrichment']);
  const fit = await page.evaluate(() => {
    const modal = document.querySelector('#sc-prestige-modal .modal')!.getBoundingClientRect();
    const body = document.getElementById('sc-reset-body')!;
    return {
      inside: modal.top >= 0 && modal.bottom <= innerHeight,
      scrolls: body.scrollHeight > body.clientHeight,
    };
  });
  expect(fit, 'at 1440x900, with every fork and six perks').toEqual({
    inside: true,
    scrolls: false,
  });

  // A hover shows what a rung does, over its half of the switch.
  const tip = page.locator('#sc-pick-tip');
  await page.mouse.move(5, 5);
  await expect(tip).toBeHidden();
  const prodigy = page.locator('.reset-seg-option[data-rung="prodigy"]');
  await prodigy.hover();
  await expect(tip).toBeVisible();
  await expect(page.locator('#sc-pick-tip-name')).toHaveText('Prodigy');
  await expect(page.locator('#sc-pick-tip-detail')).toHaveText(
    "Perks you don't hold drop at level II, for their level I price."
  );
  const tipBox = (await tip.boundingBox())!;
  const halfBox = (await prodigy.boundingBox())!;
  expect(tipBox.y + tipBox.height).toBeLessThanOrEqual(halfBox.y + 1);
  await page.mouse.move(5, 5);
  await expect(tip).toBeHidden();

  // A switch makes the pick: Cornerstone has no keystone to keep, and Twin
  // Keystones takes the bonus back to 10% an isotope.
  await page.click('.reset-seg-option[data-rung="cornerstone"]');
  await expect(page.locator('#sc-reset-keep')).toBeEmpty();
  await page.click('.reset-seg-option[data-rung="twin-keystones"]');
  await expect(page.locator('#sc-reset-sum-bonus')).toHaveText('+130%');

  // From the keyboard, the arrows switch, and focus shows the tooltip.
  await page.focus('[data-fork="6"] input[value="reroll"]');
  await page.keyboard.press('ArrowRight');
  const patience = page.locator('[data-fork="6"] input[value="patience"]');
  await expect(patience).toBeChecked();
  await expect(patience).toHaveAccessibleDescription('Perks stay on offer twice as long.');
  await expect(tip).toBeVisible();
  await expect(page.locator('#sc-pick-tip-name')).toHaveText('Patience');

  // Escape closes the tooltip first, then the dialog.
  await page.keyboard.press('Escape');
  await expect(tip).toBeHidden();
  await expect(page.locator('#sc-prestige-modal')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#sc-prestige-modal')).toBeHidden();
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

test('a return credits Night Lab where it held full output past the half hour', async ({
  page,
}) => {
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
    50 * 60 * 1000
  );
  // The return's toasts queue behind one another (and a stage change's after
  // them), so they are recorded as they show rather than read off the screen.
  await recordToasts(page);
  await openGame(page);
  await expect(page.locator('#sc-reactor'), 'still at full power').not.toHaveAttribute(
    'data-power'
  );
  // 50 minutes, all at full output with Night Lab: 2 a second, x1.05 Warming, x1.4 isotopes.
  // Loading adds a moment, so the last digits may run on a little. Night Lab's
  // credit comes next, in the isotopes' blue.
  await expect
    .poll(async () => (await toastsSeen(page)).length, { timeout: 8000 })
    .toBeGreaterThanOrEqual(2);
  const [away, credit] = await toastsSeen(page);
  expect(away).toMatch(/^\|Untended 50m 0\ds: \+8,8[2-4]\d energy$/);
  expect(credit).toBe('track|Night Lab held full output for an hour');
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

  test('the reset dialog with every fork fits the width, opens at the top, and pins its buttons', async ({
    page,
  }) => {
    const held = ['overtone', 'coiled-spring', 'loaded-dice', 'afterglow', 'overtime'] as const;
    await seedSave(page, {
      ...resetFor(2),
      isotopes: 11,
      forks: { 3: 'prodigy', 6: 'reroll', 9: 'heirloom' },
      perks: {
        ...noDrops,
        owned: held.map((id) => ({ id, level: 2 })),
        codex: Object.fromEntries(held.map((id) => [id, 2])),
      },
    });
    await openGame(page);
    await page.click('[data-tab="prestige"]');
    await page.click('#sc-prestige-btn');
    // Three forks picked before, the capstone's new one, and Heirloom's.
    await expect(page.locator('#sc-reset-choices fieldset')).toHaveCount(5);
    const fit = await page.evaluate(() => {
      const modal = document.querySelector('#sc-prestige-modal .modal')!.getBoundingClientRect();
      const confirm = document.getElementById('sc-prestige-confirm')!.getBoundingClientRect();
      const body = document.getElementById('sc-reset-body')!;
      return {
        inside: modal.left >= 0 && modal.right <= innerWidth && modal.bottom <= innerHeight,
        scrolls: body.scrollHeight > body.clientHeight,
        atTop: body.scrollTop === 0,
        buttonsInView: confirm.top >= modal.top && confirm.bottom <= modal.bottom,
        noScroll: document.documentElement.scrollWidth <= innerWidth,
      };
    });
    expect(fit).toEqual({
      inside: true,
      scrolls: true,
      atTop: true,
      buttonsInView: true,
      noScroll: true,
    });
    await page.locator('input[value="twin-keystones"]').check();
    await page.click('#sc-prestige-confirm');
    // From 11 to 13 isotopes, the capstone is the only rung reached.
    await expect(page.locator('#sc-unlock-card .unlock-name')).toHaveText(['Twin Keystones']);
  });

  test('a reset that lands every rung lists three on the card, and points to the rest', async ({
    page,
  }) => {
    // A first run held to 177B pays all twelve isotopes in one reset.
    await seedSave(page, {
      energy: 50,
      runLifetime: 180e9,
      totalLifetime: 180e9,
      isotopes: 0,
      perks: noDrops,
    });
    await openGame(page);
    await page.click('[data-tab="prestige"]');
    await page.click('#sc-prestige-btn');
    for (const fieldset of await page.locator('#sc-reset-choices fieldset').all()) {
      await fieldset.locator('input[type="radio"]').first().check();
    }
    await page.locator('#sc-prestige-confirm').scrollIntoViewIfNeeded();
    await page.click('#sc-prestige-confirm');

    const card = page.locator('#sc-unlock-card');
    await expect(card).toBeVisible({ timeout: 5000 });
    await expect(card.locator('.unlock-name')).toHaveText([
      'Warm Start',
      'Capacitor',
      'Sixth Slot',
    ]);
    await expect(page.locator('#sc-unlock-more')).toHaveText('+9 more in the Isotopes tab');
    const fit = await page.evaluate(() => {
      const c = document.getElementById('sc-unlock-card')!.getBoundingClientRect();
      const f = document.getElementById('sc-reactor')!.getBoundingClientRect();
      return {
        inside: c.top >= f.top && c.bottom <= f.bottom && c.left >= f.left && c.right <= f.right,
      };
    });
    expect(fit).toEqual({ inside: true });
  });

  test('the Isotopes tab: a rung a row, the hidden ones six sockets to a row, no sideways scroll', async ({
    page,
  }) => {
    await seedSave(page, { energy: 50, runLifetime: 5000, isotopes: 4, perks: noDrops });
    await openGame(page);
    await page.click('[data-tab="prestige"]');
    const fit = await page.evaluate(() => {
      const grid = document.getElementById('sc-track')!.getBoundingClientRect();
      const cards = Array.from(document.querySelectorAll('#sc-track .track-card'));
      const shown = cards.filter((c) => !c.classList.contains('is-hidden'));
      const hidden = cards.filter((c) => c.classList.contains('is-hidden'));
      const tops = new Set(hidden.map((c) => Math.round(c.getBoundingClientRect().top)));
      return {
        acrossThePanel: shown.every(
          (c) => Math.abs(c.getBoundingClientRect().width - grid.width) < 1
        ),
        hidden: hidden.length,
        oneRow: tops.size,
        noScroll: document.documentElement.scrollWidth <= window.innerWidth,
      };
    });
    expect(fit).toEqual({ acrossThePanel: true, hidden: 6, oneRow: 1, noScroll: true });
  });

  test('six sockets and the isotope badge keep clear of each other', async ({ page }) => {
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
        compact: document.querySelector('.reactor-wrap')!.classList.contains('is-compact'),
        apart: ring.right + 12 <= perks.left || ring.bottom <= perks.top,
        readout: readout.top >= Math.max(ring.bottom, perks.bottom),
        noScroll: document.documentElement.scrollWidth <= window.innerWidth,
      };
    });
    // Six sockets leave no room for the lines: the ring stands alone.
    expect(fit).toEqual({ compact: true, apart: true, readout: true, noScroll: true });
  });
});
