// Runs a fully covered file next to an untested one with the project's real
// thresholds: the total stays above 90%, so only a per-file gate catches it.
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { unitTest } from "../../../vitest.config";

export default defineConfig({
  test: {
    ...unitTest,
    root: fileURLToPath(new URL("../../..", import.meta.url)),
    include: ["test/fixtures/coverage-per-file/*.test.ts"],
    coverage: {
      ...unitTest.coverage,
      include: ["test/fixtures/coverage-per-file/*.ts"],
      exclude: ["test/fixtures/coverage-per-file/*.test.ts", "**/vitest.config.ts"],
      reportsDirectory: "coverage/coverage-per-file",
    },
  },
});
