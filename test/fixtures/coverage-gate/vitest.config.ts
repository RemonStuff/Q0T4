// Runs the half-covered fixture with the project's real coverage thresholds,
// so test/unit/tooling/vitest-setup.test.ts can prove the gate fails.
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { unitTest } from "../../../vitest.config";

export default defineConfig({
  test: {
    ...unitTest,
    root: fileURLToPath(new URL("../../..", import.meta.url)),
    include: ["test/fixtures/coverage-gate/*.test.ts"],
    coverage: {
      ...unitTest.coverage,
      include: ["test/fixtures/coverage-gate/half.ts"],
      reportsDirectory: "coverage/coverage-gate",
    },
  },
});
