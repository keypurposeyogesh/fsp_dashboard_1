export interface CompletionRecord { enrollment_id: string; task_id: string; completed_at: string }
const dayKey = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);

/** Progress derives from saved records, never visits or button clicks. */
export function growthProgress(profilePercent: number, records: CompletionRecord[], now = new Date()) {
  const unique = [...new Map(records.map(row => [`${row.enrollment_id}:${row.task_id}`, row])).values()];
  const valid = unique.filter(row => Number.isFinite(Date.parse(row.completed_at)) && Date.parse(row.completed_at) <= now.getTime());
  const days = new Set(valid.map(row => dayKey(new Date(row.completed_at))));
  const today = dayKey(now);
  const cursor = new Date(`${today}T12:00:00+05:30`);
  if (!days.has(today)) cursor.setUTCDate(cursor.getUTCDate() - 1);
  let streak = 0;
  while (days.has(dayKey(cursor))) { streak++; cursor.setUTCDate(cursor.getUTCDate() - 1); }
  const week = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(`${today}T12:00:00+05:30`);
    date.setUTCDate(date.getUTCDate() - (6 - index));
    return { key: dayKey(date), label: new Intl.DateTimeFormat('en', { weekday: 'short', timeZone: 'Asia/Kolkata' }).format(date), complete: days.has(dayKey(date)) };
  });
  const xp = valid.length * 25 + (profilePercent === 100 ? 50 : 0);
  const level = Math.floor(xp / 250) + 1;
  return { xp, level, levelXP: xp % 250, nextXP: 250 - xp % 250, streak, week, completedTasks: valid.length,
    badges: [
      { name: 'First Steps', description: 'Complete your first course task', earned: valid.length > 0, icon: 'sprout' },
      { name: 'All About You', description: 'Complete your member profile', earned: profilePercent === 100, icon: 'user' },
      { name: 'Steady Learner', description: 'Complete 10 course tasks', earned: valid.length >= 10, icon: 'award' },
      { name: '7-Day Streak', description: 'Complete tasks on 7 consecutive days', earned: hasSevenDays(days), icon: 'flame' },
    ] };
}
function hasSevenDays(days: Set<string>) {
  let count = 0, previous = 0;
  for (const day of [...days].sort()) {
    const time = Date.parse(day);
    count = time - previous === 86400000 ? count + 1 : 1;
    if (count >= 7) return true;
    previous = time;
  }
  return false;
}
