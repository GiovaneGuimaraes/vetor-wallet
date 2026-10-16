/**
 * Returns a Date whose UTC fields equal the current wall-clock time in BRT (UTC-3).
 * Use .getUTCHours() / .getUTCDay() etc. to read BRT time components.
 * Brazil abolished DST in 2019, so BRT = UTC-3 year-round.
 */
export function getBRTDate(): Date {
  const now = new Date();
  return new Date(now.getTime() - 3 * 60 * 60 * 1000);
}
