/** Returns true if the given BRT date falls Mon-Fri. */
export function isBusinessDay(brtDate: Date): boolean {
  const day = brtDate.getUTCDay(); // 0=Sun, 6=Sat
  return day !== 0 && day !== 6;
}
