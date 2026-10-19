// Fixture for the per-file coverage gate: fully covered by covered.test.ts,
// and big enough that the total stays above 90% with untested.ts included.
export function describeNumber(n: number): string {
  const parts: string[] = [];
  parts.push(n > 0 ? "positive" : n < 0 ? "negative" : "zero");
  parts.push(n % 2 === 0 ? "even" : "odd");
  parts.push(Math.abs(n) >= 100 ? "large" : "small");
  parts.push(Number.isInteger(n) ? "integer" : "fraction");
  const a = n + 1;
  const b = a * 2;
  const c = b - 3;
  const d = c / 4;
  const e = d + 5;
  const f = e * 6;
  const g = f - 7;
  const h = g / 8;
  const i = h + 9;
  const j = i * 10;
  const k = j - 11;
  const l = k / 12;
  const m = l + 13;
  const o = m * 14;
  const p = o - 15;
  const q = p / 16;
  const r = q + 17;
  const s = r * 18;
  const t = s - 19;
  const u = t / 20;
  const v = u + 21;
  const w = v * 22;
  const x = w - 23;
  const y = x / 24;
  const z = y + 25;
  parts.push(String(Math.round(z)));
  return parts.join(" ");
}
