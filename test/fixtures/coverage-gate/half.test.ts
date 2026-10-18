import { expect, it } from "vitest";
import { sign } from "./half";

it("covers only the non-negative branch", () => {
  expect(sign(1)).toBe("non-negative");
});
