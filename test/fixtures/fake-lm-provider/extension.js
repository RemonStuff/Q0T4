// Test-only extension: a scripted language-model provider for vendor "q0t4-test".
// Integration tests drive it with the q0t4-test.setScript / setError commands.
const vscode = require("vscode");

const MODEL = {
  id: "fake-model",
  name: "Fake Model",
  family: "fake-family",
  version: "1.0.0",
  maxInputTokens: 128000,
  maxOutputTokens: 16000,
  capabilities: {},
};

let script = ["Hello from the fake model."];
/** A LanguageModelError code (NoPermissions, Blocked, NotFound) or undefined. */
let errorCode;
let hold = false;
const releases = new Set();
const cancellationWaiters = new Set();
let state = { requests: [], cancelled: false };

function release() {
  hold = false;
  for (const resolve of releases) resolve();
  releases.clear();
  for (const resolve of cancellationWaiters) resolve(false);
  cancellationWaiters.clear();
}

function textOf(input) {
  if (typeof input === "string") return input;
  return input.content
    .map((part) => (part instanceof vscode.LanguageModelTextPart ? part.value : ""))
    .join("");
}

function scriptedError(code) {
  const make = vscode.LanguageModelError[code];
  return typeof make === "function" ? make(`scripted ${code}`) : new Error(`scripted ${code}`);
}

exports.activate = (context) => {
  context.subscriptions.push(
    vscode.lm.registerLanguageModelChatProvider("q0t4-test", {
      provideLanguageModelChatInformation: () => [
        MODEL,
        { ...MODEL, id: "second-model", name: "Second Fake Model" },
      ],
      async provideLanguageModelChatResponse(model, messages, _options, progress, token) {
        const current = state;
        current.requests.push({
          model: model.name,
          messages: messages.map((message) => ({
            role: message.role === vscode.LanguageModelChatMessageRole.User ? "user" : "assistant",
            text: textOf(message),
          })),
        });
        const subscription = token.onCancellationRequested(() => {
          current.cancelled = true;
          for (const resolve of cancellationWaiters) resolve(true);
          cancellationWaiters.clear();
          for (const resolve of releases) resolve();
          releases.clear();
        });
        try {
          if (errorCode) throw scriptedError(errorCode);
          for (const chunk of script) {
            if (token.isCancellationRequested) return;
            progress.report(new vscode.LanguageModelTextPart(chunk));
            if (hold) {
              await new Promise((resolve) => {
                if (token.isCancellationRequested) resolve();
                else releases.add(resolve);
              });
            }
          }
        } finally {
          subscription.dispose();
        }
      },
      async provideTokenCount(_model, text) {
        return Math.ceil(textOf(text).length / 4);
      },
    }),
    vscode.commands.registerCommand("q0t4-test.setScript", (chunks) => {
      release();
      script = chunks;
      errorCode = undefined;
      hold = false;
      state = { requests: [], cancelled: false };
    }),
    vscode.commands.registerCommand("q0t4-test.setError", (code) => {
      errorCode = code;
    }),
    vscode.commands.registerCommand("q0t4-test.getState", () => state),
    vscode.commands.registerCommand("q0t4-test.hold", () => {
      hold = true;
    }),
    vscode.commands.registerCommand("q0t4-test.waitForCancellation", () =>
      state.cancelled
        ? Promise.resolve(true)
        : new Promise((resolve) => cancellationWaiters.add(resolve)),
    ),
    vscode.commands.registerCommand("q0t4-test.release", release),
    { dispose: release },
  );
};

exports.deactivate = () => {};
