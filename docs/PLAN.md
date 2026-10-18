# Q0T4: Plan

Q0T4 is a VS Code extension that adds a chat participant, `@q0t4`, to the Copilot Chat panel. It forwards your prompts to Copilot's language models and gives each **subject** a **weekly token budget**. Every prompt is assigned to a subject, its tokens are counted, and once a subject has used up its weekly limit, chats on that subject stop until the week resets.

The project is test-driven throughout. This document covers the architecture, the data model, the risks and the testing rules. The work itself is broken down in [ROADMAP.md](ROADMAP.md) and [issues/](issues/).

---

## 1. Spec vs API (researched against `@types/vscode` 1.140.0)

| Spec item | What the API actually offers | Our approach |
|---|---|---|
| Use `request.model` | `ChatRequest.model: LanguageModelChat` is **non-optional**. It's the model picked in the chat UI and shouldn't be held after the request ends. | Use it. Fall back to `vscode.lm.selectChatModels({ vendor: "copilot" })` only when sending fails with `LanguageModelError.NotFound`, or when `classifierModelFamily` names a different family. |
| Count tokens with `countTokens()` | `countTokens(text: string \| LanguageModelChatMessage, token?)` returns `Thenable<number>`. **Responses don't report usage**, so there are no prompt or completion token counts. | Input = the sum of `countTokens(message)` over every message we send. Output = `countTokens(accumulatedText)`. Message-framing overhead isn't visible to us. That's documented as one reason our numbers differ from GitHub's. |
| Cancel the stream when the budget is reached | There is no portable max-output-tokens option (`modelOptions` depends on the vendor). We cancel by cancelling the token passed to `sendRequest` or by breaking out of `for await`. | Give the model its own `CancellationTokenSource`, linked to the chat's token, and cancel it from the `StreamGuard`. Tokens that arrive before cancellation still count. The overshoot is limited to one recount interval (see §5). |
| Reuse the subject for each thread | **There's no thread or session ID.** `ChatContext.history` contains only *this participant's* turns, and `ChatResponseTurn.result.metadata` comes back exactly as we returned it. | Thread = the history we're given. The thread's subject is `metadata.subject` from the newest `ChatResponseTurn`. Metadata must be JSON-serialisable. |
| Send same-subject history | `ChatResponseTurn.response` holds the markdown parts we streamed, **including our footer and warnings**. | Emit the footer and warnings after a sentinel (`<!-- q0t4:footer -->`). The pure history builder strips everything from the sentinel on. |
| Messages sent to the model | `LanguageModelChatMessageRole` has only `User` and `Assistant`, with **no System role**. | Send instructions as a leading `User` message, for both the classifier and any future preamble. |
| Attached references | `ChatPromptReference.value: string \| Uri \| Location \| unknown`. | `ReferenceReaderPort` reads Uri files and Location ranges. Strings are used as they are. Unknown values and images are skipped, with a progress note. |
| Sticky participant and slash commands | These are declared in package.json under `contributes.chatParticipants[]` with `isSticky: true` and `commands: [status, subjects, use]`. At runtime `request.command` holds the name, and the `/use` argument is the start of `request.prompt`. | Parse `/use` in pure core. |
| Consent and quota errors | The first `sendRequest` shows a consent dialog. Failures are `LanguageModelError` with `code` set to `NoPermissions`, `NotFound`, `Blocked` or `Unknown`. `ExtensionContext.languageModelAccessInformation.canSendRequest(model)` checks consent without prompting. | The adapter maps these to a core `ModelErrorKind`, and core turns each kind into a friendly message and a recording policy (issue 38). |
| Context window | `LanguageModelChat.maxInputTokens` is exposed. | Drop the oldest history turns until the input fits, before the budget pre-check (issue 39). |
| `extensionDependencies: ["github.copilot-chat"]` | With this dependency, the extension **won't activate** in the integration-test VS Code instance unless Copilot Chat is installed and signed in. Copilot Chat is also being merged into core VS Code, so the ID may change. | **Kept (decided).** Integration tests install `github.copilot-chat` into the test instance so activation succeeds, while models come from the fake `q0t4-test` provider. Q0T4 still handles "no models" gracefully at runtime. |
| Integration testing the participant | No public API invokes a chat participant or lists participants. `vscode.lm.registerLanguageModelChatProvider` **is stable**. | A test-only fixture extension registers a fake vendor `q0t4-test`. `activate()` returns a small test API (`handleRequest`, `store`) that integration tests call with a recording response stream. |
| Tool references (`request.toolReferences`) | Not covered by the spec. | Ignored in v1 and documented as a known limit. |

---

## 2. Architecture

Q0T4 uses ports and adapters. All logic lives in `src/core/`, which never imports `vscode`; an ESLint `no-restricted-imports` rule enforces that. VS Code is reached only through small interfaces in `src/ports/`, each implemented by a thin adapter in `src/adapters/`. `src/extension.ts` is the composition root.

