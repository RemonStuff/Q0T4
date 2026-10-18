# 50: Price source and price-table store adapters

**Iteration:** 7 (Live pricing)

## Description
Thin adapters for the ports from [PLAN §2](../PLAN.md#2-architecture):
- **`githubDocsPriceSource`** (`PriceSourcePort`):
  1. GET the raw YAML (`https://raw.githubusercontent.com/github/docs/main/data/tables/copilot/models-and-pricing.yml`) with `If-None-Match: <etag>`. `304` → `unchanged`, `200` → parse (#49) → `ok`.
  2. On a network or parse failure, GET the article Markdown (`https://docs.github.com/api/article/body?pathname=/en/copilot/reference/copilot-billing/models-and-pricing`) and parse that.
  3. If both fail → `failed` with the reasons.

  It uses Node's global `fetch` with a 10 s timeout. No auth is needed.
- **`priceTableFile`** (`PriceTableStorePort`): reads and writes `globalStorageUri/prices/table.json` atomically (write to a temp file, then rename).

## Tests to write first
*(integration; the HTTP layer is pointed at a local test server, never the real network)*
- `returns ok with a parsed table for a 200 YAML response, plus its ETag`
- `sends If-None-Match and returns unchanged for a 304`
- `falls back to the article when the YAML request fails`
- `falls back to the article when the YAML doesn't parse`
- `returns failed with both reasons when both sources fail`
- `times out after 10 seconds`
- `priceTableFile saves and loads a table`
- `priceTableFile load returns undefined when no file exists`
- `priceTableFile never leaves a half-written file` (rename is atomic)

## Implementation tasks
- [ ] `src/adapters/githubDocsPriceSource.ts` with injectable base URLs for tests
- [ ] `src/adapters/priceTableFile.ts`
- [ ] A tiny local HTTP server fixture for the integration tests

## Acceptance criteria
- [ ] The listed tests pass, core coverage holds, and CI is green
- [ ] Manual: run the adapter once against the real URLs from a dev build and check the parsed model count matches the docs page

## Depends on
#25, #49

## Labels
`feature`

## Estimate
M
