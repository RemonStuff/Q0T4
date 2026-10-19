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
- [x] `.vscode-test.mjs`: VS Code pinned to 1.142.0, both extension development paths (`.` and `test/fixtures/fake-lm-provider`). **Changed:** no `installExtensions: ["github.copilot-chat"]`. Copilot Chat is built into VS Code since 1.14x and a fresh test profile doesn't load it, so installing it has no effect (see `test/integration/README.md`, PLAN open question 1).
- [x] ~~Test: `github.copilot-chat is installed in the test instance`~~ dropped: it can't pass in a fresh test profile (finding above). The "no `vendor: "copilot"`" rule is now an automated unit test instead.
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
