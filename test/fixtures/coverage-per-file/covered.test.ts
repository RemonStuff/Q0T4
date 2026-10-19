import { expect, it } from "vitest";
import { describeNumber } from "./covered";

it("covers every branch of describeNumber", () => {
  expect(describeNumber(2)).toMatch(/^positive even small integer/);
  expect(describeNumber(-101)).toMatch(/^negative odd large integer/);
  expect(describeNumber(0)).toMatch(/^zero even small integer/);
  expect(describeNumber(1.5)).toMatch(/^positive odd small fraction/);
});
