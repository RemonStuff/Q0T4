import { describe, expect, it, vi } from "vitest";
import { chatHandler } from "../../../src/core/chatHandler";
import type { ChatHandlerRequest, Deps } from "../../../src/core/chatHandler";
import { buildMessages } from "../../../src/core/messages/buildMessages";
import type { StatusRow } from "../../../src/core/format/statusTable";
import type { SubjectListItem } from "../../../src/core/format/subjectList";
import { threadSubject } from "../../../src/core/subjects/threadSubject";
import type { HistoryTurn } from "../../../src/core/types";
import {
  FakeCancellation,
  FakeModel,
  FakeModelSelector,
  FakeReferenceReader,
  RecordingOutput,
} from "../../fakes";
import type { FakeModelOptions } from "../../fakes";

const ERROR_MESSAGE = "Q0T4 couldn't complete this request. Please try again.";
const NO_MODEL_MESSAGE =
  "No Copilot chat model is available. Check that GitHub Copilot is signed in.";

function fixture(options: FakeModelOptions = {}) {
  const model = new FakeModel(options);
  const selector = new FakeModelSelector([]);
  const output = new RecordingOutput();
  const signal = new FakeCancellation();
  const request: ChatHandlerRequest = { prompt: "Hello", history: [], model };
  const deps: Deps = { selector, output, signal, referenceReader: new FakeReferenceReader() };
  return { model, selector, output, signal, request, deps };
}

