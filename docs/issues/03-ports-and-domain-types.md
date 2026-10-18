# 03: Port interfaces and core domain types

**Iteration:** 0 (Test harness)

## Description
Define the small interfaces core uses to reach the outside world, plus the shared domain types. These are the contracts that the fakes (#04) and adapters implement. Keep them minimal: add a member only when a test needs it.

The types are **unit-agnostic** from the start. Budgets can be measured in tokens or GitHub AI Credits ([PLAN §9](../PLAN.md#9-credits-cycles-pools-and-the-public-api)), so amounts are a `Cost` and usage is stored as ledger entries ([PLAN §4](../PLAN.md#4-data-model-an-append-only-ledger)).

- **Ports:** `ModelPort`, `ModelSelectorPort`, `StoragePort`, `LedgerPort`, `PriceSourcePort`, `PriceTableStorePort`, `ClockPort`, `ConfigPort`, `ChatOutputPort`, `UiPort`, `ReferenceReaderPort`, `CancellationSignal`. Signatures are in [PLAN §2](../PLAN.md#2-architecture).
- **Domain types:**
  - `SubjectName`, `SubjectConfig`, `Q0T4Config`
  - `ChatMessage { role: "user" | "assistant"; text }`, `HistoryTurn`, `ModelErrorKind`
  - `BudgetUnit = "tokens" | "credits"`
  - `Cost { tokens: number; credits?: number }`
  - `RateSnapshot { input; output; tier; tableDate; tableSource }`
  - `LedgerEntry` (v1, kinds `usage` | `untracked` | `reset` | `budget` | `reserve-grant`)
  - `PriceTable`
  - `ResultMetadata { v: 1; subject; model; unit; inputTokens; outputTokens; cost; stopped }`, where `model` is the answering model's display name, or `undefined` when no model was called

## Tests to write first
- `ResultMetadata round-trips through JSON.stringify/parse unchanged`: `ChatResult.metadata` must be JSON-serialisable
- `isResultMetadata accepts a valid v1 object in each unit`
- `isResultMetadata rejects missing subject, wrong version, unknown unit and non-numeric counts`
- `LedgerEntry round-trips through JSON unchanged`
- `isLedgerEntry accepts a valid usage entry with and without credits`
- `isLedgerEntry rejects an unknown kind, a missing subject or day, and negative token counts`
- `a vscode-shaped CancellationToken is assignable to CancellationSignal`: a type-level `expectTypeOf` test against a local copy of the shape

## Implementation tasks
- [ ] `src/ports/*.ts`: one file per port, types only
- [ ] `src/core/types.ts` with the domain types and the `isResultMetadata` / `isLedgerEntry` guards
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
