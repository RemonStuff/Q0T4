# Q0T4

[![CI](https://github.com/RemonStuff/Q0T4/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/RemonStuff/Q0T4/actions/workflows/ci.yml)

**Weekly budgets for GitHub Copilot Chat, per repo.**

Q0T4 is a VS Code extension that adds a chat participant, **`@q0t4`**, to the Copilot Chat panel. You chat through `@q0t4` as you would with Copilot. It forwards your prompt and conversation history to the model you picked. Per-repo metering and weekly budget enforcement are planned, **not active yet**.

**Planned budgeting features:**

- **Subjects are repos.** A prompt is charged to the repo you're working in (`owner/repo` from its git remote). `/use <subject>` overrides that.
- **Tokens or AI Credits.** Budgets can be counted in tokens, or in GitHub AI Credits (how Copilot bills since June 2026), using live per-model prices.
- **Monthly pool (optional).** Split a monthly credit allowance across repos with a reserve; each repo's share becomes a rolling weekly budget.
- **Hard stop.** Requests over budget are refused up front, and replies are cut off mid-stream when the budget runs out.
- **Public API.** Other extensions can check budgets and send metered requests.

> **Status: in development.** `@q0t4` streams replies from the selected model and supports cancellation. Requests use your Copilot allowance, but Q0T4 does not measure or limit usage yet. Attached files and slash commands are not implemented. See [the roadmap](docs/ROADMAP.md#status) for progress.

## How to use it

### Today: install the preview build

1. Download the latest build: open the [CI runs on `main`](https://github.com/RemonStuff/Q0T4/actions/workflows/ci.yml?query=branch%3Amain), pick the newest green run, and download the **`q0t4-vsix`** artifact. It's a zip containing `q0t4-<version>.vsix`. Or build it yourself with `npm run package`.
2. In VS Code (1.104 or newer): Extensions view → `…` → **Install from VSIX…** and pick the `.vsix`.
3. Sign in to GitHub Copilot, select a model in the Chat picker, and send `@q0t4 hi`. The reply streams from that model. VS Code may ask for permission on the first request.
4. Send another message without typing `@q0t4`: it still goes to Q0T4, because the participant is sticky. Pick a different model for the next request or use Stop to cancel an answer.
5. `/status`, `/subjects` and `/use` appear in the UI but report that slash commands are not available yet. They do not call a model.

To remove it, uninstall **Q0T4** from the Extensions view.

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

- There is no metering or budget enforcement yet. Planned budgeting applies only to chats through `@q0t4`, not inline completions, agent mode or normal Copilot chat.
- Attached files and selections are not read or inlined yet ([#12](https://github.com/RemonStuff/Q0T4/issues/12)); tool references are not executed. Do not assume the model can see your files.
- Detailed consent/quota error messages and retry-on-missing-model come in [#38](https://github.com/RemonStuff/Q0T4/issues/38). For now model failures show a generic retry message and preserve any partial reply.
- Future token counts will be estimates and will not exactly match how GitHub meters Copilot.

## Development

Requirements: Node.js 22 or newer, and VS Code 1.104 or newer.

The core includes [`buildMessages`](src/core/messages/buildMessages.ts), which prepares completed user/assistant history pairs followed by the current prompt. It preserves text exactly and leaves the supplied history unchanged. Unanswered requests, empty response pairs and orphan responses are omitted.

[`resolveModel`](src/core/models/resolveModel.ts) keeps the requested model unless the caller marks it unavailable. It then queries Copilot models once, preferring the same family before the first available result, or returns a typed `noModel` result. [`formatNoModel`](src/core/format/formatNoModel.ts) supplies the sign-in guidance for that result. Resolution never probes a model or sends a prompt; retry-on-`NotFound` comes later.

[`chatHandler`](src/core/chatHandler.ts) combines model resolution and message building, forwards a request through `ModelPort`, and streams each text chunk to the supplied output. It checks cancellation, closes unfinished streams, and reports model failures with a friendly message while preserving partial replies. Its JSON-safe metadata reports the outcome and the model used, without inventing token counts or costs; full usage metadata comes in [#18](https://github.com/RemonStuff/Q0T4/issues/18).

[`extension.ts`](src/extension.ts) connects that core pipeline to the real participant and the integration-test hook. The [adapters](src/adapters/) convert history and messages, use each request's selected model, and link cancellation without retaining listeners after the request ends. Integration and installed-VSIX tests use the fake `q0t4-test` provider to verify forwarding, model switching and cancellation; they never call real Copilot.

```sh
npm install
npm test            # unit tests (Vitest)
npm run coverage    # unit tests with the 90% core coverage gate
npm run lint        # ESLint, including the rule that keeps src/core free of vscode
npm run typecheck   # TypeScript, strict
npm run build       # bundle to dist/extension.js
npm run test:integration  # integration tests in a real VS Code (downloads it on first run)
npm run package     # build q0t4-<version>.vsix
npm run test:vsix   # package, install the .vsix into a clean VS Code, and smoke-test it
```

CI (GitHub Actions) runs on every push and pull request:

- lint, format check and typecheck
- unit tests with the coverage gate, on Ubuntu and Windows
- integration tests under `xvfb`
- packaging, then installing the `.vsix` into a clean VS Code and smoke-testing it; every run uploads the tested `.vsix` as an artifact

Branches named `docs/…` skip the test jobs.

Integration tests use a fake language-model provider (vendor `q0t4-test`) and never call real Copilot; see [test/integration/README.md](test/integration/README.md).

Assistant-run integration and installed-VSIX tests run only on GitHub-hosted runners, monitored through the GitHub CLI (`gh`). They must not launch test VS Code windows on the maintainer's Mac. Lint, typechecks and unit tests still run locally.

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
