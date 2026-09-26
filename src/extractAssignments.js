/**
 * Baca HTML dari data/html/, extract item assignment/quiz/lab/forum,
 * lalu output ke data/assignments.json.
 *
 * Logika ekstraksi di bawah adalah salinan CommonJS dari
 * timeline-scele-auth/src/extractAssignments.js (backend live). Test
 * tests/extractAssignments.test.mjs memastikan keduanya menghasilkan output
 * yang sama; ubah keduanya bersamaan.
 */

const fs = require('fs');
const path = require('path');
const {
  filterCoursesForActiveAcademicYear,
  resolveAcademicYear,
} = require('./academicYear');

const HTML_DIR = path.resolve(__dirname, '../data/html');
const MANIFEST_FILE = path.join(HTML_DIR, 'courses.json');
const COURSES_FILE = path.resolve(__dirname, '../config/courses.json');
const OUTPUT_FILE = path.resolve(__dirname, '../data/assignments.json');

const ACTIVITY_TYPES = new Set(['assignment', 'quiz', 'lab', 'forum']);

const LAB_PATTERN = /\b(lab|laboratorium|praktikum|praktik)\b/i;
const QUIZ_PATTERN = /\b(quiz|kuis)\b/i;
const ASSIGNMENT_PATTERN = /\b(tugas|assignment|penugasan|homework|hw|tp|tutorial|submission|pengumpulan|worksheet|lembar\s+kerja|proyek|project|laporan|esai|essay)\b/i;
const WEEKLY_REFLECTION_PATTERN = /\bweekly\s+reflection\b/i;
const NON_ACTIONABLE_TITLE_PATTERN = /^(?:deskripsi\s+kuliah|informasi\s+umum|sekilas\s+(?:tentang\s+)?sda)\b/i;

const IGNORED_MODULE_PATTERN = /\/mod\/(?:resource|url|page|book|folder|label|forum|glossary|choice|feedback|survey|wiki|lesson|scorm|attendance|data)\//i;
const ACTIONABLE_RESOURCE_MODULE_PATTERN = /\/mod\/(?:resource|url|page)\//i;
// Workshop is Moodle's peer-assessed submission activity.
const ASSIGN_MODULE_PATTERN = /\/mod\/(?:assign(?:ment)?|workshop)\//i;
const QUIZ_MODULE_PATTERN = /\/mod\/quiz\//i;
const ACTIONABLE_TEXT_PATTERN = /\b(?:tugas|assignment|penugasan|deadline|batas\s+pengumpulan|dikumpulkan\s+paling\s+lambat|submission|pengumpulan|submit|kumpulkan)\b/i;
const FORUM_MODULE_PATTERN = /\/mod\/forum\//i;
const ANNOUNCEMENT_FORUM_PATTERN = /\b(?:announcements?|pengumuman|news\s+forum)\b/i;
// Moodle course-page module types that never represent a gradable task.
const NON_TASK_MODTYPES = new Set([
  'label', 'folder', 'book', 'glossary', 'choice', 'feedback', 'survey', 'wiki',
  'lesson', 'scorm', 'attendance', 'data', 'questionnaire', 'imscp', 'lti', 'h5pactivity',
  'bigbluebuttonbn', 'chat', 'zoom',
]);
// Shown only to students outside the group/grouping the activity belongs to.
const OTHER_GROUP_RESTRICTION_PATTERN = /\b(?:you\s+belong\s+to|anda\s+(?:termasuk|anggota))\b/i;

const MONTHS_ID = {
  januari: '01', februari: '02', maret: '03', april: '04',
  mei: '05', juni: '06', juli: '07', agustus: '08',
  september: '09', oktober: '10', november: '11', desember: '12',
};
const MONTHS_EN = {
  january: '01', february: '02', march: '03', april: '04',
  may: '05', june: '06', july: '07', august: '08',
  september: '09', october: '10', november: '11', december: '12',
};

