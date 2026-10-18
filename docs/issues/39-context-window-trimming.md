# 39: Context-window trimming

**Iteration:** 6 (Hardening and release)

## Description
Long same-subject threads can exceed `model.maxInputTokens`, which makes `sendRequest` reject. Before the budget pre-check, drop the **oldest** history pairs until the input fits within `maxInputTokens` minus a safety margin (10%). References and the prompt are never dropped. If they alone don't fit, refuse with a clear message and charge nothing.

## Tests to write first
- `leaves messages unchanged when they fit`
- `drops the oldest history pair first`
- `drops whole pairs, never half a pair`
- `keeps references and the prompt even when all history is dropped`
- `refuses with a context-window message when the prompt and references alone exceed the window`
- `pre-check uses the token count after trimming`
- `shows a progress note saying N earlier messages were left out`

## Implementation tasks
- [ ] `src/core/messages/trimToWindow.ts` (uses `countTokens` per message, caching counts)
- [ ] Call it in `chatHandler` before `preCheck`

## Acceptance criteria
- [ ] The listed tests pass, core coverage holds, and CI is green

## Depends on
#33

## Labels
`feature`

## Estimate
S
