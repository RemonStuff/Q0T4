import type { Q0T4Config } from "../../src/core/types";
import type { ChatOutputPort } from "../../src/ports/ChatOutputPort";
import type { ClockPort } from "../../src/ports/ClockPort";
import type { ConfigPort } from "../../src/ports/ConfigPort";
import type { Disposable } from "../../src/ports/Disposable";
import type { PromptReference, ReferenceReaderPort } from "../../src/ports/ReferenceReaderPort";
import type { StatusBarState, UiPort } from "../../src/ports/UiPort";

/** A clock frozen at an instant in a given IANA zone, moved only by the test. */
export class FixedClock implements ClockPort {
  private ms: number;

  constructor(
    iso: string,
    private readonly zone = "UTC",
  ) {
    this.ms = Date.parse(iso);
  }

  now(): Date {
    return new Date(this.ms);
  }

  timeZone(): string {
    return this.zone;
  }

  advance(ms: number): void {
    this.ms += ms;
  }

  set(iso: string): void {
    this.ms = Date.parse(iso);
  }
}

/** Complete settings for tests; real defaults are owned by parseConfig (#26). */
export const TEST_CONFIG: Q0T4Config = {
  budgetUnit: "tokens",
  subjects: { general: { weeklyLimit: 200_000 } },
  defaultLimit: 150_000,
  fallbackSubject: "general",
  resetDay: "monday",
  warnAtPercent: 80,
  dailyPaceWarning: 30,
  includeHistory: true,
};

/** Mutable settings that notify listeners on `update`. */
export class FakeConfig implements ConfigPort {
  private config: Q0T4Config;
  private readonly listeners = new Set<() => void>();

  constructor(overrides: Partial<Q0T4Config> = {}) {
    this.config = { ...TEST_CONFIG, ...overrides };
  }

  get(): Q0T4Config {
    return this.config;
  }

  update(patch: Partial<Q0T4Config>): void {
    this.config = { ...this.config, ...patch };
    for (const listener of this.listeners) listener();
  }

  onDidChange(listener: () => void): Disposable {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }
}

/** Records everything written to the chat, in order. */
export class RecordingOutput implements ChatOutputPort {
  readonly calls: { readonly kind: "markdown" | "progress"; readonly text: string }[] = [];

  markdown(text: string): void {
    this.calls.push({ kind: "markdown", text });
  }

  progress(text: string): void {
    this.calls.push({ kind: "progress", text });
  }

  /** The reply as the user reads it: markdown parts only. */
  get text(): string {
    return this.calls
      .filter((c) => c.kind === "markdown")
      .map((c) => c.text)
      .join("");
  }
}

/** Records UI calls; `confirm` answers from a script, then `false`. */
export class FakeUi implements UiPort {
  readonly statusBar: StatusBarState[] = [];
  readonly confirmations: string[] = [];
  readonly settingsOpened: string[] = [];
  readonly infos: string[] = [];
  private readonly answers: boolean[];

  constructor(answers: readonly boolean[] = []) {
    this.answers = [...answers];
  }

  setStatusBar(state: StatusBarState): void {
    this.statusBar.push(state);
  }

  async confirm(message: string): Promise<boolean> {
    this.confirmations.push(message);
    return this.answers.shift() ?? false;
  }

  async openSettings(query: string): Promise<void> {
    this.settingsOpened.push(query);
  }

  showInfo(text: string): void {
    this.infos.push(text);
  }
}

/** Returns configured text per reference id; unknown ids can't be read. */
export class FakeReferenceReader implements ReferenceReaderPort {
  readonly calls: string[] = [];

  constructor(
    private readonly texts: Readonly<Record<string, { label: string; text: string }>> = {},
  ) {}

  async read(ref: PromptReference): Promise<{ label: string; text: string } | undefined> {
    this.calls.push(ref.id);
    return this.texts[ref.id];
  }
}
