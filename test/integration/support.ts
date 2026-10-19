import * as assert from "node:assert/strict";
import * as vscode from "vscode";
import type { Q0T4Exports } from "../../src/extension";

export const Q0T4_ID = "RemonStuff.q0t4";
export const FAKE_PROVIDER_ID = "q0t4-test.fake-lm-provider";
/** The only model vendor integration tests may use; never real Copilot. */
export const FAKE_VENDOR = "q0t4-test";

export async function fakeModel(): Promise<vscode.LanguageModelChat> {
  const [model] = await vscode.lm.selectChatModels({ vendor: FAKE_VENDOR });
  if (!model) throw new Error(`no ${FAKE_VENDOR} model available`);
  assert.equal(model.vendor, FAKE_VENDOR);
  return model;
}

export async function participantApi(): Promise<Q0T4Exports> {
  const extension = vscode.extensions.getExtension<Q0T4Exports>(Q0T4_ID);
  assert.ok(extension, `${Q0T4_ID} is not loaded`);
  return extension.activate();
}

export function chatRequest(
  model: vscode.LanguageModelChat,
  prompt = "hi",
  command?: string,
  references: vscode.ChatRequest["references"] = [],
): vscode.ChatRequest {
  return {
    prompt,
    command,
    references,
    toolReferences: [],
    model,
    get toolInvocationToken(): never {
      throw new Error("These tests must not invoke tools");
    },
  };
}

export function recordingStream(onMarkdown?: () => void) {
  const markdown: string[] = [];
  const progress: string[] = [];
  const calls: { kind: "markdown" | "progress"; text: string }[] = [];
  const unexpected = () => {
    throw new Error("Unexpected non-text chat output");
  };
  const stream: vscode.ChatResponseStream = {
    markdown(value) {
      const text = typeof value === "string" ? value : value.value;
      markdown.push(text);
      calls.push({ kind: "markdown", text });
      onMarkdown?.();
    },
    progress(text) {
      progress.push(text);
      calls.push({ kind: "progress", text });
    },
    anchor: unexpected,
    button: unexpected,
    filetree: unexpected,
    reference: unexpected,
    push: unexpected,
  };
  return { stream, markdown, progress, calls };
}

export interface ProviderState {
  readonly requests: readonly {
    readonly model: string;
    readonly messages: readonly { readonly role: "user" | "assistant"; readonly text: string }[];
  }[];
  readonly cancelled: boolean;
}

export async function withDeadline<T>(operation: T | PromiseLike<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("Fake model operation did not settle")), 4_000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
