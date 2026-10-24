import { describe, expect, it, vi } from "vitest";
import {
  CONTEXT_SAFETY_MARGIN,
  contextLimit,
  trimToWindow,
} from "../../../../src/core/messages/trimToWindow";
import type { ChatMessage } from "../../../../src/core/types";

const user = (text: string): ChatMessage => ({ role: "user", text });
const assistant = (text: string): ChatMessage => ({ role: "assistant", text });
/** One token per character, so the sizes in the tests are the text lengths. */
const count = async (message: ChatMessage): Promise<number> => message.text.length;

const history = [user("aaaa"), assistant("bbbb"), user("cccc"), assistant("dddd")];
const tail = [user("refs"), user("ask")];

describe("contextLimit", () => {
  it("keeps a 10% safety margin below the model's window", () => {
    expect(CONTEXT_SAFETY_MARGIN).toBe(0.1);
    expect(contextLimit(1000)).toBe(900);
    expect(contextLimit(1001)).toBe(900);
  });
});

describe("trimToWindow", () => {
  it("leaves messages unchanged when they fit", async () => {
    const messages = [...history, ...tail];
    const result = await trimToWindow({ messages, keepLast: 2, limit: 100, count });
    expect(result).toEqual({ messages, dropped: 0, fits: true, tokens: 23 });
  });

  it("drops the oldest history pair first", async () => {
    const messages = [...history, ...tail];
    // total 4*4 + 4 + 3 = 23; dropping the first pair (8) leaves 15
    const result = await trimToWindow({ messages, keepLast: 2, limit: 15, count });
    expect(result.messages).toEqual([user("cccc"), assistant("dddd"), ...tail]);
    expect(result).toMatchObject({ dropped: 2, fits: true, tokens: 15 });
  });

  it("drops whole pairs, never half a pair", async () => {
    const messages = [...history, ...tail];
    // 23 -> 15 fits only after the first pair; a limit of 14 needs the second pair too
    const result = await trimToWindow({ messages, keepLast: 2, limit: 14, count });
    expect(result.messages).toEqual(tail);
    expect(result.dropped).toBe(4);
    expect(result.dropped % 2).toBe(0);
  });

  it("keeps references and the prompt even when all history is dropped", async () => {
    const messages = [...history, ...tail];
    const result = await trimToWindow({ messages, keepLast: 2, limit: 7, count });
    expect(result.messages).toEqual(tail);
    expect(result).toMatchObject({ dropped: 4, fits: true, tokens: 7 });
  });

  it("reports that it does not fit when the references and the prompt alone exceed the limit", async () => {
    const messages = [...history, ...tail];
    const result = await trimToWindow({ messages, keepLast: 2, limit: 6, count });
    expect(result.messages).toEqual(tail);
    expect(result).toMatchObject({ dropped: 4, fits: false });
  });

  it("works without any history", async () => {
    const result = await trimToWindow({ messages: tail, keepLast: 2, limit: 100, count });
    expect(result).toEqual({ messages: tail, dropped: 0, fits: true, tokens: 7 });
    const tooBig = await trimToWindow({ messages: tail, keepLast: 2, limit: 1, count });
    expect(tooBig).toEqual({ messages: tail, dropped: 0, fits: false, tokens: 7 });
  });

  it("counts every message once", async () => {
    const counter = vi.fn(count);
    const messages = [...history, ...tail];
    await trimToWindow({ messages, keepLast: 2, limit: 7, count: counter });
    expect(counter).toHaveBeenCalledTimes(messages.length);
  });

  it("does not change the input", async () => {
    const messages = Object.freeze([...history, ...tail]);
    await trimToWindow({ messages, keepLast: 2, limit: 7, count });
    expect(messages).toHaveLength(6);
  });

  it("passes a counting failure on", async () => {
    const failure = new Error("count failed");
    await expect(
      trimToWindow({
        messages: tail,
        keepLast: 2,
        limit: 10,
        count: async () => {
          throw failure;
        },
      }),
    ).rejects.toBe(failure);
  });
});
