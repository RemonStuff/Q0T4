# 38: Model error mapping: consent, missing model, quota

**Iteration:** 6 (Hardening and release)

## Description
Turn every `LanguageModelError` into a clear message and the right recording behaviour. The `errorMapping` adapter maps `error.code` to a core `ModelErrorKind`, and core decides the message, the fallback and what gets charged.

| Kind | Message | Behaviour |
|---|---|---|
| `NoPermissions` | "Q0T4 needs permission to use Copilot models. Accept the prompt and try again." | Nothing charged |
| `NotFound` | (silent) | Retry once with the fallback model (#09); if that fails, show the no-model message |
| `Blocked` | "Copilot reports a quota or rate limit. Try again later." | Charge only what was streamed |
| `Unknown` / other | Generic message plus the error message | Charge only what was streamed |

## Tests to write first
- `NoPermissions before streaming shows the consent message and records nothing`
- `NotFound retries once with the fallback copilot model and succeeds`
- `after a NotFound fallback, the footer and metadata name the fallback model, not the original`
- `NotFound with no fallback available shows the no-model message`
- `NotFound does not retry more than once`
- `Blocked shows the quota message`
- `Blocked mid-stream records input and output so far`
- `Unknown errors include the original message`
- `the footer is still written after every error kind`
- `classifier errors of any kind fall back silently to fallbackSubject`
- *(integration)* `errorMapping maps each LanguageModelError code from the fake provider`

## Implementation tasks
- [ ] `src/core/errors/modelErrors.ts`
- [ ] `src/adapters/errorMapping.ts`
- [ ] Retry-once logic in `chatHandler`

## Acceptance criteria
- [ ] The listed tests pass, core coverage holds, and CI is green
- [ ] Manual: in a fresh profile, the first `@q0t4` request shows the consent dialog; deny it and see the friendly message

## Depends on
#33

## Labels
`feature`

## Estimate
M
