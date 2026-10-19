import * as assert from "node:assert/strict";
import * as vscode from "vscode";
import type { Q0T4Exports } from "../../src/extension";
import { referenceForwardingTests } from "../integration/referenceCases";
import { Q0T4_ID } from "../integration/support";

referenceForwardingTests(async () => {
  const extension = vscode.extensions.getExtension<Q0T4Exports>(Q0T4_ID);
  assert.ok(extension);
  return extension.activate();
});