const DEADLINE_LABEL_RE = /^(?:due|deadline|closes?|batas\s+pengumpulan|dikumpulkan\s+paling\s+lambat)\s*:\s*/i;
const DAY_PREFIX_RE = /^(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday|minggu|senin|selasa|rabu|kamis|jumat|sabtu),\s*/i;

function parseDeadline(text) {
  if (!text) return null;
  let s = DEADLINE_LABEL_RE.test(text) ? text.replace(DEADLINE_LABEL_RE, '') : text;
  s = s.replace(DAY_PREFIX_RE, '').trim();
  s = s.replace(/(\d{1,2})\.(\d{2})(?=\s|$)/, '$1:$2');
  const match = s.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})[,\s]+(\d{1,2}):(\d{2})(?:\s*(AM|PM))?/i);
  if (!match) return null;
  const [, day, monthRaw, year, hourRaw, minute, ampm] = match;
  const monthKey = monthRaw.toLowerCase();
  const month = MONTHS_ID[monthKey] || MONTHS_EN[monthKey];
  if (!month) return null;
  let hour = parseInt(hourRaw, 10);
  if (ampm) {
    const isPM = ampm.toUpperCase() === 'PM';
    if (isPM && hour !== 12) hour += 12;
    if (!isPM && hour === 12) hour = 0;
  }
  const dd = day.padStart(2, '0');
  const hh = String(hour).padStart(2, '0');
  return `${year}-${month}-${dd}T${hh}:${minute}:00+07:00`;
}

