# 65: Public API contract tests with a fake consumer extension

**Iteration:** 9 (Public API)

## Description
Prove the API works for a real second extension, the way the planned multi-repo chat extension will use it. Add a test-only fixture extension, `test/fixtures/fake-consumer/`, that declares `extensionDependencies: ["RemonStuff.q0t4"]`, gets the API through `vscode.extensions.getExtension("RemonStuff.q0t4").activate()`, and exercises every method against the fake model provider (#05). The contract is versioned: these tests pin `apiVersion: 1`, so any breaking change fails them.

## Tests to write first
*(integration)*
- `the consumer can activate Q0T4 and receives apiVersion 1`
- `getStatus returns every known subject with weekly and cycle figures`
- `canSpend answers without recording`
- `sendRequest streams the fake reply and the ledger file gets an entry with source "api:test.fake-consumer"`
- `sendRequest is cut off at a tiny budget`
- `onDidChangeUsage fires in the consumer after its own sendRequest and after a participant request`
- `two consumers get separate sources but share the subject's budget`
- `the API's exported type file matches the runtime shape` (type-level check of `src/api.d.ts` against the object)

## Implementation tasks
- [ ] `test/fixtures/fake-consumer/` (package.json + extension.js with test commands)
- [ ] Add it to `.vscode-test.mjs` extension development paths
- [ ] `docs/api.md`: how to consume the API, with the example from the fixture

## Acceptance criteria
- [ ] The listed tests pass, core coverage holds, and CI is green with a `.vsix` artifact

## Depends on
#64

## Labels
`test`, `feature`

## Estimate
M
