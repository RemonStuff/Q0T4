import * as vscode from "vscode";
import { ModelError } from "../core/errors/modelErrors";
import type { ModelErrorKind } from "../core/errors/modelErrors";

const KINDS: Readonly<Record<string, ModelErrorKind>> = {
  NoPermissions: "noPermissions",
  NotFound: "notFound",
  Blocked: "blocked",
};

/**
 * Turns whatever the language model API threw into a core `ModelError`. Core decides
 * messages, the fallback and what is charged; this only reads `LanguageModelError.code`.
 * A `ModelError` and a cancellation are returned as they are.
 */
export function mapModelError(error: unknown): unknown {
  if (error instanceof ModelError || error instanceof vscode.CancellationError) return error;
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof vscode.LanguageModelError) {
    return new ModelError(KINDS[error.code] ?? "unknown", message, error);
  }
  return new ModelError("unknown", message, error);
}
