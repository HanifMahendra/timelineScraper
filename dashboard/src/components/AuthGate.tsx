'use client';

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { AUTH_EXPIRED_EVENT, SafeApiError, displayApiError } from '@/lib/apiErrors';
import { fetchCompletedTasks, updateCompletedTasks } from '@/lib/taskStateApi';
import { formatSyncAge, isSyncStale, rebucketTimeline } from '@/lib/timelineStatus';
import ThemeSwitcher from '@/components/ThemeSwitcher';

const EMPTY_TIMELINE: TimelineData = { today: [], upcoming: [], overdue: [], syncedAt: null };
const REMEMBER_KEY = 'my-timeline-remember-login';
const LAST_USERNAME_KEY = 'my-timeline-last-username';
// Pre-sync completion marks lived in one shared key; they are migrated to the
// signed-in account once and then removed.
const LEGACY_COMPLETED_KEY = 'scele-completed-tasks';
const COMPLETED_KEY_PREFIX = 'scele-completed-tasks';
const PROFILE_KEY_PREFIX = 'my-timeline-profile';
const PROFILE_NAME_MAX_LENGTH = 38;
const PROFILE_PHOTO_MAX_SIDE = 256;
const PROFILE_PHOTO_MAX_SOURCE_BYTES = 10 * 1024 * 1024;
const SESSION_ERROR_CODES = new Set(['SCELE_SESSION_EXPIRED', 'SCELE_SESSION_NOT_FOUND', 'SCELE_SESSION_UNAVAILABLE']);

type SyncStatusTone = 'loading' | 'warning' | 'error';
type TimelineLoadState = 'loading' | 'ready' | 'empty' | 'error';

interface SyncStatus {
  message: string;
  tone: SyncStatusTone;
  action?: 'relogin';
}

interface LocalProfile {
  name: string;
  photo: string;
}

function getStoredRememberLogin(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(REMEMBER_KEY) === 'true';
}

function completedKey(uid: string): string {
  return `${COMPLETED_KEY_PREFIX}:${uid}`;
}

function readIdList(key: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(key) || '[]');
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function writeCompletedCache(uid: string, ids: Iterable<string>) {
  try {
    window.localStorage.setItem(completedKey(uid), JSON.stringify([...ids]));
  } catch {
    // The server copy remains authoritative when local storage is unavailable.
  }
}

function getStoredLastUsername(): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(LAST_USERNAME_KEY) || '';
  } catch {
    return '';
  }
}

