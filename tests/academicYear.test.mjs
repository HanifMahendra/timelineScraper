import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  courseMatchesActiveAcademicYear,
  extractAcademicYears,
  filterCoursesForActiveAcademicYear,
  resolveAcademicYear,
} = require('../src/academicYear.js');

test('January through June uses the academic year ending in the calendar year', () => {
  assert.equal(
    resolveAcademicYear(new Date('2026-01-15T00:00:00Z')).label,
    '2025/2026'
  );
  assert.equal(
    resolveAcademicYear(new Date('2026-06-30T16:59:59Z')).label,
    '2025/2026'
  );
});

test('July through December uses the academic year starting in the calendar year', () => {
  assert.equal(
    resolveAcademicYear(new Date('2026-06-30T17:00:00Z')).label,
    '2026/2027'
  );
  assert.equal(
    resolveAcademicYear(new Date('2026-12-31T23:59:59Z')).label,
    '2026/2027'
  );
});

test('academic year parsing supports common separators and abbreviated end years', () => {
  assert.deepEqual(
    extractAcademicYears('Kelas A 2026-2027, arsip 2025/26, salah 2026/2028'),
    [
      { startYear: 2026, endYear: 2027, label: '2026/2027' },
      { startYear: 2025, endYear: 2026, label: '2025/2026' },
    ]
  );
});

test('explicit course academicYear is authoritative over its display name', () => {
  const now = new Date('2026-08-16T00:00:00Z');
  assert.equal(
    courseMatchesActiveAcademicYear(
      { name: 'Algoritma 2026/2027', academicYear: '2025/2026' },
      { now }
    ),
    false
  );
});

test('course filtering is fail-closed for old, future, and unlabelled courses', () => {
  const courses = [
    { name: 'Aktif', academicYear: '2026/2027' },
    { name: 'Lama', academicYear: '2025/2026' },
    { name: 'Mendatang', academicYear: '2027/2028' },
    { name: 'Tanpa Tahun' },
  ];
  assert.deepEqual(
    filterCoursesForActiveAcademicYear(courses, {
      now: new Date('2026-08-16T00:00:00Z'),
    }),
    [courses[0]]
  );
});

test('invalid reference dates are rejected', () => {
  assert.throws(() => resolveAcademicYear(new Date('invalid')), TypeError);
});
