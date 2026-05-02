/**
 * Baca HTML dari data/html/, extract item assignment/quiz/lab,
 * lalu output ke data/assignments.json.
 */

const fs = require('fs');
const path = require('path');

const HTML_DIR = path.resolve(__dirname, '../data/html');
const COURSES_FILE = path.resolve(__dirname, '../config/courses.json');
const OUTPUT_FILE = path.resolve(__dirname, '../data/assignments.json');

const ACTIVITY_TYPES = new Set(['assignment', 'quiz', 'lab']);

const LAB_PATTERN = /\b(lab|laboratorium|praktikum|praktik)\b/i;
const QUIZ_PATTERN = /\b(quiz|kuis)\b/i;
const ASSIGNMENT_PATTERN = /\b(tugas|assignment|penugasan|homework|hw|tp|tutorial)\b/i;
const WEEKLY_REFLECTION_PATTERN = /\bweekly\s+reflection\b/i;
const NON_ACTIONABLE_TITLE_PATTERN = /^(?:deskripsi\s+kuliah|informasi\s+umum|sekilas\s+(?:tentang\s+)?sda)\b/i;

const IGNORED_MODULE_PATTERN = /\/mod\/(?:resource|url|page|book|folder|label|forum|glossary|choice|feedback|survey|wiki|lesson|scorm|attendance|data)\//i;
const ASSIGN_MODULE_PATTERN = /\/mod\/assign(?:ment)?\//i;
const QUIZ_MODULE_PATTERN = /\/mod\/quiz\//i;

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

/**
 * Ubah teks deadline dari SCELE ke format ISO 8601 (WIB +07:00).
 *
 * Format yang didukung:
 *   - "10 May 2026, 23:59"
 *   - "Sunday, 10 May 2026, 23:59"
 *   - "Due: Sunday, 10 May 2026, 23:59"
 *   - "10 Mei 2026, 23:59"
 *   - "Batas pengumpulan: 10 Mei 2026 23.59"
 *   - "10 May 2026, 11:59 PM"
 */
// Label prefix yang mungkin muncul sebelum tanggal di SCELE
const DEADLINE_LABEL_RE = /^(?:due|deadline|closes?|batas\s+pengumpulan|dikumpulkan\s+paling\s+lambat)\s*:\s*/i;

// Nama hari (EN + ID) di awal string, diikuti koma
const DAY_PREFIX_RE = /^(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday|minggu|senin|selasa|rabu|kamis|jumat|sabtu),\s*/i;

/**
 * Ubah teks deadline dari SCELE ke ISO 8601 (WIB +07:00).
 *
 * Format yang didukung:
 *   "10 May 2026, 23:59"
 *   "Sunday, 10 May 2026, 23:59"
 *   "Due: Sunday, 10 May 2026, 23:59"
 *   "10 Mei 2026, 23:59"
 *   "Batas pengumpulan: 10 Mei 2026 23.59"
 *   "10 May 2026, 11:59 PM"
 */
function parseDeadline(text) {
  if (!text) return null;

  // Strip label prefix hanya jika ada kata kunci yang dikenal
  let s = DEADLINE_LABEL_RE.test(text) ? text.replace(DEADLINE_LABEL_RE, '') : text;

  // Strip nama hari di depan: "Sunday, " atau "Minggu, "
  s = s.replace(DAY_PREFIX_RE, '').trim();

  // Normalisasi pemisah jam: titik → titik dua ("23.59" → "23:59")
  s = s.replace(/(\d{1,2})\.(\d{2})(?=\s|$)/, '$1:$2');

  // Pola utama: "10 May 2026, 23:59" atau "10 May 2026 23:59 PM"
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
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function stripTags(html) {
  return decodeHtmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  );
}

