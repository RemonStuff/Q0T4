# 59: `/sync` with GitHub usage, and the calibration ratio

**Iteration:** 8 (Pool, reserve and sync)

## Description
Our credit estimates miss what we can't see: hidden prompts, cache writes and **reasoning tokens**. `/sync` lets the user correct the cycle total against GitHub's real figure ([PLAN §9.6](../PLAN.md#96-sync-with-github)). Credits mode only.

- **`/sync <creditsUsedSoFar>`** and the `Q0T4: Sync With GitHub Usage` command (an input box) take the cycle-to-date credits from GitHub. With an **enterprise allowance** (decided, PLAN open question 12), automatic sync isn't possible (#60 not planned), so this manual sync is the only correction. Where an enterprise user can see their own figure depends on the enterprise's settings; the manual check below finds out and records it in the README.
- They append an `untracked` entry of `actual − ledgerCycleCredits`, where the ledger total includes earlier `untracked` entries, so repeated syncs are idempotent.
- **Positive** differences are charged to the reserve first, and the remainder to `fallbackSubject`. **Negative** differences are recorded as a credit back to the reserve.
- **Calibration:**
  - `/status` shows `actual ÷ estimated` for the cycle (estimated = Q0T4's own usage entries)
  - with `q0t4.calibration: "apply"`, new cost estimates are multiplied by it, capped at 2× and floored at 1×
  - default `"off"` (open question 14)

## Tests to write first
- `/sync 9,420 with 8,000 tracked appends untracked +1,420`
- `syncing the same figure twice appends nothing the second time`
- `a positive difference is charged to the reserve first, and the remainder to fallbackSubject`
- `a negative difference is recorded as a credit back to the reserve`
- `/sync in tokens mode explains that it only applies to credits`
- `/sync with a missing, negative or non-numeric figure shows usage help`
- `accepts "9,420", "9420" and "9420.5"`
- `the command's input box validates the same way`
- `calibration ratio = actual ÷ Q0T4-estimated for the cycle`
- `calibration "apply" multiplies new estimates by the ratio, capped at 2× and floored at 1×`
- `calibration does not change existing ledger entries`
- `untracked entries are excluded from the ratio's denominator`

## Implementation tasks
- [ ] `src/core/sync.ts` and the `sync` slash command in `chatParticipants`
- [ ] `q0t4.syncUsage` command
- [ ] `calibration` setting; apply it inside `CreditCostModel`

## Acceptance criteria
- [ ] The listed tests pass, core coverage holds, and CI is green
- [ ] Manual: find where your enterprise shows your own cycle-to-date AI Credit usage (your GitHub Copilot settings/usage page, or a report from the billing manager), write the steps into the README's `/sync` section, and run one real `/sync`

## Depends on
#53, #56

## Labels
`feature`

## Estimate
M
