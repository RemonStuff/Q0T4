import { describe, expect, it, vi } from "vitest";
import { resolveModel } from "../../../../src/core/models/resolveModel";
import { FakeModel, FakeModelSelector } from "../../../fakes";

describe("resolveModel", () => {
  it("uses the request model when one is provided", async () => {
    const model = new FakeModel();
    const result = await resolveModel(model, new FakeModelSelector([]));

    expect(result).toEqual({ kind: "ok", model });
    if (result.kind === "ok") expect(result.model).toBe(model);
  });

  it("falls back to the first copilot model when the request model is marked unavailable", async () => {
    const model = new FakeModel({ family: "unavailable-family" });
    const first = new FakeModel({ vendor: "copilot", family: "first", id: "first" });
    const second = new FakeModel({ vendor: "copilot", family: "second", id: "second" });

    expect(
      await resolveModel(model, new FakeModelSelector([first, second]), "unavailable"),
    ).toEqual({ kind: "ok", model: first });
  });

  it("prefers a copilot model whose family matches the request model family", async () => {
    const model = new FakeModel({ family: "requested-family" });
    const first = new FakeModel({ vendor: "copilot", family: "different-family", id: "first" });
    const matching = new FakeModel({
      vendor: "copilot",
      family: "requested-family",
      id: "matching",
    });

    const result = await resolveModel(
      model,
      new FakeModelSelector([first, matching]),
      "unavailable",
    );

    expect(result).toEqual({ kind: "ok", model: matching });
    if (result.kind === "ok") expect(result.model).toBe(matching);
  });

  it("returns noModel when the request model is unavailable and the selector returns nothing", async () => {
    expect(await resolveModel(new FakeModel(), new FakeModelSelector([]), "unavailable")).toEqual({
      kind: "noModel",
    });
  });

  it("never calls the selector when the request model is usable", async () => {
    const model = new FakeModel();
    const selector = new FakeModelSelector([]);
    const select = vi.spyOn(selector, "select").mockRejectedValue(new Error("Must not select"));

    expect(await resolveModel(model, selector)).toEqual({ kind: "ok", model });
    expect(select).not.toHaveBeenCalled();
  });

  it("queries copilot once without restricting the family or selecting another vendor", async () => {
    const model = new FakeModel({ family: "requested-family" });
    const otherVendor = new FakeModel({ vendor: "q0t4-test", family: "requested-family" });
    const copilot = new FakeModel({ vendor: "copilot", family: "different-family" });
    const selector = new FakeModelSelector([otherVendor, copilot]);
    const select = vi.spyOn(selector, "select");

    expect(await resolveModel(model, selector, "unavailable")).toEqual({
      kind: "ok",
      model: copilot,
    });
    expect(select).toHaveBeenCalledExactlyOnceWith({ vendor: "copilot" });
  });

  it("uses the first matching family without changing the selector's model order", async () => {
    const model = new FakeModel({ family: "requested-family" });
    const first = new FakeModel({ vendor: "copilot", family: "different-family", id: "first" });
    const matching = new FakeModel({
      vendor: "copilot",
      family: "requested-family",
      id: "matching",
    });
    const laterMatch = new FakeModel({
      vendor: "copilot",
      family: "requested-family",
      id: "later-match",
    });
    const models = Object.freeze([first, matching, laterMatch]);
    const selector = new FakeModelSelector(models);
    vi.spyOn(selector, "select").mockResolvedValue(models);

    expect(await resolveModel(model, selector, "unavailable")).toEqual({
      kind: "ok",
      model: matching,
    });
    expect(models).toEqual([first, matching, laterMatch]);
  });

  it("propagates a selector failure unchanged instead of returning noModel or retrying", async () => {
    const failure = new Error("Model listing failed");
    const selector = new FakeModelSelector([]);
    const select = vi.spyOn(selector, "select").mockRejectedValue(failure);

    await expect(resolveModel(new FakeModel(), selector, "unavailable")).rejects.toBe(failure);
    expect(select).toHaveBeenCalledOnce();
  });

  it("does not probe a model explicitly marked available", async () => {
    const model = new FakeModel({ failBeforeFirstChunk: new Error("Must not send") });

    expect(await resolveModel(model, new FakeModelSelector([]), "available")).toEqual({
      kind: "ok",
      model,
    });
    expect(model.calls).toEqual({ sendRequest: [], countTokens: [] });
  });

  it("does not probe either model while resolving a fallback", async () => {
    const model = new FakeModel({ failBeforeFirstChunk: new Error("Must not send") });
    const fallback = new FakeModel({
      vendor: "copilot",
      failBeforeFirstChunk: new Error("Must not send"),
    });

    expect(await resolveModel(model, new FakeModelSelector([fallback]), "unavailable")).toEqual({
      kind: "ok",
      model: fallback,
    });
    expect(model.calls).toEqual({ sendRequest: [], countTokens: [] });
    expect(fallback.calls).toEqual({ sendRequest: [], countTokens: [] });
  });

  it("returns noModel when only non-copilot models are listed", async () => {
    const model = new FakeModel();
    const otherVendor = new FakeModel({ vendor: "q0t4-test", family: model.family });

    expect(await resolveModel(model, new FakeModelSelector([otherVendor]), "unavailable")).toEqual({
      kind: "noModel",
    });
  });
});
