import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ACTIVE_OVERDUE_WINDOW_MS,
  activeOverdue,
  calendarDayDiffWIB,
  isAncientOverdue,
  isTaskCompleted,
  legacyTaskId,
  taskId,
} from '../dashboard/src/lib/timelineFilters.ts';
import {
  formatSyncAge,
  isSyncStale,
  rebucketTimeline,
  withLiveStatus,
} from '../dashboard/src/lib/timelineStatus.ts';
import {
  formatScaleNumber,
  letterTargetLabel,
  previewThresholds,
} from '../dashboard/src/features/grades/letterGrades.ts';

function makeTask(overrides = {}) {
  return {
    title: 'Tugas 1',
    type: 'assignment',
    course: 'Aljabar Linier',
    deadlineText: '8 Mei 2026, 23:59',
    deadlineISO: '2026-05-08T23:59:00+07:00',
    url: 'https://scele.cs.ui.ac.id/course/view.php?id=10',
    rawText: '',
    isOverdue: false,
    isDueToday: false,
    isDueSoon: false,
    ...overrides,
  };
}

test('AUD-02: taskId uses unique activityId so tasks sharing courseUrl do not collide', () => {
  const first = makeTask({ title: 'Tugas A', activityId: '10:fallback:aaa' });
  const second = makeTask({ title: 'Tugas B', activityId: '10:fallback:bbb' });

  assert.equal(taskId(first), '10:fallback:aaa');
  assert.equal(taskId(second), '10:fallback:bbb');
  assert.notEqual(taskId(first), taskId(second));

  const completed = new Set([taskId(first)]);
  assert.equal(isTaskCompleted(first, completed), true);
  assert.equal(isTaskCompleted(second, completed), false);
});

test('AUD-02: isTaskCompleted falls back to legacy url/title key for previously saved marks', () => {
  const task = makeTask({
    title: 'Tugas Lama',
    url: 'https://scele.cs.ui.ac.id/mod/assign/view.php?id=99',
    activityId: '10:assign:99',
  });
  const legacyCompleted = new Set([legacyTaskId(task)]);

  assert.equal(isTaskCompleted(task, legacyCompleted), true);
});

test('AUD-12: timelineStatus recomputes overdue/today/upcoming in WIB and formats sync age', () => {
  const nowMs = new Date('2026-05-08T03:00:00Z').getTime(); // 10:00 WIB on 2026-05-08
  const todayTask = makeTask({ title: 'Today', deadlineISO: '2026-05-08T23:59:00+07:00' });
  const overdueTask = makeTask({ title: 'Late', deadlineISO: '2026-05-07T23:59:00+07:00' });
  const upcomingTask = makeTask({ title: 'Soon', deadlineISO: '2026-05-10T10:00:00+07:00' });

  assert.equal(withLiveStatus(todayTask, nowMs).isDueToday, true);
  assert.equal(withLiveStatus(overdueTask, nowMs).isOverdue, true);
  assert.equal(withLiveStatus(upcomingTask, nowMs).isDueSoon, true);

  const rebucketed = rebucketTimeline({
    today: [],
    upcoming: [todayTask, overdueTask, upcomingTask],
    overdue: [],
    syncedAt: '2026-05-08T02:30:00Z',
  }, nowMs);
  assert.deepEqual(rebucketed.today.map((t) => t.title), ['Today']);
  assert.deepEqual(rebucketed.overdue.map((t) => t.title), ['Late']);
  assert.deepEqual(rebucketed.upcoming.map((t) => t.title), ['Soon']);

  assert.equal(formatSyncAge('2026-05-08T02:30:00Z', nowMs), '30 menit lalu');
  assert.equal(isSyncStale('2026-05-06T00:00:00Z', nowMs), true);
  assert.equal(isSyncStale('2026-05-08T02:30:00Z', nowMs), false);
});

test('AUD-12: timelineFilters handles ancient overdue window and WIB calendar day diff', () => {
  const nowMs = new Date('2026-05-20T05:00:00Z').getTime(); // 12:00 WIB on 2026-05-20
  const ancient = makeTask({
    title: 'Ancient',
    isOverdue: true,
    deadlineISO: new Date(nowMs - ACTIVE_OVERDUE_WINDOW_MS - 60_000).toISOString(),
  });
  const recent = makeTask({
    title: 'Recent',
    isOverdue: true,
    deadlineISO: new Date(nowMs - 2 * 24 * 60 * 60 * 1000).toISOString(),
  });
  assert.equal(isAncientOverdue(ancient, nowMs), true);
  assert.equal(isAncientOverdue(recent, nowMs), false);
  assert.deepEqual(activeOverdue([ancient, recent], nowMs).map((t) => t.title), ['Recent']);
  assert.equal(calendarDayDiffWIB('2026-05-21T01:00:00+07:00', nowMs), 1);
});

test('AUD-12: letterGrades previews thresholds evenly and formats labels', () => {
  const thresholds = previewThresholds(85, 55);
  assert.deepEqual(thresholds?.map(({ letter, min }) => [letter, min]), [
    ['A', 85], ['A-', 80], ['B+', 75], ['B', 70], ['B-', 65], ['C+', 60], ['C', 55],
  ]);
  assert.equal(previewThresholds(50, 55), null);
  assert.equal(formatScaleNumber(null), '—');
  assert.equal(letterTargetLabel({ letter: 'A', points: 4, min: 85, status: 'already_achieved', requiredAverage: 0, requiredAverageInScale: 0 }), 'Sudah aman');
  assert.equal(letterTargetLabel({ letter: 'A', points: 4, min: 85, status: 'impossible', requiredAverage: 120, requiredAverageInScale: 120 }), 'Tidak mungkin lagi');
});
