import { defineConfig } from '@playwright/test';

/**
 * Browser checks: `npm run test:browser`.
 *
 * Vitest covers the pure logic; these drive the real pages. They run in the
 * system's Chrome (`channel: 'chrome'`), so there are no Playwright browsers to
 * download. A dev server already on port 4321 is reused; otherwise one is
 * started for the run.
 *
 * One worker: several checks press the spacebar on a real-time beat, and a
 * busy machine would jitter the beat enough to break a combo.
 */
export default defineConfig({
  testDir: 'tests/browser',
  // Not *.spec.ts or *.test.ts, which Vitest would also pick up.
  testMatch: '**/*.e2e.ts',
  workers: 1,
  timeout: 90_000,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4321',
    channel: 'chrome',
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4321',
    url: 'http://127.0.0.1:4321',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
