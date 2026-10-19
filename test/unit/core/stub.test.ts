import { describe, expect, it } from "vitest";
import { handleStubRequest, stubReply } from "../../../src/core/stub";
import { RecordingOutput } from "../../fakes";

describe("stub participant", () => {
  it("stubReply returns the not-wired-yet message", () => {
    expect(stubReply()).toBe("Q0T4 is installed. Budgeting isn't wired up yet.");
  });

  it("handleStubRequest writes the stub reply as markdown, and nothing else", () => {
    const output = new RecordingOutput();
    handleStubRequest(output);
    expect(output.calls).toEqual([{ kind: "markdown", text: stubReply() }]);
  });
});
