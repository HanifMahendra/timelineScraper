'use client';

import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import {
  BookOpenCheck,
  BrainCircuit,
  CalendarClock,
  CalendarDays,
  ChevronRight,
  ImageIcon,
  ListTodo,
  LogOut,
  RefreshCw,
} from 'lucide-react';
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
import { ScrapeApiError, triggerScrape, fetchUserTimeline } from '@/lib/timelineApi';
import DashboardClient from '@/app/DashboardClient';
import ThemeSwitcher from './ThemeSwitcher';
import { isAncientOverdue, taskId } from '@/lib/timelineFilters';
import type { Task, TimelineData } from '@/types/task';
import GradeTracker from '@/features/grades/GradeTracker';
import StudyPlanner from '@/features/study/StudyPlanner';
import { AUTH_EXPIRED_EVENT, displayApiError } from '@/lib/apiErrors';

const EMPTY_TIMELINE: TimelineData = { today: [], upcoming: [], overdue: [] };
const REMEMBER_KEY = 'my-timeline-remember-login';
const COMPLETED_KEY = 'scele-completed-tasks';
const PROFILE_KEY_PREFIX = 'my-timeline-profile';

interface LocalProfile {
  name: string;
  photo: string;
}

function getStoredRememberLogin(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(REMEMBER_KEY) === 'true';
}

