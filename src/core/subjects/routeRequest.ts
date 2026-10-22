import { formatSubjectNote } from "../format/formatSubjectNote";
import { formatUseConfirmation } from "../format/formatUse";
import type { HistoryTurn, ResultMetadata, SubjectName } from "../types";
import type { ConfigPort } from "../../ports/ConfigPort";
import type { RepoInfo, WorkspacePort } from "../../ports/WorkspacePort";
import { resolveSubject } from "./resolveSubject";

export interface RouteInput {
  readonly prompt: string;
  /** The slash command of the request, without the slash. */
  readonly command?: string | undefined;
  readonly history: readonly HistoryTurn[];
  readonly workspace: WorkspacePort;
  readonly config: ConfigPort;
  /** Subjects with usage in the last 12 weeks. Only called for `/use`. */
  readonly recentSubjects: () => Promise<readonly SubjectName[]>;
}

export type Route =
  /** Send to the model, charged to `subject`. `prompt` has the `/use` part removed. */
  | {
      readonly kind: "send";
      readonly subject: SubjectName;
      readonly note: string;
      readonly prompt: string;
    }
  /** Answer in the chat without a model. `metadata` carries the subject when the thread should keep it. */
  | {
      readonly kind: "reply";
      readonly text: string;
      readonly metadata: ResultMetadata | { readonly outcome: "error" };
    };

/**
 * Decides, before anything is sent, which subject a request is charged to, and
 * handles `/use` that needs no model. Costs no tokens. A failing workspace or an
 * unreadable ledger never blocks the request: they count as "no folder open" and
 * "no recent subjects".
 */
export async function routeRequest(input: RouteInput): Promise<Route> {
  const config = input.config.get();
  const repo = await currentRepo(input.workspace);
  const seen = input.command === "use" ? await recent(input.recentSubjects) : [];

  const resolution = resolveSubject({
    prompt: input.prompt,
    command: input.command,
    history: input.history,
    repo,
    config,
    seen,
  });

  if (resolution.kind === "error") {
    return { kind: "reply", text: resolution.message, metadata: { outcome: "error" } };
  }
  if (resolution.kind === "setOnly") {
    const zero = config.budgetUnit === "credits" ? { tokens: 0, credits: 0 } : { tokens: 0 };
    return {
      kind: "reply",
      text: formatUseConfirmation(resolution.subject),
      metadata: {
        v: 1,
        subject: resolution.subject,
        unit: config.budgetUnit,
        inputTokens: 0,
        outputTokens: 0,
        cost: zero,
        stopped: false,
      },
    };
  }
  return {
    kind: "send",
    subject: resolution.subject,
    note: formatSubjectNote(resolution.subject, resolution.source),
    prompt: resolution.prompt,
  };
}

async function currentRepo(workspace: WorkspacePort): Promise<RepoInfo | undefined> {
  try {
    return await workspace.currentRepo();
  } catch {
    return undefined;
  }
}

async function recent(
  recentSubjects: () => Promise<readonly SubjectName[]>,
): Promise<readonly SubjectName[]> {
  try {
    return await recentSubjects();
  } catch {
    return [];
  }
}