```
src/
  core/
    budget/      preCheck, StreamGuard (adaptive recount + cut-off), recordingPolicy
    time/        weekStart, dayKey, nextReset (Intl.DateTimeFormat with the IANA zone from ClockPort)
    storage/     BudgetStore over StoragePort: schema v1, pruning, corruption handling
    subjects/    parseSubjects, matchKeywords, threadSubject, parseUse, classifier, resolveSubject
    messages/    buildMessages (history filter, footer strip, references, prompt), trimToWindow
    format/      tokens (112k / 1.2M), footer, warnings, refusal, statusTable, subjectList, statusBarText
    errors/      ModelErrorKind → user-facing message
    chatHandler.ts   orchestrates one request through the ports
    types.ts     domain types (Subject, SubjectConfig, Usage, ChatTurn, ResultMetadata…)
  ports/
    ModelPort            sendRequest(messages, signal) → AsyncIterable<string>; countTokens(text|msg); id, family, vendor, maxInputTokens
    ModelSelectorPort    select({ vendor?, family? }) → ModelPort[]
    StoragePort          get<T>(key), set(key, value), keys()
    ClockPort            now(): Date; timeZone(): string (IANA)
    ConfigPort           get(): Q0T4Config; onDidChange(cb)
    ChatOutputPort       markdown(text), progress(text)
    UiPort               setStatusBar(state), confirm(message) → boolean, openSettings(query), showInfo(text)
    ReferenceReaderPort  read(ref) → { label, text } | undefined
    CancellationSignal   { isCancellationRequested; onCancellationRequested(cb) } (vscode.CancellationToken fits structurally)
  adapters/
    vscodeModel, vscodeModelSelector, globalStateStorage, systemClock, vscodeConfig,
    chatStreamOutput, vscodeUi, referenceReader, errorMapping
  extension.ts           registers the participant and commands; returns the test API
test/
  unit/                  Vitest, mirrors src/core
  fakes/                 FakeModel, FakeModelSelector, InMemoryStorage, FixedClock, FakeConfig,
                         RecordingOutput, FakeUi, FakeReferenceReader, FakeCancellation
  integration/           @vscode/test-cli suites
  fixtures/fake-lm-provider/   test-only extension registering vendor "q0t4-test"
```

### Request flow (`chatHandler`)

1. **Parse the command.** `/status` and `/subjects` render and return. `/use` is parsed in pure core.
2. **Resolve the subject**, in this order: `/use` argument → thread subject (history metadata) → whole-word keyword match → classifier model (its tokens are charged to the chosen subject) → `fallbackSubject`.
3. **Build the messages:** same-subject history when `includeHistory` is on (footers stripped), then attached references, then the prompt. Trim to fit `maxInputTokens`.
4. **Count input** with `countTokens` per message.
5. **Pre-check:** refuse if `used + input > limit`. The refusal shows used, limit, remaining and reset date, and the classifier tokens are still recorded.
6. **Stream** chunks to the output through `StreamGuard`, which recounts output at adaptive intervals and cancels with a "⛔ Stopped" note once `used + input + output ≥ limit`.
7. **`finally`** (always, including on cancel and error): record input + output (+ classifier) for today, then write the sentinel, the footer `*frontend: 112k / 150k this week · resets Mon*` and any ⚠️ warnings (`warnAtPercent`, daily pace).
8. **Return** `{ metadata: { v: 1, subject, inputTokens, outputTokens, classifierTokens, stopped } }`.

### Module responsibilities

| Module | Pure? | Responsibility |
|---|---|---|
| `core/time` | yes | Week start for a given `resetDay` and IANA zone, day keys, next reset instant, and labels like "Mon" and "Mon 19 Oct". |
| `core/storage` | yes (through StoragePort) | Reading and writing usage, summing the week window, today's total, pruning, quarantining corrupt data. |
| `core/budget` | yes | Pre-check decision, StreamGuard scheduling and cut-off, the rules for what gets recorded when. |
| `core/subjects` | yes (classifier through ModelPort) | Validating config, keyword matching, thread subject, `/use`, classifier prompt and parsing, the resolution pipeline. |
| `core/messages` | yes | Building the message list, filtering history, stripping footers, reference blocks, trimming to the context window. |
| `core/format` | yes | Every user-visible string: footer, warnings, refusal, `/status` table, `/subjects` list, status bar text. |
| `adapters/*` | no | Thin wrappers that turn VS Code objects into port types. Each one is covered by an integration test and contains no logic. |

---

## 3. Settings (`q0t4.*`)