// Shrinks an uploaded photo to a small JPEG so it fits in local storage.
function resizeProfilePhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(1, PROFILE_PHOTO_MAX_SIDE / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext('2d');
      if (!context) { reject(new Error('Browser tidak dapat memproses gambar.')); return; }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('File tersebut bukan gambar yang dapat dibaca.'));
    };
    image.src = objectUrl;
  });
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
  const [username, setUsername] = useState(getStoredLastUsername);
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(getStoredRememberLogin);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<TimelineData>(EMPTY_TIMELINE);
  const [timelineLoad, setTimelineLoad] = useState<TimelineLoadState>('loading');
  const [scraping, setScraping] = useState(false);
  const [scrapeStartedAt, setScrapeStartedAt] = useState<number | null>(null);
  const [scrapeStatus, setScrapeStatus] = useState<SyncStatus | null>(null);
  const [selectedCourse, setSelectedCourse] = useState('all');
  const [completedIds, setCompletedIds] = useState<Set<string>>(() => new Set());
  const [completionError, setCompletionError] = useState<string | null>(null);
  const [profile, setProfile] = useState<LocalProfile>({ name: '', photo: '' });
  const [profileError, setProfileError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeArea, setActiveArea] = useState<'timeline' | 'grades' | 'study'>('timeline');
  const [nowMs, setNowMs] = useState(() => Date.now());
  const userRef = useRef<User | null>(null);

  // Deadline status is re-evaluated every minute (every second while syncing,
  // for the elapsed-time indicator).
  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), scraping ? 1_000 : 60_000);
    return () => window.clearInterval(timer);
  }, [scraping]);

  const loadTimeline = useCallback(async (uid: string, { silent = false }: { silent?: boolean } = {}) => {
    if (!silent) setTimelineLoad('loading');
    try {
      const stored = await fetchUserTimeline(uid);
      if (userRef.current?.uid !== uid) return;
      setTimeline(stored ?? EMPTY_TIMELINE);
      setTimelineLoad(stored ? 'ready' : 'empty');
    } catch {
      if (userRef.current?.uid === uid) setTimelineLoad('error');
    }
  }, []);

  const loadCompletedTasks = useCallback(async (currentUser: User) => {
    const uid = currentUser.uid;
    const cached = readIdList(completedKey(uid));
    const legacy = readIdList(LEGACY_COMPLETED_KEY);
    setCompletedIds(new Set([...cached, ...legacy]));
    try {
      const idToken = await currentUser.getIdToken();
      let remote = await fetchCompletedTasks(idToken);
      const unsynced = [...new Set([...cached, ...legacy])].filter((id) => !remote.includes(id));
      if (unsynced.length > 0) {
        for (let i = 0; i < unsynced.length; i += 200) {
          remote = await updateCompletedTasks(idToken, { add: unsynced.slice(i, i + 200) });
        }
      }
      try { window.localStorage.removeItem(LEGACY_COMPLETED_KEY); } catch { /* ignore */ }
      if (userRef.current?.uid !== uid) return;
      setCompletedIds(new Set(remote));
      writeCompletedCache(uid, remote);
      setCompletionError(null);
    } catch {
      if (userRef.current?.uid === uid) {
        setCompletionError('Status "Selesai" belum tersinkron ke server; menampilkan salinan di perangkat ini.');
      }
    }
  }, []);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    try {
      const auth = getFirebaseAuth();
      unsubscribe = onAuthStateChanged(auth, (nextUser) => {
        userRef.current = nextUser;
        setUser(nextUser);
        setLoading(false);
        if (nextUser) {
          const fallbackName = nextUser.displayName || nextUser.email || nextUser.uid;
          setProfile(getStoredProfile(nextUser.uid, fallbackName));
          void loadTimeline(nextUser.uid);
          void loadCompletedTasks(nextUser);
        } else {
          setTimeline(EMPTY_TIMELINE);
          setTimelineLoad('loading');
          setCompletedIds(new Set());
          setCompletionError(null);
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
  }, [loadTimeline, loadCompletedTasks]);

  useEffect(() => {
    const handleExpired = () => {
      setError('Sesi login sudah berakhir. Silakan masuk kembali.');
      setScrapeStatus(null);
      signOut(getFirebaseAuth()).catch(() => undefined);
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, handleExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handleExpired);
  }, []);

  const liveTimeline = useMemo(() => rebucketTimeline(timeline, nowMs), [timeline, nowMs]);

  async function handleScrape(currentUser: User) {
    setScraping(true);
    setScrapeStartedAt(Date.now());
    setNowMs(Date.now());
    setScrapeStatus(null);
    try {
      const idToken = await currentUser.getIdToken();
      const result = await triggerScrape(idToken);
      if (result.timelineWritten) {
        await loadTimeline(currentUser.uid, { silent: true });
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
          message: `Baru saja disinkronkan. Coba lagi dalam ${err.retryAfterSeconds ?? 60} detik.`,
          tone: 'warning',
        });
      } else if (err instanceof ScrapeApiError && err.code === 'SCRAPE_ALREADY_RUNNING') {
        setScrapeStatus({
          message: 'Sinkronisasi untuk akun ini masih berjalan. Tunggu hingga selesai.',
          tone: 'loading',
        });
      } else if (err instanceof SafeApiError && err.code && SESSION_ERROR_CODES.has(err.code)) {
        setScrapeStatus({ message: err.message, tone: 'error', action: 'relogin' });
      } else {
        setScrapeStatus({
          message: displayApiError(err, 'Sinkronisasi gagal.'),
          tone: 'error',
        });
      }
    } finally {
      setScraping(false);
      setScrapeStartedAt(null);
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
      try {
        window.localStorage.setItem(REMEMBER_KEY, remember ? 'true' : 'false');
        window.localStorage.setItem(LAST_USERNAME_KEY, username.trim());
      } catch {
        // Preferences are conveniences only.
      }
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

  async function handleLogout(message: string | null = null) {
    const auth = getFirebaseAuth();
    const token = user ? await user.getIdToken().catch(() => null) : null;
    if (token) await logoutScele(token).catch(() => undefined);
    await signOut(auth);
    setScrapeStatus(null);
    setError(message);
  }

  function toggleDone(id: string) {
    if (!user) return;
    const currentUser = user;
    const wasDone = completedIds.has(id);
    const apply = (done: boolean) => {
      setCompletedIds((prev) => {
        const next = new Set(prev);
        if (done) next.add(id); else next.delete(id);
        writeCompletedCache(currentUser.uid, next);
        return next;
      });
    };
    apply(!wasDone);
    void (async () => {
      try {
        const idToken = await currentUser.getIdToken();
        await updateCompletedTasks(idToken, wasDone ? { remove: [id] } : { add: [id] });
        setCompletionError(null);
      } catch {
        apply(wasDone);
        setCompletionError('Status tugas gagal disimpan. Periksa koneksi lalu coba lagi.');
      }
    })();
  }

  function saveProfile(nextProfile: LocalProfile): boolean {
    if (!user) return false;
    const safeProfile = {
      ...nextProfile,
      name: limitProfileName(nextProfile.name),
    };
    try {
      window.localStorage.setItem(profileKey(user.uid), JSON.stringify(safeProfile));
    } catch {
      setProfileError('Profil tidak dapat disimpan di browser ini (penyimpanan penuh atau diblokir).');
      return false;
    }
    setProfile(safeProfile);
    setProfileError(null);
    return true;
  }

  async function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setProfileError('Pilih file gambar (JPG, PNG, atau WebP).');
      return;
    }
    if (file.size > PROFILE_PHOTO_MAX_SOURCE_BYTES) {
      setProfileError('Ukuran foto maksimal 10 MB.');
      return;
    }
    try {
      saveProfile({ ...profile, photo: await resizeProfilePhoto(file) });
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Foto gagal diproses.');
    }
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
  const allTasks = getAllTasks(liveTimeline);
  const taskCount = allTasks.length;
  const syncAge = formatSyncAge(liveTimeline.syncedAt, nowMs);
  const syncIsStale = isSyncStale(liveTimeline.syncedAt, nowMs);
  const scrapeElapsedSeconds = scrapeStartedAt ? Math.max(0, Math.floor((nowMs - scrapeStartedAt) / 1000)) : 0;
  // The backend reports no progress, so stages follow typical timings: the
  // free Space may need to wake up, then SCELE is opened course by course.
  const scrapeStage = scrapeElapsedSeconds < 6
    ? 'Menghubungkan ke server'
    : scrapeElapsedSeconds < 20
      ? 'Masuk ke SCELE dan mencari mata kuliah'
      : 'Membaca halaman mata kuliah satu per satu';
  const panelStatus: SyncStatus | null = scraping
    ? { message: `${scrapeStage}… ${scrapeElapsedSeconds} dtk (biasanya 30–90 dtk)`, tone: 'loading' }
    : scrapeStatus ?? (syncIsStale
      ? { message: `Terakhir sinkron ${syncAge}. Sinkronkan agar data terbaru.`, tone: 'warning' }
      : null);
  const idleSyncMessage = syncAge
    ? `${taskCount} item · sinkron ${syncAge}`
    : timelineLoad === 'empty' ? 'Belum pernah disinkronkan' : `${taskCount} item SCELE`;
  const reloginNeeded = scrapeStatus?.action === 'relogin';
  const relogin = () => handleLogout('Sesi SCELE sudah berakhir. Masukkan password untuk sinkronisasi lagi.');
  const courses = [...new Set(allTasks.map((task) => task.course))].sort((a, b) => a.localeCompare(b));
  const courseCounts = new Map<string, number>();
  for (const task of allTasks) courseCounts.set(task.course, (courseCounts.get(task.course) ?? 0) + 1);
  const nearestTask = getNearestTask(liveTimeline, completedIds, selectedCourse);
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

          <div className={`sync-panel sync-status-${panelStatus?.tone ?? 'idle'}`} aria-live="polite">
            <div className="sync-panel-top">
              <span>Sinkronisasi</span>
              {reloginNeeded ? (
                <button onClick={relogin}>Masuk ulang</button>
              ) : (
                <button onClick={() => handleScrape(user)} disabled={scraping}>
                  <RefreshCw size={13} className={scraping ? 'animate-spin' : ''} />
                  {scraping ? 'Berjalan' : 'Sinkron'}
                </button>
              )}
            </div>
            <p>
              <span className={`sync-dot sync-dot-${panelStatus?.tone ?? 'idle'}`} />
              {panelStatus?.message || idleSyncMessage}
            </p>
            {scraping && <div className="sync-progress" aria-hidden="true"><span /></div>}
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
                {scraping ? 'Menyinkronkan' : 'Sinkronkan'}
              </button>
              <button onClick={() => handleLogout()} className="ghost-action ghost-action-danger">
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

          {panelStatus && (
            <div
              className={`status-banner status-banner-${panelStatus.tone} status-banner-with-action`}
              role={panelStatus.tone === 'error' ? 'alert' : 'status'}
              aria-live="polite"
            >
              <span>{panelStatus.message}</span>
              {reloginNeeded ? (
                <button type="button" className="ghost-action" onClick={relogin}>Masuk ulang</button>
              ) : !scraping && panelStatus.tone !== 'loading' ? (
                <button type="button" className="ghost-action" onClick={() => handleScrape(user)}>Sinkronkan</button>
              ) : null}
            </div>
          )}

          {activeArea === 'timeline' && completionError && (
            <div className="status-banner status-banner-warning" role="status">
              {completionError}
            </div>
          )}

          {activeArea === 'timeline' ? (
            timelineLoad === 'loading' && !scraping ? (
              <div className="empty-panel timeline-state-panel" role="status">
                <p>Memuat timeline tersimpan…</p>
              </div>
            ) : timelineLoad === 'error' ? (
              <div className="empty-panel timeline-state-panel" role="alert">
                <p>Timeline gagal dimuat, jadi daftar tugas belum bisa ditampilkan. Ini bukan berarti tidak ada tugas.</p>
                <button type="button" className="ghost-action" onClick={() => loadTimeline(user.uid)}>Coba lagi</button>
              </div>
            ) : timelineLoad === 'empty' || (timelineLoad === 'loading' && scraping) ? (
              <div className="empty-panel timeline-state-panel" role="status">
                <p>
                  {scraping
                    ? 'Sinkronisasi pertama sedang berjalan. Tugas akan muncul di sini setelah selesai.'
                    : 'Belum ada data dari SCELE. Jalankan sinkronisasi untuk mengambil tugas kamu.'}
                </p>
                {!scraping && !reloginNeeded && (
                  <button type="button" className="ghost-action" onClick={() => handleScrape(user)}>Sinkronkan sekarang</button>
                )}
              </div>
            ) : (
              <DashboardClient
                timeline={liveTimeline}
                selectedCourse={selectedCourse}
                completedIds={completedIds}
                onToggleDone={toggleDone}
              />
            )
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

            {profileError && <p className="form-error" role="alert">{profileError}</p>}

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
