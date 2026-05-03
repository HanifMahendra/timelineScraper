# Project Notes For Codex / Claude

This repo contains the SCELE automated deadline tracker.

## What This App Does

My Timeline is an automated SCELE deadline tracker. The scraper logs in to SCELE, extracts assignments/quizzes/labs/deadlines, stores a per-user timeline in Firebase/Firestore, and the dashboard displays those SCELE-derived deadlines.

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
- Completed task local key: `scele-completed-tasks`.
- Remember-login preference key: `my-timeline-remember-login`.

## Auth And Persistence

- Login uses SCELE credentials sent to the auth backend, receives a Firebase custom token, then signs in with Firebase.
- The "Ingat saya" checkbox controls Firebase Auth persistence:
  - checked: `browserLocalPersistence`
  - unchecked: `browserSessionPersistence`
- Do not store SCELE passwords in frontend storage.

## Extraction Notes

- `src/extractAssignments.js` and `cloud-run-auth/src/extractAssignments.js` may intentionally mirror extraction behavior.
- `timeline-scele-auth/src/extractAssignments.js` is the live Hugging Face copy.
- The current extractor can treat `/mod/resource`, `/mod/url`, and `/mod/page` as assignments only when the block looks actionable and has a valid deadline.
- Root `npm test` runs `tests/extractAssignments.test.mjs` for this regression.

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

