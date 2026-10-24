/** Timers that only run when a test fires them. */
export class FakeTimers {
  readonly scheduled: { fn: () => void; ms: number; id: number; cleared: boolean }[] = [];

  set(fn: () => void, ms: number): number {
    const timer = { fn, ms, id: this.scheduled.length, cleared: false };
    this.scheduled.push(timer);
    return timer.id;
  }

  clear(id: unknown): void {
    const timer = this.scheduled[id as number];
    if (timer) timer.cleared = true;
  }

  /** Fires a timer once, like the real one. */
  fire(id: number): void {
    const timer = this.scheduled[id] as (typeof this.scheduled)[number];
    timer.cleared = true;
    timer.fn();
  }

  get active() {
    return this.scheduled.filter((t) => !t.cleared);
  }
}
