export class CountError extends Error {
  constructor(cause: unknown, kind: "input" | "output" = "input") {
    super(`Q0T4 couldn't count ${kind} tokens.`, { cause });
    this.name = "CountError";
  }
}
