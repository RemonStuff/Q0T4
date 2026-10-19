# Integration tests

These tests run inside a real VS Code (pinned in `.vscode-test.mjs`) with two extensions under development:

- **Q0T4** (the repo root)
- **`test/fixtures/fake-lm-provider`**, a test-only extension that registers the model vendor **`q0t4-test`** through `vscode.lm.registerLanguageModelChatProvider`

No test ever calls a real Copilot model. A unit test (`test/unit/tooling/integration-guard.test.ts`) fails if any integration test uses `vendor: "copilot"`.

## Run

```sh
npm run test:integration
```

This builds the extension, compiles `test/integration` with `tsconfig.integration.json` into `out/`, and runs it with `@vscode/test-cli`. The first run downloads VS Code into `.vscode-test/`, which is git-ignored. On Linux CI it runs under `xvfb-run -a`.

## Driving the fake model

| Command                                 | Effect                                                                                                    |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `q0t4-test.setScript(chunks: string[])` | The next replies stream these chunks; clears any scripted error                                           |
| `q0t4-test.setError(code)`              | The next requests fail with `LanguageModelError[code]`, e.g. `"Blocked"`, `"NoPermissions"`, `"NotFound"` |
| `q0t4-test.getState()`                  | Read the model names/messages received and whether the provider observed cancellation                     |
| `q0t4-test.hold()`                      | Pause after reporting a chunk until cancellation or explicit release                                      |
| `q0t4-test.waitForCancellation()`       | Resolve `true` when the provider sees cancellation; resolve `false` if released without that proof        |
| `q0t4-test.release()`                   | Release held responses and pending observers during test cleanup                                          |

The provider exposes two models, so tests can prove that the selected model changes between requests. `setScript` also resets observations, releases held responses and clears hold mode. Token counts are `ceil(chars / 4)`, matching `FakeModel` in the unit tests.

## Calling the participant

VS Code has no API to invoke a chat participant, so `activate()` returns test hooks under `exports.test` (e.g. `handleRequest`), and tests call them with a recording response stream.

The hook and registered participant use the same real handler. Tests assert actual provider messages and cancellation, not just a matching visible reply. The installed-VSIX tests reuse the fake provider and test helpers while loading Q0T4 only from the installed package.

Cancellation tests use a held response and wait for provider readback, with a bounded test-only deadline. Cleanup releases the hold even if a test fails; no timing sleeps or production timeouts are needed.

## Debugging

Run `npx vscode-test --grep "<test name>"` to run one test. Logs from the test instance are in `.vscode-test/user-data/logs/`.

## Copilot Chat in the test instance

Since VS Code 1.14x, Copilot Chat (`GitHub.copilot-chat`) is **built into VS Code**. A fresh test profile doesn't load it: the extension host logs _"Extension 'github.copilot-chat' appears in product.json but enables LESS API proposals than the extension wants"_, and `vscode.extensions.getExtension("github.copilot-chat")` returns `undefined`. Your normal VS Code logs the same message but still activates it. Installing it from the Marketplace has no effect, because the built-in copy wins. That's why Q0T4 declares no `extensionDependencies` (PLAN open question 1).
