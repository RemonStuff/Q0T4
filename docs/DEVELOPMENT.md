# Q0T4 development notes

How the code is built, in the order it was built. The user-facing description is in the [README](../README.md); the plan is [PLAN.md](../PLAN.md) and the progress is in the [roadmap](../ROADMAP.md).

## Behaviour notes (per issue)

- Metering and the hard stop use one subject, `general`, with a weekly token budget (200,000 by default, set with `q0t4.subjects`) that resets on Monday at local midnight (`q0t4.resetDay`), a warning from 80% of the week (`q0t4.warnAtPercent`) and a pace warning at 30% of the week in one day (`q0t4.dailyPaceWarning`). The usage ledger is kept under the extension's global storage folder; month folders older than 13 months are pruned when VS Code starts, and the totals from the iteration-2 preview are dropped. Budgeting applies only to chats through `@q0t4`, not inline completions, agent mode or normal Copilot chat.
- Only explicitly attached text, files and selections are included. Q0T4 does not search the workspace or execute tool references. Image data, common binary image files and NUL-containing document text are unsupported; they are skipped with one progress note.
- Model errors ([#38](https://github.com/RemonStuff/Q0T4/issues/38)): the adapter ([`mapModelError`](../src/adapters/errorMapping.ts)) turns a `LanguageModelError` into a core [`ModelError`](../src/core/errors/modelErrors.ts) by its `code`, and core decides the rest. `NoPermissions` asks the user to accept the Copilot prompt and try again; `Blocked` says Copilot reports a quota or rate limit; `NotFound` is retried once with another Copilot model (same family first, never the one that was not found), and if that fails too, or there is none, the no-model message is shown; any other error shows the generic message with the first line of the original message (up to 200 characters). Internal errors keep the generic message only. A request that is rejected before anything streams charges nothing; an error after some output charges the input and what was streamed. The footer and metadata name the model that answered, so after a fallback that is the fallback.
- Future token counts will be estimates and will not exactly match how GitHub meters Copilot.

## Development

Requirements: Node.js 22 or newer, and VS Code 1.104 or newer.

The core includes [`buildMessages`](../src/core/messages/buildMessages.ts), which prepares completed user/assistant history pairs, one user message containing attached reference blocks, then the current prompt. It preserves text exactly and leaves supplied inputs unchanged. Reference labels identify files and selection ranges; fences are longer than any backtick sequence in their content. Unanswered requests, empty response pairs and orphan responses are omitted.

[`resolveModel`](../src/core/models/resolveModel.ts) keeps the requested model unless the caller marks it unavailable. It then queries Copilot models once, preferring the same family before the first available result, or returns a typed `noModel` result. [`formatNoModel`](../src/core/format/formatNoModel.ts) supplies the sign-in guidance for that result. Resolution never probes a model or sends a prompt; retry-on-`NotFound` comes later.

[`chatHandler`](../src/core/chatHandler.ts) combines model resolution and message
building, forwards a request through `ModelPort`, and streams each text chunk
to the supplied output. It checks cancellation, closes unfinished streams, and
reports model failures with a friendly message while preserving partial
replies. Its JSON-safe metadata reports the outcome and, for generated replies,
the model used, without inventing token counts or costs; full usage metadata
comes in [#18](https://github.com/RemonStuff/Q0T4/issues/18).

[`extension.ts`](../src/extension.ts) connects that core pipeline to the real participant and the integration-test hook. The [adapters](../src/adapters/) convert history and messages, use each request's selected model, and link cancellation without retaining listeners after the request ends. Integration and installed-VSIX tests use the fake `q0t4-test` provider to verify forwarding, model switching and cancellation; they never call real Copilot.

[`referenceReader`](../src/adapters/referenceReader.ts) resolves attached strings, file URIs and Location selections through VS Code's document APIs. The handler restores prompt order from VS Code's reversed reference list without deduplicating references by their kind ID. Unsupported values are reported once, read failures stop before sending, and cancellation prevents further reads or model calls.

[`countInput`](../src/core/budget/countInput.ts) is core-only groundwork: it counts
every complete message through the supplied model, concurrently, including
history and formatted references. It forwards the cancellation signal, stops
waiting with typed `Cancelled`, and wraps tokenizer failures in `CountError`
with a safe message and the original cause. Its cancellation listener is always
released. A tokenizer that ignores cancellation may keep running internally.

[`TokenCostModel`](../src/core/cost/tokenCostModel.ts) implements the existing
[`CostModel`](../src/core/cost/costModel.ts): cost is input plus output tokens, with
no credits or rate snapshot. Neither helper sends a model request. The participant
uses them since [#19B](https://github.com/RemonStuff/Q0T4/issues/83).

[`preCheck`](../src/core/budget/preCheck.ts) is a pure budget decision in tokens or
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

[`formatRefusal`](../src/core/format/formatRefusal.ts) shows the subject, used cost,
effective budget, remaining amount and supplied reset label, with `/status`
and `/use` hints. Amounts are not rounded; dynamic labels are escaped for
Markdown. The formatter does not calculate dates.

The pre-check shipped in [PR #80](https://github.com/RemonStuff/Q0T4/pull/80).
Its exact-main CI passed unit, integration and installed-package checks.
The installed participant supplies a budget context since
[#19B](https://github.com/RemonStuff/Q0T4/issues/83), with the real reset labels
(`Mon`, and `Mon 19 Oct` in a refusal) since
[#25](https://github.com/RemonStuff/Q0T4/issues/25). The command hints do not
activate the slash commands that are not implemented yet.

[`StreamGuard`](../src/core/budget/streamGuard.ts) is implemented and unit-tested
locally for [#15](https://github.com/RemonStuff/Q0T4/issues/15). It uses the same
optional handler budget context, so installed behavior is still unchanged.
Between real output recounts, it estimates extra tokens as extra characters
divided by four, anchored to the last real count. Far from the limit, it
recounts the entire accumulated output after 400 characters. Once estimated
remaining cost falls below 10% of the effective budget or twice the last
chunk's estimated cost, it recounts every chunk.

[`recordingPolicy`](../src/core/budget/recordingPolicy.ts) decides what a request
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

[`core/format`](../src/core/format/) holds the usage strings from
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

[`stripFooter`](../src/core/messages/stripFooter.ts) removes everything from the last
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

The [`globalStateStorage`](../src/adapters/globalStateStorage.ts) adapter puts `StoragePort` on VS
Code's `globalState`. It holds small settings-like state only; usage lives in the ledger. (The
iteration-2 `TotalsStore` kept running totals there and is gone: VS Code's `globalState` can
replace a newer pending value with a stale echo of an earlier write, and it is per window.)

[`BudgetCalendar`](../src/core/time/budgetCalendar.ts) ([#20](https://github.com/RemonStuff/Q0T4/issues/20))
is the pure calendar for the enforced week. `dayKey(instant)` is the local calendar day
and `weekWindow(instant)` the `[start, end)` day keys of the week that starts at local
midnight on `resetDay`. Both use `Intl` with the IANA zone from the clock, never the
machine's `TZ`, and do their arithmetic on `YYYY-MM-DD` keys (`addDays`, `daysBetween`),
so a DST change, a year boundary or a far-away time zone cannot move a boundary. Nothing
uses it yet; the ledger totals (#22) and the next-reset labels (#21) are built on it.

[`nextResetKey`, `msUntilReset`, `formatResetShort` and `formatResetLong`](../src/core/time/reset.ts)
([#21](https://github.com/RemonStuff/Q0T4/issues/21)) say when the current week ends. The reset is at
local midnight, so `msUntilReset` stays correct across a DST change, and
`BudgetCalendar.startOfDay` also handles a day whose midnight a DST change skipped. Labels use
fixed English abbreviations: `Mon` for the footer and `Mon 19 Oct` for the refusal. The installed
participant passes them to the footer and the refusal since
[#25](https://github.com/RemonStuff/Q0T4/issues/25).

[`Ledger`](../src/core/ledger/ledger.ts) ([#22](https://github.com/RemonStuff/Q0T4/issues/22)) keeps usage as an
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

[`paceWarning`](../src/core/budget/paceWarning.ts) ([#24](https://github.com/RemonStuff/Q0T4/issues/24)) warns,
without ever blocking, when a subject has used `dailyPaceWarning`% (default 30%) of its weekly budget within
one local day, in whichever unit is active. It is computed from today's usage, so it ends at local midnight
by itself. The handler writes `⚠️ Daily pace: 62k used today, at least 30% of the weekly budget (60k).`
after the weekly warning when it is given today's usage (`budget.usedToday`) and the setting
(`footer.dailyPaceWarning`); the figures count the request just answered. The installed participant
supplies today's usage from the ledger since [#25](https://github.com/RemonStuff/Q0T4/issues/25).

[`fileLedger`](../src/adapters/fileLedger.ts) ([#25](https://github.com/RemonStuff/Q0T4/issues/25)) stores the
ledger as JSON Lines files, `ledger/<YYYY-MM>/<sessionId>.jsonl` under VS Code's global storage folder. Each
window appends only to its own file, so no lock is needed and two windows never lose an entry; reads merge every
file of the months in range, with a cache keyed on file size and modification time. A line another window is still
writing is ignored, and unreadable lines are skipped and counted ([#23](https://github.com/RemonStuff/Q0T4/issues/23)).
At activation Q0T4 prunes old months and removes the iteration-2 totals key. If the ledger cannot be read, the request is
not sent and the chat says so, because the budget is unknown. `systemClock` supplies the time and the user's IANA time zone.

[`parseConfig`](../src/core/subjects/parseConfig.ts) ([#26A](https://github.com/RemonStuff/Q0T4/issues/84)) validates the raw `q0t4.*` settings and never throws. A broken value falls back to its default and adds a warning; `null` means not set. `subjects` only overrides limits, keys are trimmed and keep their casing for display, two keys that differ only by case keep the first, and a `weeklyLimit` of 0 disables a subject. `defaultLimit` (150,000) applies to every repo that is not listed, `warnAtPercent` and `dailyPaceWarning` are clamped to 1-100, and an unknown `resetDay` becomes `monday`. `weeklyLimitFor(config, subject)` matches names case-insensitively. Nothing reads the settings yet; the VS Code settings and adapter are [#26B](https://github.com/RemonStuff/Q0T4/issues/85).

The `q0t4.*` settings ([#26B](https://github.com/RemonStuff/Q0T4/issues/85)) are declared in `package.json` and read by the [`vscodeConfig`](../src/adapters/vscodeConfig.ts) adapter through `parseConfig`: `q0t4.subjects` (per-repo or per-name weekly limits, e.g. `{ "RemonStuff/Q0T4": { "weeklyLimit": 50000 } }`), `q0t4.defaultLimit` (150,000, for every repo not listed), `q0t4.fallbackSubject`, `q0t4.resetDay`, `q0t4.warnAtPercent`, `q0t4.dailyPaceWarning` and `q0t4.includeHistory`. A change applies to the next request. A broken value falls back to its default and a warning is shown once, when the setting changes. The settings are application-scoped, so a repo's own `.vscode/settings.json` cannot raise its budget. Until repo detection arrives, all chats still use the fallback subject.

[`normaliseRemote` and `repoSubject`](../src/core/subjects/repoIdentifier.ts) ([#27](https://github.com/RemonStuff/Q0T4/issues/27)) derive the subject from the repo a folder is in. A git remote becomes `owner/repo` and never includes the host, so the same repo matches on every machine and clone: HTTPS, `git@host:owner/repo.git`, `ssh://` URLs, a trailing `.git` or slash and credentials in the URL are handled, GitLab subgroups are kept (`group/sub/repo`) and Azure DevOps becomes `org/project/repo`. `repoSubject` uses the `origin` remote, else the first remote that can be read, else the folder name, and returns nothing when no folder is open, so the caller uses the fallback subject. Nothing calls it yet; the workspace adapter is [#30](https://github.com/RemonStuff/Q0T4/issues/30).

[`threadSubject`](../src/core/subjects/threadSubject.ts) ([#28](https://github.com/RemonStuff/Q0T4/issues/28)) finds the subject of the conversation so far. The chat API has no thread id, so it is the subject in the metadata of the newest response turn that carries valid Q0T4 metadata; refusals and `/use` turns count, a blank subject is ignored, and any non-empty name is accepted because a repo does not have to be configured. History already carries each response's metadata through the history adapter, so no adapter change was needed.

[`parseUse`](../src/core/subjects/parseUse.ts) ([#29](https://github.com/RemonStuff/Q0T4/issues/29)) parses what follows `/use`: `<subject> <question>`. The subject must be a known one, matched case-insensitively and returned in its canonical spelling, so a typo cannot silently create a budget: [`knownSubjects`](../src/core/subjects/knownSubjects.ts) is the configured keys, the fallback subject, subjects with usage in the last 12 weeks (`Ledger.subjectsSeen(since)`) and the current repo. A subject may contain spaces (Azure DevOps projects), so the longest known subject wins. The question keeps its whitespace and newlines. `/use general` alone only switches the conversation's subject; an unknown subject or an empty `/use` returns a message listing the known subjects (at most 20). Nothing calls it yet; the pipeline is [#31](https://github.com/RemonStuff/Q0T4/issues/31).

[`workspaceRepo`](../src/adapters/workspaceRepo.ts) ([#30](https://github.com/RemonStuff/Q0T4/issues/30)) tells which repo the user is working in. The folder is chosen by the pure [`pickFolder`](../src/core/subjects/pickFolder.ts): the workspace folder that contains the active editor's file (the deepest, if folders are nested), else the first folder, else none. Its remotes come from VS Code's built-in Git extension, which is asked to open the folder's repository if it has not found it yet, and waited for briefly while it starts. If the Git extension is missing, disabled, has not found the repo or fails, the remotes are read with `git remote -v` instead (3 s timeout). If that fails too, or the folder is not a git repo, the folder is still returned, with no remotes. The adapter is tested against real temporary git repos in the integration tests. The participant does not use it yet; that is [#33](https://github.com/RemonStuff/Q0T4/issues/33).

[`resolveSubject`](../src/core/subjects/resolveSubject.ts) ([#31](https://github.com/RemonStuff/Q0T4/issues/31)) picks the subject for a request and stops at the first source that answers: `/use <subject> ...`, then the conversation's subject ([`threadSubject`](../src/core/subjects/threadSubject.ts)), then the current repo ([`repoSubject`](../src/core/subjects/repoIdentifier.ts)), then the fallback subject when no folder is open. The result also says which source answered, shown as a short note such as `Subject: RemonStuff/Q0T4 (repo)` ([`formatSubjectNote`](../src/core/format/formatSubjectNote.ts)). `/use <subject>` alone returns `setOnly`, an unknown subject returns the error text, and a `/use` question replaces the prompt. Resolving never calls a model and costs no tokens. The participant does not use it yet; that is [#33](https://github.com/RemonStuff/Q0T4/issues/33).

[`filterHistoryBySubject`](../src/core/messages/filterHistory.ts) ([#32](https://github.com/RemonStuff/Q0T4/issues/32)) keeps only the request/response pairs charged to the current subject: a request goes with the response that follows it, and that response's Q0T4 metadata names the subject (compared case-insensitively). Pairs from other subjects or without Q0T4 metadata are dropped and the order is kept. `buildMessages` takes `{ subject, includeHistory }`: with a subject it sends only that subject's history, with `includeHistory: false` it sends none, and references and the prompt are always sent. Without options it behaves as before. The participant does not pass them yet; that is [#33](https://github.com/RemonStuff/Q0T4/issues/33).

Repo subjects are wired in ([#33A](https://github.com/RemonStuff/Q0T4/issues/86)). Before anything is sent, [`routeRequest`](../src/core/subjects/routeRequest.ts) picks the subject (`/use`, the conversation's subject, the repo of the active workspace folder, else `q0t4.fallbackSubject`) and the participant shows a note such as `Subject: RemonStuff/Q0T4 (repo)`. The weekly limit is the subject's entry in `q0t4.subjects`, else `q0t4.defaultLimit`; usage, the footer and the history sent to the model follow the same subject, and `q0t4.includeHistory: false` sends no history. `/use <subject> <question>` charges one question to a known subject; `/use <subject>` alone switches the conversation (a reply with zero tokens, nothing recorded); an unknown subject lists the known ones and sends nothing. A failing Git extension or an unreadable ledger never blocks a request. The end-to-end tests with real git repos are [#33B](https://github.com/RemonStuff/Q0T4/issues/87).

The end-to-end behaviour of repo subjects ([#33B](https://github.com/RemonStuff/Q0T4/issues/87)) is tested in real VS Code with temporary git repos as the workspace, and once in the installed `.vsix`: a prompt in a repo is charged to `owner/repo` with its own or the default limit; a follow-up stays on the conversation's subject; `/use general <question>` charges `general`; `/use general` alone switches without a model call or tokens; an unknown subject lists the known ones; an exhausted repo is refused while `/use general` still works; a changed `q0t4.subjects` applies at the next request; history is limited to the same subject and `q0t4.includeHistory: false` sends none.

`/status` ([#34](https://github.com/RemonStuff/Q0T4/issues/34)) answers with a table of every known subject: the configured ones, those with usage this week and the repo of the open folder. Each row shows used, weekly budget (marked `(default)` when it comes from `q0t4.defaultLimit`), percent, usage today and the number of requests this week, with `⚠️` from `q0t4.warnAtPercent` and `⛔` at the limit; the current repo is first, then subjects by usage, and the reset date is below the table. [`formatStatusTable`](../src/core/format/statusTable.ts) builds it, `Ledger.weekUsage` supplies the week's total and request count in one read, and the chat handler answers the command without selecting a model, counting or recording anything. Its metadata has no subject, so the conversation keeps its own.

`/subjects` ([#35](https://github.com/RemonStuff/Q0T4/issues/35)) lists the subjects `/use` accepts, plus the conversation's own: each with its weekly limit (marked `(default)` when it comes from `q0t4.defaultLimit`), its description, and marks for the current repo, the fallback subject and this conversation. [`subjectItems`](../src/core/subjects/subjectItems.ts) builds the rows and [`formatSubjectList`](../src/core/format/subjectList.ts) the text, which ends with the default limit for new repos and hints for `/use` and the `q0t4.subjects` setting. `ChatOutputPort` gained `button(commandId, title)` for the closing **Edit Subjects** button, which runs `q0t4.editSubjects` (#37). The command reads settings and the ledger only: no model call, nothing counted or recorded.

The status bar item ([#36](https://github.com/RemonStuff/Q0T4/issues/36)) shows the subject of the open folder's repo, else the last-used subject (kept under `q0t4.ui.lastSubject`), else the fallback subject, with its usage this week, e.g. `$(pulse) RemonStuff/Q0T4 113k/150k`. It is yellow from `q0t4.warnAtPercent` and red when the budget is used up; the tooltip lists every subject and the reset date. [`formatStatusBar`](../src/core/format/statusBarText.ts) computes text, tooltip and state, [`StatusBarController`](../src/core/statusBar.ts) keeps it current (after every request, also a refusal, on a settings change, when the active editor or the workspace folders change, and by a timer at the weekly reset), and [`vscodeUi`](../src/adapters/vscodeUi.ts) only draws it. `/status` and the status bar share [`buildStatusRows`](../src/core/statusRows.ts). If the ledger can't be read, the item shows `Q0T4 ?` instead of a wrong number.

The three palette commands ([#37](https://github.com/RemonStuff/Q0T4/issues/37)) are declared in `package.json` under the category _Q0T4_ and implemented in [`createCommands`](../src/core/commands.ts): **Show Usage** opens the `/status` table in a new editor tab (the status bar item runs it when clicked), **Edit Subjects** opens Settings filtered to `q0t4.subjects` (the button at the end of `/subjects` runs it too), and **Reset This Week** asks for a modal confirmation that names the week, then appends a reset marker to the ledger for every subject with entries this week. Nothing is deleted: weekly totals count only what follows the marker, earlier weeks and range or cycle totals are unchanged, and the status bar refreshes. `UiPort` gained `showDocument`, which `vscodeUi` implements next to `confirm`, `openSettings` and `showInfo`.

- Model errors ([#38](https://github.com/RemonStuff/Q0T4/issues/38)): the adapter ([`mapModelError`](../src/adapters/errorMapping.ts)) turns a `LanguageModelError` into a core [`ModelError`](../src/core/errors/modelErrors.ts) by its `code`, and core decides the rest. `NoPermissions` asks the user to accept the Copilot prompt and try again; `Blocked` says Copilot reports a quota or rate limit; `NotFound` is retried once with another Copilot model (same family first, never the one that was not found), and if that fails too, or there is none, the no-model message is shown; any other error shows the generic message with the first line of the original message (up to 200 characters). Internal errors keep the generic message only. A request that is rejected before anything streams charges nothing; an error after some output charges the input and what was streamed. The footer and metadata name the model that answered, so after a fallback that is the fallback.

Context-window trimming ([#39](https://github.com/RemonStuff/Q0T4/issues/39)): with a budget, the input is counted message by message ([`trimToWindow`](../src/core/messages/trimToWindow.ts)). When it exceeds 90% of the model's `maxInputTokens`, the oldest history pairs are dropped, whole pairs only, until it fits; the references and the prompt are never dropped. A progress note says how many earlier messages were left out, and the pre-check and the ledger use the count after trimming. If the references and the prompt alone do not fit, Q0T4 says so, sends nothing and charges nothing. The window is checked per model, so a fallback model (#38) is trimmed to its own window. Without a budget context nothing is counted or trimmed.

Failure paths outside the model ([#40](https://github.com/RemonStuff/Q0T4/issues/40)): problems with storage and settings never break a chat. Core's [`Diagnostics`](../src/core/diagnostics/diagnostics.ts) logs every occurrence through a `LogPort` (the **Q0T4** output channel, [`outputChannelLog`](../src/adapters/outputChannelLog.ts)) and tells the user once per problem per session. A usage write that fails (disk full, a locked file) keeps the reply and warns once that the weekly total may be too low. A ledger line or file that can't be read is skipped, counted and warned once. A stored price table that can't be read is treated as missing and warned once ([`loadStoredPrices`](../src/core/pricing/loadStoredPrices.ts)). Invalid settings fall back to their defaults and are reported once for the same set of problems.

Release packaging ([#41](https://github.com/RemonStuff/Q0T4/issues/41)): the README is now the user's guide; this file holds the build notes. [`release.yml`](../.github/workflows/release.yml) runs on a `v*` tag: the full CI (`ci.yml` is also callable), then `vsce package` and a GitHub Release with the `.vsix`; a tag with a suffix such as `v0.1.0-rc.1` is a pre-release, and running it by hand is a dry run that only uploads the `.vsix` as an artifact. v0.1 is distributed through GitHub Releases only; nothing is published to a marketplace. A unit test ([`release.test.ts`](../test/unit/tooling/release.test.ts)) checks the package metadata, that the README documents every setting and command, the changelog and the workflow.

Credit costs ([#48](https://github.com/RemonStuff/Q0T4/issues/48)): [`CreditCostModel`](../src/core/cost/creditCostModel.ts) turns tokens into credits from a `PriceTable`: `(input × inputRate + output × outputRate) / 1e6 × 100`. The tier comes from the request's input size against the model's threshold; the input rate is the higher of `input` and `cacheWrite`; an override replaces a model's rates; a model nobody priced costs the highest input and output rates in the table (and the overrides) and is flagged `unknownPrice` so the user can be warned. Each result carries a `RateSnapshot` (rates, tier, table date and source), so a recorded entry is never repriced. Credits are kept unrounded. [`matchModel`](../src/core/pricing/matchModel.ts) matches by display name only until #52. Nothing uses the model yet: credits mode is wired in #53.

Price parsing ([#49](https://github.com/RemonStuff/Q0T4/issues/49)): two parsers turn GitHub's published price list into a `PriceTable` with no runtime dependencies. [`parseYamlTable`](../src/core/pricing/parseYamlTable.ts) reads exactly the YAML subset of `models-and-pricing.yml` (flat `- key: value` records, plain, single-quoted or double-quoted scalars, `#` comments); anything else (nesting, flow collections, anchors, tags, block scalars, tabs, wrong indentation, duplicate keys) is a `PriceParseError` with a line number. [`parseMarkdownTable`](../src/core/pricing/parseMarkdownTable.ts) reads the article's pipe tables, one per provider, whose columns differ. Both normalise footnote markers, `$` prices, `Not applicable` and thresholds like `≤ 272K`, group a model's records into tiers, and give providers the same id (`moonshot_ai`), so the two sources produce equal tables. [`validateTable`](../src/core/pricing/validateTable.ts) checks a fetched table before it replaces the stored one: models with tiers, every rate positive, the required models present, and no rate moved more than 3× (exactly 3× passes; the first table skips that check). It returns every failing check. The tests run on real snapshots of both sources in `test/fixtures/pricing/`.

Price adapters ([#50](https://github.com/RemonStuff/Q0T4/issues/50)): [`githubDocsPriceSource`](../src/adapters/githubDocsPriceSource.ts) implements `PriceSourcePort` with Node's `fetch` and a 10 s timeout. It asks the raw YAML first, conditional on the stored ETag (a 304 is `unchanged`), parses it with #49 and, if that request fails, returns a non-200 status, doesn't parse or yields no models, asks the docs article as Markdown. If both fail it returns `failed` with both reasons. [`priceTableFile`](../src/adapters/priceTableFile.ts) stores the table at `prices/table.json` through a temporary file and a rename, so a reader never sees half a file; a file that isn't a price table throws (core treats that as a missing table). The URLs are injectable and the tests run against a local HTTP server fixture, never the real network. Nothing calls the adapters yet: the refresher is #51.

Price refresh ([#51](https://github.com/RemonStuff/Q0T4/issues/51)): [`PriceRefresher`](../src/core/pricing/priceRefresher.ts) keeps the price table fresh without ever blocking a chat. `start()` loads the stored table, fetches (with the stored ETag) and schedules a check every 24 hours; `refreshNow()` fetches immediately. An `ok` table is validated against the previous one and the required models before it is saved; an `unchanged` answer re-dates the stored table (so it isn't flagged stale while GitHub's list is simply unchanged); a failed fetch or a failed validation keeps the last good table and warns once per failure streak. `isStale()` is true when the table is older than `q0t4.priceMaxAgeHours`; `currentTable()` is the fetched table with the `q0t4.modelPrices` overrides on top, or, with `q0t4.priceSource` set to manual, a table from the overrides alone (nothing is fetched). With no table, `currentTable()` is `undefined` and the caller must refuse rather than guess. `Q0T4: Refresh Model Prices` runs `refreshNow()` and says what happened. Extension activation does not start the refresher: credits mode does (#53).

All 1227 local unit tests pass with 100% core coverage. The pull request for #51
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
- integration tests under `xvfb` (a run in which VS Code never started its tests, a runner flake, is retried up to three times; a run in which tests ran and failed is not)
- packaging, then installing the `.vsix` into a clean VS Code and smoke-testing it; every run uploads the tested `.vsix` as an artifact

Branches named `docs/…` skip the test jobs.

Integration tests use a fake language-model provider (vendor `q0t4-test`) and never call real Copilot; see [test/integration/README.md](../test/integration/README.md).

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
- details are in [PLAN §7–§8](PLAN.md#7-testing-strategy)
