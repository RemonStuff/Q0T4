import { describe, expect, it } from "vitest";
import { formatLedgerError } from "../../../../src/core/errors/formatLedgerError";

describe("formatLedgerError", () => {
  it("says the request was not sent, without private details", () => {
    const text = formatLedgerError();
    expect(text).toContain("did not send your request");
    expect(text).not.toMatch(/ENOENT|EACCES|\/|\\\\/);
  });
});
