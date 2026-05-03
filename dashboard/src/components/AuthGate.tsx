'use client';

import { FormEvent, useEffect, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithCustomToken,
  signOut,
} from 'firebase/auth';
import { getFirebaseAuth } from '@/lib/firebase';
import { loginWithScele, logoutScele } from '@/lib/authApi';
import { triggerScrape, fetchUserTimeline } from '@/lib/timelineApi';
import DashboardClient from '@/app/DashboardClient';
import type { TimelineData } from '@/types/task';

const EMPTY_TIMELINE: TimelineData = { today: [], upcoming: [], overdue: [] };

export default function AuthGate() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<TimelineData>(EMPTY_TIMELINE);
  const [scraping, setScraping] = useState(false);
  const [scrapeStatus, setScrapeStatus] = useState<string | null>(null);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    try {
      const auth = getFirebaseAuth();
      unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
        setUser(nextUser);
        setLoading(false);
        if (nextUser) {
          const cached = await fetchUserTimeline(nextUser.uid);
          if (cached) setTimeline(cached);
        } else {
          setTimeline(EMPTY_TIMELINE);
        }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Firebase belum terkonfigurasi.');
      setLoading(false);
    }
    return () => unsubscribe?.();
  }, []);

  async function handleScrape(currentUser: User) {
    setScraping(true);
    setScrapeStatus('Sedang mengambil data SCELE...');
    try {
      const idToken = await currentUser.getIdToken();
      await triggerScrape(idToken);
      setScrapeStatus('Memuat data...');
      const fresh = await fetchUserTimeline(currentUser.uid);
      if (fresh) setTimeline(fresh);
      setScrapeStatus(null);
    } catch (err) {
      setScrapeStatus(err instanceof Error ? err.message : 'Scrape gagal.');
    } finally {
      setScraping(false);
    }
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const customToken = await loginWithScele(username, password);
      const auth = getFirebaseAuth();
      const credential = await signInWithCustomToken(auth, customToken);
      setPassword('');
      await handleScrape(credential.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login gagal.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLogout() {
    const auth = getFirebaseAuth();
    const token = user ? await user.getIdToken().catch(() => null) : null;
    if (token) await logoutScele(token).catch(() => undefined);
    await signOut(auth);
    setTimeline(EMPTY_TIMELINE);
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
        Memeriksa sesi...
      </div>
    );
  }

  if (!user) {
    return (
      <form
        onSubmit={handleLogin}
        className="mx-auto max-w-sm rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
      >
        <div className="mb-4">
          <h2 className="text-base font-semibold text-slate-900">Login SCELE</h2>
          <p className="mt-1 text-sm text-slate-500">
            Gunakan username dan password SCELE.
          </p>
        </div>

        <label className="mb-3 block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Username</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-slate-400"
            required
          />
        </label>

        <label className="mb-4 block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Password</span>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete="current-password"
            className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-slate-400"
            required
          />
        </label>

        {error && (
          <p className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="h-10 w-full rounded-md bg-slate-900 px-4 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? 'Login...' : 'Login'}
        </button>
      </form>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
        <p className="text-sm text-slate-600">
          Login sebagai <span className="font-semibold text-slate-800">{user.displayName || user.uid}</span>
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => handleScrape(user)}
            disabled={scraping}
            className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-60"
          >
            {scraping ? 'Memuat...' : 'Refresh'}
          </button>
          <button
            onClick={handleLogout}
            className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
          >
            Logout
          </button>
        </div>
      </div>

      {scrapeStatus && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-700">
          {scrapeStatus}
        </div>
      )}

      <DashboardClient timeline={timeline} />
    </div>
  );
}
