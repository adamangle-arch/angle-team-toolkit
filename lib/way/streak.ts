// A gentle streak, not a competitive one: how many days in a row someone
// has completed at least one lesson item, counting from today backward.
// "Gentle" specifically means today not having activity yet doesn't zero
// it out - the streak only breaks once a full day is skipped, so opening
// the app in the morning doesn't show 0 just because you haven't done
// today's lesson yet.
export function computeStreak(completedAtIsoDates: string[]): number {
  const days = new Set(completedAtIsoDates.map((iso) => new Date(iso).toDateString()));
  if (days.size === 0) return 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const hasToday = days.has(today.toDateString());
  const cursor = new Date(today);
  if (!hasToday) cursor.setDate(cursor.getDate() - 1);

  let streak = 0;
  while (days.has(cursor.toDateString())) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
