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

## Failure behavior

The policy is fail-closed:

- filtering happens before course navigation;
- an inactive course is not treated as a failed active course;
- if no active-year course remains, production returns the existing safe
  `NO_COURSES_FOUND` failure path;
- partial, failed, or empty scrapes never replace the last successful timeline;
- no old cached HTML is deleted; the local extractor simply ignores it.

## Local configuration

Every entry in `config/courses.json` must include an explicit `academicYear`.
That field is authoritative even if the display name contains a different year.
Update the configuration only after confirming the corresponding SCELE course
belongs to the active academic year.

## Verification

Regression tests cover the Jakarta boundary at 1 July, full and abbreviated
labels, explicit local metadata, invalid dates, non-consecutive years, and
fail-closed filtering. Tests are deterministic and do not log in to or scrape
SCELE.