| Key | Type | Default |
|---|---|---|
| `subjects` | `{ [name]: { weeklyLimit: number; description?: string; keywords?: string[] } }` | `general` 200 000; `frontend` 150 000 (react, css, html, tsx, component, tailwind); `backend` 150 000 (api, sql, database, endpoint, server, auth) |
| `fallbackSubject` | string | `"general"` |
| `resetDay` | enum monday…sunday | `"monday"` |
| `warnAtPercent` | number 1–100 | `80` |
| `dailyPaceWarning` | number 1–100 (% of the weekly limit used in one day; warning only) | `30` |
| `classifierModelFamily` | string (`""` = the chat's model) | `""` |
| `includeHistory` | boolean | `true` |

Invalid values never throw. `parseSubjects` falls back to the defaults for any broken entry and reports a warning (issue 26).

---

## 4. Data model (globalState)

There's one key per week: `q0t4.usage.v1.<weekStart YYYY-MM-DD>`, where the date is the local week start in the user's time zone.

```json
{
  "v": 1,
  "weekStart": "2026-10-12",
  "resetDay": "monday",
  "subjects": {
    "frontend": {
      "days": {
        "2026-10-14": { "input": 41200, "output": 18800, "classifier": 0, "requests": 7, "stopped": 0 }
      }
    }
  }
}
```

- **Weekly usage** is the sum of the **day** entries whose date falls in the current week window. Entries from neighbouring week keys are included too, so changing `resetDay` mid-week never loses or double-counts usage.
- **Today** is the day entry for `dayKey(now, tz)` and drives the daily pace warning.
- **Retention:** keys older than 12 weeks are pruned on activation.
- **Corruption:** a value that fails validation is moved to `q0t4.usage.corrupt.<timestamp>` and treated as empty. It is never thrown.
- **Concurrency:** writes are read-modify-write per request, re-reading immediately before `set`, so updates from another VS Code window are rarely lost. The remaining race is documented.
- **Other keys:** `q0t4.ui.lastSubject` drives the status bar.
- Nothing is synced across machines (decided, open question 4).

---

## 5. Key technical risks

| Risk | Impact | Mitigation |
|---|---|---|
| **The cut-off happens in the extension.** The model keeps generating until our cancellation takes effect. | A small overshoot past the limit. | StreamGuard recounts every ~400 characters while far from the limit and on **every chunk** once the estimated remaining budget is below 10% (or under 2× the last chunk). Overshoot is bounded by one interval, recorded honestly, and documented. |
| **`countTokens` latency.** It may be async, IPC-backed and slow on long texts. | Slower streaming. | Adaptive recounting with a cheap `chars/4` estimate between recounts. Recount only the accumulated text, never per chunk while far from the limit. Covered by FakeModel call-count tests. |
| **Our counts ≠ GitHub's metering.** Copilot bills *premium requests*, not tokens, and our count leaves out framing and hidden system prompts. | User confusion. | README "Known limits". The footer says "this week" and never claims to match billing. The classifier may itself use a premium request (open question 3). |
| **The footer pollutes history.** It's part of `ChatResponseTurn.response`. | Wasted tokens, and the model echoes footers. | Sentinel plus stripping in pure core. Tests cover a missing sentinel and sentinel-like text in user content. |
| **No thread ID.** | The subject can't be stored per thread. | Derive it from history metadata. Tests cover missing or old metadata and subjects that have since been removed. |
| **Time zones and DST.** | The wrong week or day bucket. | `ClockPort.timeZone()` (IANA) plus `Intl.DateTimeFormat` in core, so results never depend on the machine's `TZ`. FixedClock tests cover DST in both directions, the year boundary and ±14h zones. CI runs unit tests on Linux and Windows. |
| **Races between windows** on globalState. | A rarely lost increment. | Re-read before writing, small per-week keys, documented. |
| **The Copilot dependency in tests.** | Without Copilot Chat installed, the extension doesn't activate in the test instance. | The test config installs `github.copilot-chat` (no sign-in needed to activate), and the fake LM provider fixture supplies the models. The VS Code test version is pinned to one that Copilot Chat supports. No test ever calls real Copilot. |
| **Consent dialog / `NoPermissions`.** | The first request fails or blocks. | Friendly message with a retry hint, and nothing charged (issue 38). |
| **Context window overflow.** | `sendRequest` rejects. | `trimToWindow` drops the oldest history first, and refuses with a clear message if the prompt alone doesn't fit. |
| **API churn** (chat APIs move fast). | Breakage. | Pin `engines.vscode` and `@types/vscode` to the same minor version and keep every API touch in adapters, so changes stay in one place. |

---

## 6. Open questions

1. ✅ **Decided: keep `extensionDependencies: ["github.copilot-chat"]`** (Q0T4 is used with a work Copilot subscription). Integration tests therefore install `github.copilot-chat` into the test VS Code instance (`installExtensions` in `.vscode-test.mjs`), and models still come from the fake `q0t4-test` provider. The test VS Code version is pinned to one that the installed Copilot Chat supports (issues 05, 07).
2. ✅ **Decided: no.** Nothing is charged when `sendRequest` rejects before the first chunk. Input + output are charged once streaming has started (issue 16).
3. **Default classifier model.** The participant **can** see the model picked in the chat: `request.model` exposes `name`, `id`, `family` and `vendor`, which is what `classifierModelFamily: ""` uses. The API does **not** expose whether a model is premium or its request multiplier. *Proposal: show the model name in the footer, and keep `""` as the classifier default with the premium-request note in the README. Still open: confirm the footer change, and whether the classifier should default to a cheaper family instead.*
4. ✅ **Decided: no sync.** Budgets are per machine; `setKeysForSync` isn't used.
5. **Accept non-Copilot models** (BYOK vendors picked in the UI)? *Recommendation: yes, budget them the same way.*
6. **Reserve output headroom in the pre-check**, e.g. refuse if `remaining < input + N`? *Recommendation: an optional setting, off by default.*
7. **`/use <subject>` with no question:** set the thread subject and confirm without calling the model? *Recommendation: yes.*
8. **Should the thread subject win over keywords** when a later prompt clearly matches another subject? The spec's order says yes, and `/use` is the way to switch. Confirm?
9. **Minimum `engines.vscode`** (the fake provider needs a recent stable LM provider API; proposed `^1.104.0`) and **distribution**: Marketplace, Open VSX, or `.vsix` from GitHub Releases only?

---

## 7. Testing strategy

### Rules
- **Red → green → refactor.** For every behaviour: write a failing test, write the minimum code to pass it, then refactor. Commit at green. In each issue, the implementation tasks start only once the tests listed under "Tests to write first" are red.
- **Ports and adapters.** All decisions live in `src/core` and are unit tested. Adapters are thin and covered only by integration tests.
- **Bugs.** Every bug fix starts with a failing test that reproduces it. The bug issue template requires a link to that test.
- **No real models.** No test, unit or integration, calls a real Copilot model.

### Test doubles (`test/fakes/`, each with its own tests)
- **`FakeModel`**: scripted streamed chunks; deterministic `countTokens = ceil(chars / 4)` (overridable per test); errors injected before the first chunk or after chunk *n*; watches the cancellation signal and stops yielding once it's cancelled; records `sendRequest` and `countTokens` calls.
- **`FakeModelSelector`**: returns configured models by vendor and family.
- **`InMemoryStorage`**: a `StoragePort` backed by a `Map`, with optional injected write failure.
- **`FixedClock`**: a fixed instant plus an IANA time zone, with `advance(ms)` and `set(iso)`.
- **`FakeConfig`**: a mutable config that fires change events.
- **`RecordingOutput`**: records every markdown and progress call, in order.
- **`FakeUi`**: records status bar states and messages, with scripted `confirm` answers.
- **`FakeReferenceReader`** and **`FakeCancellation`**.

### Layers
| Layer | Tool | Scope | Speed |
|---|---|---|---|
| Unit | Vitest | `src/core/**` and the fakes | < 5 s total |
| Integration | `@vscode/test-cli` + `@vscode/test-electron` | Activation, participant and command registration, adapters, end-to-end handler through the fake `q0t4-test` provider, globalState persistence | < 2 min |
| Manual | Install the `.vsix` | One checklist per iteration in its last issue | |

### Coverage
At least 90% line **and** branch coverage on `src/core/**` (Vitest v8 `thresholds`). The run fails below that, locally and in CI.

### CI (`.github/workflows/ci.yml`), on every push and pull request
1. `npm ci`
2. `npm run lint`: ESLint, including the core import ban
3. `npm run typecheck`: `tsc --noEmit`
4. `npm run test:unit -- --coverage`: matrix of ubuntu-latest and windows-latest
5. `xvfb-run -a npm run test:integration`: ubuntu-latest
6. `npx @vscode/vsce package`, then upload the `.vsix` as a build artifact

The iteration 0 issues set up CI before any feature work. Pushes to `docs/**` branches, and PRs from them, skip these jobs (see §8).

---

## 8. Branches and pull requests

- **Every piece of work gets its own branch**, pushed to GitHub and merged into `main` through a pull request. Nothing is committed straight to `main`.
- **One branch per issue**, named `<type>/<NN>-<short-title>`, for example `infra/01-project-scaffold`, `feat/14-pre-check-refusal`, `test/04-test-doubles`, `fix/<NN>-<bug>`. The PR description says `Closes #NN`.
- **Documentation-only work** goes on a `docs/<topic>` branch (e.g. `docs/plan`). **Automated tests don't run for `docs/**` branches**, neither on push nor for their PRs, so a docs branch must not contain code changes.
- A PR merges only when CI is green (docs branches excepted) and the issue's definition of done is met. The commit history inside the branch follows red → green → refactor.
