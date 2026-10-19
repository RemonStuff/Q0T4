// Fixture: a small core file with no tests at all (and no branches, so the
// combined total stays above 90% for both lines and branches).
export function untested(flag: boolean): string {
  return `flag: ${String(flag)}`;
}
