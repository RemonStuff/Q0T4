import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import type { ViteUserConfig } from "vitest/config";

type TestOptions = NonNullable<ViteUserConfig["test"]>;

// Exported so test/fixtures/coverage-gate can prove these exact thresholds fail.
export const unitTest = {
  include: ["test/unit/**/*.test.ts", "test/fakes/**/*.test.ts"],
  alias: {
    vscode: fileURLToPath(new URL("./test/unit/no-vscode.ts", import.meta.url)),
  },
  coverage: {
    provider: "v8",
    include: ["src/core/**/*.ts"],
    reporter: ["text", "html", "lcov"],
    // Per file, so one untested core module can't hide behind a high total.
    thresholds: { lines: 90, branches: 90, perFile: true },
  },
} satisfies TestOptions;

export default defineConfig({ test: unitTest });
