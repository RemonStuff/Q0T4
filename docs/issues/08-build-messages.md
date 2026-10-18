# 08: Core `buildMessages`: prompt and history

**Iteration:** 1 (Walking skeleton)

## Description
A pure function that turns the request prompt and chat history into the ordered `ChatMessage[]` sent to the model. In this iteration it includes **all** prior turns. Subject filtering (#32), footer stripping (#18) and references (#12) come later. The adapter converts `ChatRequestTurn` / `ChatResponseTurn` into the core `HistoryTurn` type, so core never sees `vscode` classes.

## Tests to write first
- `builds a single user message from the prompt when history is empty`
- `includes prior user and assistant turns in chronological order`
- `places the current prompt last`
- `joins multiple markdown parts of one response turn into one assistant message`
- `skips response turns with empty text`
- `skips a request turn whose response is missing` (the user cancelled before any output)
- `does not mutate the input history`

## Implementation tasks
- [ ] `src/core/messages/buildMessages.ts`
- [ ] Add the `HistoryTurn` type (`{ kind: "request", prompt, command? } | { kind: "response", text, metadata? }`) to `core/types.ts` if #03 didn't
- [ ] Refactor: extract `pairTurns` if it makes the tests read better

## Acceptance criteria
- [ ] The listed tests pass, core coverage is ≥ 90%, and CI is green

## Depends on
#03, #04

## Labels
`feature`

## Estimate
S
