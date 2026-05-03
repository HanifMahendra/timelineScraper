export function buildTimeline(assignments) {
  const nowMs = Date.now();
  const wibNow = new Date(nowMs + 7 * 60 * 60 * 1000);
  const todayStr = wibNow.toISOString().slice(0, 10);
  const dueSoonCutoff = new Date(`${todayStr}T00:00:00+07:00`).getTime() + 3 * 24 * 60 * 60 * 1000;

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
