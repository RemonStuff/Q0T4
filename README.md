# Q0T4

[![CI](https://github.com/RemonStuff/Q0T4/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/RemonStuff/Q0T4/actions/workflows/ci.yml)

**Weekly token budgets per repo for GitHub Copilot Chat.**

Q0T4 is a VS Code extension that adds a chat participant, **`@q0t4`**, to Copilot Chat. You chat through it as you would with Copilot. It sends your prompt and the conversation to the model you picked, counts the tokens, and keeps a weekly budget for each repo you work in. A request that doesn't fit the remaining budget is refused before any model is called, and a reply that reaches the limit is cut off.

## Install

1. Download `q0t4-<version>.vsix` from [GitHub Releases](https://github.com/RemonStuff/Q0T4/releases).
2. In VS Code 1.104 or newer: Extensions view → `…` → **Install from VSIX…**.
3. Sign in to GitHub Copilot, open Copilot Chat and send `@q0t4 hi`. VS Code may ask for permission to use Copilot models on the first request; accept it.

To remove it, uninstall **Q0T4** from the Extensions view.

## Use it

Start a message with `@q0t4`. It stays selected for the rest of the conversation. Every reply ends with a footer such as:

`RemonStuff/Q0T4: 112k / 150k this week · resets Mon · GPT-5`

- From `q0t4.warnAtPercent` of the week (80% by default) a warning line follows the footer. A pace warning appears when one day uses `q0t4.dailyPaceWarning` of the week (30% by default); it never blocks.
- A request that doesn't fit is refused up front and says what is used, what is left and when the budget resets. A reply that reaches the limit ends with `⛔ Stopped`.
- The footer is stripped from the history that is sent back to the model.
- Attach files with `#file` or a text selection to include them. Unsaved edits are included. Images and binary files are skipped with one note.
- A thread that grows past the model's context window loses its oldest messages (whole question-and-answer pairs) and tells you how many.

### Subjects: what a budget belongs to

A **subject** is what a request is charged to. Q0T4 picks the first that applies:

1. `/use <subject> <question>`: charges that one question to another subject. `/use <subject>` alone switches the whole conversation.
2. The subject the conversation already has.
3. The repo you are working in: `owner/repo` from its git remote (`origin` first). Azure DevOps remotes give `org/project/repo`. Without a usable remote, the folder name.
4. `q0t4.fallbackSubject` when no folder is open.

A repo uses its own weekly limit from `q0t4.subjects`, or `q0t4.defaultLimit` when it isn't listed.

### Chat commands

None of these call a model or cost tokens.

- `/status`: a table of every known subject: used this week, weekly budget, percent, used today, requests, and when the budgets reset.
- `/subjects`: every known subject with its weekly limit, where the limit comes from, its description, and whether it is the current repo, the fallback or this conversation's subject. Ends with an **Edit Subjects** button.
- `/use <subject> <question>`: see above.

### Palette commands

- **Q0T4: Show Usage**: opens the `/status` table in a tab. The status bar item (current subject and its usage, yellow near the limit, red when used up) runs it when clicked.
- **Q0T4: Reset This Week**: asks for confirmation, then restarts this week's count for every subject. Nothing is deleted; earlier weeks are unchanged.
- **Q0T4: Edit Subjects**: opens Settings filtered to `q0t4.subjects`.
- **Q0T4: Refresh Model Prices**: fetches GitHub's published model prices now. Prices only matter when `q0t4.budgetUnit` is `credits`.
- **Q0T4: Log Copilot Models**: a diagnostic. Writes the name, family, id and vendor of every Copilot model to the **Q0T4** output channel, which is how model names are checked against the price table.

## Settings

| Setting                 | Default                                    | What it does                                                                                                                                                                                                  |
| ----------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `q0t4.subjects`         | `{ "general": { "weeklyLimit": 200000 } }` | Per-subject overrides. Keys are `owner/repo` (case-insensitive) or a plain name. Each value is `{ "weeklyLimit": 50000, "description": "…" }`. A `weeklyLimit` of `0` disables a subject.                     |
| `q0t4.defaultLimit`     | `150000`                                   | Weekly token limit for every repo not listed in `q0t4.subjects`.                                                                                                                                              |
| `q0t4.fallbackSubject`  | `general`                                  | The subject when no folder is open.                                                                                                                                                                           |
| `q0t4.resetDay`         | `monday`                                   | The day the weekly budget resets, at local midnight.                                                                                                                                                          |
| `q0t4.cycleStartDay`    | `1`                                        | Day of the month your billing cycle starts (1 to 31). Short months use their last day. Used by the monthly pool.                                                                                              |
| `q0t4.warnAtPercent`    | `80`                                       | Show a warning under the reply from this percentage of the week.                                                                                                                                              |
| `q0t4.dailyPaceWarning` | `30`                                       | Warn when this percentage of the week is used within one day.                                                                                                                                                 |
| `q0t4.includeHistory`   | `true`                                     | Send earlier messages of the same subject to the model. When off, only the current prompt is sent.                                                                                                            |
| `q0t4.budgetUnit`       | `tokens`                                   | What budgets count. `credits` costs each request from GitHub's published model prices (1 credit = US$0.01) and then `q0t4.subjects` and `q0t4.defaultLimit` are in credits. Switching doesn't convert limits. |
| `q0t4.priceSource`      | `auto`                                     | Credits mode. `auto` fetches GitHub's price list once a day; `manual` never fetches and uses only `q0t4.modelPrices`.                                                                                         |
| `q0t4.modelPrices`      | `{}`                                       | Credits mode. Your own prices in USD per 1M tokens by model name, e.g. `{ "GPT-5 mini": { "input": 0.25, "output": 2 } }`.                                                                                    |
| `q0t4.priceMaxAgeHours` | `48`                                       | Credits mode. Warn when the price list is older than this many hours.                                                                                                                                         |

An invalid value falls back to its default and shows one warning; the extension keeps working.

## Known limits

- **Only `@q0t4` is counted.** Inline completions, agent mode and the normal Copilot chat don't go through Q0T4.
- **Counts won't exactly match how GitHub meters Copilot.** GitHub bills from its own token counts, including hidden prompts, framing overhead and reasoning tokens Q0T4 never sees. Treat the numbers as a close guide, not an invoice.
- **The cut-off can overshoot** by up to one recount interval of streamed output.
- **Subjects come from the git remote** (`owner/repo`), falling back to the folder name, so a folder copied without `.git` gets its own budget.
- **Usage is stored per machine,** under the extension's global storage folder. It is not synced between machines.
- **Credits are new.** `q0t4.budgetUnit: credits` costs requests from GitHub's published prices; it is in the pre-release and not yet checked against real billing. Monthly pools and a public API are planned for v1.0.

## Privacy

Nothing leaves your machine except the model requests you make, which go to Copilot the way any chat request does. Usage is a local JSON Lines ledger. Q0T4 has no telemetry and no server.

If something goes wrong with storage or settings, the **Q0T4** channel in the Output panel has the details.

## Development

Requirements: Node.js 22 or newer and VS Code 1.104 or newer. Run `npm ci`, then `npm run lint`, `npm run typecheck`, `npm test` and `npm run test:integration`; `npm run package` builds the `.vsix`.

Q0T4 is built test-first, in small pull requests, one per issue; every merge needs green CI (lint, format, types, unit tests with 100% core coverage, integration tests in real VS Code, and an installed-`.vsix` smoke test). The design is in [docs/PLAN.md](docs/PLAN.md), progress in [docs/ROADMAP.md](docs/ROADMAP.md), how each part works in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md), and the manual checklist in [docs/manual-testing.md](docs/manual-testing.md).

## License

[MIT](LICENSE)
