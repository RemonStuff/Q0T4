# 35: `/subjects` list

**Iteration:** 5 (Visibility)

## Description
`@q0t4 /subjects` lists every known subject (see #29) with its weekly limit, where that limit comes from (configured, or `defaultLimit`) and its description if it has one. It marks the current repo, the fallback subject and the current thread subject, and gives a hint on using `/use <subject>` and on setting a repo's limit. No model call.

## Tests to write first
- `lists every known subject with its limit and description`
- `marks limits from defaultLimit as "(default)"`
- `marks the current repo`
- `marks the fallback subject`
- `marks the current thread subject when there is one`
- `shows the default limit that applies to any new repo`
- `ends with /use and settings hints`
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
