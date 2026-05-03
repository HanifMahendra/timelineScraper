'use client';

import { FormEvent, useEffect, useState } from 'react';
import { LogOut, RefreshCw } from 'lucide-react';
import {
  browserLocalPersistence,
  browserSessionPersistence,
  User,
  onAuthStateChanged,
  setPersistence,
  signInWithCustomToken,
  signOut,
} from 'firebase/auth';
import { getFirebaseAuth } from '@/lib/firebase';
import { loginWithScele, logoutScele } from '@/lib/authApi';
import { triggerScrape, fetchUserTimeline } from '@/lib/timelineApi';
import DashboardClient from '@/app/DashboardClient';
import ThemeSwitcher from './ThemeSwitcher';
import type { TimelineData } from '@/types/task';

const EMPTY_TIMELINE: TimelineData = { today: [], upcoming: [], overdue: [] };
const REMEMBER_KEY = 'my-timeline-remember-login';

function getStoredRememberLogin(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(REMEMBER_KEY) === 'true';
}

export default function AuthGate() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(getStoredRememberLogin);
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
      queueMicrotask(() => {
        setError(err instanceof Error ? err.message : 'Firebase belum terkonfigurasi.');
        setLoading(false);
      });
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
      await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
      window.localStorage.setItem(REMEMBER_KEY, remember ? 'true' : 'false');
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
      <div className="app-screen app-screen-dashboard">
        <div className="app-bg app-bg-dashboard" />
        <div className="loading-card">
          <span className="sync-dot" />
          Memeriksa sesi...
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="app-screen app-screen-login">
        <div className="app-bg app-bg-login" />
        <div className="login-theme-control">
          <ThemeSwitcher />
        </div>

        <div className="login-layout">
          <section className="login-brand" aria-label="My Timeline">
            <p className="brand-kicker">Automated SCELE Deadline Tracker</p>
            <h1 className="brand-title">My Timeline</h1>
            <p className="brand-subtitle">Masuk dengan akun SCELE kamu</p>
          </section>

          <form onSubmit={handleLogin} className="login-card">
            <div className="login-card-line" />
            <div className="mb-5">
              <h2 className="panel-title">My Timeline</h2>
              <p className="panel-subtitle">Automated SCELE Deadline Tracker</p>
            </div>

            <label className="form-field">
              <span>Username</span>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                placeholder="Username SCELE"
                required
              />
            </label>

            <label className="form-field">
              <span>Password</span>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                autoComplete="current-password"
                placeholder="Password SCELE"
                required
              />
            </label>

            <label className="remember-row">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              <span>Ingat saya</span>
            </label>

            {error && <p className="form-error">{error}</p>}

            <button type="submit" disabled={submitting} className="primary-action">
              {submitting ? 'Masuk...' : 'Masuk'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const displayName = user.displayName || user.email || user.uid;
  const taskCount = timeline.today.length + timeline.upcoming.length + timeline.overdue.length;

  return (
    <div className="app-screen app-screen-dashboard">
      <div className="app-bg app-bg-dashboard" />
      <div className="dashboard-shell">
        <aside className="dashboard-sidebar">
          <div className="sidebar-logo">
            <div className="logo-mark">MT</div>
            <div>
              <p className="sidebar-title">My Timeline</p>
              <p className="sidebar-subtitle">SCELE Tracker</p>
            </div>
          </div>

          <div className="sync-panel">
            <div className="sync-panel-top">
              <span>Sinkronisasi</span>
              <button onClick={() => handleScrape(user)} disabled={scraping}>
                <RefreshCw size={13} className={scraping ? 'animate-spin' : ''} />
                {scraping ? 'Syncing' : 'Sync'}
              </button>
            </div>
            <p>
              <span className="sync-dot" />
              {scrapeStatus || `Snapshot memuat ${taskCount} item SCELE`}
            </p>
          </div>

          <div className="sidebar-user">
            <div className="user-avatar">{displayName.slice(0, 1).toUpperCase()}</div>
            <div className="min-w-0">
              <p>{displayName}</p>
              <span>Mahasiswa UI</span>
            </div>
          </div>
        </aside>

        <section className="dashboard-main">
          <header className="dashboard-header">
            <div className="min-w-0">
              <p className="brand-kicker">Automated SCELE Deadline Tracker</p>
              <h1 className="dashboard-title">Timeline Tugas</h1>
              <p className="dashboard-subtitle">Data diambil langsung dari SCELE</p>
            </div>

            <div className="dashboard-actions">
              <ThemeSwitcher compact />
              <button onClick={() => handleScrape(user)} disabled={scraping} className="ghost-action">
                <RefreshCw size={15} className={scraping ? 'animate-spin' : ''} />
                {scraping ? 'Memuat' : 'Refresh'}
              </button>
              <button onClick={handleLogout} className="ghost-action ghost-action-danger">
                <LogOut size={15} />
                Logout
              </button>
            </div>
          </header>

          {scrapeStatus && <div className="status-banner">{scrapeStatus}</div>}

          <DashboardClient timeline={timeline} />
        </section>
      </div>
    </div>
  );
}
