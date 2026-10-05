import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "retain-on-failure",
    launchOptions: { args: ["--disable-gpu", "--renderer-process-limit=4"] },
    reducedMotion: "reduce",
    actionTimeout: 15000,
    navigationTimeout: 20000,
  },
});
