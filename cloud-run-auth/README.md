---
title: Timeline SCELE Auth
emoji: 📚
colorFrom: blue
colorTo: green
sdk: docker
app_port: 7860
---

# SCELE Auth Service

Backend service untuk login SCELE dengan username/password, menyimpan `storageState` SCELE terenkripsi di Firestore, lalu mengembalikan Firebase custom token ke dashboard.

## Environment

Copy `.env.example` menjadi `.env` untuk local run.

`SESSION_ENCRYPTION_KEY` harus 32 byte base64. Generate:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Di Cloud Run, pakai Application Default Credentials service account yang punya akses Firebase Auth dan Firestore.

Di Hugging Face Spaces, tambahkan Secrets:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_SERVICE_ACCOUNT_JSON`
- `SESSION_ENCRYPTION_KEY`

Tambahkan Variable:

- `ALLOWED_ORIGINS`

`FIREBASE_SERVICE_ACCOUNT_JSON` bisa diisi raw JSON service account atau base64 dari file JSON.

## Endpoints

- `POST /auth/login` body `{ "username": "...", "password": "..." }`
- `POST /auth/logout` dengan header `Authorization: Bearer <firebase-id-token>`
- `GET /healthz`
