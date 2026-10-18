import * as assert from "node:assert/strict";
import * as vscode from "vscode";
import { Q0T4_ID } from "./support";

describe("Q0T4 activation", () => {
  it("Q0T4 extension activates", async () => {
    const extension = vscode.extensions.getExtension(Q0T4_ID);
    assert.ok(extension, `${Q0T4_ID} is not loaded`);
    await extension.activate();
    assert.equal(extension.isActive, true);
  });

  it("activate returns a test API object", async () => {
    const exports: unknown = await vscode.extensions.getExtension(Q0T4_ID)?.activate();
    assert.equal(
      typeof (exports as { test?: { handleRequest?: unknown } })?.test?.handleRequest,
      "function",
    );
  });
});
