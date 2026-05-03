import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { extractFromHtml as extractFromCloudHtml } from '../cloud-run-auth/src/extractAssignments.js';
import { buildTimeline as buildCloudTimeline } from '../cloud-run-auth/src/buildTimeline.js';

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

assertPkplResourceAssignment(
  extractFromHtml(fixture, 'Pengantar Keamanan Perangkat Lunak', 'https://scele.cs.ui.ac.id/course/view.php?id=0'),
  'local extractor'
);

assertPkplResourceAssignment(
  extractFromCloudHtml(fixture, 'Pengantar Keamanan Perangkat Lunak', 'https://scele.cs.ui.ac.id/course/view.php?id=0'),
  'cloud extractor'
);

const cloudItems = extractFromCloudHtml(
  fixture,
  'Pengantar Keamanan Perangkat Lunak',
  'https://scele.cs.ui.ac.id/course/view.php?id=0'
);
const cloudTimeline = buildCloudTimeline(cloudItems);
assert.equal(cloudTimeline.upcoming.length, 1, 'dashboard timeline should place the PKPL item in upcoming');
assert.equal(cloudTimeline.upcoming[0].title, 'Tugas 3 - Secure Coding Practice');

console.log('extractAssignments regression tests passed');
