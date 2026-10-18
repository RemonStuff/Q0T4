import { describe, expect, it } from "vitest";
import { FakeCancellation, FakeModel, FakeModelSelector } from "./index";

async function collect(stream: AsyncIterable<string>): Promise<string[]> {
  const parts: string[] = [];
  for await (const part of stream) parts.push(part);
  return parts;
}

const user = (text: string) => ({ role: "user" as const, text });

describe("FakeModel", () => {
  it("streams scripted chunks in order", async () => {
    const model = new FakeModel({ chunks: ["Hel", "lo", "!"] });
    const stream = await model.sendRequest([user("hi")], new FakeCancellation());
    expect(await collect(stream)).toEqual(["Hel", "lo", "!"]);
  });

  it("countTokens returns ceil(chars / 4) by default", async () => {
    const model = new FakeModel();
    expect(await model.countTokens("")).toBe(0);
    expect(await model.countTokens("abcd")).toBe(1);
    expect(await model.countTokens("abcde")).toBe(2);
  });

  it("countTokens accepts a ChatMessage and counts its text", async () => {
    expect(await new FakeModel().countTokens(user("abcdefgh"))).toBe(2);
  });

  it("countTokens can be overridden per test", async () => {
    const model = new FakeModel({ countTokens: (text) => text.length * 10 });
    expect(await model.countTokens("abc")).toBe(30);
  });

  it("rejects sendRequest when an error is injected before the first chunk", async () => {
    const model = new FakeModel({
      chunks: ["a"],
      failBeforeFirstChunk: new Error("NoPermissions"),
    });
    await expect(model.sendRequest([user("hi")], new FakeCancellation())).rejects.toThrow(
      "NoPermissions",
    );
  });

  it("throws mid-stream when an error is injected after chunk n", async () => {
    const model = new FakeModel({
      chunks: ["a", "b", "c"],
      failAfterChunk: { after: 2, error: new Error("connection reset") },
    });
    const seen: string[] = [];
    const stream = await model.sendRequest([user("hi")], new FakeCancellation());
    await expect(
      (async () => {
        for await (const part of stream) seen.push(part);
      })(),
    ).rejects.toThrow("connection reset");
    expect(seen).toEqual(["a", "b"]);
  });

  it("stops yielding after the cancellation signal fires", async () => {
    const model = new FakeModel({ chunks: ["a", "b", "c", "d"] });
    const signal = new FakeCancellation();
    const seen: string[] = [];
    for await (const part of await model.sendRequest([user("hi")], signal)) {
      seen.push(part);
      if (seen.length === 2) signal.cancel();
    }
    expect(seen).toEqual(["a", "b"]);
  });

  it("records sendRequest messages and countTokens calls", async () => {
    const model = new FakeModel({ chunks: [] });
    const messages = [user("one"), { role: "assistant" as const, text: "two" }];
    await collect(await model.sendRequest(messages, new FakeCancellation()));
    await model.countTokens("x");
    await model.countTokens(user("y"));
    expect(model.calls.sendRequest).toEqual([messages]);
    expect(model.calls.countTokens).toEqual(["x", user("y")]);
  });

  it("reports maxInputTokens, id, name, family and vendor from its options", () => {
    const model = new FakeModel({
      id: "gpt-5-mini",
      name: "GPT-5 mini",
      family: "gpt-5-mini",
      vendor: "copilot",
      maxInputTokens: 128_000,
    });
    expect(model).toMatchObject({
      id: "gpt-5-mini",
      name: "GPT-5 mini",
      family: "gpt-5-mini",
      vendor: "copilot",
      maxInputTokens: 128_000,
    });
  });
});

describe("FakeModelSelector", () => {
  const mini = new FakeModel({ vendor: "copilot", family: "gpt-5-mini", id: "m1" });
  const sonnet = new FakeModel({ vendor: "copilot", family: "claude-sonnet-5.5", id: "s1" });
  const other = new FakeModel({ vendor: "q0t4-test", family: "gpt-5-mini", id: "t1" });
  const selector = new FakeModelSelector([mini, sonnet, other]);

  it("returns models matching vendor and family", async () => {
    expect(await selector.select({ vendor: "copilot", family: "gpt-5-mini" })).toEqual([mini]);
    expect(await selector.select({ vendor: "copilot" })).toEqual([mini, sonnet]);
    expect(await selector.select({ id: "t1" })).toEqual([other]);
  });

  it("returns an empty list when nothing matches", async () => {
    expect(await selector.select({ vendor: "openai" })).toEqual([]);
  });
});