function parseNumericDateDeadline(text) {
  const match = (text || '').match(/\bdeadline\s*:\s*(\d{1,2})-(\d{1,2})-(\d{4})\b/i);
  if (!match) return null;
  const [, day, month, year] = match;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T23:59:00+07:00`;
}

function decodeHtmlEntities(text) {
  return text
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function stripTags(html) {
  return decodeHtmlEntities(
    html.replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  );
}

function cleanText(text) {
  return decodeHtmlEntities(text || '')
    // Moodle's module-name suffix only; "Forum Diskusi" keeps its first word.
    .replace(/\s+(?:File|URL|Page|Folder|Forum|Book)\s*$/, ' ')
    .replace(/\b(?:Opened|Closes|Due date|Due|Deadline|To do|Mark as done|Done|Not done):?\b/gi, ' ')
    .replace(/\b(?:Available from|Submitted|Graded|Attempts allowed|Time limit):?\b[^.]*\.?/gi, ' ')
    .replace(/\s+/g, ' ').trim();
}

function cleanTitle(text) {
  return cleanText(text)
    .replace(/\(\s*:?\s*\d{1,2}-\d{1,2}-\d{4}\s*\)/g, '')
    .replace(/\b(?:opens?|opened|closes?|due|deadline)\b.*$/i, '')
    .replace(/\s+/g, ' ').trim();
}

function getAttribute(tag, attrName) {
  const regex = new RegExp(`${attrName}\\s*=\\s*["']([^"']+)["']`, 'i');
  const match = tag.match(regex);
  return match ? decodeHtmlEntities(match[1]).trim() : null;
}

function findFirstClassText(html, className) {
  const regex = new RegExp(`<[^>]*class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`, 'i');
  const match = html.match(regex);
  return match ? cleanText(stripTags(match[1])) : null;
}

function findActivityLinks(html) {
  const links = [];
  const linkPattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = linkPattern.exec(html)) !== null) {
    const href = getAttribute(match[1], 'href');
    if (!href) continue;
    links.push({
      href,
      title: cleanTitle(stripTags(match[2])) || cleanTitle(getAttribute(match[1], 'aria-label')),
      ariaLabel: cleanText(getAttribute(match[1], 'aria-label')),
    });
  }
  return links;
}

function detectType({ text, url, deadlineISO }) {
  const haystack = `${text || ''} ${url || ''}`;
  if (WEEKLY_REFLECTION_PATTERN.test(text || '')) return 'assignment';
  if (FORUM_MODULE_PATTERN.test(url || '')) return 'forum';
  if (IGNORED_MODULE_PATTERN.test(url || '')) {
    if (
      ACTIONABLE_RESOURCE_MODULE_PATTERN.test(url || '') &&
      deadlineISO &&
      ASSIGNMENT_PATTERN.test(text || '')
    ) {
      return 'assignment';
    }
    return null;
  }
  if (LAB_PATTERN.test(haystack)) return 'lab';
  if (QUIZ_MODULE_PATTERN.test(url || '') || QUIZ_PATTERN.test(text || '')) return 'quiz';
  if (ASSIGN_MODULE_PATTERN.test(url || '') || ASSIGNMENT_PATTERN.test(text || '')) return 'assignment';
  return null;
}

const DATE_TIME_PATTERN = String.raw`(?:[A-Za-z]+,\s*)?\d{1,2}\s+[A-Za-z]+\s+\d{4}[,\s]+\d{1,2}[:.]\d{2}(?:\s*(?:AM|PM))?`;
const DATE_TIME_RE = new RegExp(DATE_TIME_PATTERN, 'gi');
const LABELED_DEADLINE_RE = new RegExp(
  String.raw`\b(?:due\s*date|due|deadline|closes?|closed|batas\s+pengumpulan|dikumpulkan\s+paling\s+lambat)\s*:?\s*(${DATE_TIME_PATTERN})`,
  'i'
);
const OPEN_LABEL_RE = /\b(?:opens?|opened|available\s+from)\s*:/i;
const NUMERIC_DEADLINE_RE = /\bdeadline\s*:\s*(\d{1,2}-\d{1,2}-\d{4})\b/i;

function extractDeadlineText(text) {
  const normalized = (text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return null;
  const labeled = normalized.match(LABELED_DEADLINE_RE);
  if (labeled) return labeled[1];
  const numeric = normalized.match(NUMERIC_DEADLINE_RE);
  if (numeric) return `Deadline: ${numeric[1]}`;
  const dates = [...normalized.matchAll(DATE_TIME_RE)].map((m) => m[0]);
  if (OPEN_LABEL_RE.test(normalized)) {
    // "Opened: X" alone is an availability date, not a deadline.
    return dates.length > 1 ? dates[dates.length - 1] : null;
  }
  return dates[0] || null;
}

function isActionableResourceBlock(block, url) {
  return ACTIONABLE_RESOURCE_MODULE_PATTERN.test(url || '') && ACTIONABLE_TEXT_PATTERN.test(stripTags(block));
}

function parseCalendarTimeFromUrl(url) {
  const match = (url || '').match(/[?&]time=(\d+)/);
  if (!match) return null;
  const timestampMs = Number(match[1]) * 1000;
  if (!Number.isFinite(timestampMs)) return null;
  const wib = new Date(timestampMs + 7 * 60 * 60 * 1000);
  const year = wib.getUTCFullYear();
  const month = String(wib.getUTCMonth() + 1).padStart(2, '0');
  const day = String(wib.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseCalendarEventDate(dateText, url) {
  const dateMatch = (dateText || '').match(/\b(\d{1,2}):(\d{2})\b/);
  const datePart = parseCalendarTimeFromUrl(url);
  if (!dateMatch || !datePart) return null;
  const [, hour, minute] = dateMatch;
  return `${datePart}T${hour.padStart(2, '0')}:${minute}:00+07:00`;
}

function extractUpcomingQuizEvents(htmlContent, courseName, courseUrl) {
  const items = [];
  const eventPattern = /<div\b(?=[^>]*data-region=["']event-item["'])[^>]*>([\s\S]*?)<hr>/gi;
  let match;
  while ((match = eventPattern.exec(htmlContent)) !== null) {
    const block = match[1];
    const links = findActivityLinks(block);
    const eventLink = links.find((link) => /calendar\/view\.php/i.test(link.href));
    if (!eventLink || !QUIZ_PATTERN.test(eventLink.title || '')) continue;
    const dateMatch = block.match(/<div\b[^>]*class=["'][^"']*\bdate\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
    const deadlineISO = parseCalendarEventDate(stripTags(dateMatch?.[1] || ''), eventLink.href);
    if (!deadlineISO) continue;
    const title = cleanTitle(eventLink.title);
    items.push({
      title, type: 'quiz', course: courseName,
      deadlineText: stripTags(dateMatch?.[1] || '').trim(),
      deadlineISO, url: eventLink.href || courseUrl || '',
      rawText: `${title} ${stripTags(dateMatch?.[1] || '').trim()}`.trim(),
    });
  }
  return items;
}

function buildItem({ block, title, url, courseName, courseUrl }) {
  const rawDeadlineText = stripTags(block);
  const rawText = cleanText(rawDeadlineText);
  const candidateText = cleanText([title, rawText, url].filter(Boolean).join(' '));
  const deadlineText = extractDeadlineText(rawDeadlineText);
  const deadlineISO = parseDeadline(deadlineText) || parseNumericDateDeadline(deadlineText);
  const type = detectType({ text: candidateText, url, deadlineISO });
  if (!ACTIVITY_TYPES.has(type)) return null;
  const finalTitle = cleanTitle(
    title ||
    findFirstClassText(block, 'instancename') ||
    findFirstClassText(block, 'activityname') ||
    rawText
  );
  if (!finalTitle || finalTitle.length < 3) return null;
  if (NON_ACTIONABLE_TITLE_PATTERN.test(finalTitle)) return null;
  if (type === 'forum' && ANNOUNCEMENT_FORUM_PATTERN.test(finalTitle)) return null;
  return {
    title: finalTitle.slice(0, 200), type, course: courseName,
    deadlineText: deadlineText || null, deadlineISO,
    url: url || courseUrl || '', rawText: rawText.slice(0, 500),
  };
}

// Returns each <li class="activity"> with its own attributes and full body,
// balancing nested <li> (e.g. inline folder file trees) instead of stopping
// at the first </li>.
function findActivityBlocks(html) {
  const blocks = [];
  const openPattern = /<li\b([^>]*class=["'][^"']*\bactivity\b[^"']*["'][^>]*)>/gi;
  let open;
  while ((open = openPattern.exec(html)) !== null) {
    const start = open.index + open[0].length;
    const tagPattern = /<(\/?)li\b[^>]*>/gi;
    tagPattern.lastIndex = start;
    let depth = 1;
    let end = html.length;
    let tag;
    while ((tag = tagPattern.exec(html)) !== null) {
      depth += tag[1] ? -1 : 1;
      if (depth === 0) { end = tag.index; break; }
    }
    blocks.push({ attributes: open[1], block: html.slice(start, end) });
    openPattern.lastIndex = end;
  }
  return blocks;
}

function getModtype(attributes) {
  const match = (attributes || '').match(/\bmodtype_([a-z0-9_]+)\b/i);
  return match ? match[1].toLowerCase() : null;
}

// Restricted activities render without a link; Moodle's module id still
// identifies them, so keep a stable activity URL.
function moduleUrlFromAttributes(attributes, modtype) {
  const id = (attributes || '').match(/\bid=["']module-(\d+)["']/i)?.[1];
  if (!id || !modtype) return null;
  return `https://scele.cs.ui.ac.id/mod/${modtype}/view.php?id=${id}`;
}

