import { defineConfig, devices } from "@playwright/test";

// Chromium-based mobile emulation (real viewport + touch + isMobile), served
// from a fresh production preview build so import.meta.env.PROD is true — that
// makes the agent "proxy-only" (ready) and lets the spec stub /api/chat.
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  timeout: 45_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
    ...devices["Pixel 5"],
  },
  projects: [
    { name: "mobile", testMatch: /mobile\.spec\.ts$/, use: { ...devices["Pixel 5"] } },
    {
      name: "desktop",
      testMatch: /desktop\.spec\.ts$/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1360, height: 900 } },
    },
  ],
  webServer: {
    command: "npm run build && npm run preview",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
