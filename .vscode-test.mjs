import { defineConfig } from "@vscode/test-cli";

export default defineConfig({
  label: "integration",
  files: "out/test/integration/**/*.test.js",
  // Pinned so runs are reproducible.
  version: "1.142.0",
  // Copilot Chat isn't installed here: since 1.14x it's built into VS Code, and a
  // fresh test profile doesn't load it (see test/integration/README.md).
  extensionDevelopmentPath: [".", "test/fixtures/fake-lm-provider"],
  mocha: { ui: "bdd", timeout: 20_000 },
});
