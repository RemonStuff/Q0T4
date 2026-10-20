import { describe, expect, it, vi } from "vitest";
import { countInput } from "../../../../src/core/budget/countInput";
import { Cancelled } from "../../../../src/core/errors/cancelled";
import { CountError } from "../../../../src/core/errors/countError";
import { buildMessages } from "../../../../src/core/messages/buildMessages";
import type { ChatMessage } from "../../../../src/core/types";
import { FakeCancellation, FakeModel } from "../../../fakes";

const messages: readonly ChatMessage[] = Object.freeze([
  Object.freeze({ role: "user", text: "one" }),
  Object.freeze({ role: "assistant", text: "four" }),
  Object.freeze({ role: "user", text: "three" }),
]);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function trackedCancellation() {
  const signal = new FakeCancellation();
  const subscribe = signal.onCancellationRequested.bind(signal);
  const dispose = vi.fn();
  const registration = vi
    .spyOn(signal, "onCancellationRequested")
    .mockImplementation((listener) => {
      const subscription = subscribe(listener);
      return {
        dispose() {
          dispose();
          subscription.dispose();
        },
      };
    });
  return { signal, dispose, registration };
}

describe("countInput", () => {
  it("sums countTokens across all complete messages without sending a request", async () => {
    const model = new FakeModel({ countTokens: (text) => text.length });
    const signal = new FakeCancellation();
    const count = vi.spyOn(model, "countTokens");

    expect(await countInput(model, messages, signal)).toBe(12);
    for (const [index, message] of messages.entries()) {
      expect(count).toHaveBeenNthCalledWith(index + 1, message, signal);
    }
    expect(model.calls.sendRequest).toEqual([]);
    expect(messages.map((message) => message.text)).toEqual(["one", "four", "three"]);
  });

  it("returns zero for an empty list without counting or retaining a listener", async () => {
    const model = new FakeModel();
    const { signal, registration } = trackedCancellation();

    expect(await countInput(model, [], signal)).toBe(0);
    expect(model.calls.countTokens).toEqual([]);
    expect(registration).not.toHaveBeenCalled();
  });

  it("counts completed history, fenced references and the prompt, including their roles", async () => {
    const model = new FakeModel({ countTokens: (text) => text.length });
    const signal = new FakeCancellation();
    const built = buildMessages(
      "current prompt",
      [
        { kind: "request", prompt: "previous question" },
        { kind: "response", text: "previous answer" },
      ],
      [{ label: "file.ts", text: "attached content" }],
    );

    expect(await countInput(model, built, signal)).toBe(
      built.reduce((total, message) => total + message.text.length, 0),
    );
    expect(model.calls.countTokens).toEqual(built);
    expect(model.calls.countTokens).toHaveLength(4);
    expect(built[2]?.text).toBe("file.ts\n```\nattached content\n```");
  });

  it("starts counts in parallel and sums them independently of completion order", async () => {
    const model = new FakeModel();
    const pending = [deferred<number>(), deferred<number>(), deferred<number>()] as const;
    const count = vi
      .spyOn(model, "countTokens")
      .mockReturnValueOnce(pending[0].promise)
      .mockReturnValueOnce(pending[1].promise)
      .mockReturnValueOnce(pending[2].promise);
    const { signal, dispose } = trackedCancellation();

    const result = countInput(model, messages, signal);
    expect(count).toHaveBeenCalledTimes(3);
    expect(dispose).not.toHaveBeenCalled();
    pending[2].resolve(108);
    pending[0].resolve(2);
    pending[1].resolve(11);

    expect(await result).toBe(121);
    expect(dispose).toHaveBeenCalledOnce();
  });

  it.each([{ input: messages }, { input: [] }])(
    "rejects an already-cancelled request before any work (%j)",
    async ({ input }) => {
      const model = new FakeModel();
      const { signal, registration } = trackedCancellation();
      signal.cancel();

      await expect(countInput(model, input, signal)).rejects.toBeInstanceOf(Cancelled);
      expect(model.calls.countTokens).toEqual([]);
      expect(registration).not.toHaveBeenCalled();
    },
  );

  it("stops waiting when cancelled even if tokenizers ignore the signal", async () => {
    const model = new FakeModel();
    const pending = deferred<number>();
    vi.spyOn(model, "countTokens").mockReturnValue(pending.promise);
    const { signal, dispose } = trackedCancellation();
    const result = countInput(model, messages, signal);
    const rejection = expect(result).rejects.toMatchObject({
      name: "Cancelled",
      message: "Input token counting was cancelled.",
    });

    signal.cancel();
    await rejection;
    expect(dispose).toHaveBeenCalledOnce();
    pending.resolve(5);
    await Promise.resolve();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("does not start further counts after synchronous cancellation during a count", async () => {
    const model = new FakeModel();
    const signal = new FakeCancellation();
    const count = vi.spyOn(model, "countTokens").mockImplementation(() => {
      signal.cancel();
      return Promise.resolve(4);
    });

    await expect(countInput(model, messages, signal)).rejects.toBeInstanceOf(Cancelled);
    expect(count).toHaveBeenCalledTimes(1);
  });

  it("does not return a total when cancellation follows the final count resolution", async () => {
    const model = new FakeModel();
    const pending = deferred<number>();
    vi.spyOn(model, "countTokens").mockReturnValue(pending.promise);
    const signal = new FakeCancellation();
    const result = countInput(model, messages, signal);
    const rejection = expect(result).rejects.toBeInstanceOf(Cancelled);

    pending.resolve(7);
    signal.cancel();
    await rejection;
  });

  it("observes the cancellation flag even before its notification arrives", async () => {
    const model = new FakeModel();
    const signal = new FakeCancellation();
    const dispose = vi.fn();
    vi.spyOn(signal, "onCancellationRequested").mockReturnValue({ dispose });
    vi.spyOn(model, "countTokens").mockImplementation(async () => {
      signal.cancel();
      return 7;
    });

    await expect(countInput(model, messages.slice(0, 1), signal)).rejects.toBeInstanceOf(Cancelled);
    expect(dispose).toHaveBeenCalledOnce();
  });

  it.each([new Error("private tokenizer detail"), "private tokenizer detail", null, undefined])(
    "preserves a rejected cause in CountError without exposing it in the message (%j)",
    async (cause) => {
      const model = new FakeModel();
      vi.spyOn(model, "countTokens").mockRejectedValue(cause);
      const { signal, dispose } = trackedCancellation();
      const result = countInput(model, messages, signal);

      await expect(result).rejects.toBeInstanceOf(CountError);
      await expect(result).rejects.toMatchObject({
        name: "CountError",
        message: "Q0T4 couldn't count input tokens.",
        cause,
      });
      expect(dispose).toHaveBeenCalledOnce();
    },
  );

  it("wraps a synchronous tokenizer throw in CountError", async () => {
    const model = new FakeModel();
    const cause = new Error("synchronous private detail");
    vi.spyOn(model, "countTokens").mockImplementation(() => {
      throw cause;
    });
    const { signal, dispose } = trackedCancellation();

    await expect(countInput(model, messages, signal)).rejects.toMatchObject({
      name: "CountError",
      cause,
    });
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("reports cancellation rather than a tokenizer rejection after cancellation", async () => {
    const model = new FakeModel();
    const pending = deferred<number>();
    const count = vi.spyOn(model, "countTokens").mockReturnValue(pending.promise);
    const { signal, dispose } = trackedCancellation();
    const result = countInput(model, messages, signal);
    expect(count).toHaveBeenCalledTimes(3);
    const rejection = expect(result).rejects.toBeInstanceOf(Cancelled);

    signal.cancel();
    pending.reject(new Error("cancelled tokenizer"));
    await rejection;
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("keeps rejection handlers on in-flight counts after cancellation", async () => {
    const model = new FakeModel();
    const first = deferred<number>();
    const second = deferred<number>();
    vi.spyOn(model, "countTokens")
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { signal, dispose } = trackedCancellation();
    const result = countInput(model, messages.slice(0, 2), signal);
    const rejection = expect(result).rejects.toBeInstanceOf(Cancelled);

    signal.cancel();
    await rejection;
    first.reject(new Error("late first failure"));
    second.reject(new Error("late second failure"));
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("keeps rejection handlers on other in-flight counts after a count fails", async () => {
    const model = new FakeModel();
    const first = deferred<number>();
    const second = deferred<number>();
    const count = vi
      .spyOn(model, "countTokens")
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { signal, dispose } = trackedCancellation();
    const cause = new Error("first count failure");
    const result = countInput(model, messages.slice(0, 2), signal);
    expect(count).toHaveBeenCalledTimes(2);
    const rejection = expect(result).rejects.toMatchObject({ name: "CountError", cause });

    first.reject(cause);
    await rejection;
    second.reject(new Error("late second failure"));
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("disposes the cancellation listener on success", async () => {
    const model = new FakeModel();
    const { signal, dispose, registration } = trackedCancellation();

    expect(await countInput(model, messages, signal)).toBe(4);
    expect(registration).toHaveBeenCalledOnce();
    expect(dispose).toHaveBeenCalledOnce();
    signal.cancel();
    expect(dispose).toHaveBeenCalledOnce();
  });
});
