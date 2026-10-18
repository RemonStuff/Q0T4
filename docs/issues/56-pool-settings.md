# 56: Pool, share and reserve settings

**Iteration:** 8 (Pool, reserve and sync)

## Description
Settings for pool mode ([PLAN §3](../PLAN.md#3-settings-q0t4), [§9.3](../PLAN.md#93-pool-shares-and-reserve)):
- `pool`: optional; unset means no pool
- `reservePercent`: default 10
- `subjects[x].monthlyShare`
- `unallocatedSubjects`: `"default"` | `"reserve"` | `"block"`
- `reserveMode`: `"auto"` | `"ask"` | `"off"`, default `"ask"`

`parseConfig` validates them as a whole, never throws, and produces warnings. It also exposes `monthlyShareFor(subject)` and `reserveSize()`.

## Tests to write first
- `no pool set: pool mode is off and monthlyShare values are ignored with a warning`
- `pool 35,000 with reservePercent 10 gives a reserve of 3,500`
- `monthlyShareFor returns the configured share, case-insensitively`
- `unallocatedSubjects "default" gives defaultLimit as the monthly share`
- `unallocatedSubjects "reserve" gives share 0 and marks the subject reserve-backed`
- `unallocatedSubjects "block" marks the subject blocked`
- `warns when shares add up to more than pool − reserve, naming the excess`
- `no warning when shares add up exactly to pool − reserve`
- `weeklyLimit is ignored with a warning in pool mode`
- `reservePercent outside 0–100 is clamped with a warning`
- `reserveMode defaults to "ask"`
- *(integration)* `package.json declares the pool settings with the same defaults as core`

## Implementation tasks
- [ ] Settings in `contributes.configuration`, with descriptions that explain how `defaultLimit` means a weekly limit without a pool and a monthly share with one
- [ ] Extend `parseConfig`

## Acceptance criteria
- [ ] The listed tests pass, core coverage holds, and CI is green

## Depends on
#26, #55

## Labels
`feature`

## Estimate
S
