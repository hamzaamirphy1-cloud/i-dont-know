import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";

// A local Chromium installation avoids a browser download in cloud workspaces.
// On other machines install Playwright Chromium with: npx playwright install chromium
const systemChromium =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
  (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 2,
  reporter: "list",
  use: {
    baseURL: process.env.BASE_URL || "http://localhost:3000",
    browserName: "chromium",
    viewport: { width: 1440, height: 1000 },
    launchOptions: { executablePath: systemChromium },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
