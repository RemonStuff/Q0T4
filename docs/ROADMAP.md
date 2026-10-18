# Q0T4: Roadmap

See [PLAN.md](PLAN.md) for the architecture and testing rules. Each issue is in [issues/](issues/).

Every iteration ends with **CI green** and a **`.vsix` you can install** (downloaded from the CI artifact) and try by following `docs/manual-testing.md`.

## Iterations

| # | Iteration | What you can try at the end | Issues |
|---|---|---|---|
| 0 | Test harness | `@q0t4` installs, is sticky, and replies "not wired yet" | [01](issues/01-project-scaffold.md), [02](issues/02-vitest-and-coverage.md), [03](issues/03-ports-and-domain-types.md), [04](issues/04-test-doubles.md), [05](issues/05-integration-runner-and-fake-provider.md), [06](issues/06-ci-workflow.md), [07](issues/07-stub-participant-and-vsix.md) |
| 1 | Walking skeleton | `@q0t4` answers through the model chosen in the picker, with attached files | [08](issues/08-build-messages.md), [09](issues/09-model-resolution.md), [10](issues/10-chat-handler-forwarding.md), [11](issues/11-wire-participant-to-model.md), [12](issues/12-attached-references.md) |
| 2 | Counting and the hard stop | Footer with usage, a pre-check refusal, and the ⛔ cut-off mid-stream (single subject, running total) | [13](issues/13-count-input.md), [14](issues/14-pre-check-refusal.md), [15](issues/15-stream-guard.md), [16](issues/16-recording-policy.md), [17](issues/17-format-footer-and-warnings.md), [18](issues/18-history-footer-strip-and-metadata.md), [19](issues/19-wire-budget-enforcement.md) |
| 3 | Weekly storage | Usage resets weekly on `resetDay`, with a daily pace warning | [20](issues/20-week-and-day-keys.md), [21](issues/21-next-reset.md), [22](issues/22-budget-store.md), [23](issues/23-budget-store-resilience.md), [24](issues/24-daily-pace-warning.md), [25](issues/25-wire-weekly-storage.md) |
| 4 | Repo subjects | Each repo gets its own weekly budget automatically (`owner/repo` from the git remote), per-repo limits in settings, sticky thread subject, `/use` override | [26](issues/26-settings-schema-and-config.md), [27](issues/27-repo-identifier.md), [28](issues/28-thread-subject.md), [29](issues/29-use-command-parsing.md), [30](issues/30-workspace-repo-adapter.md), [31](issues/31-resolve-subject-pipeline.md), [32](issues/32-same-subject-history.md), [33](issues/33-wire-subjects.md) |
| 5 | Visibility | Status bar, `/status`, `/subjects`, and the Show Usage, Reset This Week and Edit Subjects commands | [34](issues/34-status-command.md), [35](issues/35-subjects-command.md), [36](issues/36-status-bar.md), [37](issues/37-commands.md) |
| 6 | Hardening and release | Friendly consent, missing-model and quota errors; long threads trimmed; README; release `.vsix` | [38](issues/38-model-error-handling.md), [39](issues/39-context-window-trimming.md), [40](issues/40-storage-and-config-failures.md), [41](issues/41-readme-and-release.md) |

**Totals:** 41 issues: 24 S and 17 M, none L.

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
```

## Checklist (dependency order)

Each issue depends only on issues with lower numbers, so working top to bottom is always valid. Issues marked ∥ can be done in parallel with the one above.

### Iteration 0: Test harness
- [ ] 01 Project scaffold
- [ ] 02 Vitest and enforced core coverage (needs 01)
- [ ] 03 Port interfaces and domain types (needs 01) ∥
- [ ] 04 Test doubles (needs 02, 03)
- [ ] 05 Integration runner and fake LM provider (needs 01) ∥
- [ ] 06 GitHub Actions CI (needs 02, 05)
- [ ] 07 Stub sticky participant and `.vsix` (needs 05, 06). 🎯 **Install and try**

### Iteration 1: Walking skeleton
- [ ] 08 `buildMessages` (needs 03, 04)
- [ ] 09 Model resolution (needs 03, 04) ∥
- [ ] 10 `chatHandler` forwarding (needs 08, 09)
- [ ] 11 Adapters and wiring (needs 07, 10)
- [ ] 12 Attached references (needs 08, 11). 🎯 **Install and try**

### Iteration 2: Counting and the hard stop
- [ ] 13 `countInput` (needs 10)
- [ ] 14 `preCheck` and refusal (needs 13)
- [ ] 15 `StreamGuard` (needs 13) ∥
- [ ] 16 Recording policy (needs 15)
- [ ] 17 Footer and warning formatting (needs 03) ∥ (can start any time after iteration 0)
- [ ] 18 Footer stripping and metadata (needs 08, 17)
- [ ] 19 globalState adapter and wiring (needs 14, 15, 16, 18). 🎯 **Install and try**

### Iteration 3: Weekly storage
- [ ] 20 Week and day keys (needs 04)
- [ ] 21 Next reset (needs 20)
- [ ] 22 `BudgetStore` v1 (needs 20) ∥
- [ ] 23 Store resilience (needs 22)
- [ ] 24 Daily pace warning (needs 17, 22) ∥
- [ ] 25 Wire weekly storage (needs 19, 21, 23, 24). 🎯 **Install and try**

### Iteration 4: Repo subjects
- [ ] 26 Settings schema, `parseConfig` and limits (needs 25)
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
- [ ] 41 README and release (needs 38, 39, 40). 🎯 **Release candidate**

## Definition of done (every issue)
0. The work is on its own branch (`<type>/<NN>-<short-title>`) and merged through a PR that says `Closes #NN`. Docs-only work uses `docs/<topic>` branches, which skip the automated tests (see [PLAN §8](PLAN.md#8-branches-and-pull-requests)).
1. The tests listed under "Tests to write first" were committed **red** before the implementation
2. All tests are green, and core line and branch coverage is ≥ 90%
3. CI is green: lint, typecheck, unit (ubuntu and windows), integration (xvfb), package
4. The manual checks in the issue are done, where the issue lists any
