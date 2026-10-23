/**
 * Spacebar Clicker: perks in play (SPACEBAR-CLICKER.md §8.1, step 4). Drops
 * and their offer rows, buying and upgrading, the swap dialog, the keystone
 * swap, windows running out, time away, and the effects the script runs:
 * Brute Force's dead combo, Chain Reaction's floats, and a surge with Storm
 * Front, Afterglow, a surge drop and Self-Replicator on a fake clock.
 */

import type { Page } from '@playwright/test';

import type { PerkId } from '../../src/games/spacebar-clicker/config';
import type { PerkOffer, PerkState, SaveState } from '../../src/games/spacebar-clicker/save';
import { SAVE_KEY, energy, expect, openGame, pressSteady, test } from './fixtures';

type Staged = Partial<Omit<SaveState, 'perks'>> & { perks?: Partial<PerkState> };

/**
 * Write a save before the page's own scripts run, on the first load only.
 * Fields left out fall back to a fresh save's. `awayMs` backdates the last
 * visit at load time, for away progress.
 */
async function seedSave(page: Page, save: Staged, awayMs = 0): Promise<void> {
  await page.addInitScript(
    ([key, json, away]) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      const s = JSON.parse(json);
      if (away) s.lastSeen = Date.now() - away;
      localStorage.setItem(key, JSON.stringify(s));
    },
    [SAVE_KEY, JSON.stringify(save), awayMs] as const
  );
}

/** The perks block as the page would save it now. */
async function savedPerks(page: Page): Promise<PerkState> {
  return page.evaluate((key) => {
    window.dispatchEvent(new Event('pagehide'));
    return JSON.parse(localStorage.getItem(key)!).perks;
  }, SAVE_KEY);
}

/** An offer that drops with the run at `at` energy and leaves `window` later. */
const offer = (id: PerkId, level: number, price: number, at: number, window = 4000): PerkOffer => ({
  id,
  level,
  price,
  droppedAt: at,
  expiresAt: at + window,
  seen: true,
  seenAffordable: true,
});

/** Drops stay away unless a test wants one. */
const noDrops = { rng: 7, activeS: 0, nextDropAtS: 99_999 };

test('a perk drops into its tab, lit in its family hue, with a toast and a tag', async ({
  page,
}) => {
  await seedSave(page, {
    energy: 100,
    runLifetime: 5000,
    tappers: { assistant: 0, pneumatic: 5, arm: 0, quantum: 0, collider: 0 },
    // Not a first run (the codex has something), so the drop comes when the save says.
    perks: { owned: [], offers: [], rng: 7, activeS: 0, nextDropAtS: 1.5, codex: { overtone: 0 } },
  });
  await openGame(page);
  await page.click('[data-shop-tab="auto"]');
  await page.keyboard.press('Space'); // active play starts with a press

  const row = page.locator('.perk-offer:not([hidden])');
  await expect(row).toHaveCount(1, { timeout: 6000 });
  const name = (await row.locator('[data-perk-name]').textContent())!.trim();
  await expect(page.locator('#sc-toast')).toContainText(`drop: ${name}`);
  expect(await row.getAttribute('data-family')).toMatch(/^(rhythm|press|luck|surge|machines)$/);
  expect(
    await row.evaluate((li) => getComputedStyle(li.querySelector('.perk-tile')!).color),
    'the tile is lit in its family hue'
  ).not.toBe('rgb(250, 250, 250)');
  expect(
    await row.evaluate((li) =>
      parseFloat((li.querySelector('.perk-ring-fill') as SVGElement).style.strokeDashoffset)
    ),
    'the window starts full'
  ).toBeLessThan(5);

  const tab = (await row.getAttribute('id'))!.replace('sc-offer-', '');
  if (tab === 'press') {
    await expect(page.locator('#sc-new-press'), 'a drop on a closed tab tags it').toBeVisible();
    await page.click('[data-shop-tab="press"]');
    await expect(page.locator('#sc-new-press')).toBeHidden();
  }
  await expect(row).toBeVisible();
});

