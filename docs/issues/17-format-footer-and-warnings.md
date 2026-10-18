# 17: Core formatting: tokens, footer and warnings

**Iteration:** 2 (Counting and the hard stop)

## Description
Every user-visible usage string comes from pure `core/format`. This issue covers compact token units, the footer `*frontend: 112k / 150k this week · resets Mon*` behind a hidden sentinel (`<!-- q0t4:footer -->`) so it can be stripped from history later (#18), and the ⚠️ warning once usage passes `warnAtPercent`.

## Tests to write first
- `formats 0 as "0"`, `950 as "950"`, `1000 as "1k"`, `112400 as "112k"`, `1250000 as "1.25M"`
- `rounds down so the footer never overstates remaining budget`
- `footer starts with the sentinel and a blank line`
- `footer shows subject, used, limit and reset label`
- `adds a ⚠️ warning when usage is at or above warnAtPercent`
- `no warning just below warnAtPercent`
- `shows ⛔ instead of ⚠️ when usage is at or above 100%`
- `footer escapes markdown special characters in subject names`

## Implementation tasks
- [ ] `src/core/format/tokens.ts`, `footer.ts`, `warnings.ts`
- [ ] Export the `FOOTER_SENTINEL` constant

## Acceptance criteria
- [ ] The listed tests pass, core coverage holds, and CI is green

## Depends on
#03

## Labels
`feature`

## Estimate
S
