# 29: Core `/use` parsing

**Iteration:** 4 (Repo subjects)

## Description
Detection step 1, the manual override. When `request.command === "use"`, the prompt reads `<subject> <question>`, where the subject is a repo (`owner/repo`) or a name such as `general`. Parse it in pure core.

The subject must be a **known subject**: a key in `q0t4.subjects`, the fallback subject, a subject with usage in the last 12 weeks, or the current repo. This stops typos from silently creating new budgets. With no question, `/use` sets the thread subject and confirms without calling the model.

## Tests to write first
- `parses '/use general how do I center a div' as subject general plus the question`
- `parses an owner/repo subject: '/use acme/web-app why is the build slow'`
- `subject match is case-insensitive and returns the canonical casing`
- `preserves the question's whitespace and newlines after the subject`
- `'/use general' with no question returns setOnly`
- `accepts a subject that only appears in usage history`
- `accepts the current repo even when it has never been used`
- `unknown subject returns an error listing the known subjects`
- `empty '/use' returns usage help listing the known subjects`
- `handler with setOnly writes a confirmation and returns metadata with the subject but zero tokens`

## Implementation tasks
- [ ] `src/core/subjects/knownSubjects.ts`: configured keys ∪ fallback ∪ subjects seen by `BudgetStore` ∪ current repo
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
