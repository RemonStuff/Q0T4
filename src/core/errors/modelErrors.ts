import { formatRequestError } from "./formatRequestError";

/** What went wrong with a model request, as core decides on messages and retries. */
export type ModelErrorKind = "noPermissions" | "notFound" | "blocked" | "unknown";

/** A model failure whose kind the adapter has already worked out (adapters/errorMapping). */
export class ModelError extends Error {
  constructor(
    readonly kind: ModelErrorKind,
    message: string,
    cause?: unknown,
  ) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "ModelError";
  }
}

export function modelErrorKind(error: unknown): ModelErrorKind {
  return error instanceof ModelError ? error.kind : "unknown";
}

const MAX_DETAILS = 200;

/** Only errors that came from the model API carry details; internal errors stay generic. */
function details(error: unknown): string {
  if (!(error instanceof ModelError)) return "";
  const line = error.message.replace(/\n[\s\S]*$/, "").trim();
  return line.length > MAX_DETAILS ? `${line.slice(0, MAX_DETAILS - 1)}\u2026` : line;
}

/** The text shown for a failed model request. `notFound` is retried before it gets here. */
export function formatModelError(error: unknown): string {
  switch (modelErrorKind(error)) {
    case "noPermissions":
      return "Q0T4 needs permission to use Copilot models. Accept the prompt and try again.";
    case "blocked":
      return "Copilot reports a quota or rate limit. Try again later.";
    default: {
      const detail = details(error);
      return detail === "" ? formatRequestError() : `${formatRequestError()}\n\nDetails: ${detail}`;
    }
  }
}
