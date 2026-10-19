/**
 * A reference the user attached to a prompt. `value` is opaque to core
 * (a string, a Uri, a Location, or something unknown).
 */
export interface PromptReference {
  readonly id: string;
  readonly value: unknown;
}

/** Resolves attached references to text. Implemented by `adapters/referenceReader` (#12). */
export interface ResolvedReference {
  readonly label: string;
  readonly text: string;
}

export interface ReferenceReaderPort {
  /** Returns `undefined` for references it can't read, such as images. */
  read(ref: PromptReference): Promise<ResolvedReference | undefined>;
}
