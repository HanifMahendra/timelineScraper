import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { extractFromHtml as extractFromLiveHtml } from '../timeline-scele-auth/src/extractAssignments.js';
import { buildTimeline as buildLiveTimeline } from '../timeline-scele-auth/src/buildTimeline.js';

const require = createRequire(import.meta.url);
const { extractFromHtml } = require('../src/extractAssignments.js');

const fixture = `
<ul>
  <li class="activity">
    <div class="activityinstance">
      <a href="https://scele.cs.ui.ac.id/mod/resource/view.php?id=12345">
        <span class="instancename">Tugas 3 - Secure Coding Practice</span>
      </a>
    </div>
    <div class="description">
      Deadline: Jumat, 8 Mei 2026, 23:59 waktu server
    </div>
  </li>
</ul>
`;

function assertPkplResourceAssignment(items, sourceName) {
  assert.equal(items.length, 1, `${sourceName} should extract exactly one item`);
  assert.equal(items[0].title, 'Tugas 3 - Secure Coding Practice');
  assert.equal(items[0].type, 'assignment');
  assert.equal(items[0].deadlineISO, '2026-05-08T23:59:00+07:00');
  assert.match(items[0].url, /\/mod\/resource\/view\.php\?id=12345$/);
}

test('local and live extractors keep actionable SCELE resources', () => {
  assertPkplResourceAssignment(
    extractFromHtml(fixture, 'Pengantar Keamanan Perangkat Lunak', 'https://scele.cs.ui.ac.id/course/view.php?id=1'),
    'local extractor'
  );

  assertPkplResourceAssignment(
    extractFromLiveHtml(fixture, 'Pengantar Keamanan Perangkat Lunak', 'https://scele.cs.ui.ac.id/course/view.php?id=1'),
    'live extractor'
  );
});

test('timeline regression uses an explicit reference time', () => {
  const liveItems = extractFromLiveHtml(
    fixture,
    'Pengantar Keamanan Perangkat Lunak',
    'https://scele.cs.ui.ac.id/course/view.php?id=1'
  );
  const timeline = buildLiveTimeline(liveItems, {
    now: new Date('2026-05-01T00:00:00.000Z'),
  });

  assert.equal(timeline.upcoming.length, 1);
  assert.equal(timeline.upcoming[0].title, 'Tugas 3 - Secure Coding Practice');
});
