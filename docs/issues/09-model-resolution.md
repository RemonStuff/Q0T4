# 09: Core model resolution

**Iteration:** 1 (Walking skeleton)

## Description
Decide which model a request uses. Prefer the model selected in the chat UI (`request.model`). If it isn't usable, fall back to `ModelSelectorPort.select({ vendor: "copilot" })`. If nothing is available, return a typed "no model" result that the handler turns into a friendly message. `request.model` is non-optional in the API, so the fallback mainly matters when the chosen model returns `NotFound` (fully handled in #38).

## Tests to write first
- `uses the request model when one is provided`
- `falls back to the first copilot model when the request model is marked unavailable`
- `prefers a copilot model whose family matches the request model family`
- `returns noModel when the request model is unavailable and the selector returns nothing`
- `never calls the selector when the request model is usable`

## Implementation tasks
- [ ] `src/core/models/resolveModel.ts` returning `{ kind: "ok", model } | { kind: "noModel" }`
- [ ] `formatNoModel()` message in `core/format` ("No Copilot chat model is available. Check that GitHub Copilot is signed in.")

## Acceptance criteria
- [ ] The listed tests pass, core coverage holds, and CI is green

## Depends on
#03, #04

## Labels
`feature`

## Estimate
S
