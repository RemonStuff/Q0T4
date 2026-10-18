# 49: Core price-table parsers and validation

**Iteration:** 7 (Live pricing)

## Description
Turn the two researched sources ([PLAN §9.1](../PLAN.md#91-cost-unit-and-live-prices)) into a `PriceTable`, with **no runtime dependencies**:
- **Primary:** `github/docs` `data/tables/copilot/models-and-pricing.yml`, a list of flat records (`model`, `provider`, `release_status`, `category`, `tier`, `threshold`, `input`, `cached_input`, `cache_write`, `output`). Write a strict parser for exactly this YAML subset: `- key: value` lists, single/double/unquoted scalars, and `#` comments. Anything else is a parse error, never a guess.
- **Fallback:** the docs article as Markdown (`/api/article/body?pathname=…/models-and-pricing`), with one pipe table per provider. Column sets differ per provider; Tier, Threshold and Cache write are sometimes missing.

Both parsers normalise names (strip footnote markers like `[^gemini-flash-promo]`, collapse whitespace), prices (`$2.50` → 2.5, `Not applicable` → undefined) and thresholds (`≤ 272K` → `{ op: "lte", tokens: 272000 }`).

**Validation** (`validateTable(next, previous, requiredModels)`):
- schema
- every rate positive
- required models present
- no rate changing more than 3× from the previous table

## Tests to write first
*(fixtures: a snapshot of the real YAML and article taken 2026-10-18, committed under `test/fixtures/pricing/`)*
- `parses every record of the YAML snapshot`
- `parses quoted and unquoted model names identically ('GPT-5.4' = GPT-5.4)`
- `strips footnote markers from model names`
- `parses $ prices, and "Not applicable" as undefined`
- `parses ≤ / > thresholds with K suffixes into token counts`
- `groups Default and Long context records of one model into tiers`
- `rejects YAML constructs outside the supported subset with a line number`
- `parses every provider table of the Markdown snapshot, including tables without Tier or Cache write columns`
- `YAML and Markdown snapshots of the same day produce equal tables`
- `validation rejects a zero or negative rate`
- `validation rejects a table missing a required model`
- `validation rejects a rate that changed more than 3× from the previous table`
- `validation accepts a rate change of exactly 3×`
- `validation of the first-ever table skips the change check`

## Implementation tasks
- [ ] `src/core/pricing/parseYamlTable.ts`, `parseMarkdownTable.ts`, `validateTable.ts`, `normalise.ts`
- [ ] Commit the snapshots as fixtures, with their source URL and date in a README

## Acceptance criteria
- [ ] The listed tests pass, core coverage holds, and CI is green

## Depends on
#03

## Labels
`feature`

## Estimate
M
