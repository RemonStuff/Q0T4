import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";
import { root, runCli } from "./support";

async function lint(code: string, filePath: string) {
  const eslint = new ESLint({ cwd: root });
  const [result] = await eslint.lintText(code, { filePath });
  return result?.messages ?? [];
}

function restrictedImports(messages: ESLint.LintResult["messages"]) {
  return messages.filter((m) => m.ruleId === "no-restricted-imports");
}

const valueImport = 'import * as vscode from "vscode";\n\nexport const api = vscode;\n';
const typeImport = 'import type { Uri } from "vscode";\n\nexport type Target = Uri;\n';

describe("ports-and-adapters boundary", () => {
  it("lint fails when a file in src/core imports vscode", async () => {
    expect(restrictedImports(await lint(valueImport, "src/core/fixture.ts"))).toHaveLength(1);
  });

  it("lint fails when a file in src/core type-imports vscode", async () => {
    expect(restrictedImports(await lint(typeImport, "src/core/nested/fixture.ts"))).toHaveLength(1);
  });

  it("lint fails when a file in src/ports imports vscode", async () => {
    expect(restrictedImports(await lint(typeImport, "src/ports/fixture.ts"))).toHaveLength(1);
  });

  it("lint passes when a file in src/adapters imports vscode", async () => {
    expect(await lint(valueImport, "src/adapters/fixture.ts")).toEqual([]);
  });
});

describe("strict typecheck", () => {
  it("typecheck rejects implicit any", () => {
    const { status, output } = runCli("typescript/bin/tsc", [
      "--noEmit",
      "-p",
      "test/lint-fixtures",
    ]);
    expect(status).not.toBe(0);
    // TS5xxx means the project config itself failed to load, which would make
    // the TS7006 below come from compiler defaults rather than our tsconfig.
    expect(output).not.toMatch(/error TS5\d{3}/);
    expect(output).toMatch(/error TS7006/);
  }, 60_000);
});
