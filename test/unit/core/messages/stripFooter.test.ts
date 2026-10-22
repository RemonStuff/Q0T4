import { describe, expect, it } from "vitest";
import { buildMessages } from "../../../../src/core/messages/buildMessages";
import { stripFooter } from "../../../../src/core/messages/stripFooter";
import { FOOTER_SENTINEL, formatFooter } from "../../../../src/core/format/footer";
import type { HistoryTurn } from "../../../../src/core/types";

const footer = formatFooter({
  subject: "org/repo",
  unit: "tokens",
  used: { tokens: 10 },
  budget: { tokens: 100 },
  resetLabel: "Mon",
  modelName: "GPT-5",
});

describe("stripFooter", () => {
  it("strips the footer and warnings after the sentinel from assistant history", () => {
    expect(stripFooter(`The answer.\n\n${footer}\n\n⚠️ 85% of the weekly budget used.`)).toBe(
      "The answer.",
    );
  });

  it("leaves assistant text without a sentinel unchanged", () => {
    const text = "  Plain reply\n\nwith trailing space \n";
    expect(stripFooter(text)).toBe(text);
    expect(stripFooter("")).toBe("");
  });

  it("strips only from the last sentinel, so a quoted sentinel keeps earlier content", () => {
    const text = `Use ${FOOTER_SENTINEL} to mark it.\n\nMore text.\n\n${footer}`;
    expect(stripFooter(text)).toBe(`Use ${FOOTER_SENTINEL} to mark it.\n\nMore text.`);
  });

  it("returns an empty string when the reply was only a footer", () => {
    expect(stripFooter(footer)).toBe("");
    expect(stripFooter(`\n\n${footer}`)).toBe("");
  });
});

describe("buildMessages with footers in history", () => {
  const history: HistoryTurn[] = [
    { kind: "request", prompt: "first" },
    { kind: "response", text: `Reply one.\n\n${footer}` },
    { kind: "request", prompt: "second" },
    { kind: "response", text: footer },
    { kind: "request", prompt: "third" },
    { kind: "response", text: "Reply three, untouched." },
  ];

  it("sends the assistant text without the footer", () => {
    expect(buildMessages("now", history)).toEqual([
      { role: "user", text: "first" },
      { role: "assistant", text: "Reply one." },
      { role: "user", text: "third" },
      { role: "assistant", text: "Reply three, untouched." },
      { role: "user", text: "now" },
    ]);
  });

  it("drops an assistant turn that is empty after stripping, with its prompt", () => {
    const texts = buildMessages("now", history).map((m) => m.text);
    expect(texts).not.toContain("second");
    expect(texts.join("\n")).not.toContain("q0t4:footer");
  });

  it("does not modify the history it was given", () => {
    const copy = structuredClone(history);
    buildMessages("now", history);
    expect(history).toEqual(copy);
  });
});
