const ACADEMIC_YEAR_START_MONTH = 7;
const ACADEMIC_YEAR_TIME_ZONE = 'Asia/Jakarta';
const ACADEMIC_YEAR_PATTERN = /(?:^|[^\d])((?:19|20)\d{2})\s*(?:\/|-|\u2013|\u2014)\s*((?:19|20)?\d{2})(?!\d)/gu;

function calendarParts(value, timeZone) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError('Tanggal acuan tahun akademik tidak valid.');
  }

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(date);

  return {
    year: Number(parts.find((part) => part.type === 'year')?.value),
    month: Number(parts.find((part) => part.type === 'month')?.value),
  };
}

function resolveAcademicYear(
  now = new Date(),
  { timeZone = ACADEMIC_YEAR_TIME_ZONE } = {}
) {
  const { year, month } = calendarParts(now, timeZone);
  const startYear = month >= ACADEMIC_YEAR_START_MONTH ? year : year - 1;
  const endYear = startYear + 1;

  return {
    startYear,
    endYear,
    label: `${startYear}/${endYear}`,
    timeZone,
  };
}

function extractAcademicYears(value) {
  const text = String(value || '');
  const matches = [];
  const seen = new Set();

  for (const match of text.matchAll(ACADEMIC_YEAR_PATTERN)) {
    const startYear = Number(match[1]);
    let endYear = Number(match[2]);
    if (match[2].length === 2) {
      endYear = Math.floor(startYear / 100) * 100 + endYear;
      if (endYear <= startYear) endYear += 100;
    }
    if (endYear !== startYear + 1) continue;

    const label = `${startYear}/${endYear}`;
    if (seen.has(label)) continue;
    seen.add(label);
    matches.push({ startYear, endYear, label });
  }

  return matches;
}

function matchesAcademicYear(value, academicYear) {
  return extractAcademicYears(value).some(
    ({ startYear, endYear }) =>
      startYear === academicYear.startYear && endYear === academicYear.endYear
  );
}

function courseMatchesActiveAcademicYear(
  course,
  { now = new Date(), timeZone = ACADEMIC_YEAR_TIME_ZONE } = {}
) {
  const academicYear = resolveAcademicYear(now, { timeZone });
  const yearSource = course?.academicYear ?? course?.name;
  return matchesAcademicYear(yearSource, academicYear);
}

function filterCoursesForActiveAcademicYear(courses, options = {}) {
  if (!Array.isArray(courses)) {
    throw new TypeError('Daftar course harus berupa array.');
  }
  return courses.filter((course) => courseMatchesActiveAcademicYear(course, options));
}

module.exports = {
  ACADEMIC_YEAR_START_MONTH,
  ACADEMIC_YEAR_TIME_ZONE,
  courseMatchesActiveAcademicYear,
  extractAcademicYears,
  filterCoursesForActiveAcademicYear,
  matchesAcademicYear,
  resolveAcademicYear,
};
