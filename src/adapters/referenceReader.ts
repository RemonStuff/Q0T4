import * as vscode from "vscode";
import type { ReferenceReaderPort } from "../ports/ReferenceReaderPort";

export const referenceReader: ReferenceReaderPort = {
  async read(ref) {
    const { value } = ref;
    if (typeof value === "string") return { label: ref.id, text: value };
    const uri = value instanceof vscode.Location ? value.uri : value;
    if (!(uri instanceof vscode.Uri)) return undefined;
    if (/\.(png|jpe?g|gif|webp|bmp|ico|avif|heic|tiff?)$/i.test(uri.path)) return undefined;

    const document = await vscode.workspace.openTextDocument(uri);
    const range = value instanceof vscode.Location ? value.range : undefined;
    const text = document.getText(range);
    if (text.includes("\0")) return undefined;
    let label = vscode.workspace.asRelativePath(uri);
    if (range) {
      label += `:${range.start.line + 1}:${range.start.character + 1}-${range.end.line + 1}:${range.end.character + 1}`;
    }
    return { label, text };
  },
};