test('buying takes a slot, and an upgrade strikes out the value it replaces', async ({ page }) => {
  await seedSave(page, {
    energy: 5000,
    runLifetime: 5000,
    perks: {
      ...noDrops,
      owned: [{ id: 'metronome', level: 1 }],
      offers: [offer('metronome', 2, 450, 5000), offer('overtime', 1, 300, 5000)],
    },
  });
  await openGame(page);

  const press = page.locator('#sc-offer-press');
  await expect(press).toBeVisible();
  await expect(press.locator('[data-perk-level]')).toContainText('II');
  await expect(press.locator('.perk-was')).toContainText('40%');
  await expect(press.locator('.perk-value')).toContainText('55%');
  await expect(press.locator('[data-perk-rarity]')).toHaveText('Upgrade');

  await press.locator('.perk-buy').click();
  await expect(press).toBeHidden();
  expect(await energy(page)).toBe(4550);

  await page.click('[data-shop-tab="auto"]');
  const auto = page.locator('#sc-offer-auto');
  await expect(auto.locator('[data-perk-rarity]')).toHaveText('Common');
  await auto.locator('.perk-buy').click();
  await expect(auto).toBeHidden();
  expect(await energy(page)).toBe(4250);
  expect((await savedPerks(page)).owned).toEqual([
    { id: 'metronome', level: 2 },
    { id: 'overtime', level: 1 },
  ]);
  expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('BUTTON');
});

test('with every slot full, the dialog asks which perk to drop', async ({ page }) => {
  await seedSave(page, {
    energy: 5000,
    runLifetime: 5000,
    perks: {
      ...noDrops,
      owned: [
        { id: 'metronome', level: 2 },
        { id: 'held-breath', level: 1 },
        { id: 'overtime', level: 3 },
        { id: 'loaded-dice', level: 1 },
        { id: 'storm-front', level: 1 },
      ],
      offers: [offer('chain-reaction', 1, 1000, 5000)],
    },
  });
  await openGame(page);

  const row = page.locator('#sc-offer-press');
  await expect(row.locator('[data-perk-note]')).toHaveText(
    "All 5 slots are full: you'll pick one to drop"
  );
  await row.locator('.perk-buy').click();
  const dialog = page.locator('#sc-swap-modal');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('#sc-swap-title')).toHaveText('All 5 slots are full');
  await expect(dialog.locator('#sc-swap-incoming')).toContainText('Chain Reaction');
  await expect(dialog.locator('button.perk-card')).toHaveCount(5);
  await expect(page.locator('#sc-swap-cancel')).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(row, 'cancelling keeps the offer').toBeVisible();
  expect(await energy(page)).toBe(5000);

  await row.locator('.perk-buy').click();
  await dialog.locator('button.perk-card').nth(1).click(); // Held Breath
  await expect(dialog).toBeHidden();
  await expect(row).toBeHidden();
  expect(await energy(page)).toBe(4000);
  expect((await savedPerks(page)).owned.map((o) => o.id)).toEqual([
    'metronome',
    'chain-reaction',
    'overtime',
    'loaded-dice',
    'storm-front',
  ]);
  expect(await page.evaluate(() => document.activeElement?.id)).toBe('sc-reactor');
});

test('a second keystone asks before it swaps, and the shop marks what keystones switch off', async ({
  page,
}) => {
  await seedSave(page, {
    energy: 5000,
    runLifetime: 5000,
    perks: {
      ...noDrops,
      owned: [{ id: 'glass-rhythm', level: 2 }],
      offers: [offer('brute-force', 1, 1000, 5000)],
    },
  });
  await openGame(page);

  const level = (id: string) => page.locator(`.shop-item[data-id="${id}"] [data-level]`);
  await expect(level('stabiliser'), 'Glass Rhythm switches the Stabiliser off').toHaveText('Off');
  await expect(level('sync')).toHaveText('');

  const row = page.locator('#sc-offer-press');
  await expect(row.locator('[data-perk-note]')).toHaveText(
    'Swaps out your keystone, Glass Rhythm II'
  );
  await row.locator('.perk-buy').click();
  const dialog = page.locator('#sc-swap-modal');
  await expect(dialog.locator('#sc-swap-title')).toHaveText('Swap your keystone?');
  await expect(page.locator('#sc-swap-cancel')).toHaveText('Keep Glass Rhythm');
  await page.click('#sc-swap-cancel');
  await expect(dialog).toBeHidden();
  await expect(row).toBeVisible();

  await row.locator('.perk-buy').click();
  await page.click('#sc-swap-confirm');
  await expect(row).toBeHidden();
  expect((await savedPerks(page)).owned).toEqual([{ id: 'brute-force', level: 1 }]);
  await expect(level('stabiliser')).toHaveText('');
  await expect(level('sync'), 'Brute Force leaves Synchronisation nothing').toHaveText('Off');

  // Brute Force: a steady beat builds no combo.
  await pressSteady(page, 15, 200);
  await expect(page.locator('#sc-combo')).toHaveText('0');
  await expect(page.locator('#sc-combo-next')).toHaveText('off with Brute Force');
  await expect(page.locator('#sc-combo-mult')).toHaveText('x1');
});

