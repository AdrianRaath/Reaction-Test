/**
 * Spacebar Clicker: the endgame's records (SPACEBAR-CLICKER.md §8.5.16). A
 * timed run reaching a million sets the fastest million, quietly the first
 * time and told when it beats an earlier one, with Quick Study under 10
 * minutes; the Stats panel shows the best run.
 */

import { expect, openGame, seedSave, test } from './fixtures';

const MIN = 60_000;
const noDrops = { rng: 7, activeS: 0, nextDropAtS: 99_999 };
/** A run 500 energy short of a million, with machines to close the gap in a few seconds. */
const nearlyThere = {
  energy: 1000,
  runLifetime: 999_500,
  totalLifetime: 999_500,
  tappers: { pneumatic: 40 },
  revealed: ['assistant', 'pneumatic'] as ('assistant' | 'pneumatic')[],
  perks: noDrops,
};

test('a faster million than before is told, kept, and earns Quick Study', async ({ page }) => {
  await seedSave(page, { ...nearlyThere, runStartedAt: Date.now() - 9 * MIN, bestMillionS: 700 });
  await openGame(page);
  await expect(page.locator('#sc-stat-fastest-million')).toHaveText('11m 40s');

  await expect(page.locator('#sc-announce')).toContainText(/New record: a million in 9m 0\ds\./, {
    timeout: 15_000,
  });
  await expect(page.locator('#sc-stat-fastest-million')).toHaveText(/^9m 0\ds$/);
  await expect(page.locator('.achievement[data-id="quick-study"]')).toHaveClass(/is-unlocked/);
});

test('a first million is recorded quietly, and Stats shows the best run', async ({ page }) => {
  await seedSave(page, { ...nearlyThere, runStartedAt: Date.now() - 25 * MIN, bestRunEnergy: 5e7 });
  await openGame(page);
  await expect(page.locator('#sc-stat-best-run')).toHaveText('50.0M');
  await expect(page.locator('#sc-stat-fastest-million')).toHaveText('—');

  await expect(page.locator('#sc-stat-fastest-million')).toHaveText(/^25m 0\ds$/, {
    timeout: 15_000,
  });
  await expect(page.locator('#sc-announce')).not.toContainText('New record');
  await expect(page.locator('.achievement[data-id="quick-study"]')).not.toHaveClass(/is-unlocked/);
});
