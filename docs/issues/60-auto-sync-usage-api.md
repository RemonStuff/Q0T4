# 60: Optional automatic sync from GitHub's AI credit usage API

**Iteration:** 8 (Pool, reserve and sync)

> **Not planned (decided 2026-10-18).** The 35,000 credits are an **enterprise allowance** (PLAN open question 12). GitHub's user-level endpoint doesn't report enterprise-managed licenses, and the enterprise endpoints need billing-manager rights. This issue exists to record the research and keep the numbering; it's closed as *not planned*. Reopen it only if Q0T4 is later used with a self-purchased plan.

## Description
Automate `/sync` (#59) using `GET /users/{username}/settings/billing/ai_credit/usage?year=&month=&day=` ([PLAN §9.6](../PLAN.md#96-sync-with-github)):
- The endpoint reports per **calendar** day, so the cycle-to-date total is the sum of `netAmount` (USD → credits ×100) over each day from the cycle start to today.
- **Opt-in:** `q0t4.autoSync: true`. It asks for a GitHub session through `vscode.authentication.getSession("github", ["user"])`, a broad scope, explained in the setting description and the consent prompt.
- It runs at most every 6 hours, and on `/status`. Failures (403/404, offline) fall back to manual `/sync` with one notice.

## Tests to write first
*(core, with a FakeUsageSource)*
- `sums netAmount over the cycle's days and converts USD to credits`
- `a cycle spanning two calendar months queries both`
- `feeds the total into the same sync logic as /sync`
- `runs at most every 6 hours`
- `a 404 or 403 disables auto-sync for the session and suggests manual /sync`
- `does nothing unless autoSync is true`

*(integration)*
- `the adapter calls the documented path with year, month and day, using a stubbed authentication session`

## Implementation tasks
- [ ] `UsageSourcePort` and the `githubUsageSource` adapter
- [ ] The `autoSync` setting
- [ ] A scheduler in core

## Acceptance criteria
- [ ] The listed tests pass, core coverage holds, and CI is green
- [ ] Manual: with a personal plan, enable auto-sync and compare the result with GitHub's billing page

## Depends on
#59

## Labels
`feature`

## Estimate
M
