import type { LogPort } from "../../ports/LogPort";

/**
 * Where core reports problems that must not break a chat: every occurrence goes to the
 * log, and the user is told once per problem per session. Nothing here ever throws.
 */
export class Diagnostics {
  private readonly told = new Set<string>();

  constructor(
    private readonly log: LogPort,
    private readonly notify: (text: string) => void,
  ) {}

  info(message: string): void {
    this.safely(() => this.log.info(message));
  }

  error(message: string, error?: unknown): void {
    this.safely(() => this.log.error(message, error));
  }

  /** Logs every time; shows `text` to the user the first time for this `key`. */
  warnOnce(key: string, text: string): void {
    this.safely(() => this.log.warn(text));
    if (this.told.has(key)) return;
    this.told.add(key);
    this.safely(() => this.notify(text));
  }

  /** Usage could not be written: the reply is unaffected but the weekly total may be too low. */
  recordFailed(error: unknown): void {
    this.error("Couldn't record usage in the ledger.", error);
    this.warnOnce(
      "ledger-append",
      "Q0T4 couldn't save this request's usage. Your reply is unaffected, but your weekly total may be too low. See the Q0T4 output channel.",
    );
  }

  /** Ledger lines or files that could not be read and were skipped. */
  ledgerSkipped(count: number): void {
    this.warnOnce(
      "ledger-skipped",
      `Q0T4 skipped ${count} unreadable usage ledger line(s) or file(s), so your weekly total may be too low. See the Q0T4 output channel.`,
    );
  }

  /** Invalid settings fall back to their defaults; a repeat of the same problems is not shown again. */
  configWarnings(warnings: readonly string[]): void {
    if (warnings.length === 0) return;
    this.warnOnce(
      `config:${JSON.stringify(warnings)}`,
      `Q0T4 settings: ${warnings.join(" ")} Using the defaults for those.`,
    );
  }

  private safely(action: () => void): void {
    try {
      action();
    } catch {
      // Diagnostics must never break the reply they are about.
    }
  }
}
