import { describe, expect, it } from "vitest";
import { buildMessages } from "../../../../src/core/messages/buildMessages";
import type { HistoryTurn } from "../../../../src/core/types";

describe("buildMessages", () => {
  it("builds a single user message from the prompt when history is empty", () => {
    expect(buildMessages("Hello", [])).toEqual([{ role: "user", text: "Hello" }]);
  });

  it("includes prior user and assistant turns in chronological order", () => {
    const history: HistoryTurn[] = [
      { kind: "request", prompt: "First question" },
      { kind: "response", text: "First answer" },
      { kind: "request", prompt: "Second question" },
      { kind: "response", text: "Second answer" },
    ];

    expect(buildMessages("Third question", history)).toEqual([
      { role: "user", text: "First question" },
      { role: "assistant", text: "First answer" },
      { role: "user", text: "Second question" },
      { role: "assistant", text: "Second answer" },
      { role: "user", text: "Third question" },
    ]);
  });

  it("places the current prompt last even when it matches a previous prompt", () => {
    expect(
      buildMessages("Again", [
        { kind: "request", prompt: "Again" },
        { kind: "response", text: "Previous answer" },
      ]),
    ).toEqual([
      { role: "user", text: "Again" },
      { role: "assistant", text: "Previous answer" },
      { role: "user", text: "Again" },
    ]);
  });

  it("preserves combined markdown response text as one assistant message", () => {
    const text = "First **part**.\n\n```ts\nconst answer = 42;\n```\nLast part.";

    expect(
      buildMessages("Continue", [
        { kind: "request", prompt: "Explain" },
        { kind: "response", text },
      ]),
    ).toEqual([
      { role: "user", text: "Explain" },
      { role: "assistant", text },
      { role: "user", text: "Continue" },
    ]);
  });

  it("skips response turns with empty text and their paired requests", () => {
    expect(
      buildMessages("Next", [
        { kind: "request", prompt: "No output" },
        { kind: "response", text: "" },
        { kind: "request", prompt: "Answered" },
        { kind: "response", text: "Answer" },
      ]),
    ).toEqual([
      { role: "user", text: "Answered" },
      { role: "assistant", text: "Answer" },
      { role: "user", text: "Next" },
    ]);
  });

  it("skips a trailing request turn whose response is missing", () => {
    expect(
      buildMessages("Current", [
        { kind: "request", prompt: "Answered" },
        { kind: "response", text: "Answer" },
        { kind: "request", prompt: "Cancelled" },
      ]),
    ).toEqual([
      { role: "user", text: "Answered" },
      { role: "assistant", text: "Answer" },
      { role: "user", text: "Current" },
    ]);
  });

  it("pairs a response with the latest request after an unanswered request", () => {
    expect(
      buildMessages("Current", [
        { kind: "request", prompt: "Cancelled" },
        { kind: "request", prompt: "Answered" },
        { kind: "response", text: "Answer" },
      ]),
    ).toEqual([
      { role: "user", text: "Answered" },
      { role: "assistant", text: "Answer" },
      { role: "user", text: "Current" },
    ]);
  });

  it("skips an orphan response before the first request", () => {
    expect(
      buildMessages("Current", [
        { kind: "response", text: "Orphan" },
        { kind: "request", prompt: "Question" },
        { kind: "response", text: "Answer" },
      ]),
    ).toEqual([
      { role: "user", text: "Question" },
      { role: "assistant", text: "Answer" },
      { role: "user", text: "Current" },
    ]);
  });

  it("does not pair an extra response with an already answered request", () => {
    expect(
      buildMessages("Current", [
        { kind: "request", prompt: "Question" },
        { kind: "response", text: "Answer" },
        { kind: "response", text: "Extra answer" },
      ]),
    ).toEqual([
      { role: "user", text: "Question" },
      { role: "assistant", text: "Answer" },
      { role: "user", text: "Current" },
    ]);
  });

  it("does not reuse a request after its empty response", () => {
    expect(
      buildMessages("Current", [
        { kind: "request", prompt: "No output" },
        { kind: "response", text: "" },
        { kind: "response", text: "Orphan" },
      ]),
    ).toEqual([{ role: "user", text: "Current" }]);
  });

  it("keeps non-empty partial replies", () => {
    expect(
      buildMessages("Continue", [
        { kind: "request", prompt: "Explain" },
        { kind: "response", text: "An unfinished" },
      ]),
    ).toEqual([
      { role: "user", text: "Explain" },
      { role: "assistant", text: "An unfinished" },
      { role: "user", text: "Continue" },
    ]);
  });

  it("preserves whitespace and empty prompts without trimming", () => {
    expect(
      buildMessages("", [
        { kind: "request", prompt: " \nQuestion\t" },
        { kind: "response", text: " \n\t" },
        { kind: "request", prompt: "" },
        { kind: "response", text: "Answer" },
      ]),
    ).toEqual([
      { role: "user", text: " \nQuestion\t" },
      { role: "assistant", text: " \n\t" },
      { role: "user", text: "" },
      { role: "assistant", text: "Answer" },
      { role: "user", text: "" },
    ]);
  });

  it("does not mutate the input history, including commands and metadata", () => {
    const history: readonly HistoryTurn[] = Object.freeze([
      Object.freeze({ kind: "request", prompt: "Question", command: "use" } as const),
      Object.freeze({
        kind: "response",
        text: "Answer",
        metadata: Object.freeze({ subject: "another/repo" }),
      } as const),
    ]);
    const before = structuredClone(history);

    expect(buildMessages("Current", history)).toEqual([
      { role: "user", text: "Question" },
      { role: "assistant", text: "Answer" },
      { role: "user", text: "Current" },
    ]);
    expect(history).toEqual(before);
  });
});
