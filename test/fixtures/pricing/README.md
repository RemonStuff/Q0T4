# Price table snapshots

Real copies of the two sources the price parsers (`src/core/pricing`) read, taken on 2026-10-24. They are test input, not documentation: do not reformat them (Prettier skips this folder).

| File | Source |
| --- | --- |
| `models-and-pricing.yml` | https://raw.githubusercontent.com/github/docs/main/data/tables/copilot/models-and-pricing.yml |
| `models-and-pricing.md` | https://docs.github.com/api/article/body?pathname=/en/copilot/reference/copilot-billing/models-and-pricing |

When GitHub changes the format, take new snapshots, keep the old ones as separate files if they still matter, and update the tests that count records.
