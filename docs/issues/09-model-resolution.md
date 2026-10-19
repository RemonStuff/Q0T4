# 09: Core model resolution

**Iteration:** 1 (Walking skeleton)

## Description
Decide which model a request uses. Prefer the model selected in the chat UI (`request.model`). If it isn't usable, fall back to `ModelSelectorPort.select({ vendor: "copilot" })`. If nothing is available, return a typed "no model" result that the handler turns into a friendly message. `request.model` is non-optional in the API, so the fallback mainly matters when the chosen model returns `NotFound` (fully handled in #38).

## Resolution rules
- `resolveModel(requestModel, selector, availability = "available")` requires the request model and uses an explicit `"available" | "unavailable"` state supplied by the caller.
- An available request model is returned unchanged, without invoking the selector, counting tokens or sending a probe request.
- An unavailable request model triggers exactly one `select({ vendor: "copilot" })` call. Do not restrict that query by family, because a different-family fallback must still be possible.
- Prefer the first returned model with an exact family match; otherwise use the first returned model. Keep the selector's order unchanged.
- Only an empty model list returns `{ kind: "noModel" }`. Selector failures propagate unchanged for the handler to report; do not turn them into an empty-list result or retry them here.
- The formatter returns the specified sign-in guidance. This issue does not wire a handler, attempt a model request or implement the retry-on-`NotFound` policy from #38.

## Tests to write first
- `uses the request model when one is provided`
- `falls back to the first copilot model when the request model is marked unavailable`
- `prefers a copilot model whose family matches the request model family`
- `returns noModel when the request model is unavailable and the selector returns nothing`
- `never calls the selector when the request model is usable`
- `queries copilot once without restricting the family or selecting another vendor`
- `uses the first matching family without changing the selector's model order`
- `propagates a selector failure unchanged instead of returning noModel or retrying`
- `does not probe the selected model or either model during fallback`
- `returns noModel when only non-copilot models are listed`
- `formatNoModel returns the exact sign-in guidance`

## Implementation tasks
- [x] `src/core/models/resolveModel.ts` returning the discriminated `ModelResolution` union `{ kind: "ok", model } | { kind: "noModel" }`
- [x] Reuse `ModelPort`, `ModelSelectorPort`, `FakeModel` and `FakeModelSelector` without changing them
- [x] `formatNoModel()` message in `core/format` ("No Copilot chat model is available. Check that GitHub Copilot is signed in.")

## Acceptance criteria
- [ ] The listed tests pass, core coverage holds, and CI is green

## Depends on
#03, #04

## Labels
`feature`

## Estimate
S
