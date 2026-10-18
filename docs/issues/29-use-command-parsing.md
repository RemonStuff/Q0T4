# 29: Core `/use` parsing

**Iteration:** 4 (Subjects)

## Description
Detection step 1. When `request.command === "use"`, the prompt reads `<subject> <question>`. Parse it in pure core. With no question, the thread subject is set and confirmed without calling the model (default answer to open question 7). An unknown subject is an error that lists the valid subjects.

## Tests to write first
- `parses '/use frontend how do I center a div' as subject frontend plus the question`
- `subject match is case-insensitive`
- `preserves the question's whitespace and newlines after the subject`
- `'/use frontend' with no question returns setOnly`
- `unknown subject returns an error listing the configured subjects`
- `empty '/use' returns usage help`
- `handler with setOnly writes a confirmation and returns metadata with the subject but zero tokens`

## Implementation tasks
- [ ] `src/core/subjects/parseUse.ts` returning `{ kind: "ask", subject, question } | { kind: "setOnly", subject } | { kind: "error", message }`
- [ ] Formatter for the confirmation and error messages

## Acceptance criteria
- [ ] The listed tests pass, core coverage holds, and CI is green

## Depends on
#26

## Labels
`feature`

## Estimate
S
