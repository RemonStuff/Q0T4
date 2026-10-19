import type { ChatOutputPort } from "../ports/ChatOutputPort";

// Iteration 0's placeholder reply; replaced by the real chatHandler in #10/#11.

export function stubReply(): string {
  return "Q0T4 is installed. Budgeting isn't wired up yet.";
}

export function handleStubRequest(output: ChatOutputPort): void {
  output.markdown(stubReply());
}