test('time away never runs an offer down, but play does', async ({ page }) => {
  await seedSave(
    page,
    {
      energy: 0,
      runLifetime: 5000,
      tappers: { assistant: 0, pneumatic: 10, arm: 0, quantum: 0, collider: 0 },
      perks: {
        ...noDrops,
        owned: [{ id: 'night-shift', level: 1 }],
        // Half its window left: 200 energy, under ten seconds of these tappers.
        offers: [offer('metronome', 1, 999_999, 4800, 400)],
      },
    },
    600_000
  );
  await openGame(page);

  await expect(page.locator('#sc-away-modal')).toBeVisible();
  await expect(page.locator('#sc-away-rate'), 'Night Shift pays all of it').toHaveText(
    'full speed'
  );
  await page.click('#sc-away-collect');
  const row = page.locator('#sc-offer-press');
  await page.waitForTimeout(500);
  await expect(row, 'thousands collected, and the offer is still there').toBeVisible();

  const ring = () =>
    row.evaluate((li) =>
      parseFloat((li.querySelector('.perk-ring-fill') as SVGElement).style.strokeDashoffset)
    );
  const early = await ring();
  expect(early).toBeGreaterThan(40);
  await expect(row, 'the last fifth of the window breathes').toHaveClass(/is-fading/, {
    timeout: 10_000,
  });
  expect(await ring()).toBeGreaterThan(early);
  await expect(row, 'then the window runs out').toBeHidden({ timeout: 10_000 });
});

test('Chain Reaction pops its doublings out as gold floats', async ({ page }) => {
  await seedSave(page, {
    runLifetime: 5000,
    upgrades: { finger: 0, double: 10, spring: 0, stabiliser: 0, sync: 0 },
    perks: {
      ...noDrops,
      owned: [
        { id: 'loaded-dice', level: 3 },
        { id: 'chain-reaction', level: 3 },
      ],
    },
  });
  await openGame(page);
  await page.evaluate(() => {
    const w = window as unknown as { chains: number };
    w.chains = 0;
    new MutationObserver((records) => {
      for (const r of records) {
        for (const n of r.addedNodes)
          if ((n as Element).classList?.contains('is-chain')) w.chains++;
      }
    }).observe(document.getElementById('sc-floats')!, { childList: true });
  });
  // A 75% Double Tap that chains on at 60%: nearly half of all presses reach x4.
  await pressSteady(page, 20, 200);
  expect(
    await page.evaluate(() => (window as unknown as { chains: number }).chains)
  ).toBeGreaterThan(0);
});

