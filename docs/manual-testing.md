# Manual testing

**Almost everything is automated.** The rule (decided 2026-10-19): if a check can run headless, it's a test, not a checklist item.

| What | Automated by |
|---|---|
| Behaviour of the code | Unit tests (`npm test`) and integration tests (`npm run test:integration`), using a fake model |
| The packaged `.vsix`: installs, ships no sources, activates, contributes the participant and commands, replies | `.vsix` smoke tests (`npm run test:vsix`, `test/vsix/`). CI runs them on every build before uploading the artifact. |

This page lists only what **can't** be automated, and why.

## What still needs a human, and why

VS Code doesn't submit chat input in a test instance without a signed-in Copilot: there's no model at the input ("no-model-at-toolbar-build"), even with a fake model registered as selectable. The only setting that unlocks chat, `chat.allowAnonymousAccess`, goes through real Copilot services, which tests must never call. So typing into the real Chat view can't be tested headless. Investigated in #7.

What this leaves to normal use, with your own Copilot; no separate test pass is needed:

- [ ] `@q0t4 …` typed in the Chat view reaches Q0T4. The participant contribution and handler are tested; only VS Code's own routing isn't.
- [ ] A follow-up message without `@q0t4` still goes to Q0T4 (sticky). `isSticky: true` is tested in the installed manifest; only VS Code honouring it isn't.

Report anything off with the bug template; the fix starts with a failing test.
