import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isTaskCompleted,
  legacyTaskId,
  taskId,
} from '../dashboard/src/lib/timelineFilters.ts';

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
