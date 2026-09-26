# Project Notes For AI Coding Agents

## Documentation Reading Order

Before working in this repository, read the applicable documentation in this order:

1. The nearest `AGENTS.md`.
2. The nearest `AI.md`, when present.
3. The relevant `README.md`, when present.
4. The root `DEPLOYMENT.md` before changing deployment or backend behavior.

This repo contains the SCELE automated deadline tracker and its separate manual
grade tracker.

## What This App Does

My Timeline is an automated SCELE deadline tracker. The scraper logs in to SCELE, extracts assignments/quizzes/labs/deadlines, stores a per-user timeline in Firebase/Firestore, and the dashboard displays those SCELE-derived deadlines. The grade tracker is a separate per-user manual-input domain and must not replace or mutate the SCELE timeline.

Do not turn the dashboard into a manual class schedule app or a generic productivity dashboard. The source of truth is SCELE data.

## Repo Map

- `dashboard/`: Next.js frontend dashboard, exported statically and hosted on Firebase Hosting.
- `timeline-scele-auth/`: Hugging Face Space repo/copy for the live auth + scrape backend used by the dashboard.
- `cloud-run-auth/`: legacy Google Cloud Run copy of the auth + scrape backend. It is kept for reference and is not currently used by the live dashboard.
- `src/`: local/root scraper and extraction pipeline.
- `config/courses.json`: course configuration for scraping.
- `tests/`: regression tests for extraction behavior.

Important deployment context:
- The dashboard frontend lives in `dashboard/` and deploys to Firebase Hosting.
- Firebase Hosting serves the static export from `dashboard/out` as configured in `firebase.json`.
- The live auth/scrape backend used by the dashboard is the Hugging Face Space at `https://hanifmhndra-timeline-scele-auth.hf.space`.
- `cloud-run-auth/` is a legacy Google Cloud Run copy and is not currently used by the live dashboard because Cloud Run costs money. Keep it for reference unless the user explicitly asks to revive Cloud Run.
- `timeline-scele-auth/` is the Hugging Face Space repo/copy for the live auth backend.

## Dashboard Notes

- Next.js version is newer than usual. In `dashboard/AGENTS.md`, the repo notes that this is not the old Next.js API surface. Prefer existing patterns and run validation after edits.
- Use `npm run dev:webpack -- -p 3001` for local preview. Avoid normal `npm run dev` unless the user asks; Turbopack dev has been laggy/problematic here.
- The dashboard is static-exported with `next.config.ts` using `output: "export"`.
- `dashboard/.env.local` values are baked at build time because the output is static.
- The dashboard currently points to Hugging Face via `NEXT_PUBLIC_AUTH_API_BASE_URL`.
- Theme assets live in `dashboard/public/backgrounds/`.
- Theme preference key: `my-timeline-theme`.
- Current dashboard themes are `glass`, `anime`, and `cyberpunk`.
- Completed tasks are stored on the backend (`/task-state/completed`); the
  browser keeps a per-user cache in `scele-completed-tasks:<uid>`. The old
  shared `scele-completed-tasks` key is migrated once on sign-in, then removed.
- Deadline status (today/upcoming/overdue) is recomputed client-side from
  `deadlineISO` via `dashboard/src/lib/timelineStatus.ts`; do not rely on the
  stored `isOverdue`/`isDueToday` flags for display.
- Remember-login preference key: `my-timeline-remember-login`.
- Dashboard profile display settings are UI-only and stored per Firebase/SCELE user as `my-timeline-profile:<uid>`.
- For dashboard backgrounds or other public assets, update files in `dashboard/public/`, rebuild, and deploy from the repo root. If deployed assets appear stale, hard refresh and/or bump the cache-busting query string in `dashboard/src/app/globals.css`.
- Do not edit generated files in `dashboard/out` or `.next`; change source files and rebuild.

## Auth And Persistence

- Login uses SCELE credentials sent to the auth backend, receives a Firebase custom token, then signs in with Firebase.
- The "Ingat saya" checkbox controls Firebase Auth persistence:
  - checked: `browserLocalPersistence`
  - unchecked: `browserSessionPersistence`
- Do not store SCELE passwords in frontend storage.

## Extraction Notes

- Course scraping is fail-closed by academic year in `Asia/Jakarta`: January
  through June uses the previous/current year pair, and July through December
  uses the current/next year pair. Courses without a matching year label are
  not opened.
- `src/extractAssignments.js` and `cloud-run-auth/src/extractAssignments.js` may intentionally mirror extraction behavior.
- `timeline-scele-auth/src/extractAssignments.js` is the live Hugging Face copy.
- The current extractor can treat `/mod/resource`, `/mod/url`, and `/mod/page` as assignments only when the block looks actionable and has a valid deadline.
- Activity types are `assignment`, `quiz`, `lab`, and `forum`. Discussion
  forums are kept (some courses grade them); announcement/news forums are not.
  Moodle `modtype_*` classes decide non-task modules (label, folder, etc.), and
  activities restricted to another group ("You belong to Kelas A") are skipped.
- Semester filter: after the academic year, a `Gasal`/`Ganjil`/`Genap` label
  must match the active Jakarta month (Jul-Dec Gasal, Feb-Jun Genap, January
  both).
- Course discovery uses Moodle's enrolled-courses web service because the
  dashboard navigation truncates long course names and hides the year label.
- `src/extractAssignments.js` is a CommonJS copy of the live extractor core;
  `tests/extractAssignments.test.mjs` asserts both produce identical output.
- Root `npm test` runs the local extraction regression plus the deterministic
  production-backend foundation test suite.

## Validation Checklist

For dashboard UI changes:

```powershell
cd dashboard
npm run lint
npm run build
```

For extraction/backend parsing changes:

```powershell
npm test
```

Before changing deploy or backend behavior, read `DEPLOYMENT.md`.
