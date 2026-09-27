/** The device's IANA time zone (e.g. "Asia/Kolkata"), sent so the Worker can bucket posts by local day and hour. */
export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}