function getStoredCompletedIds(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const stored = window.localStorage.getItem(COMPLETED_KEY);
    return stored ? new Set(JSON.parse(stored) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function profileKey(uid: string): string {
  return `${PROFILE_KEY_PREFIX}:${uid}`;
}

function getStoredProfile(uid: string, fallbackName: string): LocalProfile {
  if (typeof window === 'undefined') return { name: fallbackName, photo: '' };
  try {
    const stored = window.localStorage.getItem(profileKey(uid));
    if (!stored) return { name: fallbackName, photo: '' };
    const parsed = JSON.parse(stored) as Partial<LocalProfile>;
    return {
      name: parsed.name || fallbackName,
      photo: parsed.photo || '',
    };
  } catch {
    return { name: fallbackName, photo: '' };
  }
}

function getAllTasks(timeline: TimelineData): Task[] {
  return [...timeline.today, ...timeline.upcoming, ...timeline.overdue].filter((task) => !isAncientOverdue(task));
}

function getNearestTask(timeline: TimelineData, completedIds: Set<string>, selectedCourse: string) {
  const now = Date.now();
  return getAllTasks(timeline)
    .filter((task) => selectedCourse === 'all' || task.course === selectedCourse)
    .filter((task) => task.deadlineISO && !completedIds.has(taskId(task)) && new Date(task.deadlineISO).getTime() >= now)
    .sort((a, b) => String(a.deadlineISO).localeCompare(String(b.deadlineISO)))[0];
}

function getRelativeDeadline(task: Task): string {
  if (!task.deadlineISO) return '';
  const diffMs = new Date(task.deadlineISO).getTime() - Date.now();
  const diffHours = Math.ceil(diffMs / (1000 * 60 * 60));
  if (diffHours <= 1) return 'kurang dari 1 jam lagi';
  if (diffHours < 24) return `${diffHours} jam lagi`;
  const diffDays = Math.ceil(diffHours / 24);
  if (diffDays === 1) return 'besok';
  return `${diffDays} hari lagi`;
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
  const [selectedCourse, setSelectedCourse] = useState('all');
  const [completedIds, setCompletedIds] = useState<Set<string>>(getStoredCompletedIds);
  const [profile, setProfile] = useState<LocalProfile>({ name: '', photo: '' });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeArea, setActiveArea] = useState<'timeline' | 'grades' | 'study'>('timeline');

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    try {
      const auth = getFirebaseAuth();
      unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
        setUser(nextUser);
        setLoading(false);
        if (nextUser) {
          const fallbackName = nextUser.displayName || nextUser.email || nextUser.uid;
          setProfile(getStoredProfile(nextUser.uid, fallbackName));
          setCompletedIds(getStoredCompletedIds());
          const cached = await fetchUserTimeline(nextUser.uid);
          if (cached) setTimeline(cached);
        } else {
          setTimeline(EMPTY_TIMELINE);
          setSelectedCourse('all');
          setActiveArea('timeline');
          setProfile({ name: '', photo: '' });
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

  useEffect(() => {
    const handleExpired = () => {
      setError('Sesi login sudah berakhir. Silakan masuk kembali.');
      setScrapeStatus(null);
      signOut(getFirebaseAuth()).catch(() => undefined);
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, handleExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handleExpired);
  }, []);

  async function handleScrape(currentUser: User) {
    setScraping(true);
    setScrapeStatus('Sedang mengambil data SCELE...');
    try {
      const idToken = await currentUser.getIdToken();
      const result = await triggerScrape(idToken);
      if (result.timelineWritten) {
        setScrapeStatus('Memuat data...');
        const fresh = await fetchUserTimeline(currentUser.uid);
        if (fresh) setTimeline(fresh);
        setScrapeStatus(null);
      } else if (result.status === 'partial') {
        setScrapeStatus(
          `Sinkronisasi hanya berhasil untuk ${result.successfulCourseCount} mata kuliah; ` +
          `${result.failedCourseCount} gagal. Timeline lama tetap dipertahankan.`
        );
      } else {
        setScrapeStatus(result.message || 'Sinkronisasi gagal. Timeline lama tetap dipertahankan.');
      }
    } catch (err) {
      if (err instanceof ScrapeApiError && err.code === 'SCRAPE_COOLDOWN') {
        setScrapeStatus(
          `Refresh terlalu cepat. Coba lagi dalam ${err.retryAfterSeconds ?? 60} detik.`
        );
      } else if (err instanceof ScrapeApiError && err.code === 'SCRAPE_ALREADY_RUNNING') {
        setScrapeStatus('Sinkronisasi untuk akun ini masih berjalan. Tunggu hingga selesai.');
      } else {
        setScrapeStatus(displayApiError(err, 'Scrape gagal.'));
      }
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
      setError(displayApiError(err, 'Login gagal.'));
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

  function toggleDone(id: string) {
    setCompletedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      try {
        window.localStorage.setItem(COMPLETED_KEY, JSON.stringify([...next]));
      } catch {
        // ignore local storage write failures
      }
      return next;
    });
  }

  function saveProfile(nextProfile: LocalProfile) {
    if (!user) return;
    setProfile(nextProfile);
    try {
      window.localStorage.setItem(profileKey(user.uid), JSON.stringify(nextProfile));
    } catch {
      // ignore local storage write failures
    }
  }

  function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      saveProfile({ ...profile, photo: String(reader.result || '') });
    };
    reader.readAsDataURL(file);
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

  const fallbackName = user.displayName || user.email || user.uid;
  const displayName = profile.name || fallbackName;
  const allTasks = getAllTasks(timeline);
  const taskCount = allTasks.length;
  const courses = [...new Set(allTasks.map((task) => task.course))].sort((a, b) => a.localeCompare(b));
  const courseCounts = new Map<string, number>();
  for (const task of allTasks) courseCounts.set(task.course, (courseCounts.get(task.course) ?? 0) + 1);
  const nearestTask = getNearestTask(timeline, completedIds, selectedCourse);
  const activityOptions = [
    ...new Map(
      allTasks.flatMap((task) =>
        task.activityId
          ? [
              [
                task.activityId,
                {
                  activityId: task.activityId,
                  title: task.title,
                  course: task.course,
                  ...(task.deadlineISO ? { deadlineISO: task.deadlineISO } : {}),
                },
              ] as const,
            ]
          : []
      )
    ).values(),
  ];

  return (
    <div className="app-screen app-screen-dashboard">
      <div className="app-bg app-bg-dashboard" />
      <div className="dashboard-shell">
        <aside className="dashboard-sidebar">
          <div className="sidebar-logo">
            <div className="logo-mark">
              <CalendarDays size={20} aria-hidden="true" />
            </div>
            <div>
              <p className="sidebar-title">My Timeline</p>
              <p className="sidebar-subtitle">SCELE Tracker</p>
            </div>
          </div>

          <nav className="sidebar-navigation" aria-label="Area dashboard">
            <button
              type="button"
              aria-pressed={activeArea === 'timeline'}
              onClick={() => setActiveArea('timeline')}
            >
              <ListTodo size={15} aria-hidden="true" />
              <span>Timeline</span>
            </button>
            <button
              type="button"
              aria-pressed={activeArea === 'grades'}
              onClick={() => setActiveArea('grades')}
            >
              <BookOpenCheck size={15} aria-hidden="true" />
              <span>Nilai</span>
            </button>
            <button
              type="button"
              aria-pressed={activeArea === 'study'}
              onClick={() => setActiveArea('study')}
            >
              <BrainCircuit size={15} aria-hidden="true" />
              <span>Belajar</span>
            </button>
          </nav>

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

          {activeArea === 'timeline' && <div className="sidebar-deadline">
            <div className="sidebar-deadline-top">
              <CalendarClock size={14} aria-hidden="true" />
              <span>Deadline terdekat</span>
            </div>
            <p>{nearestTask?.title ?? 'Belum ada deadline aktif.'}</p>
            {nearestTask && (
              <small>
                {nearestTask.course} · {getRelativeDeadline(nearestTask)}
              </small>
            )}
          </div>}

          {activeArea === 'timeline' && <div className="sidebar-courses">
            <div className="sidebar-courses-title">Filter kelas</div>
            <button
              type="button"
              className="sidebar-course-button"
              aria-pressed={selectedCourse === 'all'}
              onClick={() => setSelectedCourse('all')}
            >
              <span>Semua kelas</span>
              <strong>{taskCount}</strong>
            </button>
            {courses.map((course) => (
              <button
                key={course}
                type="button"
                className="sidebar-course-button"
                aria-pressed={selectedCourse === course}
                onClick={() => setSelectedCourse(course)}
              >
                <span>{course}</span>
                <strong>{courseCounts.get(course) ?? 0}</strong>
              </button>
            ))}
          </div>}

          <button type="button" className="sidebar-user" onClick={() => setSettingsOpen(true)}>
            <div className="user-avatar">
              {profile.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.photo} alt="" />
              ) : (
                displayName.slice(0, 1).toUpperCase()
              )}
            </div>
            <div className="min-w-0">
              <p>{displayName}</p>
              <span>Mahasiswa UI</span>
            </div>
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </aside>

        <section className="dashboard-main">
          <header className="dashboard-header">
            <div className="min-w-0">
              <p className="brand-kicker">Automated SCELE Deadline Tracker</p>
              <h1 className="dashboard-title">
                {activeArea === 'timeline' ? 'Timeline Tugas' : activeArea === 'grades' ? 'Nilai Akademik' : 'Rencana Belajar'}
              </h1>
              <p className="dashboard-subtitle">
                {activeArea === 'timeline'
                  ? 'Data diambil langsung dari SCELE'
                  : activeArea === 'grades'
                    ? 'Grade tracker manual dengan perhitungan transparan'
                    : 'Jadwal deterministik dari roadmap, deadline, dan preferensi kamu'}
              </p>
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

          <nav className="mobile-area-navigation" aria-label="Area dashboard">
            <button
              type="button"
              aria-pressed={activeArea === 'timeline'}
              onClick={() => setActiveArea('timeline')}
            >
              <ListTodo size={14} aria-hidden="true" />
              Timeline
            </button>
            <button
              type="button"
              aria-pressed={activeArea === 'grades'}
              onClick={() => setActiveArea('grades')}
            >
              <BookOpenCheck size={14} aria-hidden="true" />
              Nilai
            </button>
            <button
              type="button"
              aria-pressed={activeArea === 'study'}
              onClick={() => setActiveArea('study')}
            >
              <BrainCircuit size={14} aria-hidden="true" />
              Belajar
            </button>
          </nav>

          {scrapeStatus && <div className="status-banner">{scrapeStatus}</div>}

          {activeArea === 'timeline' ? (
            <DashboardClient
              timeline={timeline}
              selectedCourse={selectedCourse}
              completedIds={completedIds}
              onToggleDone={toggleDone}
            />
          ) : activeArea === 'grades' ? (
            <GradeTracker user={user} activities={activityOptions} />
          ) : (
            <StudyPlanner user={user} activities={activityOptions} />
          )}
        </section>
      </div>

      {settingsOpen && (
        <div className="settings-backdrop" role="presentation" onClick={() => setSettingsOpen(false)}>
          <section className="settings-modal" role="dialog" aria-modal="true" aria-label="Pengaturan profil" onClick={(event) => event.stopPropagation()}>
            <div className="settings-modal-header">
              <div>
                <p className="brand-kicker">Pengaturan</p>
                <h2 className="panel-title">Profil dashboard</h2>
              </div>
              <button type="button" className="ghost-action" onClick={() => setSettingsOpen(false)}>
                Selesai
              </button>
            </div>

            <div className="settings-profile-preview">
              <div className="user-avatar settings-avatar">
                {profile.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profile.photo} alt="" />
                ) : (
                  displayName.slice(0, 1).toUpperCase()
                )}
              </div>
              <div>
                <p>{displayName}</p>
                <span>Disimpan khusus untuk akun SCELE ini</span>
              </div>
            </div>

            <label className="form-field">
              <span>Username tampilan</span>
              <input
                value={profile.name}
                onChange={(event) => saveProfile({ ...profile, name: event.target.value })}
                placeholder={fallbackName}
              />
            </label>

            <label className="profile-upload">
              <ImageIcon size={15} aria-hidden="true" />
              <span>Ganti foto profil</span>
              <input type="file" accept="image/*" onChange={handlePhotoChange} />
            </label>

            {profile.photo && (
              <button
                type="button"
                className="ghost-action ghost-action-danger"
                onClick={() => saveProfile({ ...profile, photo: '' })}
              >
                Hapus foto
              </button>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
