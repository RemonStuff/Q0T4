# Q0T4

[![CI](https://github.com/RemonStuff/Q0T4/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/RemonStuff/Q0T4/actions/workflows/ci.yml)

**Weekly budgets for GitHub Copilot Chat, per repo.**

Q0T4 is a VS Code extension that adds a chat participant, **`@q0t4`**, to the Copilot Chat panel. You chat through `@q0t4` as you would with Copilot. Q0T4 forwards your prompt to the model you picked and measures what each request costs. Every repo gets its own **weekly budget**, and once a repo has used it up, chats on that repo stop until the week resets.

- **Subjects are repos.** A prompt is charged to the repo you're working in (`owner/repo` from its git remote). `/use <subject>` overrides that.
- **Tokens or AI Credits.** Budgets can be counted in tokens, or in GitHub AI Credits (how Copilot bills since June 2026), using live per-model prices.
- **Monthly pool (optional).** Split a monthly credit allowance across repos with a reserve; each repo's share becomes a rolling weekly budget.
- **Hard stop.** Requests over budget are refused up front, and replies are cut off mid-stream when the budget runs out.
- **Public API.** Other extensions can check budgets and send metered requests.

> **Status: in development. Nothing to install yet.**
> The first installable build (a stub `@q0t4` that replies "not wired yet") arrives with [#7](https://github.com/RemonStuff/Q0T4/issues/7). See [the roadmap](docs/ROADMAP.md) for progress.

## How to use it

### Today

There's no extension to install yet. What works today is the development setup: the project builds, and the test suite runs (see [Development](#development)).

### Once released (planned)

1. Install the `.vsix` from [GitHub Releases](https://github.com/RemonStuff/Q0T4/releases): Extensions view → `…` → **Install from VSIX…**. You need a GitHub Copilot subscription signed in to VS Code (Copilot Chat is built into VS Code 1.104+).
2. Open Copilot Chat and start a message with `@q0t4`. It stays selected for the rest of the conversation.
3. Each reply ends with a footer such as
   `RemonStuff/Q0T4: 112k / 150k this week · resets Mon · GPT-5`
4. Commands in chat:
   - `/status`: usage of every repo this week
   - `/subjects`: known subjects and their budgets
   - `/use <subject> <question>`: charge a question to another subject
5. Settings live under `q0t4.*`: for example `q0t4.defaultLimit` (the weekly budget for any repo) and `q0t4.subjects` (per-repo overrides).

The full design is in [docs/PLAN.md](docs/PLAN.md).

## Known limits

- Only chats through `@q0t4` are counted, not inline completions, agent mode or the normal Copilot chat.
- Q0T4's counts are estimates and won't exactly match how GitHub meters Copilot.

## Development

Requirements: Node.js 22 or newer, and VS Code 1.104 or newer.

```sh
npm install
npm test            # unit tests (Vitest)
npm run coverage    # unit tests with the 90% core coverage gate
npm run lint        # ESLint, including the rule that keeps src/core free of vscode
npm run typecheck   # TypeScript, strict
npm run build       # bundle to dist/extension.js
npm run test:integration  # integration tests in a real VS Code (downloads it on first run)
npm run package     # build q0t4-<version>.vsix
```

CI (GitHub Actions) runs on every push and pull request:

- lint, format check and typecheck
- unit tests with the coverage gate, on Ubuntu and Windows
- integration tests under `xvfb`
- packaging; every run uploads the `.vsix` as an artifact

Branches named `docs/…` skip the test jobs.

Integration tests use a fake language-model provider (vendor `q0t4-test`) and never call real Copilot; see [test/integration/README.md](test/integration/README.md).

Press **F5** in VS Code ("Run Extension") to start an Extension Development Host.

The project is strictly test-driven, with core logic kept apart from VS Code behind small interfaces (ports and adapters):

- `src/core/`: all decisions, no `vscode` import, at least 90% line and branch coverage per file
- `src/ports/`: the interfaces core uses to reach VS Code
- `src/adapters/`: thin VS Code implementations of the ports
- `test/fakes/`: tested test doubles for every port, so core tests never need VS Code or a real model:
  - a scripted `FakeModel` with a deterministic tokenizer, injectable errors and cancellation
  - `InMemoryLedger` (JSON lines per writer, like the real ledger files)
  - `FixedClock` (instant + IANA time zone)
  - a fixed-rate credits cost model, plus fakes for config, UI, chat output and price sources

Workflow:

- every change is on its own branch and merged by pull request
- every pull request updates this README
- details are in [PLAN §7–§8](docs/PLAN.md#7-testing-strategy)
