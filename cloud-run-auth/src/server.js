import crypto from 'crypto';
import cors from 'cors';
import express from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { encryptJson, decryptJson } from './crypto.js';
import { getAuth, getFirestore } from './firebaseAdmin.js';
import { loginToScele } from './scele.js';
import { scrapeUserCourses } from './scrapeScele.js';
import { extractAllAssignments } from './extractAssignments.js';
import { buildTimeline } from './buildTimeline.js';

const app = express();
const port = Number(process.env.PORT || 8080);
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(express.json({ limit: '1mb' }));
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('Origin tidak diizinkan.'));
    },
  })
);

function uidForUsername(username) {
  const hash = crypto.createHash('sha256').update(username).digest('hex').slice(0, 48);
  return `scele_${hash}`;
}

async function requireFirebaseUser(req, res, next) {
  const header = req.get('authorization') || '';
  const [, token] = header.match(/^Bearer\s+(.+)$/i) || [];
  if (!token) {
    res.status(401).json({ error: 'Missing Firebase ID token.' });
    return;
  }

  try {
    req.user = await getAuth().verifyIdToken(token);
    next();
  } catch {
    res.status(401).json({ error: 'Firebase ID token tidak valid.' });
  }
}

app.get('/healthz', (_req, res) => {
  res.json({ ok: true });
});

app.post('/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    res.status(400).json({ error: 'Username dan password wajib diisi.' });
    return;
  }

  try {
    const storageState = await loginToScele(username, password);
    const uid = uidForUsername(username);
    const encryptedState = encryptJson(storageState);

    await getFirestore()
      .collection('sceleSessions')
      .doc(uid)
      .set(
        {
          username,
          storageState: encryptedState,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

    const customToken = await getAuth().createCustomToken(uid, {
      provider: 'scele',
    });

    res.json({ customToken });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Login SCELE gagal.';
    res.status(401).json({ error: message });
  }
});

app.post('/auth/logout', requireFirebaseUser, async (req, res) => {
  await getFirestore().collection('sceleSessions').doc(req.user.uid).delete();
  res.json({ ok: true });
});

app.post('/scrape', requireFirebaseUser, async (req, res) => {
  const uid = req.user.uid;
  const db = getFirestore();

  const sessionDoc = await db.collection('sceleSessions').doc(uid).get();
  if (!sessionDoc.exists) {
    res.status(404).json({ error: 'Sesi SCELE tidak ditemukan. Silakan login ulang.' });
    return;
  }

  let storageState;
  try {
    storageState = decryptJson(sessionDoc.data().storageState);
  } catch {
    res.status(500).json({ error: 'Gagal mendekripsi sesi SCELE.' });
    return;
  }

  try {
    const scrapeResults = await scrapeUserCourses(storageState);
    const assignments = extractAllAssignments(scrapeResults);
    const timeline = buildTimeline(assignments);

    await db.collection('userTimelines').doc(uid).set({
      ...timeline,
      scrapedAt: FieldValue.serverTimestamp(),
    });

    res.json({ ok: true, courses: scrapeResults.length, assignments: assignments.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Scrape SCELE gagal.';
    res.status(500).json({ error: message });
  }
});

app.listen(port, () => {
  console.log(`SCELE auth service listening on ${port}`);
});
