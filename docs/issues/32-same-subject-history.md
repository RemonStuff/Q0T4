# 32: Same-subject history filter and `includeHistory`

**Iteration:** 4 (Subjects)

## Description
The spec sends only **same-subject** history. Filter the history pairs by the subject in each response's metadata. A request turn goes with the response turn that follows it. When `includeHistory` is false, send no history at all.

## Tests to write first
- `keeps request/response pairs whose response metadata matches the current subject`
- `drops pairs from other subjects`
- `drops pairs whose response has no Q0T4 metadata`
- `keeps chronological order after filtering`
- `sends no history when includeHistory is false`
- `still includes references and the prompt when history is disabled`

## Implementation tasks
- [ ] `filterHistoryBySubject` in `core/messages`
- [ ] Pass `subject` and `includeHistory` into `buildMessages`

## Acceptance criteria
- [ ] The listed tests pass, core coverage holds, and CI is green

## Depends on
#28

## Labels
`feature`

## Estimate
S
