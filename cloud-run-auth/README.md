# SCELE Auth Service

Cloud Run service untuk login SCELE dengan username/password, menyimpan `storageState` SCELE terenkripsi di Firestore, lalu mengembalikan Firebase custom token ke dashboard.

## Environment

Copy `.env.example` menjadi `.env` untuk local run.

`SESSION_ENCRYPTION_KEY` harus 32 byte base64. Generate:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Di Cloud Run, pakai Application Default Credentials service account yang punya akses Firebase Auth dan Firestore.

## Endpoints

- `POST /auth/login` body `{ "username": "...", "password": "..." }`
- `POST /auth/logout` dengan header `Authorization: Bearer <firebase-id-token>`
- `GET /healthz`
