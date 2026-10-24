/** Diagnostics for the person debugging Q0T4. Implemented by `adapters/outputChannelLog` (#40). */
export interface LogPort {
  info(message: string): void;
  warn(message: string): void;
  error(message: string, error?: unknown): void;
}
