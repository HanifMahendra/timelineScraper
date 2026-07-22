## Documentation Reading Order

Before working in the dashboard, read the applicable documentation in this order:

1. This `AGENTS.md`.
2. `AI.md` in this directory.
3. `README.md` in this directory.
4. The root `DEPLOYMENT.md` before changing deployment behavior.

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Local Preview

Use webpack for localhost preview to avoid lag/problems with the normal dev server:

```powershell
npm run dev:webpack -- -p 3001
```

Avoid plain `npm run dev` unless explicitly requested.

## Dashboard Notes

- This dashboard is statically exported to `dashboard/out`; do not edit generated files in `out/` or `.next/`.
- Source UI lives in `src/`; static assets such as theme backgrounds live in `public/backgrounds/`.
- Themes are `glass`, `anime`, and `cyberpunk`; the theme preference key is `my-timeline-theme`.
- UI-only completed tasks use `scele-completed-tasks`.
- UI-only profile display settings use `my-timeline-profile:<uid>` so they stay scoped to the current SCELE/Firebase account.
- For deployment, run `npm run lint` and `npm run build` here, then deploy Firebase Hosting from the repo root.
