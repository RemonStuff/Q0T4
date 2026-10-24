# Changelog

All notable changes to Q0T4 are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0]

First release: weekly token budgets per repo.

### Added

- The `@q0t4` chat participant: streams replies from the selected Copilot model, with history, attached files, selections and cancellation.
- Weekly token budgets per subject, with a pre-check that refuses a request that doesn't fit and a stream guard that cuts a reply off at the limit.
- Subjects from the git remote (`owner/repo`), with `/use` to charge a question to another subject and a fallback subject for no folder.
- A usage footer on every reply, a warning from `q0t4.warnAtPercent` and a daily pace warning.
- An append-only usage ledger on disk, shared by all windows, with 13 months of retention.
- `/status` and `/subjects` chat commands, a status bar item, and the palette commands Show Usage, Reset This Week and Edit Subjects.
- Clear messages for Copilot consent, quota and missing-model errors, with one retry on another Copilot model when a model isn't found.
- Trimming of the oldest history pairs to fit the model's context window.
- Failure paths that never break a chat: failed usage writes, unreadable ledger data and invalid settings are logged to the **Q0T4** output channel and reported once.

### Known limits

- Only `@q0t4` is counted; inline completions, agent mode and the normal Copilot chat are not.
- Counts won't exactly match how GitHub meters Copilot.
- Usage is stored per machine.

[Unreleased]: https://github.com/RemonStuff/Q0T4/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/RemonStuff/Q0T4/releases/tag/v0.1.0
