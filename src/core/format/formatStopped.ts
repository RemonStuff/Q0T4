import { markdownLiteral } from "./markdownLiteral";

export function formatStopped(subject: string): string {
  return `⛔ Stopped: ${markdownLiteral(subject)} weekly budget reached.`;
}
