# 10: Core `chatHandler`: forward and stream

**Iteration:** 1 (Walking skeleton)

## Description
The orchestrator for a single chat request, written entirely against ports: resolve the model (#09), build the messages (#08), call `ModelPort.sendRequest`, stream each chunk to `ChatOutputPort.markdown`, and return a result. It honours the chat's `CancellationSignal`. Any error becomes a short, friendly message instead of an unhandled rejection. This is the seam that every later feature plugs into.

## Tests to write first
- `streams every chunk from FakeModel to the output in order`
- `sends the messages produced by buildMessages`
- `stops streaming when the chat cancellation signal fires mid-stream`
- `writes a friendly error and resolves when sendRequest rejects`
- `writes partial output then a friendly error when the stream throws after chunk n`
- `writes the no-model message when no model is available`
- `returns a ChatResult-shaped object with metadata`

## Implementation tasks
- [ ] `src/core/chatHandler.ts` taking a `Deps` object of ports
- [ ] A generic error message in `core/errors` (detailed mapping comes in #38)
- [ ] Refactor: keep the handler a thin pipeline of named steps

## Acceptance criteria
- [ ] The listed tests pass, core coverage holds, and CI is green

## Depends on
#08, #09

## Labels
`feature`

## Estimate
M
