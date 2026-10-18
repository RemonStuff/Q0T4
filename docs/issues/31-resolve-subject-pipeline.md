# 31: Core `resolveSubject` pipeline

**Iteration:** 4 (Subjects)

## Description
Combine the detectors in the order from the spec, stopping at the first that answers:
1. `/use <subject>`
2. The thread subject
3. A keyword match
4. The classifier
5. `fallbackSubject`

The result also says *how* the subject was chosen, so it can be shown as a short progress note (e.g. "Subject: frontend (keyword: react)") and debugged.

## Tests to write first
- `/use wins over the thread subject and keywords`
- `the thread subject wins over a keyword match`
- `a keyword match is used before the classifier, and the classifier is not called`
- `the classifier is used when no keyword matches`
- `falls back to fallbackSubject when the classifier fails`
- `reports the source: use, thread, keyword, classifier or fallback`
- `returns classifier tokens only when the classifier ran`
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
