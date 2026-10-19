# Q0T4: Plan

Q0T4 is a VS Code extension that adds a chat participant, `@q0t4`, to the Copilot Chat panel. It forwards your prompts to Copilot's language models and gives each **subject** a **weekly budget**. A subject is **the repo you're working in** (e.g. `RemonStuff/Q0T4`), and `/use` can override it. Every prompt is assigned to a subject, its cost is measured, and once a subject has used up its weekly budget, chats on that subject stop until the week resets.

The budget is measured in a configurable **unit**: tokens (the default) or **GitHub AI Credits**, which is how Copilot is billed since June 2026. Optionally, a **monthly pool** of credits is divided across repos with a reserve, and each repo's monthly share turns into a rolling weekly budget. The weekly budget is always the limit that's enforced. Other extensions can use the same metering through a **public API**. See §9 for the full design of credits, cycles, pools and the API.

The project is test-driven throughout. This document covers the architecture, the data model, the risks and the testing rules. The work itself is broken down in [ROADMAP.md](ROADMAP.md) and [issues/](issues/).

---

## 1. Spec vs API (researched against `@types/vscode` 1.140.0)

| Spec item | What the API actually offers | Our approach |
|---|---|---|
| Use `request.model` | `ChatRequest.model: LanguageModelChat` is **non-optional**. It's the model picked in the chat UI and shouldn't be held after the request ends. | Use it. Fall back to `vscode.lm.selectChatModels({ vendor: "copilot" })` only when sending fails with `LanguageModelError.NotFound`. |
| Subject = the repo being worked on *(decided, replaces the spec's keywords and classifier)* | `vscode.workspace.workspaceFolders` and `workspace.getWorkspaceFolder(uri)` identify the open folder. The built-in Git extension (`vscode.extensions.getExtension("vscode.git").exports.getAPI(1)`) lists each repository's remotes. | `WorkspacePort.currentRepo()` returns the folder name and its remotes. Pure core normalises the `origin` URL to `owner/repo`, falling back to the first remote and then the folder name. With no folder open, the subject is `fallbackSubject`. |
| Count tokens with `countTokens()` | `countTokens(text: string \| LanguageModelChatMessage, token?)` returns `Thenable<number>`. **Responses don't report usage**, so there are no prompt or completion token counts. | Input = the sum of `countTokens(message)` over every message we send. Output = `countTokens(accumulatedText)`. Message-framing overhead isn't visible to us. That's documented as one reason our numbers differ from GitHub's. |
| Cancel the stream when the budget is reached | There is no portable max-output-tokens option (`modelOptions` depends on the vendor). We cancel by cancelling the token passed to `sendRequest` or by breaking out of `for await`. | Give the model its own `CancellationTokenSource`, linked to the chat's token, and cancel it from the `StreamGuard`. Tokens that arrive before cancellation still count. The overshoot is limited to one recount interval (see §5). |
| Reuse the subject for each thread | **There's no thread or session ID.** `ChatContext.history` contains only *this participant's* turns, and `ChatResponseTurn.result.metadata` comes back exactly as we returned it. | Thread = the history we're given. The thread's subject is `metadata.subject` from the newest `ChatResponseTurn`. Metadata must be JSON-serialisable. |
| Send same-subject history | `ChatResponseTurn.response` holds the markdown parts we streamed, **including our footer and warnings**. | Emit the footer and warnings after a sentinel (`<!-- q0t4:footer -->`). The pure history builder strips everything from the sentinel on. |
| Messages sent to the model | `LanguageModelChatMessageRole` has only `User` and `Assistant`, with **no System role**. | Send any instructions as a leading `User` message. v1 needs none. |
| Attached references | `ChatPromptReference.value: string \| Uri \| Location \| unknown`. | `ReferenceReaderPort` reads Uri files and Location ranges. Strings are used as they are. Unknown values and images are skipped, with a progress note. |
| Sticky participant and slash commands | These are declared in package.json under `contributes.chatParticipants[]` with `isSticky: true` and `commands: [status, subjects, use]`. At runtime `request.command` holds the name, and the `/use` argument is the start of `request.prompt`. | Parse `/use` in pure core. |
| Consent and quota errors | The first `sendRequest` shows a consent dialog. Failures are `LanguageModelError` with `code` set to `NoPermissions`, `NotFound`, `Blocked` or `Unknown`. `ExtensionContext.languageModelAccessInformation.canSendRequest(model)` checks consent without prompting. | The adapter maps these to a core `ModelErrorKind`, and core turns each kind into a friendly message and a recording policy (issue 38). |
| Context window | `LanguageModelChat.maxInputTokens` is exposed. | Drop the oldest history turns until the input fits, before the budget pre-check (issue 39). |
| `extensionDependencies: ["github.copilot-chat"]` | With this dependency, the extension **won't activate** in the integration-test VS Code instance unless Copilot Chat is installed and signed in. Copilot Chat is also being merged into core VS Code, so the ID may change. | **Dropped (decided after #5; open question 1).** Since VS Code 1.14x, Copilot Chat is **built into VS Code** (`resources/app/extensions/copilot`, id `GitHub.copilot-chat`). In a fresh test profile VS Code doesn't load it ("enables LESS API proposals than the extension wants"), so `getExtension("github.copilot-chat")` is `undefined`, and installing it from the Marketplace has no effect. The user's own VS Code logs the same message but does activate it. A hard `extensionDependencies` would therefore stop Q0T4 activating in integration tests, so Q0T4 declares none. Models in tests come from the fake `q0t4-test` provider. |
| Integration testing the participant | No public API invokes a chat participant or lists participants. `vscode.lm.registerLanguageModelChatProvider` **is stable**. | A test-only fixture extension registers a fake vendor `q0t4-test`. `activate()` returns a small test API (`handleRequest`, `store`) that integration tests call with a recording response stream. |
| Tool references (`request.toolReferences`) | Not covered by the spec. | Ignored in v1 and documented as a known limit. |
| Per-model prices for AI Credits *(researched 2026-10-18, see §9.1)* | No VS Code API exposes prices. `LanguageModelChat.name` is the display name shown in the model picker (e.g. "GPT-5 mini"), and `family`/`id` are vendor-defined slugs. | Fetch the public price table from `github/docs` and match it on `name` first, then on a normalised `family`. A model with no price is costed at the most expensive rate, with a ⚠️ warning. |
| Reasoning ("thinking") tokens | Reasoning models bill hidden reasoning tokens as output, but the stream only carries visible text, so `countTokens` can't see them. | Credits will usually be **under**-estimated for reasoning models. `/sync` corrects the total against GitHub's figure, and §9.6 proposes an optional calibration factor. |

---

## 2. Architecture

Q0T4 uses ports and adapters. All logic lives in `src/core/`, which never imports `vscode`; an ESLint `no-restricted-imports` rule enforces that. VS Code is reached only through small interfaces in `src/ports/`, each implemented by a thin adapter in `src/adapters/`. `src/extension.ts` is the composition root.

```
src/
  core/
    budget/      preCheck, StreamGuard (adaptive recount + cut-off), recordingPolicy,
                 weeklyBudget (fixed limit or rolling share of the pool), reserve borrowing
    cost/        CostModel: TokenCostModel and CreditCostModel (tiers, rate snapshots, unknown models)
    pricing/     price-table parsers (YAML subset, Markdown tables), validation, PriceRefresher
    time/        BudgetCalendar: dayKey, week window, billing cycle, nextReset
                 (Intl.DateTimeFormat with the IANA zone from ClockPort)
    ledger/      Ledger over LedgerPort: entries, weekly and cycle totals, markers, corruption handling
    api/         Q0T4 public API façade (apiVersion 1)
    subjects/    parseConfig, repoIdentifier (normalise remotes), threadSubject, parseUse, resolveSubject
    messages/    buildMessages (history filter, footer strip, references, prompt), trimToWindow
    format/      tokens (112k / 1.2M), footer, warnings, refusal, statusTable, subjectList, statusBarText
    errors/      ModelErrorKind → user-facing message
    chatHandler.ts   orchestrates one request through the ports
    types.ts     domain types (Subject, SubjectConfig, Usage, ChatTurn, ResultMetadata…)
  ports/
    ModelPort            sendRequest(messages, signal) → AsyncIterable<string>; countTokens(text|msg); id, name, family, vendor, maxInputTokens
    ModelSelectorPort    select({ vendor?, family? }) → ModelPort[]
    StoragePort          get<T>(key), set(key, value), keys()   (small UI state only)
    LedgerPort           append(entry), read({ from, to }) → entries   (append-only, see §4)
    PriceSourcePort      fetch(previous?: { etag }) → { status: "ok" | "unchanged" | "failed", table?, etag? }
    PriceTableStorePort  load() → PriceTable | undefined; save(table)
    ClockPort            now(): Date; timeZone(): string (IANA)
    ConfigPort           get(): Q0T4Config; onDidChange(cb)
    ChatOutputPort       markdown(text), progress(text)
    UiPort               setStatusBar(state), confirm(message) → boolean, openSettings(query), showInfo(text)
    ReferenceReaderPort  read(ref) → { label, text } | undefined
    WorkspacePort        currentRepo() → { folderName, remotes: { name, url }[] } | undefined
    CancellationSignal   { isCancellationRequested; onCancellationRequested(cb) } (vscode.CancellationToken fits structurally)
  adapters/
    vscodeModel, vscodeModelSelector, globalStateStorage, systemClock, vscodeConfig,
    chatStreamOutput, vscodeUi, referenceReader, workspaceRepo (vscode.git API), errorMapping,
    fileLedger (JSONL files in globalStorageUri), githubDocsPriceSource, priceTableFile
  extension.ts           registers the participant and commands; returns the public API (+ test hooks)
test/
  unit/                  Vitest, mirrors src/core
  fakes/                 FakeModel, FakeModelSelector, InMemoryStorage, FixedClock, FakeConfig,
                         RecordingOutput, FakeUi, FakeReferenceReader, FakeCancellation
  integration/           @vscode/test-cli suites
  fixtures/fake-lm-provider/   test-only extension registering vendor "q0t4-test"
```

### Request flow (`chatHandler`)

1. **Parse the command.** `/status` and `/subjects` render and return. `/use` is parsed in pure core.
2. **Resolve the subject**, in this order: `/use` argument → thread subject (history metadata) → current repo (`owner/repo` from the git remote, or the folder name) → `fallbackSubject` (no folder open). Resolving costs no tokens.
3. **Build the messages:** same-subject history when `includeHistory` is on (footers stripped), then attached references, then the prompt. Trim to fit `maxInputTokens`.
4. **Count input** with `countTokens` per message, then turn it into a cost with the active `CostModel` (tokens: cost = tokens; credits: §9.1).
5. **Pre-check:** refuse if `usedThisWeek + estimatedInputCost > weeklyBudget`. In pool mode, the reserve may cover the gap (§9.3). The refusal shows used, budget, remaining and reset date, in the active unit.
6. **Stream** chunks to the output through `StreamGuard`, which recounts output at adaptive intervals, converts it to cost, and cancels with a "⛔ Stopped" note once the weekly budget (plus any allowed reserve) is reached.
7. **`finally`** (always, including on cancel and error): append a ledger entry (raw tokens, model, rates snapshot, cost, source), then write the sentinel, the footer `*RemonStuff/Q0T4: 112k / 150k this week · resets Mon · GPT-5*` (the last part is the name of the model that answered; the credits/pool form is in §9.7) and any ⚠️ warnings (`warnAtPercent`, daily pace, monthly pace, stale prices).
8. **Return** `{ metadata: { v: 1, subject, model, unit, inputTokens, outputTokens, cost, stopped } }`, where `model` is the answering model's name.

### Module responsibilities

| Module | Pure? | Responsibility |
|---|---|---|
| `core/time` | yes | `BudgetCalendar`: day keys, the week window for `resetDay`, the billing cycle for `cycleStartDay`, how many days of a week fall inside a cycle, next reset, and labels like "Mon" and "Mon 19 Oct". |
| `core/ledger` | yes (through LedgerPort) | Building entries, weekly/daily/cycle totals for a subject or the reserve, reset markers, skipping corrupt lines. |
| `core/cost` | yes | `CostModel`: tokens → cost in the active unit, picking the price tier and snapshotting the rates used. |
| `core/pricing` | yes | Parsing and validating price tables, applying overrides, refresh timing, staleness. |
| `core/budget` | yes | Weekly budget (fixed or rolling pool share), reserve borrowing, the pre-check decision, StreamGuard scheduling and cut-off, the rules for what gets recorded when. |
| `core/api` | yes | The public API façade, built on the same pipeline as the participant. |
| `core/subjects` | yes | Validating config, limit lookup (configured or default), normalising git remotes to `owner/repo`, thread subject, `/use`, the resolution pipeline. |
| `core/messages` | yes | Building the message list, filtering history, stripping footers, reference blocks, trimming to the context window. |
| `core/format` | yes | Every user-visible string: footer, warnings, refusal, `/status` table, `/subjects` list, status bar text. |
| `adapters/*` | no | Thin wrappers that turn VS Code objects into port types. Each one is covered by an integration test and contains no logic. |

---

## 3. Settings (`q0t4.*`)

| Key | Type | Default |
|---|---|---|
All amounts are in the active `budgetUnit`.

| Key | Type | Default |
|---|---|---|
| `budgetUnit` | `"tokens"` \| `"credits"` | `"tokens"` |
| `subjects` | `{ [repoOrName]: { weeklyLimit?: number; monthlyShare?: number; description?: string } }`, with keys like `"RemonStuff/Q0T4"` (matched case-insensitively) or plain names like `"general"`. Without a pool, `weeklyLimit` overrides `defaultLimit`. With a pool, `monthlyShare` sets the repo's share of the cycle. | `{ "general": { "weeklyLimit": 200000 } }` |
| `defaultLimit` | number: the weekly limit for any subject not listed in `subjects` (without a pool) | `150000` |
| `fallbackSubject` | string | `"general"` |
| `resetDay` | enum monday…sunday: start of the enforced week | `"monday"` |
| `cycleStartDay` | number 1–31: start of the billing cycle, clamped to the last day of short months | `1` |
| `pool` | number, optional: total budget per billing cycle (e.g. `35000` credits). Unset = no pool. | unset |
| `reservePercent` | number 0–100: share of the pool kept as a cycle-level reserve | `10` |
| `unallocatedSubjects` | `"default"` \| `"reserve"` \| `"block"`: what a subject without a `monthlyShare` gets in pool mode | `"default"` |
| `reserveMode` | `"auto"` \| `"ask"` \| `"off"`: whether a repo that has used up its weekly budget may borrow from the reserve | `"ask"` |
| `warnAtPercent` | number 1–100: of the **weekly** budget | `80` |
| `dailyPaceWarning` | number 1–100: % of the weekly budget used in one day (warning only) | `30` |
| `monthlyPaceWarning` | number ≥ 1: warn when a repo's cycle share is used this many times faster than the cycle is passing | `1.5` |
| `priceSource` | `"auto"` (fetched table + overrides) \| `"manual"` (overrides only) | `"auto"` |
| `modelPrices` | `{ [modelName]: { input: number; output: number } }` in USD per 1M tokens, applied on top of the fetched table | `{}` |
| `priceMaxAgeHours` | number: older price tables show a ⚠️ "prices may be out of date" warning | `48` |
| `calibration` | `"off"` \| `"apply"`: multiply credit estimates by the cycle's `/sync` ratio (capped at 2×) | `"off"` |
| `includeHistory` | boolean | `true` |

Invalid values never throw. `parseConfig` falls back to the defaults for any broken entry and reports a warning (issue 26). Pool settings are checked as a whole too: a warning appears when the monthly shares add up to more than `pool − reserve` (issue 56).

---

## 4. Data model: an append-only ledger

*(Decided 2026-10-18; replaces the earlier per-week globalState records. Nothing had been built on them.)*

**Why not globalState:** each VS Code window runs its own extension host, with its own in-memory copy of `globalState`. A read-modify-write from two windows can lose an increment. The public API (§9.8) adds more writers. Per-week records also can't hold per-request rate snapshots or reserve borrowing.

**Layout:** JSON Lines files in `ExtensionContext.globalStorageUri`:
```
ledger/2026-10/<writerId>.jsonl     one file per writer per calendar month
prices/table.json                   last good price table (§9.1)
```
`writerId` is `vscode.env.sessionId`, so every extension host (window) **appends only to its own file**. Two writers never touch the same file, so **no lock is needed**. Readers merge every file in the months they need. Grouping by calendar month keeps the ledger independent of `resetDay` and `cycleStartDay`: weekly and cycle totals are just date-range queries.

**Entry (v1):**
```json
{
  "v": 1,
  "id": "6f1c…",
  "kind": "usage",
  "at": "2026-10-14T09:12:03.120Z",
  "day": "2026-10-14",
  "subject": "RemonStuff/Q0T4",
  "source": "q0t4",
  "model": { "name": "Claude Sonnet 5.5", "family": "claude-sonnet-5.5" },
  "tokens": { "input": 41200, "output": 1880 },
  "rates": { "input": 2.0, "output": 10.0, "tier": "Default", "tableDate": "2026-10-13T06:00:00Z", "tableSource": "github-docs-yaml" },
  "cost": { "tokens": 43080, "credits": 10.12 },
  "borrowed": { "credits": 0 },
  "stopped": false
}
```
- **`kind`:**
  - `usage`: a request
  - `untracked`: a `/sync` correction
  - `reset`: the "Reset This Week" marker
  - `budget`: a weekly budget snapshot (§9.2)
  - `reserve-grant`: permission to borrow from the reserve for one subject and week (§9.3)
- **`source`:** `q0t4` (the participant), `q0t4-pricing` (reserved for a pricing call that costs credits; v1 makes none, see §9.1), `untracked`, or `api:<extensionId>`.
- **Both costs are stored** whenever rates are known: `cost.tokens` always, `cost.credits` when a price was available. Switching `budgetUnit` mid-cycle therefore never loses history.
- **Past entries are never repriced.** The `rates` snapshot travels with the entry, so a price change only affects what the rest of the week's budget buys.
- **Totals** (weekly, daily, cycle, reserve, untracked) are always computed from the ledger. A small in-memory index per file, keyed on file size and mtime, keeps reads cheap.
- **Reset This Week** appends a `reset` marker. Weekly totals for that subject count only entries after the latest marker in the week. **Cycle totals in credits mode ignore markers**, because the credits were really spent.
- **Corruption:** an unparseable line is skipped and counted, and a one-time warning is shown. Nothing throws.
- **Retention:** month folders older than 13 months are deleted on activation.
- **Other state:** `q0t4.ui.lastSubject` (status bar) stays in globalState.
- Nothing is synced across machines (decided, open question 4).

---

## 5. Key technical risks

| Risk | Impact | Mitigation |
|---|---|---|
| **The cut-off happens in the extension.** The model keeps generating until our cancellation takes effect. | A small overshoot past the limit. | StreamGuard recounts every ~400 characters while far from the limit and on **every chunk** once the estimated remaining budget is below 10% (or under 2× the last chunk). Overshoot is bounded by one interval, recorded honestly, and documented. |
| **`countTokens` latency.** It may be async, IPC-backed and slow on long texts. | Slower streaming. | Adaptive recounting with a cheap `chars/4` estimate between recounts. Recount only the accumulated text, never per chunk while far from the limit. Covered by FakeModel call-count tests. |
| **Our counts ≠ GitHub's metering.** Copilot bills AI Credits from its own token counts, which include framing, hidden system prompts, cache reads and writes, and **reasoning tokens we never see**. | Credits are usually **under**-estimated, most of all for reasoning models. | README "Known limits". `/sync` books the difference as `untracked`. An optional calibration factor is proposed in §9.6. Q0T4 makes no model calls of its own beyond the user's request. |
| **Prices change** (several times a month in `github/docs` history: new models, promotions, deprecations). | Wrong costs. | Daily refresh with ETag, a stale warning, per-entry rate snapshots, and manual overrides (§9.1). |
| **Price-table format drift.** The YAML has inconsistent quoting, footnote markers in names (`Gemini 3.8 Flash[^gemini-flash-promo]`) and long-context tiers. | A parse failure, or wrong rates. | A strict parser for the subset we need, plus a schema check and a ≥3× change guard. The previous table is kept on any failure. Tests run against a snapshot fixture of the real file. |
| **Model name mapping.** The price table uses display names; VS Code exposes `name`, `family` and `id`. "Auto" model selection doesn't reveal the real model. | No price found. | Match on `name`, then the normalised `family`, then `modelPrices` overrides. Unknown → most expensive rate + ⚠️. A manual check in issue 52 records the real Copilot `name`/`family` values. |
| **Repo detection.** The Git extension may be disabled, a folder may have no remote, or a multi-root workspace has several repos. | Wrong or unstable subject. | Fallback chain: `origin` remote → first remote → folder name → `fallbackSubject`. In multi-root workspaces, use the folder of the active editor, then the first folder. Show "Subject: X (repo)" as a progress note so it's visible, and `/use` overrides. |
| **The footer pollutes history.** It's part of `ChatResponseTurn.response`. | Wasted tokens, and the model echoes footers. | Sentinel plus stripping in pure core. Tests cover a missing sentinel and sentinel-like text in user content. |
| **No thread ID.** | The subject can't be stored per thread. | Derive it from history metadata. Tests cover missing or old metadata and subjects that have since been removed. |
| **Time zones and DST.** | The wrong week or day bucket. | `ClockPort.timeZone()` (IANA) plus `Intl.DateTimeFormat` in core, so results never depend on the machine's `TZ`. FixedClock tests cover DST in both directions, the year boundary and ±14h zones. CI runs unit tests on Linux and Windows. |
| **Races between windows** (and API consumers) writing usage. | Lost increments. | An append-only ledger with one file per writer (§4): nothing is ever read-modified-written, so no lock is needed. API consumers run in the same extension host and go through the same writer. |
| **Weekly budget snapshot written by two windows** at the start of a week. | Two different budgets. | The snapshot is deterministic from the ledger at the week boundary. If two exist, the earliest `at` wins. |
| **The Copilot dependency in tests.** | Without Copilot Chat installed, the extension doesn't activate in the test instance. | The test config installs `github.copilot-chat` (no sign-in needed to activate), and the fake LM provider fixture supplies the models. The VS Code test version is pinned to one that Copilot Chat supports. No test ever calls real Copilot. |
| **Consent dialog / `NoPermissions`.** | The first request fails or blocks. | Friendly message with a retry hint, and nothing charged (issue 38). |
| **Context window overflow.** | `sendRequest` rejects. | `trimToWindow` drops the oldest history first, and refuses with a clear message if the prompt alone doesn't fit. |
| **API churn** (chat APIs move fast). | Breakage. | Pin `engines.vscode` and `@types/vscode` to the same minor version and keep every API touch in adapters, so changes stay in one place. |

---

## 6. Open questions

1. ✅ **Decided (2026-10-18, revised after #5): no `extensionDependencies`.** It was first "keep `github.copilot-chat`", but Copilot Chat is now built into VS Code, and a fresh test profile doesn't load it, so the dependency would stop Q0T4 activating in integration tests (§1). Chat is part of VS Code itself, so dropping the dependency loses nothing for the user's work Copilot. Q0T4 handles "no model available" at runtime (#9).
2. ✅ **Decided: no.** Nothing is charged when `sendRequest` rejects before the first chunk. Input + output are charged once streaming has started (issue 16).
3. ✅ **Decided: the footer shows the chat's model name** (`request.model.name`, i.e. the model that actually answered, including after a fallback). The API does **not** expose whether a model is premium or its request multiplier. The classifier question is gone, because subjects come from the repo (question 8).
4. ✅ **Decided: no sync.** Budgets are per machine; `setKeysForSync` isn't used.
5. **Accept non-Copilot models** (BYOK vendors picked in the UI)? *Recommendation: yes, budget them the same way.*
6. **Reserve output headroom in the pre-check**, e.g. refuse if `remaining < input + N`? *Recommendation: an optional setting, off by default.*
7. **`/use <subject>` with no question:** set the thread subject and confirm without calling the model? *Recommendation: yes.*
8. ✅ **Decided: the subject is the repo** (replaces the spec's keywords and classifier). Every repo automatically gets its own weekly budget (`defaultLimit`, overridable per repo in `subjects`), and `/use` stays as the manual override. Order: `/use` → thread → repo → `fallbackSubject`.
9. **Minimum `engines.vscode`:** ✅ `^1.104.0` (decided in #1). ✅ **Distribution, decided:**
   - **v0.1:** a `.vsix` from GitHub Releases only (#41). No publisher account or marketplace review is needed while it's a personal tool.
   - **v1.0:** publish to the **VS Code Marketplace** (#66), because the planned multi-repo extension will declare `extensionDependencies: ["RemonStuff.q0t4"]`. VS Code only auto-installs dependencies from the Marketplace; with a `.vsix`, every user would have to install Q0T4 by hand first.
   - **Open VSX:** skipped unless Q0T4 is needed in VSCodium or Cursor.
10. ✅ **Decided: `cycleStartDay` = 1** (the cycle starts on the first of the month), which is also the default.
11. ⏸ **Deferred: how to split the 35,000 credits** (shares per repo, reserve size, `unallocatedSubjects`). Nothing blocks on it: `pool` stays unset, which is the no-pool behaviour, until it's decided. The defaults (`reservePercent` 10, `unallocatedSubjects` `"default"`) stand until then.
12. ✅ **Decided: an enterprise allowance.** GitHub's user-level usage API doesn't report enterprise-managed licenses, and the enterprise endpoints need billing-manager rights. So **automatic sync is not built**; #60 is closed as not planned. `/sync` stays manual, using the figure GitHub shows you (issue 59 notes where to find it).
13. ✅ **Decided: cost input at `max(input, cache_write)`** (§9.1).
14. ✅ **Decided: show the calibration ratio in `/status`**; applying it stays opt-in (`calibration: "apply"`, default `"off"`) (§9.6).
15. ✅ **Decided: `reserveMode` defaults to `"ask"`.**

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
- **`InMemoryLedger`**: a `LedgerPort` backed by an array, with per-writer streams, injected append failures and corrupt lines.
- **`FakePriceSource`**: scripted fetch results (`ok`/`unchanged`/`failed`, with ETags), recording each call.
- **`InMemoryPriceTableStore`**.

### Unit-generic tests
Behaviour that depends on the budget unit (pre-check, cut-off, recording, formatting) is written once and run for each unit with `describe.each([tokensUnit, creditsUnit])`. Each unit supplies a `CostModel` with fixed, easy rates, e.g. credits at input $1/M and output $2/M. Test names describe the behaviour generically, e.g. `refuses when estimated cost exceeds remaining weekly budget`.

### Layers
| Layer | Tool | Scope | Speed |
|---|---|---|---|
| Unit | Vitest | `src/core/**` and the fakes | < 5 s total |
| Integration | `@vscode/test-cli` + `@vscode/test-electron` | Activation, participant and command registration, adapters, end-to-end handler through the fake `q0t4-test` provider, ledger files in `globalStorageUri`, public API contract via a fake consumer extension | < 2 min |
| Manual | Install the `.vsix` | One checklist per iteration in its last issue | |

### Coverage
At least 90% line **and** branch coverage on `src/core/**`, **per file** (Vitest v8 `thresholds` with `perFile: true`, decided in #6, so one untested module can't hide behind a high total). The run fails below that, locally and in CI.

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
- **Every PR updates the root `README.md`** (decided 2026-10-18), so it always holds a current project description and how to use the project at that point: what can be installed or tried, commands, settings, and the development setup. This applies to docs PRs too. The PR template has a "README updated" checkbox (issue 06).

---

## 9. Credits, cycles, pools and the public API

*(Decided 2026-10-18.)* The token-based weekly design above stays valid: it's the configuration `budgetUnit: "tokens"`, with no `pool`. Everything in this section generalises it. Where this differs from the original request, it's marked **Changed:** with the reason.

### 9.1 Cost unit and live prices

**Unit.** `q0t4.budgetUnit` is `"tokens"` (default) or `"credits"`. 1 GitHub AI Credit = $0.01.

**Formula** (rates in USD per 1M tokens):
```
credits = (inputTokens × inputRate + outputTokens × outputRate) / 1e6 × 100
```
- **Changed: price tiers.** Many models have a *Default* tier and a *Long context* tier above an input-size threshold (e.g. `≤ 272K` / `> 272K`). The tier is picked per request from its input tokens, and the original request had no tiers.
- **Changed: cache assumption.** Cached tokens aren't visible, so we assume nothing is cached. But for Anthropic models and OpenAI GPT-5.6+, a **cache write costs more than plain input** (e.g. Claude Sonnet 5.5: input $2.00, cache write $2.50). "Assume nothing cached" is therefore *not* automatically the safe direction. We cost input at `max(input, cache_write)` per model, which is safe in every case (open question 13).
- **Unknown model** (including "Auto" selection, which hides the real model): use the highest input rate and the highest output rate in the current table, and show ⚠️ "no price for <model>".

**Research: where to get prices** (checked 2026-10-18):

| Source | Machine-readable? | Auth | Update frequency | Verdict |
|---|---|---|---|---|
| A GitHub REST API for Copilot model prices | — | — | — | **Doesn't exist.** The billing API reports *usage* (with `pricePerUnit` per SKU), not a price list. |
| GitHub Models catalog (`models.github.ai/catalog/models`) | No price fields; it also only answered `OK` (no JSON) today | Token | — | **Rejected.** It covers GitHub Models, not Copilot billing. |
| **`github/docs` → `data/tables/copilot/models-and-pricing.yml`**, raw from `raw.githubusercontent.com/github/docs/main/...` | **Yes**: YAML, one record per model and tier: `model`, `provider`, `release_status`, `tier`, `threshold`, `input`, `cached_input`, `cache_write`, `output` | **None** | Changed on 30 commits between 2026-06-30 and 2026-10-13 (new models, promotions, price corrections, deprecations): several times a month | **✅ Recommended primary.** Supports ETag, so a daily check usually costs one 304. The file the docs page is generated from. |
| **Docs article API** `docs.github.com/api/article/body?pathname=/en/copilot/reference/copilot-billing/models-and-pricing` | **Yes**: the rendered page as **Markdown** with pipe tables per provider, plus footnotes with promo terms | **None** | Same as the docs site deploys | **✅ Recommended fallback.** Deterministic table parsing, no LLM needed. |
| Scraping the rendered HTML page | Fragile | None | Same | Not needed. |

**Name mapping:** the table's `model` is the display name (e.g. `GPT-5 mini`, `Claude Sonnet 5.5`). That's what `LanguageModelChat.name` shows in the model picker. Matching order:
1. exact `name` (case-insensitive, footnote markers like `[^gemini-flash-promo]` stripped, whitespace collapsed)
2. the slug of the name compared with `family` and `id` (`gpt-5-mini` ↔ `GPT-5 mini`)
3. a key in `q0t4.modelPrices`
4. otherwise unknown

Issue 52 includes a manual check that logs the real `name`/`family`/`id` of every Copilot model, since we can't see them in tests.

**Refresh:**
- `PriceRefresher` (pure core, driven by `ClockPort`) fetches on activation, then once a day, plus the `Q0T4: Refresh Model Prices` command.
- It tries the YAML source with its ETag first. On failure it falls back to the article. If both fail, it keeps the last good table.
- The table (`fetchedAt`, `source`, `etag`, per-model tiers and rates) is stored in `globalStorageUri/prices/table.json`.

**Validation** before a fetched table replaces the current one:
- a schema check
- every rate positive
- the required models present (the models seen in the ledger in the last 30 days)
- no rate changing more than **3×** from the previous table

A table that fails validation is rejected, the old one is kept, and a warning names the failing check.

**Staleness and first run:**
- If `now − fetchedAt > priceMaxAgeHours` (48), the footer and `/status` show ⚠️ "prices may be out of date (fetched <date>)", but the extension keeps working.
- In credits mode with **no table at all** (first run, offline), requests are **refused** with a clear message and a "Refresh Model Prices" button. Q0T4 never guesses.

**Overrides:**
- `q0t4.modelPrices` (USD per 1M, input/output) is applied on top of the fetched table.
- `q0t4.priceSource: "manual"` skips fetching and uses overrides only.
- `/status` shows the table's date and source, and how many overrides are active.

**Changed: no LLM fallback.** The request asked for an LLM-parsed fallback *only if no machine-readable source exists*. Two exist, so it's not built. That avoids spending credits on pricing and the risk of a model inventing rates. The ledger source `q0t4-pricing` stays reserved in the schema.

**Snapshots:** every ledger entry stores the rates, tier, table date and source it was costed with (§4). A price change mid-week only changes what the remaining budget buys.

### 9.2 Two time levels: a monthly cycle with weekly enforcement

`BudgetCalendar` (pure core) handles both levels:
- **Billing cycle:** starts on `cycleStartDay` at local midnight, clamped to the last day of short months (31 → 30 Apr, 28/29 Feb). The pool and the repo shares apply per cycle.
- **Week:** starts on `resetDay` at local midnight. **The weekly budget per subject is what's enforced.**

**Without a pool:** the weekly budget is fixed: `subjects[x].weeklyLimit`, else `defaultLimit`.

**With a pool:** a rolling weekly budget, calculated **once per week**, from usage *before* the week starts:
```
remainingInCycle = monthlyShare − cycleUsage(subject, cycleStart … weekStart)
weeklyBudget     = remainingInCycle × daysOfWeekInsideCycle / daysRemainingInCycle(from weekStart)
```
- Unused budget automatically spreads over the rest of the cycle, and overspending lowers later weeks.
- Nothing carries over past a cycle end.
- **A week that spans a cycle boundary** gets two parts, split by days: the old cycle's part uses the formula above, and the new cycle's part is `newShare × daysInNewCycle / daysOfNewCycle`.
- **Fixed for the week:** the result is appended as a `budget` ledger entry the first time it's needed in that week, so it doesn't change after each request. It's deterministic from the ledger, so two windows compute the same value; if two snapshots exist, the earliest wins.
- Tests use `FixedClock` across week ends, cycle ends, cycles starting mid-week, February in a normal and a leap year, `cycleStartDay` 29/30/31, and both DST changes.

### 9.3 Pool, shares and reserve

- **`pool`:** total per cycle in the active unit (e.g. `35000` credits). Unset means no pool, which is today's behaviour.
- **`reservePercent`:** default 10, so the reserve is 3,500 of 35,000. It's a cycle-level pot.
- **Shares:** `subjects[x].monthlyShare` sets a repo's share per cycle. With a pool, `weeklyLimit` is ignored (with a settings warning), and the reverse without a pool.
- **`defaultLimit`:** renamed from `defaultWeeklyLimit`, since nothing has shipped yet. Without a pool, it's the weekly limit of unlisted subjects. With a pool and `unallocatedSubjects: "default"`, it's their **monthly share**. The meaning follows the mode, which the setting description spells out.
- **`unallocatedSubjects`:**
  - `"default"`: share = `defaultLimit`
  - `"reserve"`: the subject has no budget of its own, and every request draws from the reserve under the `reserveMode` rules
  - `"block"`: refused, with a link to settings
- **Settings warning** when Σ shares > `pool − reserve`.

**Reserve borrowing** (`reserveMode`), when a request doesn't fit the remaining weekly budget:
- `"auto"`: the overflow is borrowed from the reserve. The ledger entry records `borrowed`, and the footer adds ⚠️ "borrowed 120 from reserve".
- `"ask"`: refused with a button, **Allow reserve for <repo> this week**, which appends a `reserve-grant` ledger entry. A chat followup re-sends the original prompt. The grant lasts for that subject and week.
- `"off"`: a plain refusal.

The pre-check allows a request when `weeklyRemaining + (borrowing allowed ? reserveRemaining : 0) ≥ estimatedInputCost`. StreamGuard uses the same total as its cut-off.

**Decided: the `reserveMode` default is `"ask"`** (open question 15). The reserve is real money, so the safest default is to ask.

### 9.4 Warnings

- **`warnAtPercent`** applies to the **weekly** budget.
- **Daily pace:** `dailyPaceWarning`% of the weekly budget used in one local day.
- **Monthly pace** (pool mode only): warn when `(cycleUsed / monthlyShare) ÷ (elapsedCycleDays / cycleDays) ≥ monthlyPaceWarning` (default 1.5). It's suppressed until the subject has used at least 10% of its share, to avoid noise on day 1.
- **Stale prices** (§9.1) and **unknown model price**.
- All warnings are pure functions with their own tests, and are shown after the footer sentinel.

### 9.5 Ledger and concurrency

See §4. Answer to "is the planned storage safe with several windows, and later API consumers?": **No**, the globalState records weren't. The replacement is an append-only JSONL ledger. **Changed: no lock.** Each writer (extension host, identified by `vscode.env.sessionId`) appends only to its own file, so writers never contend and no lock is needed; readers merge all files. API consumers run in the same extension host as Q0T4 and write through Q0T4's single writer.

### 9.6 Sync with GitHub

- **`/sync <creditsUsedSoFar>`** and the `Q0T4: Sync With GitHub Usage` command (credits mode only). The user types the cycle-to-date figure from GitHub's billing page. Q0T4 appends an `untracked` entry of `actual − ledgerCycleCredits`, counting earlier `untracked` entries, so repeated syncs are idempotent.
  - A positive difference is charged to the **reserve first**, and any remainder to the fallback subject.
  - **Changed:** a negative difference (we over-estimated) is recorded too, as a credit back to the reserve.
- **Calibration** (open question 14): `/status` shows `actual ÷ estimated` for the cycle. With `q0t4.calibration: "apply"` (off by default), future estimates are multiplied by it, capped at 2×. This targets the systematic under-count from hidden reasoning tokens.
- **Automatic sync, research result:**
  - **The endpoint:** `GET /users/{username}/settings/billing/ai_credit/usage?year=&month=&day=&model=&product=` returns `usageItems` with `pricePerUnit`, `grossAmount` and `netAmount`, covering the last 24 months.
  - **Auth:** a classic token with the `user` scope, or a fine-grained token with "Plan: read". In VS Code, that would be `vscode.authentication.getSession("github", ["user"])`, which is a broad scope.
  - **It only reports Copilot plans the user bought themselves.** Licenses managed by an organization or enterprise are excluded; those need org/enterprise endpoints (`/organizations/{org}/settings/billing/ai_credit/usage`), which require billing-manager rights.
  - **It reports per calendar day/month,** so a cycle total means summing days from `cycleStartDay`.
  - **There's no `gh` subcommand** for it; it works through `gh api` with a `user`-scoped token.
  - ✅ **Decided: not built.** The 35k is an enterprise allowance, which the user endpoint doesn't report (open question 12). `/sync` stays manual; #60 is closed as not planned.

### 9.7 Footer, status and status bar

- **Footer, tokens mode** (unchanged): `*RemonStuff/Q0T4: 112k / 150k this week · resets Mon · GPT-5*`
- **Footer, credits with a pool:** `*RemonStuff/Q0T4: 2,100 / 3,390 credits this week · month 9,420 / 15,000 · reserve 3,100 · resets Mon · GPT-5*`, plus any ⚠️ lines (stale prices, unknown price, borrowed, pace).
- **Footer, credits without a pool:** like the tokens footer, in credits with thousands separators.
- **`/status`:**
  - per subject: weekly budget, used this week, monthly share, used this cycle, pace (×), and whether the budget is the default
  - plus rows or lines for the reserve (size, borrowed, remaining), untracked usage, pricing-refresh cost (0 in v1), the calibration ratio, and the price table's date and source
- **Status bar:** the current repo's weekly figures in the active unit, e.g. `$(pulse) Q0T4 2.1k/3.4k cr`.

### 9.8 Public API

Exported from `activate()`. Consumers call `vscode.extensions.getExtension("RemonStuff.q0t4")?.activate()`.

```ts
interface Q0T4Api {
  readonly apiVersion: 1;
  /** Bind calls to the consuming extension; used as ledger source `api:<extensionId>`. */
  forExtension(extensionId: string): Q0T4Client;
}
interface Q0T4Client {
  getStatus(): Promise<StatusSnapshot>;                 // weekly + cycle figures per subject, reserve, unit, price table
  canSpend(subject: string, estimate: { inputTokens: number; model?: string }): Promise<SpendCheck>;
  sendRequest(subject: string, model: vscode.LanguageModelChat, messages: vscode.LanguageModelChatMessage[],
              options: vscode.LanguageModelChatRequestOptions | undefined, token: vscode.CancellationToken): Promise<MeteredResponse>;
  readonly onDidChangeUsage: vscode.Event<UsageChange>;
}
```

- **`sendRequest`** runs the same pipeline as the participant: cost → pre-check → StreamGuard cut-off → ledger entry in `finally`. It returns `{ stream, text, result: Promise<{ cost, stopped }> }`.
- **Changed: `forExtension(extensionId)`.** VS Code doesn't tell an extension who is calling its exports, so the caller's ID is **self-declared** and trusted. That's documented. The original shape had no way to fill `source: api:<extensionId>`.
- **Consent:** the `LanguageModelChat` object comes from the consumer's own `selectChatModels`, so the language-model consent is the consumer's.
- **Versioning:** `apiVersion: 1`. Only additive changes within v1; a breaking change means `apiVersion: 2` alongside v1.
- **Contract tests:** a fake consumer extension in the integration instance exercises every method against the fake model provider.
