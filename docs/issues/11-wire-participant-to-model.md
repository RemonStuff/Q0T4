# 11: Adapters and wiring: `@q0t4` talks to the selected model

**Iteration:** 1 (Walking skeleton)

## Description
Replace the stub from #07 with the real handler. Write the thin adapters:
- `vscodeModel`: wraps `LanguageModelChat`, maps `ChatMessage` to `LanguageModelChatMessage`, takes `.text` from the response, and creates a linked `CancellationTokenSource`
- `vscodeModelSelector`
- `chatStreamOutput`: wraps `ChatResponseStream`
- `historyAdapter`: turns `ChatContext.history` into `HistoryTurn[]`, joining each response's markdown parts in their original order into its single `text` string without adding separators. Core `buildMessages` (#08) preserves that already combined text.

Reuse the existing `chatStreamOutput` adapter. Wire the core handler in `extension.ts` and expose that same handler through the existing test API. Each request uses its own selected model; do not retain a model selection across requests.

## Boundaries
- Forward text and conversation history only. Attached references remain in #12; tool references are not executed.
- Return the outcome/model metadata from #10 unchanged. No fabricated usage fields, metering, budgets or footers are added.
- The model wrapper also implements token-count delegation for later use; the handler does not count tokens yet.
- Link the port's cancellation signal to a child `CancellationTokenSource`, including an already-cancelled signal. Do not cancel or dispose the caller's source.
- Release the signal subscription and child source after completion, send/read failure, token-count failure and early closure. Closing before the first `next()` must also clean up and cancel the provider. Use explicit iterator cleanup rather than relying only on an unstarted generator's `finally`.
- Preserve model failures for the core to handle. Output failures still propagate unchanged, with the active model request cancelled.
- Keep slash-command decisions in core: report that commands are unavailable and make no model request. Implementing the commands themselves remains in later issues.
- No retries or detailed model-error mapping are added (#38). No test calls real Copilot.

## Tests to write first
- *(integration)* `handleRequest streams the fake q0t4-test model reply to the response stream`
- *(integration)* `vscodeModel.countTokens delegates to LanguageModelChat.countTokens`
- *(integration)* `vscodeModel cancels the underlying request when its signal fires`
- *(integration)* `historyAdapter maps request and response turns, including markdown parts`
- *(integration)* `historyAdapter joins multiple markdown parts of one response in order without changing their text`
- *(integration)* `chatStreamOutput forwards markdown and progress`
- *(integration)* `each request uses its selected model without retaining the previous one`
- *(integration)* `the actual provider receives history and sees cancellation mid-answer`
- *(integration)* `iterator cleanup releases cancellation before the first next, after completion and on failures`
- *(integration)* `pending send and token-count operations receive cancellation`
- *(integration)* `concurrent requests have independent cancellation sources`
- *(integration)* `selector vendor, family and id filters are delegated`
- *(integration)* `output failures propagate unchanged and cancel the provider`
- *(unit and integration)* `unimplemented slash commands do not select, send or count tokens`
- *(installed VSIX)* `the installed participant streams a fake-model reply, switches models and cancels the provider`

## Implementation tasks
- [x] Adapters under `src/adapters/`, with type mapping and owned cancellation/iterator lifecycle cleanup; no business decisions
- [x] Composition root in `extension.ts`, sharing the real handler with the test API
- [x] Retire the obsolete stub and replace its integration/package assertions with forwarding tests
- [x] `docs/manual-testing.md`, with the automated iteration 1 checks and only genuine UI checks left to normal use

## Acceptance criteria
- [x] The listed tests pass locally and core coverage holds
- [x] Hosted CI is green on the published head with an installed-and-tested `.vsix` artifact
- [x] Streaming, selected-model switching and cancellation are automated through the actual VS Code API and installed VSIX using the fake provider
- Chat-view routing and stickiness stay normal-use checks in `docs/manual-testing.md`. They cannot run headless without real Copilot sign-in; no separate manual model test is required.

## Depends on
#07, #10

## Labels
`feature`

## Estimate
M
