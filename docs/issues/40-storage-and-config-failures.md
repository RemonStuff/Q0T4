# 40: Storage and config failure paths

**Iteration:** 6 (Hardening and release)

## Description
Failures outside the model must never break a chat or lose the user's answer. If writing to globalState fails, log it and show a one-time warning, and the reply still completes. If settings become invalid at runtime (hand-edited `settings.json`), warn and keep working with the defaults. Add an output channel, "Q0T4", for diagnostics.

## Tests to write first
- `a storage write failure does not interrupt the streamed reply`
- `a storage write failure shows a warning once per session`
- `a storage read failure is treated as zero usage and warned once`
- `an invalid subjects setting at runtime falls back to defaults and warns`
- `the warning is not repeated for the same invalid config`
- `diagnostics are logged through a LogPort`

## Implementation tasks
- [ ] Add a `LogPort` with a `FakeLog`, and an output-channel adapter
- [ ] Harden BudgetStore and the handler around storage calls
- [ ] De-duplicate warnings in core

## Acceptance criteria
- [ ] The listed tests pass, core coverage holds, and CI is green

## Depends on
#25, #26

## Labels
`feature`

## Estimate
S
