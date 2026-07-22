# Dependency Security

Baseline captured on 2026-07-22 with npm 10 and Node 22. Root has zero
findings. Dashboard production dependencies have zero findings. Dashboard's
complete tree initially had 2 low, 3 moderate, and 2 high findings; safe
same-major overrides for `fast-uri`, `js-yaml`, and `body-parser`, plus a
transitive Babel patch, reduced that to 3 moderate findings, all
development-only.
During Phase 7, a newly published high-severity `sharp <0.35.0` advisory made
the installed Next.js optional `sharp` 0.34.5 fail the production audit. A
reviewed override to patched `sharp` 0.35.3 restored the dashboard production
audit to zero; lint, typecheck, static build, and runtime package resolution
were revalidated. A second new advisory affecting `fast-uri <=3.1.3` was
resolved with 3.1.4. The application has no `next/image` usage, but the audit
gate is intentionally stricter than reachability analysis.

The backend initially had 2 low and 8 moderate findings. Patch overrides for
`body-parser` 1.20.6 and `@tootallnate/once` 2.0.1 removed both lows. The 8
remaining moderate findings are in the Firebase Admin 12 optional Google Cloud
dependency chain and are present in the production audit.

The finding was rechecked on 2026-07-22. Both `npm audit --omit=dev` and the
full `npm audit` report the same eight moderate entries and no low, high, or
critical finding. They roll up to `GHSA-w5hq-g745-h8pq`, a missing buffer
bounds check in `uuid` v3/v5/v6 when a caller supplies a buffer. The installed
runtime chains are:

```text
firebase-admin 12.7.0 -> uuid 10.0.0
firebase-admin -> @google-cloud/firestore 7.11.6
  -> google-gax 4.6.1 -> retry-request 7.0.2 / uuid 9.0.1
firebase-admin -> @google-cloud/storage 7.19.0
  -> gaxios 6.7.1 -> uuid 9.0.1
  -> retry-request 7.0.2 -> teeny-request 9.0.0 -> uuid 9.0.1
  -> uuid 8.3.2
```

Firebase Admin Auth, custom-token creation, Firestore, transactions, and
Timestamp conversion are runtime-reachable. The application does not import
Cloud Storage or `uuid` directly. Inspection of the installed affected
Google/Firebase call sites found v4 generation only, not the affected
v3/v5/v6-with-buffer pattern. This makes the published exploit path not
observed in the application flow, but it does not remove the vulnerable
packages from the production installation.

## Triage

| Package/path | Scope | Action | Rationale |
| --- | --- | --- | --- |
| `fast-uri` 3.1.4, `js-yaml`, dashboard `body-parser`, Babel 7.29.7 | Transitive dev tooling | Patched/minor update | Same major, lockfile updated, lint/type/build pass. |
| `sharp` | Next.js optional production dependency | Patched override to 0.35.3 | Upstream advisory affects versions before 0.35.0; package resolution and static build pass. |
| backend `body-parser`, `@tootallnate/once` | Transitive runtime/optional | Patch override | No API change; backend and emulator tests pass. |
| `@hono/node-server`, MCP SDK, `shadcn` | Transitive/direct dev CLI | Temporarily accepted | `shadcn` is not shipped in `dashboard/out`; audit proposes a major/downgrade path requiring compatibility work. |
| `firebase-admin` 12 and Google Cloud chain (`firestore`, `storage`, `gaxios`, `google-gax`, `retry-request`, `teeny-request`, `uuid`) | Backend runtime/optional | Temporarily accepted | npm requires Firebase Admin major upgrade and several transitive majors. Firestore, transactions, Timestamp, custom token, emulator, and Admin initialization must be retested together. The service does not expose Google Cloud Storage routes. |

No `npm audit fix --force` was run. No major dependency was changed. The only
new packages are test-only `@firebase/rules-unit-testing` 5.0.1 and Firebase
client 12.16.0 (Apache-2.0, Node 20 compatible) for Firestore Rules tests.

## Upgrade procedure

1. Work on an isolated branch and record `npm audit --json` before/after.
2. Use patch/minor changes first; review lockfile and `npm explain` paths.
3. For Firebase Admin 13+, verify Admin app initialization, custom-token auth,
   Firestore Timestamp conversion, transactions, batch limits, emulator tests,
   and the Docker Node/runtime image.
4. Run `npm test`, `npm run test:emulator`, dashboard lint/type/build, secret
   scan, and the complete preflight.
5. Deploy only to separate staging and apply the manual verification matrix.

Accepted risks must be reviewed before a future production rollout and whenever
an upstream fixed same-major release becomes available. Before the 2026-07-22
owner decision, the Firebase Admin chain was staging-only; the current
production acceptance below supersedes that earlier gate through its review
deadline.

Current production decision, explicitly accepted by the owner on 2026-07-22:
`ACCEPTED_TEMPORARILY_FOR_PRODUCTION`. This acceptance expires for review no
later than 2026-08-22 and is valid only while there are no high/critical
findings, the full backend/emulator/Rules/auth/transaction/preflight matrix
continues to pass, and no runtime-relevant exploit path or regression appears.
Rollout must stop if any of those conditions changes. No global `uuid` override
was added because it would force multiple transitive dependencies across a
major boundary, and no `npm audit fix --force` was run.
