import type { LogPort } from "../ports/LogPort";

/** The part of `vscode.OutputChannel` this adapter needs. */
export interface LineChannel {
  appendLine(line: string): void;
}

const STACK_LINES = 5;

/** `LogPort` over the "Q0T4" output channel. No vscode import, so it is unit tested. */
export function outputChannelLog(
  channel: LineChannel,
  now: () => Date = () => new Date(),
): LogPort {
  const write = (level: string, message: string, error?: unknown) => {
    channel.appendLine(`${now().toISOString()} [${level}] ${message}`);
    if (error === undefined) return;
    const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
    for (const line of detail.split("\n").slice(0, STACK_LINES)) {
      channel.appendLine(`${line.startsWith(" ") ? "" : "  "}${line}`);
    }
  };
  return {
    info: (message) => write("info", message),
    warn: (message) => write("warn", message),
    error: (message, error) => write("error", message, error),
  };
}
