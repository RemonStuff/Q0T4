import type { ClockPort } from "../../ports/ClockPort";
import type { PriceSourcePort, PriceTableStorePort } from "../../ports/PriceSourcePort";
import type { Diagnostics } from "../diagnostics/diagnostics";
import type { PriceInfo } from "../format/statusTable";
import type { TimerPort } from "../statusBar";
import type { Q0T4Config } from "../types";
import { loadStoredPrices } from "./loadStoredPrices";
import { normaliseModelName } from "./normalise";
import type { ModelPrice, PriceTable } from "./priceTable";
import { validateTable } from "./validateTable";

export type PriceRefresherSettings = Pick<
  Q0T4Config,
  "priceSource" | "modelPrices" | "priceMaxAgeHours"
>;

export interface PriceRefresherDeps {
  readonly source: PriceSourcePort;
  readonly store: PriceTableStorePort;
  readonly clock: ClockPort;
  readonly timers: TimerPort;
  readonly diagnostics: Diagnostics;
  /** Read on every use, so a settings change takes effect without a reload. */
  readonly settings: () => PriceRefresherSettings;
  /** Models a fetched table must contain, e.g. the ones seen in the ledger lately. */
  readonly requiredModels?: () => readonly string[];
}

export type RefreshOutcome =
  | { readonly status: "updated"; readonly table: PriceTable }
  | { readonly status: "unchanged" }
  | { readonly status: "failed"; readonly reasons: readonly string[] }
  | { readonly status: "invalid"; readonly failures: readonly string[] }
  | { readonly status: "manual" };

const DAY_MS = 24 * 3_600_000;
const HOUR_MS = 3_600_000;
const WARNING = "price-refresh";

/**
 * Keeps the price table fresh without ever blocking a chat (docs/PLAN.md §9.1): it fetches on
 * start, then once a day, and on demand. A table that fails to fetch or to validate never
 * replaces the last good one; the user is told once per failure streak. With
 * `priceSource: "manual"` nothing is fetched and the table is built from the overrides only.
 */
export class PriceRefresher {
  private fetched: PriceTable | undefined;
  private timer: unknown;
  private running: Promise<RefreshOutcome> | undefined;
  private started: Promise<void> | undefined;
  private readonly startedAt: string;

  constructor(private readonly deps: PriceRefresherDeps) {
    this.startedAt = deps.clock.now().toISOString();
  }

  /** Loads the stored table, fetches (unless manual) and schedules the daily check. */
  async start(): Promise<void> {
    this.fetched = await loadStoredPrices(this.deps.store, this.deps.diagnostics);
    await this.refreshNow();
    this.schedule();
  }

  /**
   * Starts once, for credits mode: loads the stored table and schedules the daily check. With
   * a stored table it refreshes in the background; without one (first run) it waits for the
   * fetch, because there is nothing to cost with until it is done.
   */
  ensureStarted(): Promise<void> {
    this.started ??= (async () => {
      this.fetched = await loadStoredPrices(this.deps.store, this.deps.diagnostics);
      if (this.fetched === undefined) await this.refreshNow();
      else void this.refreshNow();
      this.schedule();
    })();
    return this.started;
  }

  /** Fetches now, even if the table was fetched today. */
  refreshNow(): Promise<RefreshOutcome> {
    this.running ??= this.refresh().finally(() => {
      this.running = undefined;
    });
    return this.running;
  }

  /** The table to cost with: the last good fetch with the user's overrides on top. */
  currentTable(): PriceTable | undefined {
    const { priceSource, modelPrices } = this.deps.settings();
    const base: PriceTable | undefined =
      priceSource === "manual"
        ? { fetchedAt: this.startedAt, source: "manual", models: [] }
        : this.fetched;
    if (base === undefined) return undefined;
    const overridden = Object.entries(modelPrices);
    const names = new Set(overridden.map(([name]) => normaliseModelName(name).toLowerCase()));
    const models: ModelPrice[] = [
      ...base.models.filter((model) => !names.has(normaliseModelName(model.model).toLowerCase())),
      ...overridden.map(([name, price]) => ({
        model: name,
        provider: "override",
        tiers: [{ tier: "Override", input: price.input, output: price.output }],
      })),
    ];
    return models.length === 0 ? undefined : { ...base, models };
  }

