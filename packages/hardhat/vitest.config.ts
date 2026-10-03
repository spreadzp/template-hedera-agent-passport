import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    pool: "forks",
    hookTimeout: 60000,
    testTimeout: 30000,
  },
});
