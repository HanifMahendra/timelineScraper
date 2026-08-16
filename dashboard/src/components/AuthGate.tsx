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
import { isAncientOverdue, taskId } from '@/lib/timelineFilters';
import type { Task, TimelineData } from '@/types/task';
import GradeTracker from '@/features/grades/GradeTracker';
import StudyPlanner from '@/features/study/StudyPlanner';
import { AUTH_EXPIRED_EVENT, displayApiError } from '@/lib/apiErrors';
import ThemeSwitcher from '@/components/ThemeSwitcher';

const EMPTY_TIMELINE: TimelineData = { today: [], upcoming: [], overdue: [] };
const REMEMBER_KEY = 'my-timeline-remember-login';
const COMPLETED_KEY = 'scele-completed-tasks';
const PROFILE_KEY_PREFIX = 'my-timeline-profile';
const PROFILE_NAME_MAX_LENGTH = 38;

type SyncStatusTone = 'loading' | 'warning' | 'error';

interface SyncStatus {
  message: string;
  tone: SyncStatusTone;
}

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

function limitProfileName(value: string): string {
  return Array.from(value).slice(0, PROFILE_NAME_MAX_LENGTH).join('');
}

function getStoredProfile(uid: string, fallbackName: string): LocalProfile {
  const safeFallbackName = limitProfileName(fallbackName);
  if (typeof window === 'undefined') return { name: safeFallbackName, photo: '' };
  try {
    const stored = window.localStorage.getItem(profileKey(uid));
    if (!stored) return { name: safeFallbackName, photo: '' };
    const parsed = JSON.parse(stored) as Partial<LocalProfile>;
    const storedName = typeof parsed.name === 'string' ? limitProfileName(parsed.name) : '';
    return {
      name: storedName || safeFallbackName,
      photo: typeof parsed.photo === 'string' ? parsed.photo : '',
    };
  } catch {
    return { name: safeFallbackName, photo: '' };
  }
}

function initializeProfileFromLogin(uid: string, username: string): LocalProfile {
  const safeUsername = limitProfileName(username.trim()) || uid;
  const storedProfile = getStoredProfile(uid, safeUsername);
  const nextProfile = {
    ...storedProfile,
    name: storedProfile.name === uid ? safeUsername : storedProfile.name,
  };
  try {
    window.localStorage.setItem(profileKey(uid), JSON.stringify(nextProfile));
  } catch {
    // The in-memory profile still uses the login username when storage is unavailable.
  }
  return nextProfile;
}

function getProfileInitials(name: string): string {
  const parts = name.trim().split(/[\s._-]+/).filter(Boolean);
  if (parts.length > 1) {
    return `${Array.from(parts[0])[0] ?? ''}${Array.from(parts[1])[0] ?? ''}`.toUpperCase();
  }
  return Array.from(parts[0] || '?').slice(0, 2).join('').toUpperCase();
}

