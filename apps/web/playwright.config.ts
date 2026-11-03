import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  // Serialized: the M3 live harness binds fixed loopback ports (API 3001)
  // that desktop/mobile projects cannot share simultaneously.
  workers: 1,
  retries: 0,
  reporter: [["list"], ["json", { outputFile: "./playwright-report.json" }]],
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "retain-on-failure",
    // M3C evidence lane: M3C_VIDEO=on records video for the playback webm
    // deliverable. Default off (unchanged behavior).
    ...(process.env.M3C_VIDEO === "on" ? { video: "on" as const } : {}),
  },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        // M3c measurement lane: M3C_CHANNEL=msedge runs the same suite on the
        // installed real Edge (temporary Playwright profile; real GPU when
        // available) for honest hardware-vs-software render comparisons.
        // M3C_CHANNEL=chrome keeps the historical external-Chrome lane.
        // Default runs are unchanged.
        ...(process.env.M3C_CHANNEL ? { channel: process.env.M3C_CHANNEL as "msedge" | "chrome" } : {}),
      },
    },
    // Exact 390px width to match the m2-mobile-390 evidence tags (Pixel 5 defaults to 393).
    { name: "mobile", use: { ...devices["Pixel 5"], viewport: { width: 390, height: 844 }, ...(process.env.M3C_CHANNEL ? { channel: process.env.M3C_CHANNEL as "msedge" | "chrome" } : {}) } },
  ],
});
