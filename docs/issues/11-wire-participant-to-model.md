# 11: Adapters and wiring: `@q0t4` talks to the selected model

**Iteration:** 1 (Walking skeleton)

## Description
Replace the stub from #07 with the real handler. Write the thin adapters:
- `vscodeModel`: wraps `LanguageModelChat`, maps `ChatMessage` to `LanguageModelChatMessage`, takes `.text` from the response, and creates a linked `CancellationTokenSource`
- `vscodeModelSelector`
- `chatStreamOutput`: wraps `ChatResponseStream`
- `historyAdapter`: turns `ChatContext.history` into `HistoryTurn[]`

Wire them in `extension.ts` and expose the handler through the test API.

## Tests to write first
- *(integration)* `handleRequest streams the fake q0t4-test model reply to the response stream`
- *(integration)* `vscodeModel.countTokens delegates to LanguageModelChat.countTokens`
- *(integration)* `vscodeModel cancels the underlying request when its signal fires`
- *(integration)* `historyAdapter maps request and response turns, including markdown parts`
- *(integration)* `chatStreamOutput forwards markdown and progress`

## Implementation tasks
- [ ] Adapters under `src/adapters/`, with no branching logic beyond type mapping
- [ ] Composition root in `extension.ts`
- [ ] `docs/manual-testing.md`, with the iteration 1 checklist

## Acceptance criteria
- [ ] The listed tests pass, core coverage holds, and CI is green with a `.vsix` artifact
- [ ] Manual: install the `.vsix`, send `@q0t4 explain closures in JS` and see a streamed answer from the model selected in the picker; switch models and confirm the next answer uses the new one; check that cancelling mid-answer stops the stream

## Depends on
#07, #10

## Labels
`feature`

## Estimate
M
