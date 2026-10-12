import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  use: { baseURL: 'http://localhost:4173', viewport: { width: 1280, height: 720 } },
  webServer: { command: 'pnpm build && pnpm preview', url: 'http://localhost:4173', reuseExistingServer: !process.env.CI, timeout: 120_000 },
  ...(process.env.PW_CHROMIUM ? { projects: [{ name: 'chromium', use: { launchOptions: { executablePath: process.env.PW_CHROMIUM } } }] } : {}),
});
