# Q0T4

[![CI](https://github.com/RemonStuff/Q0T4/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/RemonStuff/Q0T4/actions/workflows/ci.yml)

**Weekly budgets for GitHub Copilot Chat, per repo.**

Q0T4 is a VS Code extension that adds a chat participant, **`@q0t4`**, to the Copilot Chat panel. You chat through `@q0t4` as you would with Copilot. It forwards your prompt and conversation history to the model you picked. Metering and a hard stop are **active for one shared subject**, `general`, with a 200,000-token budget per week (the week resets on Monday). Per-repo subjects, settings and slash commands are still planned.

**Planned budgeting features:**

- **Subjects are repos.** A prompt is charged to the repo you're working in (`owner/repo` from its git remote). `/use <subject>` overrides that.
- **Tokens or AI Credits.** Budgets can be counted in tokens, or in GitHub AI Credits (how Copilot bills since June 2026), using live per-model prices.
- **Monthly pool (optional).** Split a monthly credit allowance across repos with a reserve; each repo's share becomes a rolling weekly budget.
- **Hard stop.** Requests over budget are refused up front, and replies are cut off mid-stream when the budget runs out.
- **Public API.** Other extensions can check budgets and send metered requests.

> **Status: in development.** `@q0t4` streams replies from the selected model, includes attached text/files/selections and supports cancellation. Q0T4 counts the tokens of each `@q0t4` request, adds a usage footer to the reply, refuses a request that does not fit the budget and cuts a reply off when the budget runs out. For now every request counts against one subject, `general` (200,000 tokens a week, resetting on Monday). Usage is kept in an append-only ledger on disk, so it survives a reload and is shared by all your VS Code windows. Slash commands are not implemented. See [the roadmap](docs/ROADMAP.md#status) for progress.

## How to use it

### Today: install the preview build

1. Download the latest build: open the [CI runs on `main`](https://github.com/RemonStuff/Q0T4/actions/workflows/ci.yml?query=branch%3Amain), pick the newest green run, and download the **`q0t4-vsix`** artifact. It's a zip containing `q0t4-<version>.vsix`. Or build it yourself with `npm run package`.
2. In VS Code (1.104 or newer): Extensions view → `…` → **Install from VSIX…** and pick the `.vsix`.
3. Sign in to GitHub Copilot, select a model in the Chat picker, and send `@q0t4 hi`. The reply streams from that model, followed by a footer such as `*general: 1.2k / 200k this week · resets Mon · GPT-5*`. VS Code may ask for permission on the first request.
   - The footer shows the week's total for the shared subject `general`, including this request, and the model that answered. From 80% a `⚠️` line follows it.
   - A request that does not fit the remaining budget is refused before any model is called. A reply that reaches the limit is cut off with `⛔ Stopped: general weekly budget reached.`
   - The footer is hidden from the model: it is stripped from the history that is sent back.
4. Send another message without typing `@q0t4`: it still goes to Q0T4, because the participant is sticky. Pick a different model for the next request or use Stop to cancel an answer.
5. `/status`, `/subjects` and `/use` appear in the UI but report that slash commands are not available yet. They do not call a model.
6. Attach a file with `#file` or a text selection to include its content. File references use the current editor text, including unsaved edits; selections include only their range. Unsupported attachments produce one progress note. An unreadable attached file stops the request before calling a model.

To remove it, uninstall **Q0T4** from the Extensions view.

### Once released (planned)

1. Install the `.vsix` from [GitHub Releases](https://github.com/RemonStuff/Q0T4/releases): Extensions view → `…` → **Install from VSIX…**. You need a GitHub Copilot subscription signed in to VS Code (Copilot Chat is built into VS Code 1.104+).
2. Open Copilot Chat and start a message with `@q0t4`. It stays selected for the rest of the conversation.
3. Each reply ends with a footer such as
   `RemonStuff/Q0T4: 112k / 150k this week · resets Mon · GPT-5`
4. Commands in chat:
   - `/status`: usage of every repo this week
   - `/subjects`: known subjects and their budgets
   - `/use <subject> <question>`: charge a question to another subject
5. Settings live under `q0t4.*`: for example `q0t4.defaultLimit` (the weekly budget for any repo) and `q0t4.subjects` (per-repo overrides).

The full design is in [docs/PLAN.md](docs/PLAN.md).

## Known limits

- Metering and the hard stop use one subject, `general`, with a fixed 200,000-token weekly budget that resets on Monday at local midnight, a warning from 80% of the week and a pace warning at 30% of the week in one day. The usage ledger is kept under the extension's global storage folder; month folders older than 13 months are pruned when VS Code starts, and the totals from the iteration-2 preview are dropped. Budgeting applies only to chats through `@q0t4`, not inline completions, agent mode or normal Copilot chat.
- Only explicitly attached text, files and selections are included. Q0T4 does not search the workspace or execute tool references. Image data, common binary image files and NUL-containing document text are unsupported; they are skipped with one progress note.
- Detailed consent/quota error messages and retry-on-missing-model come in [#38](https://github.com/RemonStuff/Q0T4/issues/38). For now model failures show a generic retry message and preserve any partial reply.
- Future token counts will be estimates and will not exactly match how GitHub meters Copilot.

## Development

Requirements: Node.js 22 or newer, and VS Code 1.104 or newer.

The core includes [`buildMessages`](src/core/messages/buildMessages.ts), which prepares completed user/assistant history pairs, one user message containing attached reference blocks, then the current prompt. It preserves text exactly and leaves supplied inputs unchanged. Reference labels identify files and selection ranges; fences are longer than any backtick sequence in their content. Unanswered requests, empty response pairs and orphan responses are omitted.

[`resolveModel`](src/core/models/resolveModel.ts) keeps the requested model unless the caller marks it unavailable. It then queries Copilot models once, preferring the same family before the first available result, or returns a typed `noModel` result. [`formatNoModel`](src/core/format/formatNoModel.ts) supplies the sign-in guidance for that result. Resolution never probes a model or sends a prompt; retry-on-`NotFound` comes later.

[`chatHandler`](src/core/chatHandler.ts) combines model resolution and message
building, forwards a request through `ModelPort`, and streams each text chunk
to the supplied output. It checks cancellation, closes unfinished streams, and
reports model failures with a friendly message while preserving partial
replies. Its JSON-safe metadata reports the outcome and, for generated replies,
the model used, without inventing token counts or costs; full usage metadata
comes in [#18](https://github.com/RemonStuff/Q0T4/issues/18).

[`extension.ts`](src/extension.ts) connects that core pipeline to the real participant and the integration-test hook. The [adapters](src/adapters/) convert history and messages, use each request's selected model, and link cancellation without retaining listeners after the request ends. Integration and installed-VSIX tests use the fake `q0t4-test` provider to verify forwarding, model switching and cancellation; they never call real Copilot.

[`referenceReader`](src/adapters/referenceReader.ts) resolves attached strings, file URIs and Location selections through VS Code's document APIs. The handler restores prompt order from VS Code's reversed reference list without deduplicating references by their kind ID. Unsupported values are reported once, read failures stop before sending, and cancellation prevents further reads or model calls.

[`countInput`](src/core/budget/countInput.ts) is core-only groundwork: it counts
every complete message through the supplied model, concurrently, including
history and formatted references. It forwards the cancellation signal, stops
waiting with typed `Cancelled`, and wraps tokenizer failures in `CountError`
with a safe message and the original cause. Its cancellation listener is always
released. A tokenizer that ignores cancellation may keep running internally.

[`TokenCostModel`](src/core/cost/tokenCostModel.ts) implements the existing
[`CostModel`](src/core/cost/costModel.ts): cost is input plus output tokens, with
no credits or rate snapshot. Neither helper sends a model request. The participant
uses them since [#19B](https://github.com/RemonStuff/Q0T4/issues/83).

[`preCheck`](src/core/budget/preCheck.ts) is a pure budget decision in tokens or
credits. It compares used cost plus estimated input against the budget plus any
explicit extra allowance. A positive effective budget allows an exact fit;
a zero effective budget always refuses. Remaining amounts never go below zero.
Missing active credits, negative or nonfinite values, and an overflowing
effective budget fail explicitly rather than allowing an unmetered request.

The handler accepts an optional `BudgetContext` with the subject, `CostModel`,
used cost, budget, optional allowance and reset label. When supplied, it counts
the selected model's complete messages and converts input tokens to cost before
the decision. A refusal never calls `sendRequest` and returns only
`{ outcome: "refused", stopped: "precheck" }` in metadata, without claiming an
answering model or charged usage. Counting and policy failures use the existing
safe error message; cancellation stays silent.

[`formatRefusal`](src/core/format/formatRefusal.ts) shows the subject, used cost,
effective budget, remaining amount and supplied reset label, with `/status`
and `/use` hints. Amounts are not rounded; dynamic labels are escaped for
Markdown. The formatter does not calculate dates.

The pre-check shipped in [PR #80](https://github.com/RemonStuff/Q0T4/pull/80).
Its exact-main CI passed unit, integration and installed-package checks.
The installed participant supplies a budget context since
[#19B](https://github.com/RemonStuff/Q0T4/issues/83), with the real reset labels
(`Mon`, and `Mon 19 Oct` in a refusal) since
[#25](https://github.com/RemonStuff/Q0T4/issues/25). The command hints do not
activate the unimplemented slash commands.

[`StreamGuard`](src/core/budget/streamGuard.ts) is implemented and unit-tested
locally for [#15](https://github.com/RemonStuff/Q0T4/issues/15). It uses the same
optional handler budget context, so installed behavior is still unchanged.
Between real output recounts, it estimates extra tokens as extra characters
divided by four, anchored to the last real count. Far from the limit, it
recounts the entire accumulated output after 400 characters. Once estimated
remaining cost falls below 10% of the effective budget or twice the last
chunk's estimated cost, it recounts every chunk.

[`recordingPolicy`](src/core/budget/recordingPolicy.ts) decides what a request
is charged ([#16](https://github.com/RemonStuff/Q0T4/issues/16)). A reply that
started streaming is charged for its input plus the output counted so far, whether
it completed, was cancelled, failed mid-stream or was cut off by the budget. A
request that `sendRequest` rejects, or that the pre-check refuses, is charged
nothing. The entry is a ledger entry: raw tokens, model name and family, the
cost in the active unit (always tokens, credits only when rates are known), the
rate snapshot it was costed with, and whether the reply was stopped. The handler
records it in a `finally` block through a `UsageSink`, recounting the output from
the accumulated text even after a cancellation. A failed write is reported to an
optional error hook and never changes the reply. The installed participant records
into the totals store since [#19B](https://github.com/RemonStuff/Q0T4/issues/83).

At or above the effective budget, the handler preserves the already-received
chunk, cancels the model's separate signal and forwards no later chunks. It
writes one `⛔ Stopped: <subject> weekly budget reached.` note and returns
`{ outcome: "stopped", stopped: "budget", model }` metadata without invented
usage totals. User cancellation remains distinct and adds no stop note.
`finalCount()` uses the real tokenizer, reusing an unchanged exact count.
An over-budget final recount reports a budget stop, not normal completion.
Counting or pricing failures cancel the producer and use the existing safe
error path; output-write failures still propagate unchanged.

The guard limits the delay before a real recount, not GitHub's bill. A chunk
can itself exceed 400 characters, token density varies, and the provider may
generate more tokens before cancellation takes effect. Tests measure the
character interval plus the arriving chunk with deterministic tokenizers;
they do not prove a universal token or credit overshoot cap.

[`core/format`](src/core/format/) holds the usage strings from
[#17](https://github.com/RemonStuff/Q0T4/issues/17), used by the installed participant
since #19B. `formatTokens` shows `950`, `112k` or `1.25M`; `formatCredits` shows
`2,100`, and one decimal below 10 (`7.4`). Both round down by default.
`formatFooter` writes the hidden `<!-- q0t4:footer -->` sentinel, a blank line, and
`*owner/repo: 112k / 150k this week · resets Mon · GPT-5*` (with `credits` after
the budget in credits mode and no model part when no model answered). It rounds
used up and the budget down, so it never overstates what is left, and escapes the
subject, reset label and model name as literal Markdown. `formatWarning` returns
`⚠️ 85% of the weekly budget used.` from `warnAtPercent`, `⛔ Weekly budget reached.`
at 100%, or nothing below the threshold. Pool parts of the footer arrive in
[#61](https://github.com/RemonStuff/Q0T4/issues/61).

[`stripFooter`](src/core/messages/stripFooter.ts) removes everything from the last
`<!-- q0t4:footer -->` sentinel on, and `buildMessages` uses it, so Q0T4's footer and
warnings are never sent back to the model. An assistant turn that is empty after
stripping is dropped with its prompt. With a budget context, the handler's metadata
now also carries `v`, `subject`, `unit`, `inputTokens`, `outputTokens`, `cost` (in the
active unit) and `stopped` (`false`, `"budget"`, `"cancelled"` or `"precheck"`), next to the existing
`outcome` and `model`. A refusal, or a request that `sendRequest` rejects, reports
zero usage; other outcomes report what was charged, with the output recounted from
the reply. That recount waits at most one second, so a tokenizer that ignores
cancellation cannot hold up a cancelled chat; it then keeps the last exact count.
Without a budget context the metadata is unchanged.

The [`globalStateStorage`](src/adapters/globalStateStorage.ts) adapter puts `StoragePort` on VS
Code's `globalState`. It holds small settings-like state only; usage lives in the ledger. (The
iteration-2 `TotalsStore` kept running totals there and is gone: VS Code's `globalState` can
replace a newer pending value with a stale echo of an earlier write, and it is per window.)

[`BudgetCalendar`](src/core/time/budgetCalendar.ts) ([#20](https://github.com/RemonStuff/Q0T4/issues/20))
is the pure calendar for the enforced week. `dayKey(instant)` is the local calendar day
and `weekWindow(instant)` the `[start, end)` day keys of the week that starts at local
midnight on `resetDay`. Both use `Intl` with the IANA zone from the clock, never the
machine's `TZ`, and do their arithmetic on `YYYY-MM-DD` keys (`addDays`, `daysBetween`),
so a DST change, a year boundary or a far-away time zone cannot move a boundary. Nothing
uses it yet; the ledger totals (#22) and the next-reset labels (#21) are built on it.

[`nextResetKey`, `msUntilReset`, `formatResetShort` and `formatResetLong`](src/core/time/reset.ts)
([#21](https://github.com/RemonStuff/Q0T4/issues/21)) say when the current week ends. The reset is at
local midnight, so `msUntilReset` stays correct across a DST change, and
`BudgetCalendar.startOfDay` also handles a day whose midnight a DST change skipped. Labels use
fixed English abbreviations: `Mon` for the footer and `Mon 19 Oct` for the refusal. The installed
participant passes them to the footer and the refusal since
[#25](https://github.com/RemonStuff/Q0T4/issues/25).

[`Ledger`](src/core/ledger/ledger.ts) ([#22](https://github.com/RemonStuff/Q0T4/issues/22)) keeps usage as an
append-only ledger over `LedgerPort`, and is a `UsageSink`. `record` appends a validated entry and never
rewrites an old one; `markReset` appends a reset marker. `usedInRange` sums a subject's usage over `[from, to)`
days, `usedThisWeek` over the current budget week (after the subject's latest reset marker) and `usedToday`
over today's local day, so a changed `resetDay` needs no migration. Subjects match case-insensitively,
entries from several writers are merged, and totals are in tokens, plus credits when entries carry them.
`subjectsSeen` lists every subject in the stored months. The installed participant uses it
through the file adapter since [#25](https://github.com/RemonStuff/Q0T4/issues/25).

The ledger never crashes on what is stored ([#23](https://github.com/RemonStuff/Q0T4/issues/23)). A
line that is not valid JSON, fails validation or has an unknown schema version is skipped, never
misread, and counted: `corruptSkipped` holds the count and an optional `onCorrupt` hook is called
once per session. `prune()` deletes month folders older than 13 months through `LedgerPort.months()`
and `removeMonth()`, never the current month (by the clock's local time), and keeps going if one month
cannot be removed. Because totals are date-range sums rather than per-week records, changing `resetDay`
mid-week needs no migration and counts each entry exactly once.

[`paceWarning`](src/core/budget/paceWarning.ts) ([#24](https://github.com/RemonStuff/Q0T4/issues/24)) warns,
without ever blocking, when a subject has used `dailyPaceWarning`% (default 30%) of its weekly budget within
one local day, in whichever unit is active. It is computed from today's usage, so it ends at local midnight
by itself. The handler writes `⚠️ Daily pace: 62k used today, at least 30% of the weekly budget (60k).`
after the weekly warning when it is given today's usage (`budget.usedToday`) and the setting
(`footer.dailyPaceWarning`); the figures count the request just answered. The installed participant
supplies today's usage from the ledger since [#25](https://github.com/RemonStuff/Q0T4/issues/25).

[`fileLedger`](src/adapters/fileLedger.ts) ([#25](https://github.com/RemonStuff/Q0T4/issues/25)) stores the
ledger as JSON Lines files, `ledger/<YYYY-MM>/<sessionId>.jsonl` under VS Code's global storage folder. Each
window appends only to its own file, so no lock is needed and two windows never lose an entry; reads merge every
file of the months in range, with a cache keyed on file size and modification time. A line another window is still
writing is ignored, and unreadable lines are skipped and counted ([#23](https://github.com/RemonStuff/Q0T4/issues/23)).
At activation Q0T4 prunes old months and removes the iteration-2 totals key. If the ledger cannot be read, the request is
not sent and the chat says so, because the budget is unknown. `systemClock` supplies the time and the user's IANA time zone.

[`parseConfig`](src/core/subjects/parseConfig.ts) ([#26A](https://github.com/RemonStuff/Q0T4/issues/84)) validates the raw `q0t4.*` settings and never throws. A broken value falls back to its default and adds a warning; `null` means not set. `subjects` only overrides limits, keys are trimmed and keep their casing for display, two keys that differ only by case keep the first, and a `weeklyLimit` of 0 disables a subject. `defaultLimit` (150,000) applies to every repo that is not listed, `warnAtPercent` and `dailyPaceWarning` are clamped to 1-100, and an unknown `resetDay` becomes `monday`. `weeklyLimitFor(config, subject)` matches names case-insensitively. Nothing reads the settings yet; the VS Code settings and adapter are [#26B](https://github.com/RemonStuff/Q0T4/issues/85).

All 677 local unit tests pass with 100% core coverage. The pull request for #26A
records exact-source hosted results when available; no automated VS Code
tests were run on this machine. Full usage metadata remains
[#18](https://github.com/RemonStuff/Q0T4/issues/18).

```sh
npm install
npm test            # unit tests (Vitest)
npm run coverage    # unit tests with the 90% core coverage gate
npm run lint        # ESLint, including the rule that keeps src/core free of vscode
npm run typecheck   # TypeScript, strict
npm run build       # bundle to dist/extension.js
npm run test:integration  # integration tests in a real VS Code (downloads it on first run)
npm run package     # build q0t4-<version>.vsix
npm run test:vsix   # package, install the .vsix into a clean VS Code, and smoke-test it
```

CI (GitHub Actions) runs on every push and pull request:

- lint, format check and typecheck
- unit tests with the coverage gate, on Ubuntu and Windows
- integration tests under `xvfb`
- packaging, then installing the `.vsix` into a clean VS Code and smoke-testing it; every run uploads the tested `.vsix` as an artifact

Branches named `docs/…` skip the test jobs.

Integration tests use a fake language-model provider (vendor `q0t4-test`) and never call real Copilot; see [test/integration/README.md](test/integration/README.md).

Assistant-run integration and installed-VSIX tests run only on GitHub-hosted runners, monitored through the GitHub CLI (`gh`). They must not launch test VS Code windows on the maintainer's Mac. Lint, typechecks and unit tests still run locally.

Press **F5** in VS Code ("Run Extension") to start an Extension Development Host.

The project is strictly test-driven, with core logic kept apart from VS Code behind small interfaces (ports and adapters):

- `src/core/`: all decisions, no `vscode` import, at least 90% line and branch coverage per file
- `src/ports/`: the interfaces core uses to reach VS Code
- `src/adapters/`: thin VS Code implementations of the ports
- `test/fakes/`: tested test doubles for every port, so core tests never need VS Code or a real model:
  - a scripted `FakeModel` with a deterministic tokenizer, injectable errors and cancellation
  - `InMemoryLedger` (JSON lines per writer, like the real ledger files)
  - `FixedClock` (instant + IANA time zone)
  - a fixed-rate credits cost model, plus fakes for config, UI, chat output and price sources

Workflow:

- every change is on its own branch and merged by pull request
- every pull request updates this README
- details are in [PLAN §7–§8](docs/PLAN.md#7-testing-strategy)