function extractFromHtml(htmlContent, courseName, courseUrl) {
  const items = [];
  const normalizedHtml = htmlContent
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ');

  for (const { attributes, block: rawBlock } of findActivityBlocks(normalizedHtml)) {
    const modtype = getModtype(attributes);
    if (modtype && NON_TASK_MODTYPES.has(modtype)) continue;
    if (/\bisrestricted\b/i.test(rawBlock) && OTHER_GROUP_RESTRICTION_PATTERN.test(stripTags(rawBlock))) continue;
    // Screen-reader suffixes (" Assignment", " Quiz", " Forum") are not part of the title.
    const block = rawBlock.replace(/<span\b[^>]*class=["'][^"']*\baccesshide\b[^"']*["'][^>]*>[\s\S]*?<\/span>/gi, ' ');
    const links = findActivityLinks(block);
    const isWeeklyReflectionBlock = /\bsistem\s+interaksi\b/i.test(courseName || '') && WEEKLY_REFLECTION_PATTERN.test(stripTags(block));
    const usableLinks = links.filter(
      (link) =>
        !IGNORED_MODULE_PATTERN.test(link.href) ||
        FORUM_MODULE_PATTERN.test(link.href) ||
        isWeeklyReflectionBlock ||
        isActionableResourceBlock(block, link.href)
    );
    if (links.length > 0 && usableLinks.length === 0) continue;
    const primaryLink =
      usableLinks.find((link) => ASSIGN_MODULE_PATTERN.test(link.href) || QUIZ_MODULE_PATTERN.test(link.href)) ||
      usableLinks.find((link) => /\/mod\//i.test(link.href)) ||
      usableLinks[0];
    const item = buildItem({
      block,
      title:
        getAttribute(block, 'data-activityname') ||
        findFirstClassText(block, 'instancename') ||
        findFirstClassText(block, 'activityname') ||
        primaryLink?.title || primaryLink?.ariaLabel,
      url: primaryLink?.href || moduleUrlFromAttributes(attributes, modtype) || courseUrl,
      courseName, courseUrl,
    });
    if (item) items.push(item);
  }

  items.push(...extractUpcomingQuizEvents(normalizedHtml, courseName, courseUrl));

  if (items.length === 0) {
    for (const link of findActivityLinks(normalizedHtml)) {
      const item = buildItem({
        block: link.title, title: link.title || link.ariaLabel,
        url: link.href, courseName, courseUrl,
      });
      if (item) items.push(item);
    }
  }

  return items;
}

// scrapeCourse.js menulis manifest course hasil discovery SCELE; config lama
// hanya dipakai bila manifest belum ada.
function loadCourses() {
  const source = fs.existsSync(MANIFEST_FILE) ? MANIFEST_FILE : COURSES_FILE;
  return JSON.parse(fs.readFileSync(source, 'utf-8'));
}

function extractAssignments({ now = new Date() } = {}) {
  if (!fs.existsSync(HTML_DIR)) {
    console.error('Folder data/html/ tidak ditemukan. Jalankan dulu: node src/scrapeCourse.js');
    process.exit(1);
  }

  const activeAcademicYear = resolveAcademicYear(now);
  const courses = filterCoursesForActiveAcademicYear(loadCourses(), { now });
  if (!courses.length) {
    throw new Error(
      `Tidak ada course tahun akademik ${activeAcademicYear.label}. Jalankan dulu: node src/scrapeCourse.js`
    );
  }

  const allItems = [];

  for (const course of courses) {
    const htmlPath = path.join(HTML_DIR, `${course.slug || sanitizeFilename(course.name)}.html`);
    if (!fs.existsSync(htmlPath)) continue;

    const html = fs.readFileSync(htmlPath, 'utf-8');
    const items = extractFromHtml(html, course.name, course.url || '');
    console.log(`${course.name}: ${items.length} item ditemukan`);
    allItems.push(...items);
  }

  // Deduplikasi berdasarkan url+title
  const seen = new Set();
  const unique = allItems.filter((item) => {
    const key = `${item.url}|${item.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Urutkan: yang ada deadline ISO dulu, sisanya di bawah
  unique.sort((a, b) => {
    if (a.deadlineISO && b.deadlineISO) return a.deadlineISO.localeCompare(b.deadlineISO);
    if (a.deadlineISO) return -1;
    if (b.deadlineISO) return 1;
    return 0;
  });

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(unique, null, 2), 'utf-8');
  console.log(`\nTotal: ${unique.length} item unik disimpan ke ${OUTPUT_FILE}`);
  return unique;
}

function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 60);
}

module.exports = { extractAssignments, extractFromHtml, sanitizeFilename };

if (require.main === module) {
  extractAssignments();
}
