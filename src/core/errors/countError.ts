export class CountError extends Error {
  constructor(cause: unknown) {
    super("Q0T4 couldn't count input tokens.", { cause });
    this.name = "CountError";
  }
}
