# 05: Integration test runner and fake LM provider

**Iteration:** 0 (Test harness)

## Description
Set up `@vscode/test-cli` / `@vscode/test-electron` so a real VS Code instance loads Q0T4 alongside a **test-only fixture extension**. The fixture registers a fake language-model vendor, `q0t4-test`, through the stable `vscode.lm.registerLanguageModelChatProvider`. Integration tests then exercise the real `vscode.lm` path without Copilot, and no test ever calls a real model.

There's no public API to invoke a chat participant, so `activate()` returns a small **test API** (`{ handleRequest, store }`) that tests call directly with a recording `ChatResponseStream`.

## Tests to write first
- `Q0T4 extension activates`
- `fake provider is visible via vscode.lm.selectChatModels({ vendor: "q0t4-test" })`
- `fake model streams the scripted reply`: the script is set through the fixture command `q0t4-test.setScript`
- `fake model countTokens returns ceil(chars / 4)`
- `fake model rejects with the scripted LanguageModelError code`
- `activate returns a test API object`

## Implementation tasks
- [ ] Add `@vscode/test-cli`, `@vscode/test-electron`, `@types/mocha`
- [ ] `.vscode-test.mjs`: VS Code version pinned to one the current `github.copilot-chat` supports, both extension development paths (`.` and `test/fixtures/fake-lm-provider`), and `installExtensions: ["github.copilot-chat"]`. Q0T4 keeps `extensionDependencies` on it (decided), so it must be present for activation, but tests never sign in or use its models.
- [ ] Test: `github.copilot-chat is installed in the test instance`
- [ ] `test/fixtures/fake-lm-provider/`: package.json with a `languageModelChatProviders` contribution, plus `extension.js` implementing `provideLanguageModelChatInformation`, `provideLanguageModelChatResponse` (scripted chunks, honours cancellation) and `provideTokenCount`
- [ ] Fixture commands: `q0t4-test.setScript(chunks)`, `q0t4-test.setError(code)`
- [ ] `src/extension.ts` returns a test API stub
- [ ] Script `test:integration`
- [ ] `test/integration/README.md`: how to run and debug

## Acceptance criteria
- [ ] The listed tests pass locally via `npm run test:integration`
- [ ] No test uses `vendor: "copilot"` (grep check in the test suite)

## Depends on
#01

## Labels
`infra`, `test`

## Estimate
M
