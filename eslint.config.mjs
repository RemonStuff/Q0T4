import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

// Core and ports must never reach VS Code directly; only adapters may
// (docs/PLAN.md §2). Type-only imports count too.
const noVscode = {
  "no-restricted-imports": [
    "error",
    {
      paths: [
        {
          name: "vscode",
          message:
            "Keep src/core and src/ports free of vscode; reach VS Code through a port with an adapter in src/adapters.",
        },
      ],
    },
  ],
};

export default defineConfig(
  {
    ignores: ["dist/", "out/", "coverage/", ".vscode-test/", "test/lint-fixtures/"],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    rules: {
      // `const { dropped, ...rest } = x` is the idiomatic way to omit a field.
      "@typescript-eslint/no-unused-vars": ["error", { ignoreRestSiblings: true }],
    },
  },
  {
    files: ["**/*.mjs"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["src/core/**/*.ts", "src/ports/**/*.ts"],
    rules: noVscode,
  },
);