function getAvatarTone(name: string): string {
  let hash = 0;
  for (const character of name) hash = (hash * 31 + character.codePointAt(0)!) >>> 0;
  return ['blue', 'teal', 'indigo', 'amber', 'green'][hash % 5];
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
  const [scrapeStatus, setScrapeStatus] = useState<SyncStatus | null>(null);
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
    setScrapeStatus({ message: 'Sedang mengambil data SCELE...', tone: 'loading' });
    try {
      const idToken = await currentUser.getIdToken();
      const result = await triggerScrape(idToken);
      if (result.timelineWritten) {
        setScrapeStatus({ message: 'Memuat data...', tone: 'loading' });
        const fresh = await fetchUserTimeline(currentUser.uid);
        if (fresh) setTimeline(fresh);
        setScrapeStatus(null);
      } else if (result.status === 'partial') {
        setScrapeStatus({
          message:
            `Sinkronisasi hanya berhasil untuk ${result.successfulCourseCount} mata kuliah; ` +
            `${result.failedCourseCount} gagal. Timeline lama tetap dipertahankan.`,
          tone: 'warning',
        });
      } else {
        setScrapeStatus({
          message: result.message || 'Sinkronisasi gagal. Timeline lama tetap dipertahankan.',
          tone: 'error',
        });
      }
    } catch (err) {
      if (err instanceof ScrapeApiError && err.code === 'SCRAPE_COOLDOWN') {
        setScrapeStatus({
          message: `Refresh terlalu cepat. Coba lagi dalam ${err.retryAfterSeconds ?? 60} detik.`,
          tone: 'warning',
        });
      } else if (err instanceof ScrapeApiError && err.code === 'SCRAPE_ALREADY_RUNNING') {
        setScrapeStatus({
          message: 'Sinkronisasi untuk akun ini masih berjalan. Tunggu hingga selesai.',
          tone: 'loading',
        });
      } else {
        setScrapeStatus({
          message: displayApiError(err, 'Scrape gagal.'),
          tone: 'error',
        });
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
      setProfile(initializeProfileFromLogin(credential.user.uid, username));
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
    const safeProfile = {
      ...nextProfile,
      name: limitProfileName(nextProfile.name),
    };
    setProfile(safeProfile);
    try {
      window.localStorage.setItem(profileKey(user.uid), JSON.stringify(safeProfile));
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

        <div className="login-layout">
          <section className="login-window" aria-label="Scheduler">
            <div className="login-window-bar">
              <span aria-hidden="true" />
              <span>Scheduler</span>
              <ThemeSwitcher compact />
            </div>

            <div className="login-window-body">
              <section className="login-brand">
                <div className="login-brand-mark">
                  <CalendarDays size={26} aria-hidden="true" />
                </div>
                <p className="login-brand-name">Scheduler</p>
                <p className="brand-subtitle">
                  Deadline SCELE, catatan nilai, dan rencana belajar dalam satu ruang akademik pribadi.
                </p>

                <div className="login-feature-list" aria-label="Fitur Scheduler">
                  <div><ListTodo size={16} aria-hidden="true" /><span>Timeline SCELE</span></div>
                  <div><BookOpenCheck size={16} aria-hidden="true" /><span>Nilai manual</span></div>
                  <div><BrainCircuit size={16} aria-hidden="true" /><span>Rencana belajar</span></div>
                </div>
              </section>

              <form onSubmit={handleLogin} className="login-card">
                <div className="login-card-heading">
                  <span>Akun mahasiswa</span>
                  <h2>Masuk ke Scheduler</h2>
                  <p>Gunakan akun SCELE kamu untuk melanjutkan.</p>
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

                <div className="login-form-footer">
                  <label className="remember-row">
                    <input
                      type="checkbox"
                      checked={remember}
                      onChange={(e) => setRemember(e.target.checked)}
                    />
                    <span>Ingat saya</span>
                  </label>
                  <span className="login-privacy-note">Password tidak disimpan</span>
                </div>

                {error && <p className="form-error">{error}</p>}

                <button type="submit" disabled={submitting} className="primary-action">
                  {submitting ? 'Menghubungkan...' : 'Masuk'}
                </button>
              </form>
            </div>
          </section>
        </div>
      </div>
    );
  }

  const fallbackName = limitProfileName(user.displayName || user.email || user.uid);
  const displayName = limitProfileName(profile.name || fallbackName);
  const avatarInitials = getProfileInitials(displayName);
  const avatarTone = getAvatarTone(displayName);
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
              <p className="sidebar-title">Scheduler</p>
            </div>
          </div>

          <button
            type="button"
            className="sidebar-user"
            onClick={() => setSettingsOpen(true)}
            aria-label={`Buka pengaturan profil ${displayName}`}
          >
            <div className={`user-avatar user-avatar-${avatarTone}`}>
              {profile.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.photo} alt="" />
              ) : (
                avatarInitials
              )}
            </div>
            <div className="min-w-0">
              <p>{displayName}</p>
              <span>Mahasiswa UI</span>
            </div>
            <ChevronRight size={16} aria-hidden="true" />
          </button>

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

          <div className={`sync-panel sync-status-${scrapeStatus?.tone ?? 'idle'}`}>
            <div className="sync-panel-top">
              <span>Sinkronisasi</span>
              <button onClick={() => handleScrape(user)} disabled={scraping}>
                <RefreshCw size={13} className={scraping ? 'animate-spin' : ''} />
                {scraping ? 'Syncing' : 'Sync'}
              </button>
            </div>
            <p>
              <span className={`sync-dot sync-dot-${scrapeStatus?.tone ?? 'idle'}`} />
              {scrapeStatus?.message || `Snapshot memuat ${taskCount} item SCELE`}
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

        </aside>

        <section className="dashboard-main">
          <header className="dashboard-header">
            <div className="min-w-0">
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
              <ThemeSwitcher />
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

          {scrapeStatus && (
            <div
              className={`status-banner status-banner-${scrapeStatus.tone}`}
              role={scrapeStatus.tone === 'error' ? 'alert' : 'status'}
              aria-live="polite"
            >
              {scrapeStatus.message}
            </div>
          )}

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
              <div className={`user-avatar settings-avatar user-avatar-${avatarTone}`}>
                {profile.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profile.photo} alt="" />
                ) : (
                  avatarInitials
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
                maxLength={PROFILE_NAME_MAX_LENGTH}
                aria-describedby="profile-name-limit"
              />
              <small id="profile-name-limit" className="form-hint">
                {Array.from(profile.name).length}/{PROFILE_NAME_MAX_LENGTH} karakter
              </small>
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
