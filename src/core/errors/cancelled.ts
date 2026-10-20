export class Cancelled extends Error {
  constructor(kind: "input" | "output" = "input") {
    super(`${kind === "input" ? "Input" : "Output"} token counting was cancelled.`);
    this.name = "Cancelled";
  }
}
