const DAY_MS = 24 * 60 * 60 * 1000;
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const WEEKLY_REFLECTION_RE = /\bweekly\s+reflection\b/i;
const SISTEM_INTERAKSI = 'Sistem Interaksi';

function formatWibDate(dateStr) {
  const [, year, month, day] = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/) || [];
  if (!year || !month || !day) return dateStr;
  return `${Number(day)}-${Number(month)}-${year}`;
}

function nextWeeklyReflectionDeadline(nowMs, todayStr) {
  const todayStartMs = new Date(`${todayStr}T00:00:00+07:00`).getTime();
  const wibDate = new Date(todayStartMs + WIB_OFFSET_MS);
  const dayOfWeek = wibDate.getUTCDay();
  const daysUntilSunday = (7 - dayOfWeek) % 7;
  let deadlineMs = todayStartMs + daysUntilSunday * DAY_MS + 23 * 60 * 60 * 1000 + 59 * 60 * 1000;

  if (deadlineMs < nowMs) {
    deadlineMs += 7 * DAY_MS;
  }

  return new Date(deadlineMs + WIB_OFFSET_MS).toISOString().slice(0, 16) + ':00+07:00';
}

function inferNextWeeklyReflectionTitle(assignments) {
  const numbers = assignments
    .filter((item) => item.course === SISTEM_INTERAKSI && WEEKLY_REFLECTION_RE.test(item.title || ''))
    .map((item) => (item.title || '').match(/(?:topik\s*)?(\d+)/i)?.[1])
    .filter(Boolean)
    .map(Number);

  const nextNumber = numbers.length ? Math.max(...numbers) + 1 : 1;
  return `Weekly Reflection Topik ${nextNumber}`;
}

function addWeeklyReflectionReminder(assignments, nowMs, todayStr) {
  const todayStartMs = new Date(`${todayStr}T00:00:00+07:00`).getTime();
  const hasActiveWeeklyReflection = assignments.some((item) => {
    if (item.course !== SISTEM_INTERAKSI || !WEEKLY_REFLECTION_RE.test(item.title || '')) return false;
    if (!item.deadlineISO) return false;
    return new Date(item.deadlineISO).getTime() >= todayStartMs;
  });

  if (hasActiveWeeklyReflection) return assignments;

  const deadlineISO = nextWeeklyReflectionDeadline(nowMs, todayStr);
  const dateStr = deadlineISO.slice(0, 10);
  const title = inferNextWeeklyReflectionTitle(assignments);

  return [
    ...assignments,
    {
      title,
      type: 'assignment',
      course: SISTEM_INTERAKSI,
      deadlineText: `Reminder: ${formatWibDate(dateStr)}, 23:59`,
      deadlineISO,
      url: '',
      rawText: `${title} synthetic reminder`,
      synthetic: true,
    },
  ];
}

export function buildTimeline(storedAssignments) {
  const nowMs = Date.now();
  const wibNow = new Date(nowMs + 7 * 60 * 60 * 1000);
  const todayStr = wibNow.toISOString().slice(0, 10);
  const dueSoonCutoff = new Date(`${todayStr}T00:00:00+07:00`).getTime() + 3 * 24 * 60 * 60 * 1000;
  const assignments = addWeeklyReflectionReminder(storedAssignments, nowMs, todayStr);

  const withFlags = assignments.map((item) => {
    if (!item.deadlineISO) {
      return { ...item, isOverdue: false, isDueToday: false, isDueSoon: false };
    }
    const deadlineMs = new Date(item.deadlineISO).getTime();
    const deadlineDateStr = item.deadlineISO.slice(0, 10);
    const isOverdue = deadlineMs < nowMs;
    const isDueToday = !isOverdue && deadlineDateStr === todayStr;
    const isDueSoon = !isOverdue && !isDueToday && deadlineMs < dueSoonCutoff;
    return { ...item, isOverdue, isDueToday, isDueSoon };
  });

  withFlags.sort((a, b) => {
    if (a.deadlineISO && b.deadlineISO) return a.deadlineISO.localeCompare(b.deadlineISO);
    if (a.deadlineISO) return -1;
    if (b.deadlineISO) return 1;
    return 0;
  });

  return {
    today: withFlags.filter((i) => i.isDueToday),
    upcoming: withFlags.filter((i) => !i.isOverdue && !i.isDueToday),
    overdue: withFlags.filter((i) => i.isOverdue),
    updatedAt: new Date().toISOString(),
  };
}
