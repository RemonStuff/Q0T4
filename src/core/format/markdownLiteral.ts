export function markdownLiteral(text: string): string {
  return text.replace(/[\r\n]+/g, " ").replace(/[\\`*_{}[\]()#+\-.!|<>~&]/g, "\\$&");
}