describe("chatHandler", () => {
  it.each(["status", "subjects", "use", "unknown", ""])(
    "rejects an unimplemented command without selecting, sending or counting (%s)",
    async (command) => {
      const { request, deps, model, output, selector } = fixture();
      const select = vi.spyOn(selector, "select");
      const commandRequest = { ...request, command };
      expect(await chatHandler(commandRequest, deps)).toEqual({ metadata: { outcome: "error" } });
      expect(output.text).toBe(
        "Slash commands aren't available yet. Send a normal message to talk to the selected model.",
      );
      expect(model.calls.sendRequest).toEqual([]);
      expect(model.calls.countTokens).toEqual([]);
      expect(select).not.toHaveBeenCalled();
    },
  );

  it("keeps an already-cancelled slash command silent", async () => {
    const { request, deps, output, signal } = fixture();
    signal.cancel();
    const commandRequest = { ...request, command: "status" };
    expect(await chatHandler(commandRequest, deps)).toEqual({
      metadata: { outcome: "cancelled" },
    });
    expect(output.calls).toEqual([]);
  });

  it("streams every chunk from FakeModel to the output in order", async () => {
    const { request, deps, output } = fixture({ chunks: ["Hello", " ", "world"] });

    await chatHandler(request, deps);

    expect(output.calls).toEqual([
      { kind: "markdown", text: "Hello" },
      { kind: "markdown", text: " " },
      { kind: "markdown", text: "world" },
    ]);
  });

  it("sends the messages produced by buildMessages without changing frozen history", async () => {
    const { request, deps, model, signal } = fixture();
    const history: readonly HistoryTurn[] = Object.freeze([
      Object.freeze({ kind: "request", prompt: "Question", command: "use" } as const),
      Object.freeze({
        kind: "response",
        text: "Answer",
        metadata: Object.freeze({ subject: "another/repo" }),
      } as const),
      Object.freeze({ kind: "request", prompt: "Unanswered" } as const),
    ]);
    const before = structuredClone(history);
    const send = vi.spyOn(model, "sendRequest");

    await chatHandler(Object.freeze({ ...request, history }), deps);

    expect(send).toHaveBeenCalledExactlyOnceWith(buildMessages(request.prompt, history), signal);
    expect(model.calls.sendRequest).toEqual([
      [
        { role: "user", text: "Question" },
        { role: "assistant", text: "Answer" },
        { role: "user", text: "Hello" },
      ],
    ]);
    expect(history).toEqual(before);
  });

  it("stops streaming when the chat cancellation signal fires mid-stream", async () => {
    const { request, deps, output, signal, model } = fixture({
      chunks: ["first", "second", "third"],
    });
    const write = output.markdown.bind(output);
    vi.spyOn(output, "markdown").mockImplementation((text) => {
      write(text);
      signal.cancel();
    });

    expect(await chatHandler(request, deps)).toEqual({
      metadata: { outcome: "cancelled", model: model.name },
    });
    expect(output.text).toBe("first");
  });

  it("stops and closes a stream that ignores cancellation without pulling another chunk", async () => {
    const { request, deps, output, signal, model } = fixture();
    const produced: string[] = [];
    const closed = vi.fn();
    async function* stream() {
      try {
        produced.push("first");
        yield "first";
        produced.push("second");
        yield "second";
      } finally {
        closed();
      }
    }
    vi.spyOn(model, "sendRequest").mockResolvedValue(stream());
    const write = output.markdown.bind(output);
    vi.spyOn(output, "markdown").mockImplementation((text) => {
      write(text);
      signal.cancel();
    });

    expect(await chatHandler(request, deps)).toEqual({
      metadata: { outcome: "cancelled", model: model.name },
    });
    expect(output.text).toBe("first");
    expect(produced).toEqual(["first"]);
    expect(closed).toHaveBeenCalledOnce();
  });

  it("does not emit a chunk returned after cancellation while awaiting the next chunk", async () => {
    const { request, deps, output, signal, model } = fixture();
    const closed = vi.fn();
    async function* stream() {
      try {
        signal.cancel();
        yield "too late";
      } finally {
        closed();
      }
    }
    vi.spyOn(model, "sendRequest").mockResolvedValue(stream());

    expect(await chatHandler(request, deps)).toEqual({
      metadata: { outcome: "cancelled", model: model.name },
    });
    expect(output.calls).toEqual([]);
    expect(closed).toHaveBeenCalledOnce();
  });

  it("does not resolve or send a model request when already cancelled", async () => {
    const { request, deps, output, signal, model, selector } = fixture();
    signal.cancel();
    const select = vi.spyOn(selector, "select");

    expect(await chatHandler({ ...request, availability: "unavailable" }, deps)).toEqual({
      metadata: { outcome: "cancelled" },
    });
    expect(select).not.toHaveBeenCalled();
    expect(model.calls.sendRequest).toEqual([]);
    expect(output.calls).toEqual([]);
  });

  it("rechecks cancellation after awaiting an available model resolution", async () => {
    const { request, deps, output, signal, model } = fixture();
    const pending = chatHandler(request, deps);
    signal.cancel();

    expect(await pending).toEqual({ metadata: { outcome: "cancelled" } });
    expect(model.calls.sendRequest).toEqual([]);
    expect(output.calls).toEqual([]);
  });

  it.each([true, false])(
    "rechecks cancellation after fallback selection, including an empty list (%s)",
    async (hasFallback) => {
      const { request, deps, output, signal, model, selector } = fixture();
      const fallback = new FakeModel({ vendor: "copilot" });
      vi.spyOn(selector, "select").mockImplementation(async () => {
        signal.cancel();
        return hasFallback ? [fallback] : [];
      });

      expect(await chatHandler({ ...request, availability: "unavailable" }, deps)).toEqual({
        metadata: { outcome: "cancelled" },
      });
      expect(model.calls.sendRequest).toEqual([]);
      expect(fallback.calls.sendRequest).toEqual([]);
      expect(output.calls).toEqual([]);
    },
  );

  it("does not display a generic error when model selection rejects after cancellation", async () => {
    const { request, deps, output, signal, selector } = fixture();
    vi.spyOn(selector, "select").mockImplementation(async () => {
      signal.cancel();
      throw new Error("Selection aborted");
    });

    expect(await chatHandler({ ...request, availability: "unavailable" }, deps)).toEqual({
      metadata: { outcome: "cancelled" },
    });
    expect(output.calls).toEqual([]);
  });

  it.each([new Error("private model failure"), "private model failure"])(
    "writes a friendly error and resolves when sendRequest rejects (%s)",
    async (failure) => {
      const { request, deps, output, model } = fixture();
      const send = vi.spyOn(model, "sendRequest").mockRejectedValue(failure);

      expect(await chatHandler(request, deps)).toEqual({
        metadata: { outcome: "error", model: model.name },
      });
      expect(output.calls).toEqual([{ kind: "markdown", text: ERROR_MESSAGE }]);
      expect(send).toHaveBeenCalledOnce();
      expect(output.text).not.toContain("private model failure");
    },
  );

  it("writes partial output then a friendly error when the stream throws after chunk n", async () => {
    const { request, deps, output, model } = fixture({
      chunks: ["partial", "not written"],
      failAfterChunk: { after: 1, error: new Error("private stream failure") },
    });

    expect(await chatHandler(request, deps)).toEqual({
      metadata: { outcome: "error", model: model.name },
    });
    expect(output.calls).toEqual([
      { kind: "markdown", text: "partial" },
      { kind: "markdown", text: `\n\n${ERROR_MESSAGE}` },
    ]);
    expect(output.text).toBe(`partial\n\n${ERROR_MESSAGE}`);
  });

  it("writes a friendly error without a leading separator when the stream fails before output", async () => {
    const { request, deps, output, model } = fixture({
      chunks: [""],
      failAfterChunk: { after: 1, error: new Error("Stream failed") },
    });

    expect(await chatHandler(request, deps)).toEqual({
      metadata: { outcome: "error", model: model.name },
    });
    expect(output.calls).toEqual([
      { kind: "markdown", text: "" },
      { kind: "markdown", text: ERROR_MESSAGE },
    ]);
  });

  it("writes the no-model message when no model is available", async () => {
    const { request, deps, output, model } = fixture();

    expect(await chatHandler({ ...request, availability: "unavailable" }, deps)).toEqual({
      metadata: { outcome: "noModel" },
    });
    expect(output.calls).toEqual([{ kind: "markdown", text: NO_MODEL_MESSAGE }]);
    expect(model.calls.sendRequest).toEqual([]);
  });

  it("distinguishes a selector failure from an empty model list", async () => {
    const { request, deps, output, model, selector } = fixture();
    const select = vi.spyOn(selector, "select").mockRejectedValue(new Error("Private failure"));

    expect(await chatHandler({ ...request, availability: "unavailable" }, deps)).toEqual({
      metadata: { outcome: "error" },
    });
    expect(output.calls).toEqual([{ kind: "markdown", text: ERROR_MESSAGE }]);
    expect(select).toHaveBeenCalledOnce();
    expect(model.calls.sendRequest).toEqual([]);
  });

  it("returns JSON-safe ChatResult-shaped metadata without invented usage fields", async () => {
    const { request, deps } = fixture({ name: "Selected model", chunks: ["answer"] });
    const result = await chatHandler(request, deps);

    expect(result).toEqual({
      metadata: { outcome: "completed", model: "Selected model" },
    });
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it("sends through the resolved fallback and names that model in metadata", async () => {
    const { request, deps, output, model } = fixture({ name: "Unavailable model" });
    const fallback = new FakeModel({
      name: "Fallback model",
      vendor: "copilot",
      chunks: ["fallback reply"],
    });
    const selector = new FakeModelSelector([fallback]);

    expect(
      await chatHandler({ ...request, availability: "unavailable" }, { ...deps, selector }),
    ).toEqual({ metadata: { outcome: "completed", model: fallback.name } });
    expect(output.text).toBe("fallback reply");
    expect(model.calls.sendRequest).toEqual([]);
    expect(fallback.calls.sendRequest).toEqual([[{ role: "user", text: "Hello" }]]);
  });

  it("completes an empty reply without displaying an error", async () => {
    const { request, deps, output, model } = fixture();

    expect(await chatHandler(request, deps)).toEqual({
      metadata: { outcome: "completed", model: model.name },
    });
    expect(output.calls).toEqual([]);
    expect(model.calls.sendRequest).toHaveLength(1);
  });

  it("does not select, count tokens or retry when the request model is usable", async () => {
    const { request, deps, model, selector } = fixture({ chunks: ["answer"] });
    const select = vi.spyOn(selector, "select");

    await chatHandler(request, deps);

    expect(select).not.toHaveBeenCalled();
    expect(model.calls.sendRequest).toHaveLength(1);
    expect(model.calls.countTokens).toEqual([]);
  });

  it("returns cancellation without an error when sendRequest rejects after cancellation", async () => {
    const { request, deps, output, signal, model } = fixture();
    vi.spyOn(model, "sendRequest").mockImplementation(async () => {
      signal.cancel();
      throw new Error("Request aborted");
    });

    expect(await chatHandler(request, deps)).toEqual({
      metadata: { outcome: "cancelled", model: model.name },
    });
    expect(output.calls).toEqual([]);
  });

  it("closes without reading a stream returned by sendRequest after cancellation", async () => {
    const { request, deps, output, signal, model } = fixture();
    const next = vi.fn().mockResolvedValue({ done: false, value: "too late" });
    const close = vi.fn().mockResolvedValue({ done: true, value: undefined });
    const stream: AsyncIterable<string> = {
      [Symbol.asyncIterator]: () => ({ next, return: close }),
    };
    vi.spyOn(model, "sendRequest").mockImplementation(async () => {
      signal.cancel();
      return stream;
    });

    expect(await chatHandler(request, deps)).toEqual({
      metadata: { outcome: "cancelled", model: model.name },
    });
    expect(next).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
    expect(output.calls).toEqual([]);
  });

  it("propagates an output failure unchanged while closing the model stream", async () => {
    const { request, deps, output, model } = fixture();
    const failure = new Error("Output unavailable");
    const closed = vi.fn();
    async function* stream() {
      try {
        yield "answer";
      } finally {
        closed();
      }
    }
    vi.spyOn(model, "sendRequest").mockResolvedValue(stream());
    const write = vi.spyOn(output, "markdown").mockImplementation(() => {
      throw failure;
    });

    await expect(chatHandler(request, deps)).rejects.toBe(failure);
    expect(write).toHaveBeenCalledOnce();
    expect(closed).toHaveBeenCalledOnce();
  });

  it("propagates failure to display the friendly error instead of reporting success", async () => {
    const { request, deps, output } = fixture({
      failBeforeFirstChunk: new Error("Model unavailable"),
    });
    const failure = new Error("Cannot display error");
    vi.spyOn(output, "markdown").mockImplementation(() => {
      throw failure;
    });

    await expect(chatHandler(request, deps)).rejects.toBe(failure);
  });

  it("reports failure to acquire the model's iterator as a model error", async () => {
    const { request, deps, output, model } = fixture();
    const stream: AsyncIterable<string> = {
      [Symbol.asyncIterator]() {
        throw new Error("Invalid model stream");
      },
    };
    vi.spyOn(model, "sendRequest").mockResolvedValue(stream);

    expect(await chatHandler(request, deps)).toEqual({
      metadata: { outcome: "error", model: model.name },
    });
    expect(output.calls).toEqual([{ kind: "markdown", text: ERROR_MESSAGE }]);
  });

  it("handles a non-Error iterator rejection even when the iterator has no return method", async () => {
    const { request, deps, output, model } = fixture();
    const stream: AsyncIterable<string> = {
      [Symbol.asyncIterator]: () => ({
        next: vi.fn().mockRejectedValue("private stream failure"),
      }),
    };
    vi.spyOn(model, "sendRequest").mockResolvedValue(stream);

    expect(await chatHandler(request, deps)).toEqual({
      metadata: { outcome: "error", model: model.name },
    });
    expect(output.calls).toEqual([{ kind: "markdown", text: ERROR_MESSAGE }]);
  });

  it("reports one friendly error when both reading and closing the stream fail", async () => {
    const { request, deps, output, model } = fixture();
    const close = vi.fn().mockRejectedValue(new Error("Cleanup failed"));
    const stream: AsyncIterable<string> = {
      [Symbol.asyncIterator]: () => ({
        next: vi.fn().mockRejectedValue(new Error("Stream failed")),
        return: close,
      }),
    };
    vi.spyOn(model, "sendRequest").mockResolvedValue(stream);

    expect(await chatHandler(request, deps)).toEqual({
      metadata: { outcome: "error", model: model.name },
    });
    expect(close).toHaveBeenCalledOnce();
    expect(output.calls).toEqual([{ kind: "markdown", text: ERROR_MESSAGE }]);
  });

  it("does not close an already completed iterator", async () => {
    const { request, deps, model } = fixture();
    const close = vi.fn();
    const stream: AsyncIterable<string> = {
      [Symbol.asyncIterator]: () => ({
        next: vi.fn().mockResolvedValue({ done: true, value: undefined }),
        return: close,
      }),
    };
    vi.spyOn(model, "sendRequest").mockResolvedValue(stream);

    expect(await chatHandler(request, deps)).toEqual({
      metadata: { outcome: "completed", model: model.name },
    });
    expect(close).not.toHaveBeenCalled();
  });

  it("keeps cancellation silent if closing the cancelled stream also rejects", async () => {
    const { request, deps, output, signal, model } = fixture();
    const close = vi.fn().mockRejectedValue(new Error("Aborted while closing"));
    const stream: AsyncIterable<string> = {
      [Symbol.asyncIterator]: () => ({
        next: vi.fn().mockResolvedValue({ done: false, value: "first" }),
        return: close,
      }),
    };
    vi.spyOn(model, "sendRequest").mockResolvedValue(stream);
    const write = output.markdown.bind(output);
    vi.spyOn(output, "markdown").mockImplementation((text) => {
      write(text);
      signal.cancel();
    });

    expect(await chatHandler(request, deps)).toEqual({
      metadata: { outcome: "cancelled", model: model.name },
    });
    expect(output.text).toBe("first");
    expect(close).toHaveBeenCalledOnce();
  });
  describe("historyScope", () => {
    const meta = (subject: string) => ({
      v: 1,
      subject,
      unit: "tokens",
      inputTokens: 1,
      outputTokens: 1,
      cost: { tokens: 2 },
      stopped: false,
    });
    const history: HistoryTurn[] = [
      { kind: "request", prompt: "q-a" },
      { kind: "response", text: "a-a", metadata: meta("org/a") },
      { kind: "request", prompt: "q-b" },
      { kind: "response", text: "a-b", metadata: meta("org/b") },
    ];

    it("sends only the history of the scope's subject", async () => {
      const { request, deps, model } = fixture();
      const send = vi.spyOn(model, "sendRequest");
      await chatHandler({ ...request, history, historyScope: { subject: "org/b" } }, deps);
      expect(send.mock.calls[0]?.[0].map((m) => m.text)).toEqual(["q-b", "a-b", "Hello"]);
    });

    it("sends no history when includeHistory is false", async () => {
      const { request, deps, model } = fixture();
      const send = vi.spyOn(model, "sendRequest");
      await chatHandler(
        { ...request, history, historyScope: { subject: "org/b", includeHistory: false } },
        deps,
      );
      expect(send.mock.calls[0]?.[0].map((m) => m.text)).toEqual(["Hello"]);
    });

    it("without a scope sends all history, as before", async () => {
      const { request, deps, model } = fixture();
      const send = vi.spyOn(model, "sendRequest");
      await chatHandler({ ...request, history }, deps);
      expect(send.mock.calls[0]?.[0]).toHaveLength(5);
    });
  });
});

describe("chatHandler /status", () => {
  const statusRow: StatusRow = {
    subject: "org/repo",
    used: { tokens: 1000 },
    budget: { tokens: 10_000 },
    today: { tokens: 100 },
    requests: 2,
    limitIsDefault: false,
    current: true,
  };
  const status = (rows: () => Promise<readonly StatusRow[]>) =>
    ({ unit: "tokens", resetLabelLong: "Mon 19 Oct", warnAtPercent: 80, rows }) as const;

  it("answers with the table and does not call the model or record usage", async () => {
    const { request, deps, model, output, selector } = fixture();
    const select = vi.spyOn(selector, "select");
    const recorded: unknown[] = [];
    const rows = vi.fn(async () => [statusRow]);
    const result = await chatHandler(
      { ...request, command: "status" },
      {
        ...deps,
        status: status(rows),
        recording: {
          sink: { record: async (e) => void recorded.push(e) },
          clock: { now: () => new Date(0), timeZone: () => "UTC" },
          newId: () => "id",
        },
      },
    );
    expect(result).toEqual({ metadata: { outcome: "completed" } });
    expect(output.text).toContain("| org/repo | 1k | 10k | 10% | 100 | 2 |");
    expect(output.text.endsWith("Weekly budgets reset on Mon 19 Oct.")).toBe(true);
    expect(rows).toHaveBeenCalledTimes(1);
    expect(model.calls.sendRequest).toEqual([]);
    expect(model.calls.countTokens).toEqual([]);
    expect(select).not.toHaveBeenCalled();
    expect(recorded).toEqual([]);
  });

  it("shows the price table when the status has one", async () => {
    const { request, deps, output } = fixture();
    await chatHandler(
      { ...request, command: "status" },
      {
        ...deps,
        status: {
          ...status(async () => [statusRow]),
          prices: {
            source: "github-docs-article",
            fetchedAt: "2026-10-20T06:00:00.000Z",
            overrides: 0,
            stale: false,
          },
        },
      },
    );
    expect(output.text).toContain("Prices: GitHub docs article, fetched 2026-10-20, no overrides.");
  });

  it("returns metadata without a subject, so the thread subject does not change", async () => {
    const { request, deps } = fixture();
    const result = await chatHandler(
      { ...request, command: "status" },
      { ...deps, status: status(async () => [statusRow]) },
    );
    expect(result.metadata).not.toHaveProperty("subject");
    const history: HistoryTurn[] = [
      { kind: "request", prompt: "Earlier" },
      {
        kind: "response",
        text: "Answer",
        metadata: {
          v: 1,
          subject: "org/earlier",
          unit: "tokens",
          inputTokens: 1,
          outputTokens: 1,
          cost: { tokens: 2 },
          stopped: false,
        },
      },
      { kind: "request", prompt: "", command: "status" },
      { kind: "response", text: "table", metadata: result.metadata },
    ];
    expect(threadSubject(history)).toBe("org/earlier");
  });

  it("writes no footer and no warning", async () => {
    const { request, deps, output } = fixture();
    await chatHandler(
      { ...request, command: "status" },
      { ...deps, status: status(async () => [statusRow]) },
    );
    expect(output.text).not.toContain("q0t4:footer");
    expect(output.calls.every((c) => c.kind === "markdown")).toBe(true);
  });

  it("explains an unreadable ledger and reports an error", async () => {
    const { request, deps, output, model } = fixture();
    const result = await chatHandler(
      { ...request, command: "status" },
      {
        ...deps,
        status: status(async () => {
          throw new Error("disk");
        }),
      },
    );
    expect(result).toEqual({ metadata: { outcome: "error" } });
    expect(output.text).toBe(
      "Q0T4 couldn't read its usage record, so it can't show the status. Check that the extension's storage folder is readable and try again.",
    );
    expect(model.calls.sendRequest).toEqual([]);
  });

  it("stays silent when the request is cancelled while the rows load", async () => {
    const { request, deps, output, signal } = fixture();
    const result = await chatHandler(
      { ...request, command: "status" },
      {
        ...deps,
        status: status(async () => {
          signal.cancel();
          return [statusRow];
        }),
      },
    );
    expect(result).toEqual({ metadata: { outcome: "cancelled" } });
    expect(output.calls).toEqual([]);
  });

  it("stays silent when the rows fail because the request was cancelled", async () => {
    const { request, deps, output, signal } = fixture();
    const result = await chatHandler(
      { ...request, command: "status" },
      {
        ...deps,
        status: status(async () => {
          signal.cancel();
          throw new Error("aborted");
        }),
      },
    );
    expect(result).toEqual({ metadata: { outcome: "cancelled" } });
    expect(output.calls).toEqual([]);
  });

  it("other commands stay unimplemented even when status is wired", async () => {
    const { request, deps, output } = fixture();
    const result = await chatHandler(
      { ...request, command: "subjects" },
      { ...deps, status: status(async () => [statusRow]) },
    );
    expect(result).toEqual({ metadata: { outcome: "error" } });
    expect(output.text).toContain("Slash commands aren't available yet");
  });
});

describe("chatHandler /subjects", () => {
  const listItem: SubjectListItem = {
    subject: "org/repo",
    limit: { tokens: 50_000 },
    limitIsDefault: false,
    current: true,
    fallback: false,
    thread: false,
  };
  const subjects = (rows: () => Promise<readonly SubjectListItem[]>) =>
    ({ unit: "tokens", defaultLimit: { tokens: 150_000 }, rows }) as const;

  it("answers with the list and an Edit Subjects button, without a model, count or record", async () => {
    const { request, deps, model, output, selector } = fixture();
    const select = vi.spyOn(selector, "select");
    const recorded: unknown[] = [];
    const result = await chatHandler(
      { ...request, command: "subjects" },
      {
        ...deps,
        subjects: subjects(async () => [listItem]),
        recording: {
          sink: { record: async (e) => void recorded.push(e) },
          clock: { now: () => new Date(0), timeZone: () => "UTC" },
          newId: () => "id",
        },
      },
    );
    expect(result).toEqual({ metadata: { outcome: "completed" } });
    expect(output.text).toContain("- **org/repo**: 50k a week · current repo");
    expect(output.calls.at(-1)).toEqual({
      kind: "button",
      text: "Edit Subjects",
      command: "q0t4.editSubjects",
    });
    expect(model.calls.sendRequest).toEqual([]);
    expect(model.calls.countTokens).toEqual([]);
    expect(select).not.toHaveBeenCalled();
    expect(recorded).toEqual([]);
  });

  it("returns metadata without a subject", async () => {
    const { request, deps } = fixture();
    const result = await chatHandler(
      { ...request, command: "subjects" },
      { ...deps, subjects: subjects(async () => [listItem]) },
    );
    expect(result.metadata).not.toHaveProperty("subject");
  });

  it("explains a failure without a button", async () => {
    const { request, deps, output } = fixture();
    const result = await chatHandler(
      { ...request, command: "subjects" },
      {
        ...deps,
        subjects: subjects(async () => {
          throw new Error("disk");
        }),
      },
    );
    expect(result).toEqual({ metadata: { outcome: "error" } });
    expect(output.text).toBe("Q0T4 couldn't list the subjects. Try again.");
    expect(output.calls.some((c) => c.kind === "button")).toBe(false);
  });

  it("stays silent when cancelled while loading", async () => {
    const { request, deps, output, signal } = fixture();
    const result = await chatHandler(
      { ...request, command: "subjects" },
      {
        ...deps,
        subjects: subjects(async () => {
          signal.cancel();
          return [listItem];
        }),
      },
    );
    expect(result).toEqual({ metadata: { outcome: "cancelled" } });
    expect(output.calls).toEqual([]);
  });

  it("/use stays unimplemented in the handler even when subjects is wired", async () => {
    const { request, deps, output } = fixture();
    const result = await chatHandler(
      { ...request, command: "use" },
      { ...deps, subjects: subjects(async () => [listItem]) },
    );
    expect(result).toEqual({ metadata: { outcome: "error" } });
    expect(output.text).toContain("Slash commands aren't available yet");
  });
});
