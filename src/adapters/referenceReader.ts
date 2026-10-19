import type { ReferenceReaderPort } from "../ports/ReferenceReaderPort";

export const referenceReader: ReferenceReaderPort = {
  async read() {
    throw new Error("Reference reading is not implemented.");
  },
};
