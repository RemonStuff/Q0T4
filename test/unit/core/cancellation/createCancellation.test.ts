import { describe, expect, it, vi } from "vitest";
import { createCancellation } from "../../../../src/core/cancellation/createCancellation";
import { FakeCancellation } from "../../../fakes";

describe("createCancellation", () => {
  it("cancels the child once without cancelling the chat", () => {
    const parent = new FakeCancellation();
    const source = createCancellation(parent);
    const notified = vi.fn();
    source.signal.onCancellationRequested(notified);
    source.cancel();
    source.cancel();
    expect(source.signal.isCancellationRequested).toBe(true);
    expect(parent.isCancellationRequested).toBe(false);
    expect(notified).toHaveBeenCalledOnce();
    source.dispose();
  });

  it("forwards parent cancellation and lets subscriptions be removed", () => {
    const parent = new FakeCancellation();
    const source = createCancellation(parent);
    const kept = vi.fn();
    const removed = vi.fn();
    source.signal.onCancellationRequested(kept);
    const subscription = source.signal.onCancellationRequested(removed);
    subscription.dispose();
    parent.cancel();
    expect(source.signal.isCancellationRequested).toBe(true);
    expect(kept).toHaveBeenCalledOnce();
    expect(removed).not.toHaveBeenCalled();
    source.dispose();
  });

  it("releases its parent subscription exactly once on disposal", () => {
    const parent = new FakeCancellation();
    const dispose = vi.fn();
    vi.spyOn(parent, "onCancellationRequested").mockReturnValue({ dispose });
    const source = createCancellation(parent);
    const notified = vi.fn();
    source.signal.onCancellationRequested(notified);
    source.dispose();
    source.dispose();
    source.cancel();
    expect(dispose).toHaveBeenCalledOnce();
    expect(notified).not.toHaveBeenCalled();
  });

  it("starts cancelled without retaining a parent listener when the chat is already cancelled", () => {
    const parent = new FakeCancellation();
    parent.cancel();
    const subscribe = vi.spyOn(parent, "onCancellationRequested");
    const source = createCancellation(parent);
    expect(source.signal.isCancellationRequested).toBe(true);
    expect(subscribe).not.toHaveBeenCalled();
    source.dispose();
  });

  it("observes the parent flag even if its notification has not arrived", () => {
    const parent = new FakeCancellation();
    vi.spyOn(parent, "onCancellationRequested").mockReturnValue({ dispose() {} });
    const source = createCancellation(parent);
    parent.cancel();
    expect(source.signal.isCancellationRequested).toBe(true);
    source.dispose();
  });
});
