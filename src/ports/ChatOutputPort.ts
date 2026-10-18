/** Where a chat reply is written. Implemented by `adapters/chatStreamOutput` over `ChatResponseStream` (#11). */
export interface ChatOutputPort {
  markdown(text: string): void;
  progress(text: string): void;
}
