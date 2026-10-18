/**
 * Time, injected so tests control it. Implemented by `adapters/systemClock` (#25).
 */
export interface ClockPort {
  now(): Date;
  /** The user's IANA time zone, e.g. "Europe/Amsterdam". */
  timeZone(): string;
}
