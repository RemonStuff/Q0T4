# 07: Stub sticky participant and installable .vsix

**Iteration:** 0 (Test harness)

## Description
End iteration 0 with something installable. Contribute the `@q0t4` chat participant (sticky, with `/status`, `/subjects` and `/use` declared) and have it reply with a fixed message: "Q0T4 is installed. Budgeting isn't wired up yet." This proves that the contribution, activation and packaging all work.

## Tests to write first
- *(unit)* `stubReply returns the not-wired-yet message`: a trivial core function, so the handler has a core seam from day one
- *(integration)* `package.json contributes chat participant q0t4 with isSticky true`
- *(integration)* `participant declares commands status, subjects and use`
- *(integration)* `handleRequest writes the stub message to the response stream`

## Implementation tasks
- [ ] `contributes.chatParticipants`: `{ id: "q0t4.chat", name: "q0t4", fullName: "Q0T4", isSticky: true, commands: [status, subjects, use] }`
- [ ] `vscode.chat.createChatParticipant` in `extension.ts`, delegating to core
- [ ] `extensionDependencies: ["github.copilot-chat"]`: **decision re-opened by #5** (PLAN open question 1). Copilot Chat is built into VS Code now, and a fresh test profile doesn't load it, so the dependency would stop Q0T4 activating in integration tests. Recommended: leave it out.
- [ ] Test, depending on that decision: *(integration)* either `package.json declares extensionDependencies github.copilot-chat`, or `Q0T4 activates without Copilot Chat present`
- [ ] Placeholder participant icon

## Acceptance criteria
- [ ] The listed tests pass, CI is green, and CI produces a `.vsix` artifact
- [ ] Manual: install the `.vsix`, open Copilot Chat, send `@q0t4 hi`, see the stub reply, and check that the next message stays on `@q0t4` (sticky)

## Depends on
#05, #06

## Labels
`feature`, `infra`

## Estimate
S
