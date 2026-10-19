# 08: Core `buildMessages`: prompt and history

**Iteration:** 1 (Walking skeleton)

## Description
A pure function that turns the request prompt and chat history into the ordered `ChatMessage[]` sent to the model. In this iteration it includes **all completed request/response pairs**, without subject filtering. Subject filtering (#32), footer stripping (#18) and references (#12) come later. The adapter converts `ChatRequestTurn` / `ChatResponseTurn` into the core `HistoryTurn` type, so core never sees `vscode` classes.

The existing `HistoryTurn` type stores a response as one `text` string. Core preserves that text exactly; joining multiple VS Code markdown parts into it belongs to #11's `historyAdapter`, with an integration test there. This boundary was approved for #8 on 2026-10-19.

## Pairing rules
- Emit a user message and its following non-empty assistant response together.
- Consecutive requests replace an unanswered request; the next response belongs to the latest request.
- Omit trailing unanswered requests, empty response pairs and responses without an unanswered request.
- An empty response consumes its request, so a later orphan response cannot reuse it.
- Keep non-empty partial replies. Preserve whitespace, line breaks and empty prompts exactly.
- Append the current prompt last. Do not change the supplied history, commands or metadata.

## Tests to write first
- `builds a single user message from the prompt when history is empty`
- `includes prior user and assistant turns in chronological order`
- `places the current prompt last`
- `preserves combined markdown response text as one assistant message` (actual markdown-part joining is tested in #11)
- `skips response turns with empty text and their paired requests`
- `skips a request turn whose response is missing` (the user cancelled before any output)
- `does not mutate the input history`
- `pairs a response with the latest request after an unanswered request`
- `skips orphan responses before and after a completed pair`
- `does not reuse a request after its empty response`
- `keeps non-empty partial replies`
- `preserves whitespace and empty prompts without trimming`

## Implementation tasks
- [x] `src/core/messages/buildMessages.ts`: `buildMessages(prompt: string, history: readonly HistoryTurn[]): ChatMessage[]`
- [x] Reuse `HistoryTurn` and `ChatMessage` from #03 without changing either type
- [x] Keep the implementation as a single pass; no separate pairing helper is needed

## Acceptance criteria
- [ ] The listed tests pass, core coverage is ≥ 90%, and CI is green

## Depends on
#03, #04

## Labels
`feature`

## Estimate
S
