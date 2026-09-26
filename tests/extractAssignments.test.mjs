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

// Mirrors SCELE's Moodle 4 course-page markup observed in Gasal 2026/2027.
const moodleCourseFixture = `
<ul class="section">
  <li class="activity label modtype_label" id="module-1"><div class="contentwithoutlink">
    Kuis 1 Materi: SPL, Aljabar Matriks. Bentuk: esai pendek, paper-based
  </div></li>
  <li class="activity forum modtype_forum" id="module-2"><div class="activityinstance">
    <a class="aalink" href="https://scele.cs.ui.ac.id/mod/forum/view.php?id=2"><span class="instancename">Announcements<span class="accesshide "> Forum</span></span></a>
  </div></li>
  <li class="activity folder modtype_folder" id="module-3"><div class="activityinstance">
    <span class="instancename">Quizzes<span class="accesshide "> Folder</span></span>
    <ul><li><a href="https://scele.cs.ui.ac.id/pluginfile.php/1/mod_folder/content/0/Quiz%201.pdf">Quiz 1.pdf</a></li></ul>
  </div></li>
  <li class="activity assign modtype_assign" id="module-4"><div class="activityinstance">
    <a class="aalink" href="https://scele.cs.ui.ac.id/mod/assign/view.php?id=4"><span class="instancename">Worksheet 03 - Submissions<span class="accesshide "> Assignment</span></span></a>
    </div><div data-region="activity-information" data-activityname="Worksheet 03 - Submissions" class="activity-information">
    <div data-region="activity-dates"><div><strong>Opened:</strong> Friday, 18 September 2026, 12:00 AM</div>
    <div><strong>Due:</strong> Saturday, 26 September 2026, 11:55 PM</div></div></div></li>
  <li class="activity assign modtype_assign" id="module-5"><div class="activityinstance">
    <a class="aalink" href="https://scele.cs.ui.ac.id/mod/assign/view.php?id=5"><span class="instancename">Refleksi<span class="accesshide "> Assignment</span></span></a>
    </div><div data-region="activity-dates"><div><strong>Opened:</strong> Thursday, 5 February 2026, 12:00 AM</div></div></li>
  <li class="activity quiz modtype_quiz hasinfo" id="module-6"><div class="activityinstance"><div class=" dimmed dimmed_text">
    <span class="instancename">[Kelas A] Checkpoint 01<span class="accesshide "> Quiz</span></span></div></div>
    <div data-region="activity-dates"><div><strong>Closed:</strong> Wednesday, 2 September 2026, 11:50 AM</div></div>
    <div class="availabilityinfo isrestricted"><span class="badge badge-info">Restricted</span> Not available unless: You belong to <strong>Kelas A</strong></div></li>
  <li class="activity forum modtype_forum" id="module-7"><div class="activityinstance">
    <a class="aalink" href="https://scele.cs.ui.ac.id/mod/forum/view.php?id=7"><span class="instancename">Forum Diskusi Minggu Kedua<span class="accesshide "> Forum</span></span></a>
    </div><div data-region="activity-dates"><div><strong>Due:</strong> Sunday, 7 September 2025, 11:59 PM</div></div></li>
  <li class="activity forum modtype_forum" id="module-8"><div class="activityinstance">
    <a class="aalink" href="https://scele.cs.ui.ac.id/mod/forum/view.php?id=8"><span class="instancename">Forum Diskusi: Sistem Persamaan Linear<span class="accesshide "> Forum</span></span></a>
  </div></li>
</ul>
`;

test('Moodle course pages yield assignments and discussion forums, not labels, folders, or other groups', () => {
  const courseUrl = 'https://scele.cs.ui.ac.id/course/view.php?id=10';
  const live = extractFromLiveHtml(moodleCourseFixture, 'Kursus', courseUrl);
  const local = extractFromHtml(moodleCourseFixture, 'Kursus', courseUrl);

  assert.deepEqual(local, live, 'local extractor must mirror the live extractor');
  assert.deepEqual(
    live.map(({ type, title, deadlineISO, url }) => ({ type, title, deadlineISO, url })),
    [
      { type: 'assignment', title: 'Worksheet 03 - Submissions', deadlineISO: '2026-09-26T23:55:00+07:00', url: 'https://scele.cs.ui.ac.id/mod/assign/view.php?id=4' },
      { type: 'assignment', title: 'Refleksi', deadlineISO: null, url: 'https://scele.cs.ui.ac.id/mod/assign/view.php?id=5' },
      { type: 'forum', title: 'Forum Diskusi Minggu Kedua', deadlineISO: '2025-09-07T23:59:00+07:00', url: 'https://scele.cs.ui.ac.id/mod/forum/view.php?id=7' },
      { type: 'forum', title: 'Forum Diskusi: Sistem Persamaan Linear', deadlineISO: null, url: 'https://scele.cs.ui.ac.id/mod/forum/view.php?id=8' },
    ]
  );
});

test('peer-assessed workshops and deadline-bearing submission pages count as assignments', () => {
  const html = `
  <li class="activity workshop modtype_workshop" id="module-20"><div class="activityinstance">
    <a href="https://scele.cs.ui.ac.id/mod/workshop/view.php?id=20"><span class="instancename">Peer Review Desain<span class="accesshide "> Workshop</span></span></a>
    </div><div data-region="activity-dates"><div><strong>Submissions open:</strong> Monday, 5 October 2026, 8:00 AM</div>
    <div><strong>Submissions deadline:</strong> Monday, 12 October 2026, 11:59 PM</div>
    <div><strong>Assessments deadline:</strong> Monday, 19 October 2026, 11:59 PM</div></div></li>
  <li class="activity url modtype_url" id="module-21"><div class="activityinstance">
    <a href="https://scele.cs.ui.ac.id/mod/url/view.php?id=21"><span class="instancename">Pengumpulan Laporan Proyek<span class="accesshide "> URL</span></span></a>
    </div><div class="description">Batas pengumpulan: 20 Oktober 2026 23.59</div></li>`;
  const courseUrl = 'https://scele.cs.ui.ac.id/course/view.php?id=10';
  const live = extractFromLiveHtml(html, 'Kursus', courseUrl);

  assert.deepEqual(extractFromHtml(html, 'Kursus', courseUrl), live);
  assert.deepEqual(
    live.map(({ type, title, deadlineISO }) => ({ type, title, deadlineISO })),
    [
      { type: 'assignment', title: 'Peer Review Desain', deadlineISO: '2026-10-12T23:59:00+07:00' },
      { type: 'assignment', title: 'Pengumpulan Laporan Proyek', deadlineISO: '2026-10-20T23:59:00+07:00' },
    ]
  );
});
