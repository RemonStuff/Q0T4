import type { ClockPort } from "../ports/ClockPort";

/** `ClockPort` over the system clock and the user's time zone. No logic. */
export const systemClock: ClockPort = {
  now: () => new Date(),
  timeZone: () => Intl.DateTimeFormat().resolvedOptions().timeZone,
};
