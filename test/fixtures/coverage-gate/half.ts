// Fixture for the coverage gate: half.test.ts covers only one branch.
export function sign(n: number): "negative" | "non-negative" {
  if (n < 0) {
    return "negative";
  }
  return "non-negative";
}
