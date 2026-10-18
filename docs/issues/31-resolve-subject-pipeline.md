# 31: Core `resolveSubject` pipeline

**Iteration:** 4 (Repo subjects)

## Description
Combine the detectors in order, stopping at the first that answers:
1. `/use <subject>`
2. The thread subject (from history metadata)
3. The current repo (#27, #30)
4. `fallbackSubject` when no folder is open

Resolving never calls a model and costs no tokens. The result also says *how* the subject was chosen, shown as a short progress note (e.g. "Subject: RemonStuff/Q0T4 (repo)") so it's visible and debuggable.

## Tests to write first
- `/use wins over the thread subject and the repo`
- `the thread subject wins over the current repo`
- `the current repo is used when there is no /use and no thread subject`
- `falls back to fallbackSubject when no folder is open`
- `reports the source: use, thread, repo or fallback`
- `never calls the model`
- `handler shows a progress note naming the subject and source`

## Implementation tasks
- [ ] `src/core/subjects/resolveSubject.ts`
- [ ] Call it first in `chatHandler`

## Acceptance criteria
- [ ] The listed tests pass, core coverage holds, and CI is green

## Depends on
#27, #28, #29, #30

## Labels
`feature`

## Estimate
S
