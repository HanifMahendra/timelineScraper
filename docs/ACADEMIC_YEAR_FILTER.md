# Academic-Year Course Filter

## Purpose

The scraper must not mix courses from different academic years. The live
backend therefore filters discovered SCELE course links before it opens any
course page. The root local pipeline applies the same policy to its checked-in
course configuration and ignores cached HTML from inactive courses.

## Active-year rule

The calculation uses the `Asia/Jakarta` timezone and switches on 1 July:

| Jakarta calendar date | Active academic year |
| --- | --- |
| January-June 2026 | `2025/2026` |
| July-December 2026 | `2026/2027` |

The general rule is:

- January-June: `(calendar year - 1) / calendar year`;
- July-December: `calendar year / (calendar year + 1)`.

Supported labels include `2026/2027`, `2026-2027`, and the abbreviated
`2026/27`. The two years must be consecutive. Course labels with another year,
non-consecutive year-like text, or no parseable year are rejected.

## Active-semester rule

SCELE keeps a Gasal course "in progress" until the following July, so the
academic year alone would keep last semester's courses during Genap. After the
academic-year check, a course whose name carries a semester label must match
the active semester (same `Asia/Jakarta` calendar):

| Month | Accepted labels |
| --- | --- |
| July-December | `Gasal`, `Ganjil` |
| January | `Gasal`, `Ganjil`, `Genap` (finals/new-semester overlap) |
| February-June | `Genap` |

A course without a semester label is not rejected by this rule; the
academic-year label remains the fail-closed gate. Local config entries may set
an explicit `semester` field, which takes precedence over the name.

## Course discovery

The SCELE dashboard navigation truncates long course names (for example
`Desain & Analisis Algoritma (A,B,C) Gasa...`), which hid the academic-year
label and silently skipped the course. Both the live backend and the local
scraper now read the enrolled-course list from Moodle's
`core_course_get_enrolled_courses_by_timeline_classification` web service (the
same call the "My courses" page makes), which returns full names. If that call
fails, the backend falls back to dashboard links using their untruncated
`title` attribute; the local scraper falls back to `config/courses.json`.

## Failure behavior

The policy is fail-closed:

- filtering happens before course navigation;
- an inactive course is not treated as a failed active course;
- if no active-year course remains, production returns the existing safe
  `NO_COURSES_FOUND` failure path;
- partial, failed, or empty scrapes never replace the last successful timeline;
- no old cached HTML is deleted; the local extractor simply ignores it.

## Local configuration

`npm run scrape` discovers active courses automatically and writes the list it
used to the ignored `data/html/courses.json`, which `npm run extract` reads.
`config/courses.json` is only a fallback for when discovery fails. Every entry
there must include an explicit `academicYear`, which is authoritative even if
the display name contains a different year.

## Verification

Regression tests cover the Jakarta boundary at 1 July, full and abbreviated
labels, explicit local metadata, invalid dates, non-consecutive years, and
fail-closed filtering. Tests are deterministic and do not log in to or scrape
SCELE.
