# 12: Attached references

**Iteration:** 1 (Walking skeleton)

## Description
Include the user's attached context (`#file`, selections and so on) in the messages, because the spec's order is "history, attached references, prompt". `ChatPromptReference.value` is `string | Uri | Location | unknown`. A new `ReferenceReaderPort` resolves each one to `{ label, text }`. Unknown values (images, tool data) are skipped, with a single progress note. Core formats each reference as a labelled fenced block in one user message placed before the prompt.

## Tests to write first
*(unit, core)*
- `adds one user message with reference blocks before the prompt`
- `formats each reference with its label and a fenced block`
- `uses string reference values as they are`
- `skips references the reader cannot resolve and reports them once`
- `adds no reference message when there are no references`
- `keeps reference order stable (reverse of the API's reverse-sorted order)`

*(integration, adapter)*
- `referenceReader reads a workspace file Uri`
- `referenceReader reads only the range of a Location`
- `referenceReader returns undefined for unknown values`

## Implementation tasks
- [ ] `ReferenceReaderPort` (signature from #03) and `src/adapters/referenceReader.ts` using `workspace.fs.readFile` / `openTextDocument`
- [ ] Extend `buildMessages` with a `references` input
- [ ] Choose a fence that can't collide with backticks in the file

## Acceptance criteria
- [ ] The listed tests pass, core coverage holds, and CI is green
- [ ] Manual: `@q0t4 #file:package.json what is the name?` gets the right answer

## Depends on
#08, #11

## Labels
`feature`

## Estimate
M
