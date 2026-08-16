# Changelog

This project follows a simple Keep a Changelog-style record. Entries describe
implemented repository state, not deployment status.

## Unreleased

### Added

- Deterministic academic-year course filtering for both the local scraper and
  live SCELE backend, with an Asia/Jakarta 1 July boundary and fail-closed
  handling for old, future, or unlabelled courses.
- Phase 1: stable SCELE activity identity and trusted URL validation.
- Phase 2: snapshot/history, authoritative diff, distributed lock/cooldown,
  retention, and partial-scrape protection.
- Phase 3: authenticated manual gradebook, component/category/scenario domain.
- Phase 4: bounded CSV/XLSX draft-review-commit import workflow.
- Phase 5: subjects/topics, deterministic study plans, draft/apply, progress,
  and curated learning resources.
- Phase 6: validated runtime configuration, liveness/readiness, request IDs,
  structured redacted logs/metrics, safe errors, CORS/headers/timeouts/rate
  limits, graceful shutdown, emulator/rules tests, staging smoke guards,
  preflight, secret scan, indexes, and operational documentation.
- Phase 7 staging preparation: isolated environment templates, cross-target
  readiness validation, stricter staging identity/origin guards, cleanup-fatal
  authenticated smoke tooling, and an evidence-based verification report.

### Changed

- SCELE course pages are filtered before navigation; local extraction also
  ignores cached HTML whose configured course is outside the active academic
  year.
- Backend startup is separated from app construction for safe testing.
- Dashboard API errors handle offline, auth expiry, server failures, and
  request-ID correlation without exposing raw response bodies.
- Safe same-major dependency patches are pinned through reviewed overrides.
- Dashboard `sharp` is pinned to patched 0.35.3 after a new production advisory.
- The 2026-08-16 security refresh pins Next.js 16.2.11 and patched same-major
  transitive releases for PostCSS, Nanoid, Fast URI, JS-YAML, Hono, Undici,
  IP Address, and Brace Expansion; dashboard audits return zero findings and
  the backend returns only the eight previously accepted moderate findings.

### Deployment

- On 2026-08-17 the academic-year backend follow-up deployed revision
  `29cfda2ccbd6894862a69dd8fbc3b20ad686dc1d`; the Space returned to
  `RUNNING` with health/readiness checks passing.
- Firebase Hosting advanced to release `1786899858893000`, version
  `884ef983a8b09006`, after the Next.js security patch changed the static
  artifact. All 51 deployed files match the local export exactly.
- Firestore Rules and indexes were not redeployed; the active Rules hash and
  `READY` index remained unchanged.
- Controlled production rollout completed in the order Firestore Rules,
  composite index, Hugging Face backend, and Firebase Hosting.
- Production status is `DEPLOYED_AND_VERIFIED_WITHOUT_AUTHENTICATED_SMOKE`.
- Authenticated smoke remains `NOT_EXECUTED_AUTH_REQUIRES_SCELE`; SCELE login
  and scraping remain `NOT AUTHORIZED`.
- Managed Firestore backup was waived by the owner, and eight moderate backend
  dependency findings are accepted temporarily through 2026-08-22.

### Security

- Production config fails closed; test/staging production targets are rejected.
- Server-only grade/import/study/session/coordination paths are Rules-tested.
- Staging/SCELE smoke scripts require explicit opt-in and reject production.

### Fixed

- Parser/body dependency advisories with safe patch releases were mitigated.
- Full-tree dependency audits now fail preflight on either high or critical
  findings instead of being informational-only; moderate backend findings
  remain subject to the explicit owner risk decision.
- Staging smoke health/readiness calls no longer send authentication, and a
  cleanup failure now fails the run with only created resource IDs.

### Known limitations

- Firebase Admin 12 transitive moderate findings require a separately tested
  major upgrade. Dashboard production and full audits currently have zero
  findings.
- Phase 7 remote deployment/verification is blocked until isolated staging
  Firebase, Hosting, Hugging Face, credentials, and test users are provisioned.
- No authenticated production smoke, staging SCELE run, TTL deployment,
  scheduler, notification, PDF/DOCX/OCR, AI extraction, or calendar integration.
