# 28: Core thread subject from history metadata

**Iteration:** 4 (Repo subjects)

## Description
Detection step 2. The API has no thread ID, so the thread's subject is the `metadata.subject` of the **newest** response turn in `ChatContext.history` that carries valid Q0T4 metadata.

## Tests to write first
- `returns the subject from the newest response turn's metadata`
- `returns undefined for an empty history`
- `skips response turns without metadata`
- `skips metadata that fails isResultMetadata`
- `accepts any non-empty subject name, since repos don't need to be configured`
- `ignores an empty or whitespace-only subject`
- `a /use turn later in history overrides an earlier subject` (because it's newer)
- `refused turns still carry the subject`, so the thread keeps it

## Implementation tasks
- [ ] `src/core/subjects/threadSubject.ts`
- [ ] Make sure `HistoryTurn` carries metadata through the adapter (#11)

## Acceptance criteria
- [ ] The listed tests pass, core coverage holds, and CI is green

## Depends on
#18, #26

## Labels
`feature`

## Estimate
S
