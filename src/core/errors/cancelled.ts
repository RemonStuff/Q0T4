export class Cancelled extends Error {
  constructor() {
    super("Input token counting was cancelled.");
    this.name = "Cancelled";
  }
}
