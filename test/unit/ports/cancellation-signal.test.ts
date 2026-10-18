// Type-level: checked by `npm run typecheck`. The `vscode` import is type-only,
// so it's erased at runtime and never reaches the throwing test alias.
import type { CancellationToken } from "vscode";
import { expectTypeOf, it } from "vitest";
import type { CancellationSignal } from "../../../src/ports/CancellationSignal";

it("a vscode CancellationToken is assignable to CancellationSignal", () => {
  expectTypeOf<CancellationToken>().toExtend<CancellationSignal>();
});
