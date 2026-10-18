# 64: `api.sendRequest` with metering and cut-off

**Iteration:** 9 (Public API)

## Description
`client.sendRequest(subject, model, messages, options, token)` runs the **same pipeline** as the participant: count input → cost → pre-check (with reserve rules) → stream with the StreamGuard cut-off → a ledger entry in `finally`, with `source: "api:<extensionId>"`. It returns `{ stream, text, result }`:
- `stream`: the guarded `AsyncIterable` of text parts
- `text`: the full text
- `result`: a promise of `{ cost, stopped, borrowed }`

Refusals reject with a typed `Q0T4BudgetError` (`code: "over-budget" | "blocked" | "no-prices" | "needs-reserve-approval"`) carrying the refusal details.

To avoid two copies of the logic, extract the shared steps from `chatHandler` into a `meteredRequest` pipeline used by both. The participant keeps its chat-only parts: subject resolution, history, footer and metadata.

## Tests to write first
*(each runs for tokens and credits)*
- `streams the model's reply and records an entry with source "api:<extensionId>"`
- `rejects with Q0T4BudgetError "over-budget" before calling the model`
- `cuts the stream off at the budget and result.stopped is "budget"`
- `records usage when the consumer cancels mid-stream`
- `records nothing when the model rejects before streaming`
- `borrows from the reserve under "auto" and reports borrowed`
- `rejects with "needs-reserve-approval" under "ask" without a grant`
- `in credits mode with no price table, rejects with "no-prices"`

*(refactor guard)*
- `the participant's existing chatHandler tests still pass unchanged after extracting meteredRequest`

## Implementation tasks
- [ ] `src/core/budget/meteredRequest.ts`, extracted from `chatHandler` (refactor step, tests green before and after)
- [ ] `sendRequest` on the client
- [ ] Adapter glue: `vscode.LanguageModelChat` → `ModelPort`, and back for the stream

## Acceptance criteria
- [ ] The listed tests pass, core coverage holds, and CI is green

## Depends on
#63

## Labels
`feature`

## Estimate
M
