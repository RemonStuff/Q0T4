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
- [x] Reuse the existing `ReferenceReaderPort` and fake from #03/#04; implement `src/adapters/referenceReader.ts` using `openTextDocument`
- [x] Extend `buildMessages` with a resolved `references` input, preserving pure formatting and the existing history behavior
- [x] Choose a fence longer than any backtick run in the content
- [x] Wire request references and the reader into the registered handler and existing test API

## Behavior and automated proof

- Order: completed history, one user message containing labelled reference blocks, then the unchanged prompt.
- Reverse a copy of the API's reference list. IDs identify kinds, not individual files; do not deduplicate by ID.
- Preserve strings exactly. File URIs use current document text, including unsaved changes. Location references use only their range; labels show one-based line/column boundaries.
- Skip unsupported values, image data, common binary image file types and NUL-containing document text. Emit one progress note per request, not one per skipped reference.
- A genuine read failure reports a safe attachment-specific error and makes no model request. Cancellation suppresses further reads/output and model sending; pending document opens have no cancellation API.
- Core red: 15 expected failures and five passing tests before implementation. Core green: 175 unit tests, with 100% core line and branch coverage.
- Initial hosted red: run [39276985647](https://github.com/RemonStuff/Q0T4/actions/runs/39276985647), source `5beb3e9`, confirmed seven actual adapter failures before implementation. Its three handler and three installed-package failures were later found to come from a request-copying bug in the test harness, so they are not forwarding red evidence.
- The request factory accepts references directly, without evaluating the guard-only tool-token getter.
- Corrected hosted red: run [39381703657](https://github.com/RemonStuff/Q0T4/actions/runs/39381703657),
  source `b65e5e2`, restored only the preserved pre-wiring producer in a
  disposable checkout. Both integration and installed-package profiles reported
  three actual assertion failures, with no setup/getter errors. The temporary
  expected-red workflow has been removed.
- Hosted green on the actual wired source `b65e5e2`:
  [PR CI 39381709163](https://github.com/RemonStuff/Q0T4/actions/runs/39381709163)
  and [push CI 39381703689](https://github.com/RemonStuff/Q0T4/actions/runs/39381703689)
  passed. Each ran 57 integration and 12 installed-VSIX tests, plus unit coverage
  on Ubuntu and Windows, and uploaded the tested package. Final-head ordinary CI
  remains required before merge.
- Integration and installed-VSIX tests inspect actual fake-provider messages for full files, selections, literal strings, ordering, repeated IDs, skipped references and read failures. A scripted answer alone is not proof.
- Assistant-run VS Code tests execute only on GitHub-hosted runners, inspected through `gh`. No automated test calls real Copilot.

## Acceptance criteria
- [x] The listed tests pass, core coverage holds, and CI is green
- [x] The former manual attachment check is automated by verifying the exact context delivered to the model, including the installed package. Only typed Chat-view routing and stickiness remain normal-use checks, as agreed in #07/#11.

## Depends on
#08, #11

## Labels
`feature`

## Estimate
M
