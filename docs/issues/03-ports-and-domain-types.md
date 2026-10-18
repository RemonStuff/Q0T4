# 03: Port interfaces and core domain types

**Iteration:** 0 (Test harness)

## Description
Define the small interfaces core uses to reach the outside world, plus the shared domain types. These are the contracts that the fakes (#04) and adapters implement. Keep them minimal: add a member only when a test needs it.

- **Ports:** `ModelPort`, `ModelSelectorPort`, `StoragePort`, `ClockPort`, `ConfigPort`, `ChatOutputPort`, `UiPort`, `ReferenceReaderPort`, `CancellationSignal`. Signatures are in [PLAN §2](../PLAN.md#2-architecture).
- **Domain types:** `SubjectName`, `SubjectConfig`, `Q0T4Config`, `ChatMessage { role: "user" | "assistant"; text }`, `HistoryTurn`, `ResultMetadata { v: 1; subject; model; inputTokens; outputTokens; classifierTokens; stopped }` (`model` is the answering model's display name, or `undefined` when no model was called), `DayUsage`, `ModelErrorKind`.

## Tests to write first
- `ResultMetadata round-trips through JSON.stringify/parse unchanged`: `ChatResult.metadata` must be JSON-serialisable
- `isResultMetadata accepts a valid v1 object`
- `isResultMetadata rejects missing subject, wrong version and non-numeric counts`
- `a vscode-shaped CancellationToken is assignable to CancellationSignal`: a type-level `expectTypeOf` test against a local copy of the shape

## Implementation tasks
- [ ] `src/ports/*.ts`: one file per port, types only
- [ ] `src/core/types.ts` with the domain types and the `isResultMetadata` guard
- [ ] A doc comment on each port naming the adapter that will implement it

## Acceptance criteria
- [ ] The listed tests pass and core coverage holds
- [ ] No port mentions a `vscode` type

## Depends on
#01

## Labels
`feature`

## Estimate
S
