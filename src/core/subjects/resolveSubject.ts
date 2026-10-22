import type { SubjectSource } from "../format/formatSubjectNote";
import type { HistoryTurn, Q0T4Config, SubjectName } from "../types";
import type { RepoInfo } from "../../ports/WorkspacePort";
import { knownSubjects } from "./knownSubjects";
import { parseUse } from "./parseUse";
import { repoSubject } from "./repoIdentifier";
import { threadSubject } from "./threadSubject";

export interface ResolveInput {
  readonly prompt: string;
  /** The slash command of the request, without the slash. */
  readonly command?: string | undefined;
  readonly history: readonly HistoryTurn[];
  /** `undefined` when no folder is open. */
  readonly repo: RepoInfo | undefined;
  readonly config: Q0T4Config;
  /** Subjects with usage in the last 12 weeks, for `/use`. */
  readonly seen: readonly SubjectName[];
}

export type Resolution =
  /** Send the request, charged to `subject`. `prompt` is the text to send (the question after `/use`). */
  | {
      readonly kind: "resolved";
      readonly subject: SubjectName;
      readonly source: SubjectSource;
      readonly prompt: string;
    }
  /** `/use <subject>` alone: switch the conversation, send nothing. */
  | { readonly kind: "setOnly"; readonly subject: SubjectName }
  /** `/use` was wrong: show `message`, send nothing. */
  | { readonly kind: "error"; readonly message: string };

/**
 * Picks the subject for a request, stopping at the first that answers: `/use`, the
 * conversation's subject, the current repo, the fallback subject. Pure: no model
 * call, no tokens.
 */
export function resolveSubject(input: ResolveInput): Resolution {
  const { prompt, command, history, repo, config, seen } = input;
  const current = repoSubject(repo);

  if (command === "use") {
    const parsed = parseUse(prompt, knownSubjects({ config, seen, currentRepo: current }));
    if (parsed.kind === "error") return parsed;
    if (parsed.kind === "setOnly") return parsed;
    return { kind: "resolved", subject: parsed.subject, source: "use", prompt: parsed.question };
  }

  const fromThread = threadSubject(history);
  if (fromThread !== undefined)
    return { kind: "resolved", subject: fromThread, source: "thread", prompt };
  if (current !== undefined) return { kind: "resolved", subject: current, source: "repo", prompt };
  return { kind: "resolved", subject: config.fallbackSubject, source: "fallback", prompt };
}
