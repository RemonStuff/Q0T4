import { describe, expect, it } from "vitest";
import { outputChannelLog } from "../../../src/adapters/outputChannelLog";

function channel() {
  const lines: string[] = [];
  return { lines, appendLine: (line: string) => lines.push(line) };
}
const now = () => new Date("2026-10-24T08:09:10.000Z");

describe("outputChannelLog", () => {
  it("writes a timestamped line per level", () => {
    const out = channel();
    const log = outputChannelLog(out, now);
    log.info("started");
    log.warn("careful");
    log.error("broken");
    expect(out.lines).toEqual([
      "2026-10-24T08:09:10.000Z [info] started",
      "2026-10-24T08:09:10.000Z [warn] careful",
      "2026-10-24T08:09:10.000Z [error] broken",
    ]);
  });

  it("adds the message and first stack lines of an Error", () => {
    const out = channel();
    const error = new Error("disk full");
    error.stack = "Error: disk full\n    at a\n    at b\n    at c\n    at d\n    at e\n    at f";
    outputChannelLog(out, now).error("couldn't write", error);
    expect(out.lines[0]).toBe("2026-10-24T08:09:10.000Z [error] couldn't write");
    expect(out.lines.slice(1)).toEqual([
      "  Error: disk full",
      "    at a",
      "    at b",
      "    at c",
      "    at d",
    ]);
  });

  it("describes a thrown value that is not an Error", () => {
    const out = channel();
    outputChannelLog(out, now).error("couldn't write", "plain text");
    expect(out.lines).toEqual(["2026-10-24T08:09:10.000Z [error] couldn't write", "  plain text"]);
  });

  it("uses an Error's message when it has no stack", () => {
    const out = channel();
    const error = new Error("no stack");
    delete error.stack;
    outputChannelLog(out, now).error("x", error);
    expect(out.lines[1]).toBe("  no stack");
  });
});
