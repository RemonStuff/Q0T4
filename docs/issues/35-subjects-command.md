# 35: `/subjects` list

**Iteration:** 5 (Visibility)

## Description
`@q0t4 /subjects` lists each configured subject with its weekly limit, description and keywords. It marks the fallback subject and the current thread subject, and gives a hint on using `/use <subject>`. No model call.

## Tests to write first
- `lists every subject with limit, description and keywords`
- `marks the fallback subject`
- `marks the current thread subject when there is one`
- `shows "no keywords (classifier only)" for subjects without keywords`
- `ends with a /use usage hint`
- `handler /subjects does not call the model or record usage`

## Implementation tasks
- [ ] `src/core/format/subjectList.ts`
- [ ] Command branch in `chatHandler`
- [ ] Add `button(commandId, title)` to `ChatOutputPort` (and to `RecordingOutput` and the `chatStreamOutput` adapter), then end the list with an "Edit Subjects" button for `q0t4.editSubjects`. The command itself is registered in #37; until then the button is inert.

## Acceptance criteria
- [ ] The listed tests pass, core coverage holds, and CI is green

## Depends on
#33

## Labels
`feature`

## Estimate
S
