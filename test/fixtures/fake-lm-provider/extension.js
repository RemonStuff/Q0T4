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
      provideLanguageModelChatInformation: () => [MODEL],
      async provideLanguageModelChatResponse(_model, _messages, _options, progress, token) {
        if (errorCode) throw scriptedError(errorCode);
        for (const chunk of script) {
          if (token.isCancellationRequested) return;
          progress.report(new vscode.LanguageModelTextPart(chunk));
        }
      },
      async provideTokenCount(_model, text) {
        return Math.ceil(textOf(text).length / 4);
      },
    }),
    vscode.commands.registerCommand("q0t4-test.setScript", (chunks) => {
      script = chunks;
      errorCode = undefined;
    }),
    vscode.commands.registerCommand("q0t4-test.setError", (code) => {
      errorCode = code;
    }),
  );
};

exports.deactivate = () => {};
