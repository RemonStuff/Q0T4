import type { LogPort } from "../../src/ports/LogPort";

export interface LogLine {
  readonly level: "info" | "warn" | "error";
  readonly message: string;
  readonly error?: unknown;
}

/** Keeps every line; `fail` makes the log itself throw, to test that diagnostics never break a reply. */
export class FakeLog implements LogPort {
  readonly lines: LogLine[] = [];
  fail = false;

  info(message: string): void {
    this.add({ level: "info", message });
  }

  warn(message: string): void {
    this.add({ level: "warn", message });
  }

  error(message: string, error?: unknown): void {
    this.add({ level: "error", message, ...(error === undefined ? {} : { error }) });
  }

  private add(line: LogLine): void {
    if (this.fail) throw new Error("injected log failure");
    this.lines.push(line);
  }
}