  /** What `/status` shows about the prices in use, or `undefined` when there is no table. */
  info(): PriceInfo | undefined {
    const table = this.currentTable();
    if (table === undefined) return undefined;
    return {
      source: table.source,
      fetchedAt: table.fetchedAt,
      overrides: this.overrideCount(),
      stale: this.isStale(),
    };
  }

  /** How many `modelPrices` overrides are active. */
  overrideCount(): number {
    return Object.keys(this.deps.settings().modelPrices).length;
  }

  /** True when the fetched table is older than `priceMaxAgeHours`. Never for manual prices. */
  isStale(now: Date = this.deps.clock.now()): boolean {
    const { priceSource, priceMaxAgeHours } = this.deps.settings();
    if (priceSource === "manual" || this.fetched === undefined) return false;
    return now.getTime() - Date.parse(this.fetched.fetchedAt) > priceMaxAgeHours * HOUR_MS;
  }

  dispose(): void {
    if (this.timer !== undefined) this.deps.timers.clear(this.timer);
    this.timer = undefined;
  }

  private schedule(): void {
    this.dispose();
    if (this.deps.settings().priceSource === "manual") return;
    this.timer = this.deps.timers.set(() => {
      this.timer = undefined;
      void this.refreshNow().finally(() => this.schedule());
    }, DAY_MS);
  }

  private async refresh(): Promise<RefreshOutcome> {
    if (this.deps.settings().priceSource === "manual") return { status: "manual" };
    const { diagnostics, clock } = this.deps;
    const previous = this.fetched;
    let result;
    try {
      result = await this.deps.source.fetch(
        previous?.etag === undefined ? {} : { etag: previous.etag },
      );
    } catch (error) {
      result = {
        status: "failed" as const,
        reasons: [error instanceof Error ? error.message : String(error)],
      };
    }

    if (result.status === "failed") {
      this.failed(
        `Q0T4 couldn't update the model prices (${result.reasons.join("; ")}). It keeps using the last table.`,
      );
      return { status: "failed", reasons: result.reasons };
    }
    if (result.status === "unchanged") {
      if (previous === undefined) {
        const reasons = ["the source said nothing changed, but there is no stored table"];
        this.failed(`Q0T4 couldn't update the model prices (${reasons[0]}).`);
        return { status: "failed", reasons };
      }
      await this.keep({ ...previous, fetchedAt: clock.now().toISOString() });
      diagnostics.clearWarning(WARNING);
      return { status: "unchanged" };
    }

    const checked = validateTable(result.table, previous, this.deps.requiredModels?.() ?? []);
    if (!checked.ok) {
      this.failed(
        `Q0T4 rejected the new model prices (${checked.failures.join("; ")}). It keeps using the last table.`,
      );
      return { status: "invalid", failures: checked.failures };
    }
    await this.keep(result.table);
    diagnostics.clearWarning(WARNING);
    return { status: "updated", table: result.table };
  }

  /** Makes `table` current and stores it; a failed save is reported, the table is still used. */
  private async keep(table: PriceTable): Promise<void> {
    this.fetched = table;
    try {
      await this.deps.store.save(table);
    } catch (error) {
      this.deps.diagnostics.error("Couldn't save the price table.", error);
      this.deps.diagnostics.warnOnce(
        "price-save",
        "Q0T4 couldn't save the model price table. It is used for now and fetched again next time.",
      );
    }
  }

  private failed(text: string): void {
    this.deps.diagnostics.warnOnce(WARNING, text);
  }
}