test('a surge with perks: Storm Front, a surge drop, Afterglow, and Self-Replicator', async ({
  page,
}) => {
  test.setTimeout(300_000);
  await page.clock.install({ time: new Date('2026-10-22T12:00:00Z') });
  await seedSave(page, {
    runLifetime: 20_000,
    tappers: { assistant: 2, pneumatic: 0, arm: 0, quantum: 0, collider: 0 },
    perks: {
      // Seed 7's first draw is under 1 in 8: the first surge drops a perk.
      ...noDrops,
      owned: [
        { id: 'storm-front', level: 1 },
        { id: 'afterglow', level: 1 },
        { id: 'lightning-rod', level: 3 },
        { id: 'self-replicator', level: 3 },
      ],
    },
  });
  await page.goto('/spacebar-clicker', { waitUntil: 'networkidle' });
  await page.clock.pauseAt(new Date('2026-10-22T12:01:00Z'));
  await page.clock.runFor(100);
  await page.focus('#sc-reactor');

  const phase = () =>
    page.evaluate(() => document.getElementById('sc-reactor')!.dataset.surge ?? 'idle');
  const tap = async (ms: number) => {
    await page.keyboard.press('Space');
    await page.clock.runFor(ms);
  };

  // Lightning Rod III brings a surge within 36 to 72 s; Storm Front gives no countdown.
  let warned = false;
  for (let i = 0; i < 320 && (await phase()) !== 'active'; i++) {
    await tap(250);
    if ((await phase()) === 'warning') warned = true;
  }
  expect(await phase()).toBe('active');
  expect(warned, 'Storm Front strikes without a countdown').toBe(false);
  await expect(page.locator('#sc-surge-label')).toHaveText('Surge x20');
  await expect(page.locator('#sc-shockwave')).toHaveClass(/is-firing/);

  for (let i = 0; i < 60 && (await phase()) === 'active'; i++) await tap(150);
  expect(await phase()).toBe('summary');

  // The boss's loot, named on the results card and on offer in its tab.
  await expect(page.locator('#sc-surge-drop')).toBeVisible();
  await expect(page.locator('#sc-surge-drop-kind')).toHaveText(/drop$/);
  const dropped = (await page.textContent('#sc-surge-drop-name'))!.trim();
  const row = page.locator('.perk-offer:not([hidden])');
  await expect(row).toHaveCount(1);
  expect(dropped).toContain((await row.locator('[data-perk-name]').textContent())!.trim());

  // Afterglow follows the surge, counted down under the core.
  await expect(page.locator('#sc-surge-label')).toHaveText(/^Afterglow x3, \d+ s$/);
  await expect(page.locator('#sc-state-label')).toBeHidden();
  await expect(page.locator('#sc-reactor')).toHaveClass(/is-afterglow/);
  await page.clock.runFor(11_000);
  await expect(page.locator('#sc-state-label')).toBeVisible();
  await expect(page.locator('#sc-reactor')).not.toHaveClass(/is-afterglow/);

  // Self-Replicator III: a free copy of the best tapper every 90 s of active play.
  // Dispatched: a real click waits on animation frames, and the clock is paused.
  await page.locator('[data-shop-tab="auto"]').dispatchEvent('click');
  const owned = () => page.textContent('.shop-item[data-id="assistant"] [data-owned]');
  for (let i = 0; i < 200 && (await owned()) === '2'; i++) await tap(500);
  expect(await owned()).toBe('3');
});

test.describe('under reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('a bought offer goes at once, without folding away', async ({ page }) => {
    await seedSave(page, {
      energy: 5000,
      runLifetime: 5000,
      perks: { ...noDrops, offers: [offer('afterglow', 1, 300, 5000)] },
    });
    await openGame(page);
    await page.locator('#sc-offer-press .perk-buy').click();
    expect(await page.locator('#sc-offer-press').isHidden()).toBe(true);
  });
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the swap dialog fits without scrolling sideways', async ({ page }) => {
    await seedSave(page, {
      energy: 5000,
      runLifetime: 5000,
      perks: {
        ...noDrops,
        owned: [
          { id: 'glass-rhythm', level: 1 },
          { id: 'held-breath', level: 1 },
          { id: 'overtime', level: 1 },
          { id: 'loaded-dice', level: 1 },
          { id: 'self-replicator', level: 1 },
        ],
        offers: [offer('overtone', 1, 1000, 5000)],
      },
    });
    await openGame(page);
    await page.locator('#sc-offer-press .perk-buy').click();
    await expect(page.locator('#sc-swap-modal')).toBeVisible();
    const fits = await page.evaluate(() => {
      const box = document.querySelector('#sc-swap-modal .modal')!.getBoundingClientRect();
      return (
        document.documentElement.scrollWidth <= window.innerWidth &&
        box.left >= 0 &&
        box.right <= window.innerWidth
      );
    });
    expect(fits).toBe(true);
  });
});