function cleanText(text) {
  return decodeHtmlEntities(text || '')
    .replace(/\b(?:File|URL|Page|Folder|Forum|Book)\b\s*/gi, ' ')
    .replace(/\b(?:Opened|Closes|Due date|Due|Deadline|To do|Mark as done|Done|Not done):?\b/gi, ' ')
    .replace(/\b(?:Available from|Submitted|Graded|Attempts allowed|Time limit):?\b[^.]*\.?/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanTitle(text) {
  return cleanText(text)
    .replace(/\(\s*:?\s*\d{1,2}-\d{1,2}-\d{4}\s*\)/g, '')
    .replace(/\b(?:opens?|opened|closes?|due|deadline)\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
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

function detectType({ text, url }) {
  const haystack = `${text || ''} ${url || ''}`;

  if (WEEKLY_REFLECTION_PATTERN.test(text || '')) return 'assignment';
  if (IGNORED_MODULE_PATTERN.test(url || '')) return null;
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

  const dates = [...normalized.matchAll(DATE_TIME_RE)].map((match) => match[0]);
  if (OPEN_LABEL_RE.test(normalized) && dates.length > 1) {
    return dates[dates.length - 1];
  }

  return dates[0] || null;
}

function buildItem({ block, title, url, courseName, courseUrl }) {
  const rawDeadlineText = stripTags(block);
  const rawText = cleanText(rawDeadlineText);
  const candidateText = cleanText([title, rawText, url].filter(Boolean).join(' '));
  const isWeeklyReflection =
    courseName === 'Sistem Interaksi' && WEEKLY_REFLECTION_PATTERN.test(candidateText);
  const type = detectType({ text: candidateText, url });

  if (!ACTIVITY_TYPES.has(type)) return null;

  const finalTitle = cleanTitle(
    title ||
      findFirstClassText(block, 'instancename') ||
      findFirstClassText(block, 'activityname') ||
      rawText
  );

  if (!finalTitle || finalTitle.length < 3) return null;
  if (NON_ACTIONABLE_TITLE_PATTERN.test(finalTitle)) return null;

  const deadlineText = extractDeadlineText(rawDeadlineText);
  const deadlineISO = parseDeadline(deadlineText) || parseNumericDateDeadline(deadlineText);
  if (!deadlineISO && !isWeeklyReflection) return null;
  if (isWeeklyReflection && !deadlineISO) return null;

  return {
    title: finalTitle.slice(0, 200),
    type,
    course: courseName,
    deadlineText: deadlineText || null,
    deadlineISO,
    url: url || courseUrl || '',
    rawText: rawText.slice(0, 500),
  };
}

function extractFromHtml(htmlContent, courseName, courseUrl) {
  const items = [];

  // Gunakan regex ringan: cukup untuk HTML Moodle/SCELE yang sudah tersimpan.
  const normalizedHtml = htmlContent
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ');

  const activityPattern = /<li\b[^>]*class=["'][^"']*\bactivity\b[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi;
  let match;

  while ((match = activityPattern.exec(normalizedHtml)) !== null) {
    const block = match[1];
    const links = findActivityLinks(block);
    const isWeeklyReflectionBlock =
      courseName === 'Sistem Interaksi' && WEEKLY_REFLECTION_PATTERN.test(stripTags(block));
    const usableLinks = links.filter(
      (link) => !IGNORED_MODULE_PATTERN.test(link.href) || isWeeklyReflectionBlock
    );
    if (links.length > 0 && usableLinks.length === 0) continue;

    const primaryLink =
      usableLinks.find((link) => ASSIGN_MODULE_PATTERN.test(link.href) || QUIZ_MODULE_PATTERN.test(link.href)) ||
      usableLinks[0];

    const item = buildItem({
      block,
      title:
        findFirstClassText(block, 'instancename') ||
        findFirstClassText(block, 'activityname') ||
        primaryLink?.title ||
        primaryLink?.ariaLabel,
      url: primaryLink?.href || courseUrl,
      courseName,
      courseUrl,
    });

    if (item) items.push(item);
  }

  // Fallback untuk HTML Moodle yang tidak memakai <li class="activity"> lengkap.
  if (items.length === 0) {
    for (const link of findActivityLinks(normalizedHtml)) {
      const item = buildItem({
        block: link.title,
        title: link.title || link.ariaLabel,
        url: link.href,
        courseName,
        courseUrl,
      });

      if (item) items.push(item);
    }
  }

  return items;
}

function extractAssignments() {
  if (!fs.existsSync(HTML_DIR)) {
    console.error('Folder data/html/ tidak ditemukan. Jalankan dulu: node src/scrapeCourse.js');
    process.exit(1);
  }

  const courses = JSON.parse(fs.readFileSync(COURSES_FILE, 'utf-8'));
  const courseMap = Object.fromEntries(courses.map((c) => [c.name, c.url]));

  const htmlFiles = fs.readdirSync(HTML_DIR).filter((f) => f.endsWith('.html'));
  if (!htmlFiles.length) {
    console.error('Tidak ada file HTML di data/html/. Jalankan dulu: node src/scrapeCourse.js');
    process.exit(1);
  }

  const allItems = [];

  for (const file of htmlFiles) {
    const slug = file.replace('.html', '');
    // Cocokkan slug ke nama course
    const courseName =
      courses.find((c) => c.name.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 60) === slug)?.name ||
      slug;
    const courseUrl = courseMap[courseName] || '';

    const html = fs.readFileSync(path.join(HTML_DIR, file), 'utf-8');
    const items = extractFromHtml(html, courseName, courseUrl);
    console.log(`${courseName}: ${items.length} item ditemukan`);
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

module.exports = { extractAssignments, extractFromHtml };

if (require.main === module) {
  extractAssignments();
}
