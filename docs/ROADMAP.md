# Q0T4: Roadmap

See [PLAN.md](PLAN.md) for the architecture and testing rules. Each issue is in [issues/](issues/).

Every iteration ends with **CI green** and a **`.vsix` you can install** (the CI artifact, which CI has already installed into a clean VS Code and smoke-tested).

Iterations 0–6 deliver **v0.1: weekly token budgets per repo**. Iterations 7–9 generalise it to **GitHub AI Credits, a monthly pool with a reserve, and a public API**, released as **v1.0** ([PLAN §9](PLAN.md#9-credits-cycles-pools-and-the-public-api)). From iteration 2 on, budget logic is unit-generic (tokens or credits) and usage is stored in an append-only ledger, so the later iterations add to it rather than rework it.

## Status

*Updated with every PR (definition of done, item 7). Last verified delivery:
2026-10-22, PR #109. Counts include merged work only; #15 work is not
counted as done.*

**Now:** iterations 0, *Test harness*, 1, *Walking skeleton*, 2, *Counting and the hard
stop*, and 3, *Weekly storage*, are ✅ **done**. `@q0t4` streams replies from the selected
model, passes history and attached text/files/selections, and cancels the underlying
request. It counts every request, refuses one that does not fit the weekly budget
([#14](issues/14-pre-check-refusal.md)), cuts a reply off when the budget runs out
([#15](issues/15-stream-guard.md)), and ends the reply with a footer, a weekly warning and
a daily pace warning ([#17](issues/17-format-footer-and-warnings.md),
[#24](issues/24-daily-pace-warning.md)); the footer is stripped from history
([#18](issues/18-history-footer-strip-and-metadata.md)). Usage is an append-only ledger on
disk ([#22](issues/22-ledger.md), [#25](issues/25-wire-ledger.md)): weekly, resetting on
Monday, shared by all windows. Slash commands still do not call a model, and there is one
subject, `general`, with fixed settings.
**Current work:** [#26B](https://github.com/RemonStuff/Q0T4/issues/85) declares the `q0t4.*` settings in `package.json` and adds the `vscodeConfig` adapter, so the weekly limit, reset day and both warning levels now come from the user's settings. A broken value falls back with a one-time warning. The settings are application-scoped, so a cloned repo cannot raise its own budget. 682 local unit tests pass with 100% core coverage.
**Next:** the subject detection pieces: [#27 repo identifier](issues/27-repo-identifier.md), [#28 thread subject](issues/28-thread-subject.md), [#29 `/use` parsing](issues/29-use-command-parsing.md).

| Iteration | Done | State |
|---|---|---|
| 0 Test harness | 7 / 7 | ✅ done |
| 1 Walking skeleton | 5 / 5 | ✅ done |
| 2 Counting and the hard stop | 7 / 7 | ✅ done |
| 3 Weekly storage | 6 / 6 | ✅ done |
| 4 Repo subjects | 1 / 8 | in progress |
| 5 Visibility | 0 / 4 | ⚪ not started |
| 6 Hardening and release (v0.1) | 0 / 4 | ⚪ not started |
| 7 Live pricing | 0 / 6 | ⚪ not started |
| 8 Pool, reserve and sync | 0 / 8 (#60 not planned) | ⚪ not started |
| 9 Public API (v1.0) | 0 / 4 | ⚪ not started |
| **Total** | **26 / 59** | 33 to build |

**Done:**

| Issue | Pull request |
|---|---|
| #1 Project scaffold | [#46](https://github.com/RemonStuff/Q0T4/pull/46) |
| #2 Vitest and enforced core coverage | [#47](https://github.com/RemonStuff/Q0T4/pull/47) |
| #3 Port interfaces and domain types | [#68](https://github.com/RemonStuff/Q0T4/pull/68) |
| #4 Test doubles | [#69](https://github.com/RemonStuff/Q0T4/pull/69) |
| #5 Integration runner and fake LM provider | [#70](https://github.com/RemonStuff/Q0T4/pull/70) |
| #6 GitHub Actions CI | [#72](https://github.com/RemonStuff/Q0T4/pull/72) |
| #7 Stub sticky participant and installable `.vsix` | [#73](https://github.com/RemonStuff/Q0T4/pull/73) |
| #8 Core `buildMessages`: prompt and history | [#74](https://github.com/RemonStuff/Q0T4/pull/74) |
| #9 Core model resolution | [#75](https://github.com/RemonStuff/Q0T4/pull/75) |
| #10 Core chat forwarding and streaming | [#76](https://github.com/RemonStuff/Q0T4/pull/76) |
| #11 Selected-model adapters and participant wiring | [#77](https://github.com/RemonStuff/Q0T4/pull/77) |
| #12 Attached references | [#78](https://github.com/RemonStuff/Q0T4/pull/78) |
| #13 Input counting and token costing | [#79](https://github.com/RemonStuff/Q0T4/pull/79) |
| #14 Budget pre-check and refusal | [#80](https://github.com/RemonStuff/Q0T4/pull/80) |
| #15 Stream guard: adaptive recount and cut-off | [#81](https://github.com/RemonStuff/Q0T4/pull/81) |
| #16 Usage recording policy | [#98](https://github.com/RemonStuff/Q0T4/pull/98) |
| #17 Amounts, footer and warning formatting | [#99](https://github.com/RemonStuff/Q0T4/pull/99) |
| #18 Footer stripping and result metadata | [#100](https://github.com/RemonStuff/Q0T4/pull/100) |
| #19 globalState storage adapter and budget enforcement wiring | [#101](https://github.com/RemonStuff/Q0T4/pull/101) (19A), [#102](https://github.com/RemonStuff/Q0T4/pull/102) (19B) |

| #20 Core `BudgetCalendar`: day keys and the week window | [#103](https://github.com/RemonStuff/Q0T4/pull/103) |
| #21 Core next reset and reset labels | [#104](https://github.com/RemonStuff/Q0T4/pull/104) |
| #22 Core `Ledger`: append-only usage entries and totals | [#105](https://github.com/RemonStuff/Q0T4/pull/105) |
| #23 `Ledger` resilience: corrupt lines, retention, settings changes | [#106](https://github.com/RemonStuff/Q0T4/pull/106) |
| #24 Daily pace tracking and warning | [#107](https://github.com/RemonStuff/Q0T4/pull/107) |
| #25 Wire the ledger: file adapter and system clock | [#108](https://github.com/RemonStuff/Q0T4/pull/108) |
| #26B Settings schema and the VS Code config adapter | [#110](https://github.com/RemonStuff/Q0T4/pull/110) |
| #26A Core `parseConfig` and `weeklyLimitFor` | [#109](https://github.com/RemonStuff/Q0T4/pull/109) |
**Planning and design PRs:** [#42](https://github.com/RemonStuff/Q0T4/pull/42) (plan and issues), [#43](https://github.com/RemonStuff/Q0T4/pull/43) (model name in the footer), [#45](https://github.com/RemonStuff/Q0T4/pull/45) (subject = repo), [#67](https://github.com/RemonStuff/Q0T4/pull/67) (AI Credits, pools, public API).

**Decisions along the way:**
- **#5:** no `extensionDependencies`, because Copilot Chat is built into VS Code now.
- **#6:** the coverage gate applies per file.
- **#7:** the participant icon is a built-in codicon (`pulse`) until the final icon arrives in #41.
- **#7:** manual install checks are automated. CI installs the packaged `.vsix` into a clean VS Code and smoke-tests it (`test/vsix/`). Typed chat input can't be driven headless without a signed-in Copilot, so only that stays manual ([manual-testing.md](manual-testing.md)).
- **#8:** core keeps only completed request/response pairs and preserves their text exactly. Empty response pairs and orphan responses are omitted. `HistoryTurn` already holds response text as one string; joining VS Code markdown parts stays in #11's history adapter.
- **#9:** model availability is supplied by the caller, not tested with a model request. An unavailable model triggers one Copilot lookup, preferring the first same-family match before the first result. Empty results return typed `noModel`; selector failures propagate to the handler. Retry-on-`NotFound` stays in #38.
- **#10:** initial handler metadata reports an explicit outcome and the model used. Full versioned usage metadata stays in #18, without placeholder token counts or costs now. Model failures get friendly messages; failures to write output propagate. Cancellation stops further output and closes unfinished streams.
- **#11:** the registered participant and test hook share the same real handler. Each request uses its selected model, with no cached selection. Linked cancellation is released on completion, failure or early stream closure, including closure before the first chunk. Unimplemented slash commands report that they are unavailable without calling a model. Model switching, cancellation and installed-package forwarding are automated with the fake provider; no separate manual model test is required.
- **#12:** references become one labelled, safely fenced user message between history and prompt. File and selection reads use current document text, including unsaved edits. Unsupported references produce one progress note; unreadable files stop before model sending. Attachment checks are automated, including the installed package. Assistant-run VS Code tests run only on GitHub-hosted runners through `gh`; local checks do not open VS Code.
- **#13:** reuse the existing `CostModel` interface. Count complete
  messages concurrently, forward cancellation and return typed failures.
  Core token costing omits credits and rates. Participant wiring remains later;
  installed behavior still has no active metering or budget enforcement.
- **#14:** the optional core gate takes explicit budget state.
  A positive effective budget allows equality; zero always refuses. Extra
  allowance can cover an existing overshoot. Invalid costs fail explicitly.
  Refusal metadata records only the refusal and pre-check stop, not invented
  usage. Reset calculation remains in #21 and installed activation in #19.
- **#15 (in progress):** adaptive recounting uses the active output rate and a real
  final count. Show the already-received limit-reaching chunk, then cancel the
  model without cancelling the chat, and never forward another chunk.
  The stop has explicit metadata, not invented usage. A recount interval plus
  an arriving chunk bounds detection for the test tokenizer, not real billing.
  Recording on every exit is in #16 and installed activation remains in #19.

Both are in PLAN §6–§7.

## Iterations

| # | Iteration | What you can try at the end | Issues |
|---|---|---|---|
| 0 | Test harness | `@q0t4` installs, is sticky, and replies "not wired yet" | [01](issues/01-project-scaffold.md) ✅, [02](issues/02-vitest-and-coverage.md) ✅, [03](issues/03-ports-and-domain-types.md) ✅, [04](issues/04-test-doubles.md) ✅, [05](issues/05-integration-runner-and-fake-provider.md) ✅, [06](issues/06-ci-workflow.md) ✅, [07](issues/07-stub-participant-and-vsix.md) ✅ |
| 1 | Walking skeleton | `@q0t4` answers through the model chosen in the picker, with attached files | [08](issues/08-build-messages.md) ✅, [09](issues/09-model-resolution.md) ✅, [10](issues/10-chat-handler-forwarding.md) ✅, [11](issues/11-wire-participant-to-model.md) ✅, [12](issues/12-attached-references.md) ✅ |
| 2 | Counting and the hard stop | Footer with usage, a pre-check refusal, and the ⛔ cut-off mid-stream (single subject, running total, tokens) | [13](issues/13-count-input.md), [14](issues/14-pre-check-refusal.md), [15](issues/15-stream-guard.md), [16](issues/16-recording-policy.md), [17](issues/17-format-footer-and-warnings.md), [18](issues/18-history-footer-strip-and-metadata.md), [19](issues/19-wire-budget-enforcement.md) |
| 3 | Weekly storage | Usage in an append-only ledger, safe across windows; weekly reset on `resetDay`; daily pace warning | [20](issues/20-budget-calendar-week.md), [21](issues/21-next-reset.md), [22](issues/22-ledger.md), [23](issues/23-ledger-resilience.md), [24](issues/24-daily-pace-warning.md), [25](issues/25-wire-ledger.md) |
| 4 | Repo subjects | Each repo gets its own weekly budget automatically (`owner/repo` from the git remote), per-repo limits in settings, sticky thread subject, `/use` override | [26](issues/26-settings-schema-and-config.md), [27](issues/27-repo-identifier.md), [28](issues/28-thread-subject.md), [29](issues/29-use-command-parsing.md), [30](issues/30-workspace-repo-adapter.md), [31](issues/31-resolve-subject-pipeline.md), [32](issues/32-same-subject-history.md), [33](issues/33-wire-subjects.md) |
| 5 | Visibility | Status bar, `/status`, `/subjects`, and the Show Usage, Reset This Week and Edit Subjects commands | [34](issues/34-status-command.md), [35](issues/35-subjects-command.md), [36](issues/36-status-bar.md), [37](issues/37-commands.md) |
| 6 | Hardening and release | Friendly consent, missing-model and quota errors; long threads trimmed; README; **v0.1 release** | [38](issues/38-model-error-handling.md), [39](issues/39-context-window-trimming.md), [40](issues/40-storage-and-config-failures.md), [41](issues/41-readme-and-release.md) |
| 7 | Live pricing | `budgetUnit: "credits"`: costs from live per-model prices (refreshed daily), stale-price warnings, `/status` shows the price table | [48](issues/48-credit-cost-model.md), [49](issues/49-price-table-parsers.md), [50](issues/50-price-source-adapters.md), [51](issues/51-price-refresher.md), [52](issues/52-model-name-mapping.md), [53](issues/53-wire-credits-mode.md) |
| 8 | Pool, reserve and sync | A 35k-credit monthly pool split across repos, rolling weekly budgets, reserve borrowing, pace warnings, `/sync` with GitHub's figure | [54](issues/54-budget-calendar-cycle.md), [55](issues/55-rolling-weekly-budget.md), [56](issues/56-pool-settings.md), [57](issues/57-reserve-borrowing.md), [58](issues/58-monthly-pace-warning.md), [59](issues/59-sync-command.md), ~~[60](issues/60-auto-sync-usage-api.md)~~ *(not planned)*, [61](issues/61-pool-footer-status.md), [62](issues/62-wire-pool-mode.md) |
| 9 | Public API | Another extension can check budgets and send metered requests; **v1.0 release** | [63](issues/63-public-api-facade.md), [64](issues/64-api-send-request.md), [65](issues/65-api-contract-tests.md), [66](issues/66-readme-and-release-v1.md) |

**Totals:** 60 issues (41 + 19 new): 26 S and 34 M, none L. #60 is not planned (enterprise allowance), so 59 are to be built; progress is in [Status](#status). Issue numbers 42–47 and 67–73 went to pull requests, which share GitHub's numbering.

## Dependency graph (by iteration)

```
it0: 01 ─┬─ 02 ─┬─ 04 ───────────────┐
         ├─ 03 ─┘                    │
         └─ 05 ─┬─ 06 ── 07          │
                └────────┘           │
it1: 03,04 → 08, 09 → 10 → 11 (+07) → 12 (+08)
it2: 10 → 13 → 14, 15 → 16;  03 → 17;  08,17 → 18;  14,15,16,18 → 19
it3: 04 → 20 → 21, 22 → 23;  17,22 → 24;  19,21,23,24 → 25
it4: 25 → 26 → 27 → 30;  26 → 29;  18,26 → 28 → 32;  27,28,29,30 → 31;  31,32 → 33
it5: 33 → 34, 35, 36 → 37
it6: 33 → 38, 39;  25,26 → 40;  38,39,40 → 41
it7: 13 → 48;  03 → 49;  25,49 → 50;  26,48,49 → 51;  48,49 → 52;  34,36,50,51,52 → 53
it8: 20,21 → 54;  22,54 → 55;  26,55 → 56;  14,15,56 → 57;  24,55 → 58;  53,56 → 59   (60 not planned)
     34,36,57,58,59 → 61 → 62
it9: 62 → 63 → 64 → 65;  41,65 → 66
```

Some later-iteration issues have no dependency on the iterations just before them, so they can be pulled forward when convenient: #48 and #49 (pure core) can start any time after #13, and #54 any time after #21.

## Checklist (dependency order)

Each issue depends only on issues with lower numbers, so working top to bottom is always valid. Issues marked ∥ can be done in parallel with the one above.

### Iteration 0: Test harness
- [x] 01 Project scaffold · PR #46
- [x] 02 Vitest and enforced core coverage (needs 01) · PR #47
- [x] 03 Port interfaces and domain types (needs 01) ∥ · PR #68
- [x] 04 Test doubles (needs 02, 03) · PR #69
- [x] 05 Integration runner and fake LM provider (needs 01) ∥ · PR #70
- [x] 06 GitHub Actions CI (needs 02, 05) · PR #72
- [x] 07 Stub sticky participant and `.vsix` (needs 05, 06). 🎯 **Install and try** · PR #73

### Iteration 1: Walking skeleton
- [x] 08 `buildMessages` (needs 03, 04) · PR #74
- [x] 09 Model resolution (needs 03, 04) ∥ · PR #75
- [x] 10 `chatHandler` forwarding (needs 08, 09) · PR #76
- [x] 11 Adapters and wiring (needs 07, 10) · PR #77
- [x] 12 Attached references (needs 08, 11) · PR #78. 🎯 **Install and try**

### Iteration 2: Counting and the hard stop
- [x] 13 `countInput` and `TokenCostModel`, reusing `CostModel` (needs 10) · PR #79
- [x] 14 `preCheck` and refusal (needs 13) · PR #80
- [x] 15 `StreamGuard` (needs 13) ∥ · PR #81
- [x] 16 Recording policy (needs 15) · PR #98
- [x] 17 Amounts, footer and warning formatting (needs 03) ∥ (can start any time after iteration 0) · PR #99
- [x] 18 Footer stripping and metadata (needs 08, 17) · PR #100
- [x] 19 globalState adapter and wiring (needs 14, 15, 16, 18). 🎯 **Install and try**
  - [x] 19A `globalStateStorage` adapter and `TotalsStore` · PR #101
  - [x] 19B wiring and integration tests · PR #102

### Iteration 3: Weekly storage
- [x] 20 `BudgetCalendar`: day keys and the week window (needs 04) · PR #103
- [x] 21 Next reset (needs 20) · PR #104
- [x] 22 `Ledger`: append-only entries and totals (needs 20) ∥ · PR #105
- [x] 23 Ledger resilience (needs 22) · PR #106
- [x] 24 Daily pace warning (needs 17, 22) ∥ · PR #107
- [x] 25 Wire the ledger: file adapter and system clock (needs 19, 21, 23, 24) · PR #108. 🎯 **Install and try**

### Iteration 4: Repo subjects
- [x] 26 Settings schema, `parseConfig` and limits (needs 25) · PR #110
  - [x] 26A Core `parseConfig` and `weeklyLimitFor` · PR #109
  - [x] 26B Settings schema and the VS Code config adapter · PR #110
- [ ] 27 Repo identifier from git remotes (needs 26)
- [ ] 28 Thread subject (needs 18, 26) ∥
- [ ] 29 `/use` parsing (needs 26) ∥
- [ ] 30 WorkspacePort and git workspace adapter (needs 27)
- [ ] 31 `resolveSubject` pipeline (needs 27, 28, 29, 30)
- [ ] 32 Same-subject history (needs 28) ∥
- [ ] 33 Wire repo subjects (needs 31, 32). 🎯 **Install and try**

### Iteration 5: Visibility
- [ ] 34 `/status` (needs 33)
- [ ] 35 `/subjects` (needs 33) ∥
- [ ] 36 Status bar (needs 33) ∥
- [ ] 37 Commands (needs 36). 🎯 **Install and try**

### Iteration 6: Hardening and release
- [ ] 38 Model error mapping (needs 33)
- [ ] 39 Context-window trimming (needs 33) ∥
- [ ] 40 Storage and config failures (needs 25, 26) ∥
- [ ] 41 README and release v0.1 (needs 38, 39, 40). 🎯 **v0.1 release**

### Iteration 7: Live pricing
- [ ] 48 `CreditCostModel`: tiers, snapshots, unknown models (needs 13)
- [ ] 49 Price-table parsers and validation (needs 03) ∥
- [ ] 50 Price source and price-table store adapters (needs 25, 49)
- [ ] 51 `PriceRefresher`, price settings and refresh command (needs 26, 48, 49) ∥
- [ ] 52 Map VS Code models to price-table entries (needs 48, 49) ∥
- [ ] 53 Wire credits mode end to end (needs 34, 36, 50, 51, 52). 🎯 **Install and try**

### Iteration 8: Pool, reserve and sync
- [ ] 54 `BudgetCalendar`: billing cycle level (needs 20, 21)
- [ ] 55 Rolling weekly budget from a monthly share (needs 22, 54)
- [ ] 56 Pool, share and reserve settings (needs 26, 55)
- [ ] 57 Reserve borrowing: auto, ask, off (needs 14, 15, 56)
- [ ] 58 Monthly pace warning (needs 24, 55) ∥
- [ ] 59 `/sync` and the calibration ratio (needs 53, 56) ∥
- [ ] ~~60 Optional automatic sync from the usage API~~ *not planned: enterprise allowance (PLAN open question 12)*
- [ ] 61 Pool-mode footer, `/status` and status bar (needs 34, 36, 57, 58, 59)
- [ ] 62 Wire pool mode end to end (needs 61). 🎯 **Install and try**

### Iteration 9: Public API
- [ ] 63 Public API façade: status, canSpend, usage events (needs 62)
- [ ] 64 `api.sendRequest` with metering and cut-off (needs 63)
- [ ] 65 Contract tests with a fake consumer extension (needs 64)
- [ ] 66 README and release v1.0 (needs 41, 65). 🎯 **v1.0 release**

## Definition of done (every issue)
0. The work is on its own branch (`<type>/<NN>-<short-title>`) and merged through a PR that says `Closes #NN`. Docs-only work uses `docs/<topic>` branches, which skip the automated tests (see [PLAN §8](PLAN.md#8-branches-and-pull-requests)).
1. The tests listed under "Tests to write first" were committed **red** before the implementation
2. All tests are green, and core line and branch coverage is ≥ 90%
3. CI is green: lint, typecheck, unit (ubuntu and windows), integration (xvfb), package
4. Checks are automated: anything that can run headless is a test (unit, integration, or `.vsix` smoke in `test/vsix/`). Only what genuinely can't run headless goes in `docs/manual-testing.md`, with the reason (decided in #7)
5. Unit-dependent behaviour is tested in every unit (`describe.each` over tokens and credits), from iteration 2 on
6. The root `README.md` is updated: the project description and how to use what exists after this PR
7. This ROADMAP is updated: the [Status](#status) section (progress, done table with the PR, next up) and the checklist tick with the PR number
