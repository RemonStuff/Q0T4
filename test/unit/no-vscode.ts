// Vitest aliases `vscode` to this module (see vitest.config.ts). Unit tests run
// outside VS Code, so any code path that reaches for it is a boundary leak.
throw new Error(
  "src/core must not import vscode: reach VS Code through a port in src/ports (docs/PLAN.md §2).",
);
