# Manual testing

**Almost everything is automated.** The rule (decided 2026-10-19): if a check can run headless, it's a test, not a checklist item.

| What | Automated by |
|---|---|
| Behaviour of the code | Unit tests (`npm test`) and integration tests (`npm run test:integration`), using a fake model |
| Message/history conversion, token-count delegation, output and cancellation resource cleanup | Adapter integration tests (`npm run test:integration`), including closure before the first chunk and failure paths |
| Attached file/string/selection content, ordering, unsupported values and safe read failures | Adapter and real-handler tests plus installed-VSIX tests inspect the actual fake-provider messages |
| The packaged `.vsix`: installs, ships no sources, activates, contributes the participant and commands, streams replies, switches models and cancels the provider | `.vsix` smoke tests (`npm run test:vsix`, `test/vsix/`). CI runs them on every build before uploading the artifact. |

Iteration 1's forwarding, selected-model switching and cancellation checks run against the fake `q0t4-test` provider in real VS Code, including the installed package. The cancellation tests wait for the provider to confirm it saw cancellation; stopping visible text alone is not proof. No automated test calls real Copilot, and no separate manual model test is required.

This page lists only what **can't** be automated, and why.

Assistant-run integration and installed-VSIX tests run on GitHub-hosted runners, monitored through `gh`, not in local test VS Code windows. Lint, typechecks and unit tests run locally. Expected-red hosted checks are temporary test-first evidence, not final acceptance.

## What still needs a human, and why

VS Code doesn't submit chat input in a test instance without a signed-in Copilot: there's no model at the input ("no-model-at-toolbar-build"), even with a fake model registered as selectable. The only setting that unlocks chat, `chat.allowAnonymousAccess`, goes through real Copilot services, which tests must never call. So typing into the real Chat view can't be tested headless. Investigated in #7.

What this leaves to normal use, with your own Copilot; no separate test pass is needed:

- [ ] `@q0t4 …` typed in the Chat view reaches Q0T4. The participant contribution and handler are tested; only VS Code's own routing isn't.
- [ ] Open this repo (`RemonStuff/Q0T4`) as the folder, send a message to `@q0t4`: a note "Subject: RemonStuff/Q0T4 (repo)" appears and the footer names `RemonStuff/Q0T4`. A second message in the same conversation says `(thread)`.
- [ ] Add `"RemonStuff/Q0T4": { "weeklyLimit": 2000 }` to `q0t4.subjects` and chat until the request is refused; then `/use general hello` still answers and its footer says `general`.
- [ ] Open a folder that isn't a git repo: the subject is the folder name. Close the folder: the subject is `general` and the note says `(fallback)`.
- [ ] `/use general` alone replies with a confirmation, and the next message in the conversation is charged to `general`. `/use typo hi` lists the known subjects and sends nothing.
- [ ] Open Settings and search for `Q0T4`: the section lists subjects, default limit, fallback subject, reset day, both warning levels and include history, each with its default. The defaults match the code (a unit test compares `package.json` with the core defaults); only how the Settings UI renders them isn't tested.
- [ ] A follow-up message without `@q0t4` still goes to Q0T4 (sticky). `isSticky: true` is tested in the installed manifest; only VS Code honouring it isn't.
- [ ] After a real chat, the footer (`*general: … / 200k this week · resets Mon · <model>*`) shows a total that grows with each reply, and it is still there after **Developer: Reload Window**. The footer text, totals and persistence are tested with the fake model; only a real Copilot tokenizer isn't.
- [ ] With two VS Code windows open on different repos, chat in both: each footer's total includes the other window's usage on the next request. Concurrent appends from two writers are tested; only two real windows aren't.
- [ ] Optional, in a dev build: lower `DEFAULT_SUBJECTS.general.weeklyLimit` and check the refusal and the `⛔` cut-off by hand. Both are tested with a limit override; this only confirms how they look in the Chat view.

For normal use, sign in to Copilot and choose a model in Chat. `@q0t4` forwards your prompt, history and explicitly attached text/files/selections, and meters the usage of one shared subject, `general`, against 200,000 tokens a week. Slash commands are not implemented.

Report anything off with the bug template; the fix starts with a failing test.
