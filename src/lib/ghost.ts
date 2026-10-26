/**
 * "played 3 days ago" for a ghost opponent (PBI 35). Calendar days in the
 * viewer's time zone, so a run from late last night reads as yesterday.
 */
export function ghostWhen(
  playedAt: number,
  t: { ghostToday: string; ghostYesterday: string; ghostDaysAgo: string },
  now: number = Date.now(),
): string {
  const day = (ms: number) => {
    const d = new Date(ms);
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  };
  const days = Math.max(0, Math.round((day(now) - day(playedAt)) / 86_400_000));
  if (days === 0) return t.ghostToday;
  if (days === 1) return t.ghostYesterday;
  return t.ghostDaysAgo.replace('{n}', String(days));
}
