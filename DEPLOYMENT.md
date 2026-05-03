# Deployment Notes

This file is the deploy source of truth for this repo.

## Dashboard Frontend

The dashboard is a Next.js static export deployed through Firebase Hosting.

Firebase config:
- Project: `timeline-automated-scraper`
- Hosting public folder: `dashboard/out`
- Config file: `firebase.json`

Deploy flow:

```powershell
cd "C:\Users\Mahendra's\OneDrive\Documents\Double Shot Espresso\aiAutomatedTimelineKuliah\dashboard"
npm run lint
npm run build
cd ..
firebase deploy --only hosting
```

If the Firebase CLI is not installed globally:

```powershell
npx firebase-tools deploy --only hosting
```

Important: dashboard env values are baked during `npm run build`. Check `dashboard/.env.local` before building, especially:

```text
NEXT_PUBLIC_AUTH_API_BASE_URL
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_APP_ID
```

Current important value:

```text
NEXT_PUBLIC_AUTH_API_BASE_URL=https://hanifmhndra-timeline-scele-auth.hf.space
```

Local preview should use webpack:

```powershell
cd "C:\Users\Mahendra's\OneDrive\Documents\Double Shot Espresso\aiAutomatedTimelineKuliah\dashboard"
npm run dev:webpack -- -p 3001
```

Avoid normal `npm run dev` unless needed; it has been laggy/problematic in this workspace.

## Live Auth / Scrape Backend

The live backend currently used by the dashboard is Hugging Face Spaces:

```text
https://hanifmhndra-timeline-scele-auth.hf.space
```

The local folder for that Space is:

```text
timeline-scele-auth/
```

Deploy/update flow for the Hugging Face Space:

```powershell
cd "C:\Users\Mahendra's\OneDrive\Documents\Double Shot Espresso\aiAutomatedTimelineKuliah\timeline-scele-auth"
git status
git push origin main
```

The Space uses Docker with app port `7860`.

Before pushing backend/extractor changes to the Space, run:

```powershell
cd "C:\Users\Mahendra's\OneDrive\Documents\Double Shot Espresso\aiAutomatedTimelineKuliah"
npm test
```

If `timeline-scele-auth/` is already clean and up to date, there is nothing to redeploy.

## Legacy Cloud Run Copy

`cloud-run-auth/` is a Google Cloud Run version of the auth/scrape backend. It is currently not the backend used by the dashboard, because the dashboard points to the Hugging Face Space URL.

Do not deploy or modify Cloud Run unless explicitly requested.

If Cloud Run is revived later, the dashboard must be rebuilt with `NEXT_PUBLIC_AUTH_API_BASE_URL` set to the Cloud Run service URL, then redeployed to Firebase Hosting.

Example Cloud Run deploy pattern, only if intentionally reviving Cloud Run:

```powershell
cd "C:\Users\Mahendra's\OneDrive\Documents\Double Shot Espresso\aiAutomatedTimelineKuliah\cloud-run-auth"
gcloud config set project timeline-automated-scraper
gcloud builds submit --tag gcr.io/timeline-automated-scraper/timeline-scele-auth
gcloud run deploy timeline-scele-auth `
  --image gcr.io/timeline-automated-scraper/timeline-scele-auth `
  --platform managed `
  --region asia-southeast2 `
  --port 7860 `
  --allow-unauthenticated
```

Check actual service name and region first:

```powershell
gcloud run services list --platform managed
```

## What Deploys What

- Firebase Hosting deploy updates only the static dashboard from `dashboard/out`.
- Hugging Face Space update changes live `/auth/login`, `/auth/logout`, `/scrape`, and `/healthz` backend behavior.
- Cloud Run deploy only matters if `NEXT_PUBLIC_AUTH_API_BASE_URL` is changed to a Cloud Run URL and the dashboard is rebuilt/redeployed.

## Pre-Deploy Checklist

Dashboard only:

```powershell
cd dashboard
npm run lint
npm run build
cd ..
firebase deploy --only hosting
```

Dashboard + extraction behavior:

```powershell
npm test
cd dashboard
npm run lint
npm run build
cd ..
firebase deploy --only hosting
```

If auth/scrape backend changed and the live Space needs update:

```powershell
cd timeline-scele-auth
git status
git push origin main
```

