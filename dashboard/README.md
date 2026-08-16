# My Timeline Dashboard

Next.js dashboard for the automated SCELE deadline tracker. The dashboard signs users in through the SCELE auth backend, reads each user's timeline from Firebase/Firestore, and displays deadlines extracted from SCELE.

The authenticated dashboard also contains a separate manual grade tracker.
Timeline data remains SCELE-derived; grade inputs are user-authored and stored
through the authenticated backend API.

## Local Preview

Use the webpack dev server. Avoid the default `npm run dev` unless you intentionally want Turbopack.

```powershell
npm run dev:webpack -- -p 3001
```

Open:

```text
http://localhost:3001
```

## Build

This app uses static export through `next.config.ts`:

```powershell
npm run lint
npm run build
```

The build output is generated into:

```text
dashboard/out
```

Do not edit `out/` manually. Change files in `src/` or `public/`, then rebuild.

## Deploy

Deploy from the repo root, not from this `dashboard/` folder, because Firebase Hosting is configured in the root `firebase.json`.

```powershell
cd ..
firebase deploy --only hosting --project timeline-automated-scraper
```

Firebase Hosting serves:

```text
dashboard/out
```

## Themes

Theme state is stored in local storage with:

```text
my-timeline-theme
```

The dashboard currently exposes a single `glass` theme with a calm pastel,
macOS-inspired visual system. The previous `anime` and `cyberpunk` assets and
CSS remain in the repository for possible future reactivation, but stored
preferences are normalized to `glass` and no theme selector is rendered.

Theme background assets live in:

```text
public/backgrounds/
```

If a deployed background does not appear to change, hard refresh the browser. For stubborn browser/CDN cache, bump the cache-busting query string in `src/app/globals.css`, for example:

```css
url("/backgrounds/anime.png?v=20260518-2")
```

## Local Persistence

The dashboard intentionally keeps some UI-only state in browser local storage:

- `scele-completed-tasks`: task IDs marked as done.
- `my-timeline-remember-login`: remember-login preference.
- `my-timeline-profile:<uid>`: dashboard display name and profile photo for a specific Firebase/SCELE user.

SCELE passwords must not be stored in frontend storage.

## Grade Tracker

Navigation contains:

- `Timeline`: the existing SCELE deadline projection.
- `Nilai`: manual gradebooks, categories, components, target calculations, and
  scenario simulation.

Grade CRUD uses `NEXT_PUBLIC_AUTH_API_BASE_URL` with the current Firebase ID
token. The static dashboard does not use Server Actions or a Next.js API
runtime.

The UI distinguishes:

- accumulated contribution against the final 100;
- average on already graded weight;
- pending score versus a real zero;
- known remaining weight versus unknown weight;
- actual score versus scenario assumption.

An optional component link can reference one of at most 500 bounded activity
snapshots belonging to the authenticated user, including a previously linked
missing activity. It is display-only; no grade is scraped or copied from SCELE. See
`../docs/GRADE_CALCULATION.md` for domain rules.

Gradebook detail juga menyediakan wizard `Import CSV/XLSX`:

```text
upload → pilih sheet → mapping kolom → review/edit → konfirmasi → hasil
```

Wizard menerima `.csv` dan `.xlsx` sampai 5 MB sebagai pemeriksaan awal
client. Backend tetap menjadi batas keamanan yang authoritative. Multiple
sheet, mapping ambigu, category conflict, warning, row invalid, tindakan
create/skip, dan pagination ditampilkan sebelum commit. Checkbox konfirmasi
wajib aktif sebelum perubahan disimpan. Dashboard tidak mem-parsing workbook
dan tidak menulis collection grade atau import draft langsung; semua operasi
memakai Firebase ID token melalui backend API.

Lihat `../docs/GRADE_IMPORT.md` untuk perilaku parser dan batas server.

## Production errors

API clients memvalidasi base origin, membedakan kegagalan offline/network,
memakai pesan ramah untuk code yang dikenal, menyembunyikan raw body 5xx, dan
menampilkan request ID backend yang dapat disalin. HTTP 401 memicu auth-expiry
handling dan sign-out Firebase. Destructive writes tidak otomatis di-retry;
import commit dan study apply tetap memakai token/version idempotency eksplisit.
