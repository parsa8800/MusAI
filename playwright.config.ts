import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://127.0.0.1:3001",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // Use production server to avoid file-watcher limits (EMFILE) in CI/sandboxes.
    command: "npm run build && npm run start -- -p 3001 -H 127.0.0.1",
    url: "http://127.0.0.1:3001",
    // Avoid stale builds during local iteration.
    reuseExistingServer: false,
    timeout: 120_000,
  },
});

