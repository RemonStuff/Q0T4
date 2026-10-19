import { describe, expect, it, vi } from "vitest";
import { chatHandler } from "../../../../src/core/chatHandler";
import { buildMessages } from "../../../../src/core/messages/buildMessages";
import {
  FakeCancellation,
  FakeModel,
  FakeModelSelector,
  FakeReferenceReader,
  RecordingOutput,
} from "../../../fakes";

function fixture() {
  const model = new FakeModel({ chunks: ["answer"] });
  const reader = new FakeReferenceReader({
    first: { label: "first.ts", text: "first file" },
    second: { label: "second.ts", text: "second file" },
  });
  const signal = new FakeCancellation();
  const output = new RecordingOutput();
  const request = {
    model,
    prompt: "question",
    history: [],
    references: [
      { id: "second", value: "second file" },
      { id: "first", value: "first file" },
    ],
  };
  const deps = {
    selector: new FakeModelSelector([]),
    output,
    signal,
    referenceReader: reader,
  };
  return { model, reader, signal, output, request, deps };
}

describe("reference messages", () => {
  it("adds one labelled reference message between completed history and the prompt", () => {
    const references = Object.freeze([
      Object.freeze({ label: "first.ts", text: "first file" }),
      Object.freeze({ label: "second.ts", text: "second file" }),
    ]);
    expect(
      buildMessages(
        "question",
        [
          { kind: "request", prompt: "previous question" },
          { kind: "response", text: "previous answer" },
        ],
        references,
      ),
    ).toEqual([
      { role: "user", text: "previous question" },
      { role: "assistant", text: "previous answer" },
      {
        role: "user",
        text: "first.ts\n```\nfirst file\n```\n\nsecond.ts\n```\nsecond file\n```",
      },
      { role: "user", text: "question" },
    ]);
    expect(references.map((ref) => ref.label)).toEqual(["first.ts", "second.ts"]);
  });

  it.each([
    ["", "```"],
    [" \nexact\t", "```"],
    ["`short` and ``pair``", "```"],
    ["before\n```ts\ncode\n```\nafter", "````"],
    ["`````` then ```", "```````"],
  ])("preserves reference text and chooses a collision-free fence (%j)", (text, fence) => {
    expect(buildMessages("question", [], [{ label: "file", text }])).toEqual([
      { role: "user", text: `file\n${fence}\n${text}\n${fence}` },
      { role: "user", text: "question" },
    ]);
  });

  it("does not add a reference message for an empty reference list", () => {
    expect(buildMessages("question", [], [])).toEqual([{ role: "user", text: "question" }]);
  });
});

describe("reference orchestration", () => {
  it("reads in prompt order without mutating the reverse-ordered input", async () => {
    const { request, deps, reader, model, output } = fixture();
    Object.freeze(request.references);
    await chatHandler(request, deps);
    expect(reader.calls).toEqual(["first", "second"]);
    expect(request.references.map((ref) => ref.id)).toEqual(["second", "first"]);
    expect(model.calls.sendRequest).toEqual([
      [
        {
          role: "user",
          text: "first.ts\n```\nfirst file\n```\n\nsecond.ts\n```\nsecond file\n```",
        },
        { role: "user", text: "question" },
      ],
    ]);
    expect(output.calls).toEqual([{ kind: "markdown", text: "answer" }]);
  });

  it("does not deduplicate references by their kind id", async () => {
    const { request, deps, reader, model } = fixture();
    const read = vi.spyOn(reader, "read").mockImplementation(async (ref) => ({
      label: "text",
      text: String(ref.value),
    }));
    await chatHandler(
      {
        ...request,
        references: [
          { id: "same-kind", value: "second" },
          { id: "same-kind", value: "first" },
        ],
      },
      deps,
    );
    expect(read).toHaveBeenCalledTimes(2);
    expect(model.calls.sendRequest[0]?.[0]?.text).toBe(
      "text\n```\nfirst\n```\n\ntext\n```\nsecond\n```",
    );
  });

  it("skips unsupported references and reports them once before the answer", async () => {
    const { request, deps, output, model } = fixture();
    await chatHandler(
      {
        ...request,
        references: [
          { id: "unknown-1", value: {} },
          ...request.references,
          { id: "unknown-2", value: null },
        ],
      },
      deps,
    );
    expect(output.calls).toEqual([
      {
        kind: "progress",
        text: "Some attached references could not be included (unsupported content).",
      },
      { kind: "markdown", text: "answer" },
    ]);
    expect(model.calls.sendRequest[0]).toHaveLength(2);
  });

  it("adds no context message when every reference is unsupported", async () => {
    const { request, deps, output, model } = fixture();
    await chatHandler({ ...request, references: [{ id: "unknown", value: {} }] }, deps);
    expect(model.calls.sendRequest).toEqual([[{ role: "user", text: "question" }]]);
    expect(output.calls.filter((call) => call.kind === "progress")).toHaveLength(1);
  });

  it("does not read anything when references are empty", async () => {
    const { request, deps, reader } = fixture();
    await chatHandler({ ...request, references: [] }, deps);
    expect(reader.calls).toEqual([]);
  });

  it("reports unreadable attachments without exposing details or sending a request", async () => {
    const { request, deps, reader, output, model } = fixture();
    vi.spyOn(reader, "read").mockRejectedValue(new Error("private path / token"));
    expect(await chatHandler(request, deps)).toEqual({ metadata: { outcome: "error" } });
    expect(output.text).toBe(
      "Q0T4 couldn't read an attached reference. Check that it is accessible and try again.",
    );
    expect(model.calls.sendRequest).toEqual([]);
  });

  it.each(["cancelled", "command", "noModel"] as const)(
    "does not read references when the request is %s",
    async (reason) => {
      const { request, deps, reader, signal } = fixture();
      if (reason === "cancelled") signal.cancel();
      const input = {
        ...request,
        ...(reason === "command" ? { command: "status" } : {}),
        ...(reason === "noModel" ? { availability: "unavailable" as const } : {}),
      };
      await chatHandler(input, deps);
      expect(reader.calls).toEqual([]);
    },
  );

  it.each([false, true])(
    "stops reading and stays silent if cancellation occurs during a read (reject=%s)",
    async (reject) => {
      const { request, deps, reader, signal, output, model } = fixture();
      const read = vi.spyOn(reader, "read").mockImplementation(async () => {
        signal.cancel();
        if (reject) throw new Error("read aborted");
        return { label: "file", text: "late content" };
      });
      expect(await chatHandler(request, deps)).toEqual({
        metadata: { outcome: "cancelled" },
      });
      expect(read).toHaveBeenCalledOnce();
      expect(model.calls.sendRequest).toEqual([]);
      expect(output.calls).toEqual([]);
    },
  );

  it("propagates progress-output failures rather than masking them as read errors", async () => {
    const { request, deps, output, model } = fixture();
    const failure = new Error("output unavailable");
    vi.spyOn(output, "progress").mockImplementation(() => {
      throw failure;
    });
    await expect(
      chatHandler({ ...request, references: [{ id: "unknown", value: {} }] }, deps),
    ).rejects.toBe(failure);
    expect(model.calls.sendRequest).toEqual([]);
  });

  it("does not send if emitting the unsupported-reference note cancels the request", async () => {
    const { request, deps, output, signal, model } = fixture();
    vi.spyOn(output, "progress").mockImplementation(() => signal.cancel());
    expect(
      await chatHandler({ ...request, references: [{ id: "unknown", value: {} }] }, deps),
    ).toEqual({ metadata: { outcome: "cancelled" } });
    expect(model.calls.sendRequest).toEqual([]);
  });
});
