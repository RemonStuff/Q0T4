# 04: Test doubles

**Iteration:** 0 (Test harness)

## Description
Build the fakes that every core test relies on, test-first, so the fakes themselves can be trusted. They live in `test/fakes/` and count as test code, not core.

## Tests to write first
**FakeModel**
- `streams scripted chunks in order`
- `countTokens returns ceil(chars / 4) by default`
- `countTokens accepts a ChatMessage and counts its text`
- `countTokens can be overridden per test`
- `rejects sendRequest when an error is injected before the first chunk`
- `throws mid-stream when an error is injected after chunk n`
- `stops yielding after the cancellation signal fires`
- `records sendRequest messages and countTokens calls`
- `reports maxInputTokens, id, family and vendor from its options`

**FakeModelSelector**
- `returns models matching vendor and family`
- `returns an empty list when nothing matches`

**InMemoryStorage**
- `get returns undefined for a missing key`
- `get returns a deep copy, not the stored reference`
- `keys lists stored keys`
- `set rejects when a write failure is injected`

**FixedClock**
- `now returns the configured instant`
- `timeZone returns the configured IANA zone`
- `advance moves time forward by ms`
- `set jumps to an ISO instant`

**FakeConfig, RecordingOutput, FakeUi, FakeReferenceReader, FakeCancellation**
- `FakeConfig fires onDidChange when updated`
- `RecordingOutput records markdown and progress calls in order`
- `RecordingOutput.text joins markdown parts`
- `FakeUi returns scripted confirm answers in order`
- `FakeUi records status bar states`
- `FakeReferenceReader returns configured text per reference id`
- `FakeCancellation.cancel notifies listeners exactly once`

## Implementation tasks
- [ ] Implement each fake in `test/fakes/` against the ports from #03
- [ ] `test/fakes/index.ts` barrel export
- [ ] Each fake declares `satisfies <Port>` so drift from a port is a compile error

## Acceptance criteria
- [ ] All listed tests pass
- [ ] Typecheck passes, so every fake matches its port

## Depends on
#02, #03

## Labels
`test`

## Estimate
M
