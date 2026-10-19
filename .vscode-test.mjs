import { readFileSync } from "node:fs";
import { defineConfig } from "@vscode/test-cli";

// Pinned so runs are reproducible.
const version = "1.142.0";
const mocha = { ui: "bdd", timeout: 20_000 };
const { version: q0t4Version } = JSON.parse(readFileSync("package.json", "utf8"));

// Copilot Chat isn't installed in either run: since 1.14x it's built into VS
// Code, and a fresh test profile doesn't load it (see test/integration/README.md).
export default defineConfig([
  {
    // Q0T4 loaded from source next to the fake model provider.
    label: "integration",
    files: "out/test/integration/**/*.test.js",
    version,
    extensionDevelopmentPath: [".", "test/fixtures/fake-lm-provider"],
    mocha,
  },
  {
    // The packaged .vsix installed like a user would (npm run package first).
    label: "vsix",
    files: "out/test/vsix/**/*.test.js",
    version,
    extensionDevelopmentPath: ["test/fixtures/fake-lm-provider"],
    installExtensions: [`./q0t4-${q0t4Version}.vsix`],
    mocha,
  },
]);
