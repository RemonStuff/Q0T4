import { describe, expect, it } from "vitest";
import { unitTest } from "../../../vitest.config";
import { vitestCli } from "./support";

describe("vitest setup", () => {
  it("vitest discovers tests under test/unit and skips fixture tests", () => {
    const { status, output } = vitestCli(["list", "--filesOnly"]);
    const files = output.replaceAll("\\", "/");
    expect(status).toBe(0);
    expect(files).toContain("test/unit/tooling/vitest-setup.test.ts");
    expect(files).not.toContain("test/fixtures/");
  }, 60_000);

  it("vitest also discovers tests for the fakes under test/fakes", () => {
    expect(unitTest.include).toContain("test/fakes/**/*.test.ts");
  });

  it("coverage run fails when core branch coverage is below 90%", () => {
    const { status, output } = vitestCli([
      "run",
      "--coverage",
      "--config",
      "test/fixtures/coverage-gate/vitest.config.ts",
    ]);
    expect(status).not.toBe(0);
    expect(output).toMatch(
      /Coverage for branches \(\d+(\.\d+)?%\) does not meet .*threshold \(90%\)/,
    );
  }, 60_000);

  it("importing vscode from a core test fails fast", async () => {
    await expect(import("vscode")).rejects.toThrow(/must not import vscode/);
  });
});
