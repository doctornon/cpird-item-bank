import { defineConfig, devices } from '@playwright/test';
// E2E drives the real UI per role. Google-only login is bypassed by injecting a
// Supabase session into localStorage (see global-setup.mjs) — no OAuth clicks.
export default defineConfig({
  testDir: '.',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  globalSetup: './global-setup.mjs',
  use: { baseURL: process.env.BASE_URL || 'http://localhost:3000', trace: 'on-first-retry' },
  projects: [
    { name: 'student', use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/student.json' } },
    { name: 'writer',  use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/writer.json' } },
    { name: 'admin',   use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/admin.json' } },
  ],
});
