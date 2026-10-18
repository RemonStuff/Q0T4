import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const root = fileURLToPath(new URL("../../..", import.meta.url));

/**
 * Runs a CLI script from node_modules with the current Node, from the repo root.
 * Paths are joined directly because package `exports` may hide bin files.
 */
export function runCli(script: string, args: string[]) {
  const result = spawnSync(process.execPath, [join(root, "node_modules", script), ...args], {
    cwd: root,
    encoding: "utf8",
  });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

export function vitestCli(args: string[]) {
  return runCli("vitest/vitest.mjs", args);
}
