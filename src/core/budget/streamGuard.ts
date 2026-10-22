import type { CancellationSignal } from "../../ports/CancellationSignal";
import type { ModelPort } from "../../ports/ModelPort";
import { costAmount } from "../cost/costAmount";
import type { CostModel } from "../cost/costModel";
import { Cancelled } from "../errors/cancelled";
import type { Cost } from "../types";
import { countTokens } from "./countTokens";
import { effectiveBudget, preCheck } from "./preCheck";

const UNCANCELLABLE: CancellationSignal = {
  isCancellationRequested: false,
  onCancellationRequested: () => ({ dispose: () => undefined }),
};

export const RECOUNT_CHARS = 400;
export const NEAR_LIMIT_RATIO = 0.1;
export const RECORDING_COUNT_TIMEOUT_MS = 1000;

export interface StreamGuardOptions {
  readonly model: ModelPort;
  readonly costModel: CostModel;
  readonly used: Cost;
  readonly input: Cost;
  readonly budget: Cost;
  readonly extraAllowance?: Cost;
  readonly signal: CancellationSignal;
  readonly cancel: () => void;
}

export class StreamGuard {
  private text = "";
  private countedChars = 0;
  private tokens = 0;
  private nearLimit = false;
  private budgetStopped = false;
  private readonly limit: number;
  private readonly spent: number;

  constructor(private readonly options: StreamGuardOptions) {
    const unit = options.costModel.unit;
    const policy = { ...options, unit };
    preCheck(policy);
    this.limit = costAmount(effectiveBudget(policy), unit);
    this.spent = costAmount(options.used, unit) + costAmount(options.input, unit);
  }

  get stopped(): boolean {
    return this.budgetStopped;
  }

  async onChunk(text: string): Promise<"continue" | "stop"> {
    if (this.stopped) return "stop";
    if (this.options.signal.isCancellationRequested) throw new Cancelled("output");
    this.text += text;
    const delta = this.text.length - this.countedChars;
    const remaining = this.limit - this.spent - this.outputCost(this.tokens + delta / 4);
    this.nearLimit ||=
      remaining < this.limit * NEAR_LIMIT_RATIO || remaining < 2 * this.outputCost(text.length / 4);
    if (delta >= RECOUNT_CHARS || this.nearLimit || remaining <= 0) {
      await this.finalCount();
      if (this.spent + this.outputCost(this.tokens) >= this.limit) this.stop();
    }
    if (this.options.signal.isCancellationRequested) throw new Cancelled("output");
    return this.stopped ? "stop" : "continue";
  }

  async finalCount(): Promise<number> {
    if (this.text.length !== this.countedChars) {
      const count = await countTokens(
        this.options.model,
        [this.text],
        this.options.signal,
        "output",
      );
      costAmount({ tokens: count }, "tokens");
      const cost = this.outputCost(count);
      if (this.options.signal.isCancellationRequested) throw new Cancelled("output");
      this.tokens = count;
      this.countedChars = this.text.length;
      if (this.spent + cost >= this.limit) this.stop();
    }
    return this.tokens;
  }

  /**
   * Counts the whole reply for the ledger. It ignores cancellation, because the
   * user may already have stopped the reply and what was streamed is still used.
   * It waits at most `RECORDING_COUNT_TIMEOUT_MS`, so a tokenizer that hangs can't
   * hold up a cancelled chat. If counting fails or times out it keeps the last
   * exact count, never an estimate.
   */
  async countForRecording(): Promise<number> {
    if (this.text.length === this.countedChars) return this.tokens;
    const text = this.text;
    const counting = countTokens(this.options.model, [text], UNCANCELLABLE, "output").then(
      (count) => {
        costAmount({ tokens: count }, "tokens");
        return count;
      },
      () => undefined,
    );
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<undefined>((resolve) => {
      timer = setTimeout(() => resolve(undefined), RECORDING_COUNT_TIMEOUT_MS);
    });
    try {
      const count = await Promise.race([counting, timeout]);
      if (count !== undefined) {
        this.tokens = count;
        this.countedChars = text.length;
      }
    } finally {
      clearTimeout(timer);
    }
    return this.tokens;
  }

  private outputCost(tokens: number): number {
    const { model, costModel } = this.options;
    const { cost } = costModel.cost(model, { input: 0, output: tokens });
    costAmount(cost, "tokens");
    if (cost.credits !== undefined) costAmount(cost, "credits");
    return costAmount(cost, costModel.unit);
  }

  private stop(): void {
    if (this.stopped) return;
    this.budgetStopped = true;
    this.options.cancel();
  }
}
