// Guards for the project's architectural rules. These run with node:test
// until Vitest arrives in #2.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";

const root = fileURLToPath(new URL("../..", import.meta.url));
const require = createRequire(import.meta.url);

async function lint(code, filePath) {
  const eslint = new ESLint({ cwd: root });
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages;
}

const valueImport = 'import * as vscode from "vscode";\n\nexport const api = vscode;\n';
const typeImport = 'import type { Uri } from "vscode";\n\nexport type Target = Uri;\n';

function restrictedImports(messages) {
  return messages.filter((m) => m.ruleId === "no-restricted-imports");
}

test("lint fails when a file in src/core imports vscode", async () => {
  const messages = await lint(valueImport, "src/core/fixture.ts");
  assert.equal(restrictedImports(messages).length, 1, JSON.stringify(messages));
});

test("lint fails when a file in src/core type-imports vscode", async () => {
  const messages = await lint(typeImport, "src/core/nested/fixture.ts");
  assert.equal(restrictedImports(messages).length, 1, JSON.stringify(messages));
});

test("lint fails when a file in src/ports imports vscode", async () => {
  const messages = await lint(typeImport, "src/ports/fixture.ts");
  assert.equal(restrictedImports(messages).length, 1, JSON.stringify(messages));
});

test("lint passes when a file in src/adapters imports vscode", async () => {
  const messages = await lint(valueImport, "src/adapters/fixture.ts");
  assert.deepEqual(messages, []);
});

test("typecheck rejects implicit any", () => {
  const tsc = require.resolve("typescript/bin/tsc");
  const result = spawnSync(process.execPath, [tsc, "--noEmit", "-p", "test/lint-fixtures"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  // TS5xxx means the project config itself failed to load, which would make
  // the TS7006 below come from compiler defaults rather than our tsconfig.
  assert.doesNotMatch(result.stdout, /error TS5\d{3}/);
  assert.match(result.stdout, /error TS7006/);
});
