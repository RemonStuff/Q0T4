import type { ChatMessage } from "../types";

/** The share of the model's input window kept free for the reply and for counting error. */
export const CONTEXT_SAFETY_MARGIN = 0.1;

export function contextLimit(maxInputTokens: number): number {
  return Math.floor(maxInputTokens * (1 - CONTEXT_SAFETY_MARGIN));
}

export interface TrimInput {
  /** History pairs first, then the references and the prompt. */
  readonly messages: readonly ChatMessage[];
  /** How many messages at the end are never dropped (references and the prompt). */
  readonly keepLast: number;
  readonly limit: number;
  readonly count: (message: ChatMessage) => Promise<number>;
}

export interface Trimmed {
  readonly messages: readonly ChatMessage[];
  /** How many messages were left out; always a whole number of pairs. */
  readonly dropped: number;
  /** False when the kept messages alone are over the limit. */
  readonly fits: boolean;
  /** The token count of the kept messages. */
  readonly tokens: number;
}

/**
 * Drops the oldest history pairs until the input fits the limit. A pair is a user
 * message and its reply, so the history is never cut in half.
 */
export async function trimToWindow({
  messages,
  keepLast,
  limit,
  count,
}: TrimInput): Promise<Trimmed> {
  const counts = await Promise.all(messages.map(count));
  let total = counts.reduce((sum, tokens) => sum + tokens, 0);
  const historyLength = messages.length - keepLast;
  let dropped = 0;
  while (total > limit && dropped < historyLength) {
    total -= counts.slice(dropped, dropped + 2).reduce((sum, tokens) => sum + tokens, 0);
    dropped += 2;
  }
  return { messages: messages.slice(dropped), dropped, fits: total <= limit, tokens: total };
}
