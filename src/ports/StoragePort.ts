/**
 * Small key/value state such as the status bar's last subject. Usage never goes
 * here (see LedgerPort). Implemented by `adapters/globalStateStorage` (#19).
 */
export interface StoragePort {
  get<T>(key: string): T | undefined;
  set(key: string, value: unknown): Promise<void>;
  keys(): readonly string[];
}
