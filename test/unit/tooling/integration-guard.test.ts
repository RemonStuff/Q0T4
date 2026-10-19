import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { root } from "./support";

const integrationDir = join(root, "test", "integration");

function integrationSources(): string[] {
  return readdirSync(integrationDir, { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".ts"))
    .map((file) => join(integrationDir, file));
}

describe("integration test guard", () => {
  it("integration tests exist", () => {
    expect(integrationSources().filter((f) => f.endsWith(".test.ts")).length).toBeGreaterThan(0);
  });

  it('no integration test uses vendor: "copilot"', () => {
    const offenders = integrationSources().filter((file) =>
      /vendor\s*:\s*["'`]copilot["'`]/.test(readFileSync(file, "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});
