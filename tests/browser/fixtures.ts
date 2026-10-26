/**
 * Shared setup for the browser checks.
 *
 * Every test fails if its page logs an error or throws, so a broken script
 * can't hide behind a passing assertion.
 */

import { test as base, expect, type Page } from '@playwright/test';

import type { PerkState, SaveState } from '../../src/games/spacebar-clicker/save';

export const SAVE_KEY = 'reflexlab:spacebar-clicker:save';

export const test = base.extend<{ errors: string[] }>({
  errors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
      });
      await use(errors);
      expect(errors, 'console or page errors').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** Open the game with the reactor focused and any focus scroll settled. */
export async function openGame(page: Page): Promise<void> {
  await page.goto('/spacebar-clicker', { waitUntil: 'networkidle' });
  await page.focus('#sc-reactor');
  await page.waitForTimeout(600);
}

/**
 * Rewrite the save, then reload. `mutate` runs in the page, so it must not
 * use anything from the test's scope. The game saves on pagehide, so storage
 * writes are frozen first or the reload would put the old save back; the
 * reloaded page saves normally again.
 */
export async function editSave(page: Page, mutate: (s: SaveState) => void): Promise<void> {
  await page.evaluate(
    ([key, src]) => {
      const s = JSON.parse(localStorage.getItem(key) ?? '{}');
      new Function('s', `(${src})(s)`)(s);
      localStorage.setItem(key, JSON.stringify(s));
      Storage.prototype.setItem = () => {};
    },
    [SAVE_KEY, mutate.toString()] as const
  );
  await page.reload({ waitUntil: 'networkidle' });
}

/** A save to stage: any fields left out fall back to a fresh save's. */
export type Staged = Partial<Omit<SaveState, 'perks' | 'tappers'>> & {
  tappers?: Partial<SaveState['tappers']>;
  perks?: Partial<PerkState>;
};

/**
 * Write a save before the page's own scripts run, on the first load only.
 * `awayMs` backdates the last visit at load time, for away progress.
 */
export async function seedSave(page: Page, save: Staged, awayMs = 0): Promise<void> {
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

/** Press Space `count` times on a real-time beat. */
export async function pressSteady(page: Page, count: number, intervalMs: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    await page.keyboard.press('Space');
    await page.waitForTimeout(intervalMs);
  }
}

/** The energy readout as a number. Under 100K it is a whole number with separators. */
export async function energy(page: Page): Promise<number> {
  return Number((await page.textContent('#sc-energy'))!.trim().replace(/,/g, ''));
}
