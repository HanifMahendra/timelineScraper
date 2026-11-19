'use client';

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpenCheck,
  Bot,
  BrainCircuit,
  CalendarDays,
  Check,
  ChevronRight,
  Eye,
  EyeOff,
  ImageIcon,
  ListTodo,
  Loader2,
  LogOut,
  RefreshCw,
  Trash2,
  X,
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
import { isAncientOverdue, isTaskCompleted, taskCompletionKeys, taskId } from '@/lib/timelineFilters';
import type { Task, TimelineData } from '@/types/task';
import GradeTracker from '@/features/grades/GradeTracker';
import StudyPlanner from '@/features/study/StudyPlanner';
import { AUTH_EXPIRED_EVENT, SafeApiError, displayApiError } from '@/lib/apiErrors';
import { fetchCompletedTasks, updateCompletedTasks } from '@/lib/taskStateApi';
import { createDiscordLinkCode, fetchDiscordStatus, unlinkDiscord, updateDiscordPreferences, type DiscordStatus } from '@/lib/discordApi';
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

const LOGIN_STEPS = ['Menghubungkan ke server', 'Masuk ke akun SCELE', 'Menyiapkan dashboard'] as const;
// The backend reports no progress; the first step follows typical timings
// and the last one starts only once SCELE login has actually succeeded.
const LOGIN_SERVER_STEP_MS = 4_000;
const LOGIN_SLOW_HINT_MS = 15_000;

function LoginProgress({ elapsedMs, phase }: { elapsedMs: number; phase: 'scele' | 'account' }) {
  const activeStep = phase === 'account' ? 2 : elapsedMs < LOGIN_SERVER_STEP_MS ? 0 : 1;
  // Eases toward 90% while waiting on SCELE; never claims completion early.
  const percent = phase === 'account' ? 95 : Math.round(90 * (1 - Math.exp(-elapsedMs / 12_000)));
  return (
    <div className="login-progress" role="status" aria-live="polite">
      <div className="login-progress-bar" aria-hidden="true">
        <span style={{ width: `${Math.max(4, percent)}%` }} />
      </div>
      <ol className="login-progress-steps">
        {LOGIN_STEPS.map((label, index) => (
          <li
            key={label}
            className={index < activeStep ? 'is-done' : index === activeStep ? 'is-active' : undefined}
            aria-current={index === activeStep ? 'step' : undefined}
          >
            <span className="login-progress-marker" aria-hidden="true">
              {index < activeStep ? <Check size={11} /> : index === activeStep ? <Loader2 size={11} className="animate-spin" /> : null}
            </span>
            {label}
          </li>
        ))}
      </ol>
      {phase === 'scele' && elapsedMs >= LOGIN_SLOW_HINT_MS && (
        <p className="login-progress-hint">
          Server sedang bangun dari mode tidur. Login pertama bisa butuh hingga 1 menit.
        </p>
      )}
    </div>
  );
}

export default function AuthGate() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState(getStoredLastUsername);
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(getStoredRememberLogin);
  const [submitting, setSubmitting] = useState(false);
  const [loginStartedAt, setLoginStartedAt] = useState<number | null>(null);
  const [loginPhase, setLoginPhase] = useState<'scele' | 'account'>('scele');
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
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [discordStatus, setDiscordStatus] = useState<DiscordStatus | null>(null);
  const [discordCode, setDiscordCode] = useState<string | null>(null);
  const [discordBusy, setDiscordBusy] = useState(false);
  const [discordError, setDiscordError] = useState<string | null>(null);
  const [discordSavedMsg, setDiscordSavedMsg] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [undoToast, setUndoToast] = useState<{ task: Task; markedDone: boolean; text: string } | null>(null);
  const [toastAnnouncement, setToastAnnouncement] = useState('');
  const [activeArea, setActiveArea] = useState<'timeline' | 'discord' | 'grades' | 'study'>('timeline');
  const [nowMs, setNowMs] = useState(() => Date.now());
  const userRef = useRef<User | null>(null);
  const settingsDialogRef = useRef<HTMLDialogElement | null>(null);
  const logoutDialogRef = useRef<HTMLDialogElement | null>(null);
  const undoToastRef = useRef<HTMLDivElement | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const toastFocusedRef = useRef(false);

  const dismissUndoToast = useCallback(() => {
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    const toastEl = undoToastRef.current;
    if (toastEl && typeof toastEl.hidePopover === 'function') {
      try {
        toastEl.hidePopover();
      } catch {
        // Ignore if already closed.
      }
    }
    setUndoToast(null);
  }, []);

  const scheduleToastDismiss = useCallback(() => {
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => {
      if (toastFocusedRef.current) return;
      dismissUndoToast();
    }, 5_000);
  }, [dismissUndoToast]);

  useEffect(() => {
    if (settingsOpen || logoutConfirmOpen) {
      dismissUndoToast();
    }
  }, [settingsOpen, logoutConfirmOpen, dismissUndoToast]);

  useEffect(() => {
    const toastEl = undoToastRef.current;
    if (!undoToast || !toastEl) return;
    if (typeof toastEl.showPopover === 'function') {
      try {
        if (!toastEl.matches(':popover-open')) toastEl.showPopover();
      } catch {
        // Fallback when Popover API is unavailable.
      }
    }
    const docWithNotify = document as Document & { ariaNotify?: (text: string) => void };
    const announcement = `${undoToast.text}. Actions available`;
    if (typeof docWithNotify.ariaNotify === 'function') {
      docWithNotify.ariaNotify(announcement);
    } else {
      setToastAnnouncement(announcement);
    }
    scheduleToastDismiss();
    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }
    };
  }, [undoToast, scheduleToastDismiss]);

  useEffect(() => {
    const dialog = logoutDialogRef.current;
    if (!dialog) return;
    if (logoutConfirmOpen && !dialog.open) {
      dialog.showModal();
    } else if (!logoutConfirmOpen && dialog.open) {
      dialog.close();
    }
  }, [logoutConfirmOpen]);

  useEffect(() => {
    const dialog = settingsDialogRef.current;
    if (!dialog) return;
    if (settingsOpen && !dialog.open) {
      dialog.showModal();
    } else if (!settingsOpen && dialog.open) {
      dialog.close();
    }
  }, [settingsOpen]);

  useEffect(() => {
    if (!user) {
      setDiscordStatus(null);
      setDiscordCode(null);
      return;
    }
    let active = true;
    setDiscordError(null);
    void (async () => {
      try {
        const idToken = await user.getIdToken();
        const status = await fetchDiscordStatus(idToken);
        if (active) setDiscordStatus(status);
      } catch {
        if (active) setDiscordStatus(null);
      }
    })();
    return () => { active = false; };
  }, [user]);

  // Progressive enhancement fallback for browsers without native <dialog closedby="any"> (Safari).
  useEffect(() => {
    const dialog = settingsDialogRef.current;
    if (!dialog || !settingsOpen) return;
    if ('closedBy' in HTMLDialogElement.prototype) return;

    const isOutside = (event: PointerEvent) => {
      const rect = dialog.getBoundingClientRect();
      return (
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom
      );
    };

    let pressedOutside = false;
    const onPointerDown = (event: PointerEvent) => {
      pressedOutside = isOutside(event);
    };
    const onPointerUp = (event: PointerEvent) => {
      if (pressedOutside && isOutside(event)) {
        dialog.close();
      }
      pressedOutside = false;
    };

    dialog.addEventListener('pointerdown', onPointerDown);
    dialog.addEventListener('pointerup', onPointerUp);
    return () => {
      dialog.removeEventListener('pointerdown', onPointerDown);
      dialog.removeEventListener('pointerup', onPointerUp);
    };
  }, [settingsOpen]);

  // Deadline status is re-evaluated every minute (every second while syncing,
  // or logging in, for the elapsed-time indicators).
  const fastTick = scraping || submitting;
  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), fastTick ? 1_000 : 60_000);
    return () => window.clearInterval(timer);
  }, [fastTick]);

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
    setLoginStartedAt(Date.now());
    setLoginPhase('scele');
    setNowMs(Date.now());
    setError(null);
    try {
      const customToken = await loginWithScele(username, password);
      setLoginPhase('account');
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
      setLoginStartedAt(null);
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

  function toggleDone(task: Task, { showToast = true }: { showToast?: boolean } = {}) {
    if (!user) return;
    const currentUser = user;
    const primaryId = taskId(task);
    const allKeys = taskCompletionKeys(task);
    const wasDone = isTaskCompleted(task, completedIds);
    const previousPresentKeys = allKeys.filter((key) => completedIds.has(key));
    const apply = (done: boolean, keysToRestore?: string[]) => {
      setCompletedIds((prev) => {
        const next = new Set(prev);
        if (done) {
          for (const key of keysToRestore ?? [primaryId]) next.add(key);
        } else {
          for (const key of allKeys) next.delete(key);
        }
        writeCompletedCache(currentUser.uid, next);
        return next;
      });
    };
    apply(!wasDone);
    if (showToast && !settingsOpen && !logoutConfirmOpen) {
      setUndoToast({
        task,
        markedDone: !wasDone,
        text: !wasDone ? `"${task.title}" ditandai selesai` : `Status selesai "${task.title}" dibatalkan`,
      });
    }
    void (async () => {
      try {
        const idToken = await currentUser.getIdToken();
        await updateCompletedTasks(
          idToken,
          wasDone ? { remove: allKeys } : { add: [primaryId] }
        );
        setCompletionError(null);
      } catch {
        apply(wasDone, previousPresentKeys.length > 0 ? previousPresentKeys : [primaryId]);
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

                <label className="form-field" htmlFor="scele-username">
                  <span>Username</span>
                  <input
                    id="scele-username"
                    name="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                    spellCheck={false}
                    autoCapitalize="none"
                    autoCorrect="off"
                    enterKeyHint="next"
                    disabled={submitting}
                    placeholder="Username SCELE"
                    required
                  />
                </label>

                <label className="form-field" htmlFor="scele-password">
                  <span>Password</span>
                  <div className="password-field-wrap">
                    <input
                      id="scele-password"
                      name="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      enterKeyHint="done"
                      disabled={submitting}
                      placeholder="Password SCELE"
                      required
                    />
                    <button
                      type="button"
                      className="password-toggle"
                      onClick={() => setShowPassword((prev) => !prev)}
                      disabled={submitting}
                      aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                      aria-pressed={showPassword}
                    >
                      {showPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                    </button>
                  </div>
                </label>

                <div className="login-form-footer">
                  <label className="remember-row">
                    <input
                      type="checkbox"
                      checked={remember}
                      onChange={(e) => setRemember(e.target.checked)}
                      disabled={submitting}
                    />
                    <span>Ingat saya</span>
                  </label>
                  <span className="login-privacy-note">Password tidak disimpan</span>
                </div>

                {error && <p className="form-error" role="alert">{error}</p>}

                <button type="submit" disabled={submitting} className="primary-action login-submit" aria-busy={submitting}>
                  {submitting && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
                  {submitting ? 'Sedang masuk…' : 'Masuk'}
                </button>

                {submitting && loginStartedAt !== null && (
                  <LoginProgress elapsedMs={Math.max(0, nowMs - loginStartedAt)} phase={loginPhase} />
                )}
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
              aria-current={activeArea === 'timeline' ? 'page' : undefined}
              onClick={() => setActiveArea('timeline')}
            >
              <ListTodo size={15} aria-hidden="true" />
              <span>Timeline</span>
            </button>
            <button
              type="button"
              aria-current={activeArea === 'discord' ? 'page' : undefined}
              onClick={() => setActiveArea('discord')}
            >
              <Bot size={15} aria-hidden="true" />
              <span>Bot Discord</span>
              {discordStatus?.linked && <span className="nav-status-dot" aria-label="Terhubung" />}
            </button>
            <button
              type="button"
              aria-current={activeArea === 'grades' ? 'page' : undefined}
              onClick={() => setActiveArea('grades')}
            >
              <BookOpenCheck size={15} aria-hidden="true" />
              <span>Nilai</span>
            </button>
            <button
              type="button"
              aria-current={activeArea === 'study' ? 'page' : undefined}
              onClick={() => setActiveArea('study')}
            >
              <BrainCircuit size={15} aria-hidden="true" />
              <span>Belajar</span>
            </button>
          </nav>

          <div className={`sync-panel sync-status-${panelStatus?.tone ?? 'idle'}`} aria-live="polite">
            <div className="sync-panel-top">
              <span>Sinkronisasi</span>
              {reloginNeeded && (
                <button type="button" onClick={relogin}>Masuk ulang</button>
              )}
            </div>
            <p>
              <span className={`sync-dot sync-dot-${panelStatus?.tone ?? 'idle'}`} />
              {panelStatus?.message || idleSyncMessage}
            </p>
            {scraping && <div className="sync-progress" aria-hidden="true"><span /></div>}
          </div>

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

        <main className="dashboard-main">
          <header className="dashboard-header">
            <div className="min-w-0">
              <h1 className="dashboard-title">
                {activeArea === 'timeline'
                  ? 'Timeline Tugas'
                  : activeArea === 'discord'
                    ? 'Bot Discord'
                    : activeArea === 'grades'
                      ? 'Nilai Akademik'
                      : 'Rencana Belajar'}
              </h1>
              <p className="dashboard-subtitle">
                {activeArea === 'timeline'
                  ? 'Data diambil langsung dari SCELE'
                  : activeArea === 'discord'
                    ? 'Pengingat deadline harian jam 07:00 WIB & tanya tugas langsung dari Discord'
                    : activeArea === 'grades'
                      ? 'Grade tracker manual dengan perhitungan transparan'
                      : 'Jadwal deterministik dari roadmap, deadline, dan preferensi kamu'}
              </p>
              {!panelStatus && <p className="mobile-sync-note">{idleSyncMessage}</p>}
            </div>

            <button
              type="button"
              className="mobile-profile-button"
              onClick={() => setSettingsOpen(true)}
              aria-label={`Buka pengaturan profil ${displayName}`}
            >
              <span className={`user-avatar user-avatar-${avatarTone}`}>
                {profile.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profile.photo} alt="" />
                ) : (
                  avatarInitials
                )}
              </span>
            </button>

            <div className="dashboard-actions">
              <ThemeSwitcher />
              <button type="button" onClick={() => handleScrape(user)} disabled={scraping} className="ghost-action">
                <RefreshCw size={15} className={scraping ? 'animate-spin' : ''} aria-hidden="true" />
                {scraping ? 'Menyinkronkan' : 'Sinkronkan'}
              </button>
              <button type="button" onClick={() => setLogoutConfirmOpen(true)} className="ghost-action ghost-action-danger">
                <LogOut size={15} aria-hidden="true" />
                Logout
              </button>
            </div>
          </header>

          <nav className="mobile-area-navigation" aria-label="Area dashboard">
            <button
              type="button"
              aria-current={activeArea === 'timeline' ? 'page' : undefined}
              onClick={() => setActiveArea('timeline')}
            >
              <ListTodo size={14} aria-hidden="true" />
              Timeline
            </button>
            <button
              type="button"
              aria-current={activeArea === 'discord' ? 'page' : undefined}
              onClick={() => setActiveArea('discord')}
            >
              <Bot size={14} aria-hidden="true" />
              Discord
            </button>
            <button
              type="button"
              aria-current={activeArea === 'grades' ? 'page' : undefined}
              onClick={() => setActiveArea('grades')}
            >
              <BookOpenCheck size={14} aria-hidden="true" />
              Nilai
            </button>
            <button
              type="button"
              aria-current={activeArea === 'study' ? 'page' : undefined}
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

          {activeArea === 'timeline' && courses.length > 1 && (
            <label className="mobile-course-filter">
              <span>Kelas</span>
              <select value={selectedCourse} onChange={(event) => setSelectedCourse(event.target.value)}>
                <option value="all">Semua kelas ({taskCount})</option>
                {courses.map((course) => (
                  <option key={course} value={course}>
                    {course} ({courseCounts.get(course) ?? 0})
                  </option>
                ))}
              </select>
            </label>
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
          ) : activeArea === 'discord' ? (
            <section className="discord-page" aria-label="Pengaturan Bot Discord">
              <div className="discord-banner-card">
                <div className="discord-banner-copy">
                  <div className="settings-discord-head">
                    <h2 className="discord-banner-title">Koneksi Akun Discord</h2>
                    {discordStatus?.linked ? (
                      <span className="badge badge-submitted">Terhubung</span>
                    ) : (
                      <span className="badge badge-not-submitted">Belum terhubung</span>
                    )}
                  </div>
                  <p className="form-hint">
                    1. Klik <strong>Pilih Server Discord</strong> untuk mengundang bot ke server pribadimu.
                    <br />
                    2. Klik <strong>{discordStatus?.linked ? 'Buat kode baru' : 'Hubungkan Discord'}</strong> lalu jalankan perintah <code>/link</code> di Discord.
                  </p>
                </div>

                <div className="discord-banner-controls">
                  <div className="settings-photo-actions">
                    {discordStatus?.inviteUrl && (
                      <a
                        href={discordStatus.inviteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ghost-action"
                      >
                        Pilih Server Discord
                      </a>
                    )}
                    <button
                      type="button"
                      className="ghost-action"
                      disabled={discordBusy}
                      onClick={async () => {
                        if (!user) return;
                        setDiscordBusy(true);
                        setDiscordError(null);
                        try {
                          const idToken = await user.getIdToken();
                          const result = await createDiscordLinkCode(idToken);
                          setDiscordCode(result.code);
                        } catch (err) {
                          setDiscordError(displayApiError(err, 'Gagal membuat kode Discord.'));
                        } finally {
                          setDiscordBusy(false);
                        }
                      }}
                    >
                      {discordBusy ? 'Memproses…' : discordStatus?.linked ? 'Buat kode baru' : 'Hubungkan Discord'}
                    </button>
                    {discordStatus?.linked && (
                      <button
                        type="button"
                        className="profile-photo-remove"
                        disabled={discordBusy}
                        onClick={async () => {
                          if (!user) return;
                          setDiscordBusy(true);
                          setDiscordError(null);
                          try {
                            const idToken = await user.getIdToken();
                            await unlinkDiscord(idToken);
                            setDiscordStatus((prev) => (prev ? { ...prev, linked: false } : { configured: true, linked: false }));
                            setDiscordCode(null);
                          } catch (err) {
                            setDiscordError(displayApiError(err, 'Gagal memutuskan koneksi Discord.'));
                          } finally {
                            setDiscordBusy(false);
                          }
                        }}
                      >
                        Putuskan
                      </button>
                    )}
                  </div>

                  {discordCode && (
                    <div className="discord-code-box">
                      <span>Jalankan di Discord (berlaku 10 menit):</span>
                      <code>/link code:{discordCode}</code>
                    </div>
                  )}
                  {discordError && <p className="form-error" role="alert">{discordError}</p>}
                </div>
              </div>

              {discordStatus?.linked && (
                <div className="discord-banner-card">
                  <div className="discord-banner-copy">
                    <h2 className="discord-banner-title">Jadwal Pengingat Harian</h2>
                    <p className="form-hint">
                      Pilih jam pengiriman ringkasan deadline harian dalam WIB. Kamu juga bisa mengubah tujuan kirim (DM atau channel server) dengan perintah <code>/setchannel</code> di Discord.
                    </p>
                  </div>

                  <div className="discord-pref-controls">
                    <label className="remember-row">
                      <input
                        type="checkbox"
                        checked={discordStatus.reminderEnabled !== false}
                        disabled={discordBusy}
                        onChange={async (event) => {
                          if (!user) return;
                          const nextEnabled = event.target.checked;
                          setDiscordBusy(true);
                          setDiscordError(null);
                          setDiscordSavedMsg(null);
                          try {
                            const idToken = await user.getIdToken();
                            const res = await updateDiscordPreferences(idToken, { reminderEnabled: nextEnabled });
                            setDiscordStatus((prev) => (prev ? { ...prev, ...res } : prev));
                            setDiscordSavedMsg(nextEnabled ? 'Pengingat harian diaktifkan.' : 'Pengingat harian dinonaktifkan.');
                          } catch (err) {
                            setDiscordError(displayApiError(err, 'Gagal menyimpan pengaturan pengingat.'));
                          } finally {
                            setDiscordBusy(false);
                          }
                        }}
                      />
                      <span>Aktifkan pengingat harian</span>
                    </label>

                    <label className="discord-hour-field" htmlFor="discord-reminder-hour">
                      <span>Jam kirim (WIB)</span>
                      <select
                        id="discord-reminder-hour"
                        name="discordReminderHour"
                        className="themed-select"
                        value={discordStatus.reminderHourWib ?? 7}
                        disabled={discordBusy || discordStatus.reminderEnabled === false}
                        onChange={async (event) => {
                          if (!user) return;
                          const nextHour = Number(event.target.value);
                          setDiscordBusy(true);
                          setDiscordError(null);
                          setDiscordSavedMsg(null);
                          try {
                            const idToken = await user.getIdToken();
                            const res = await updateDiscordPreferences(idToken, { reminderHourWib: nextHour });
                            setDiscordStatus((prev) => (prev ? { ...prev, ...res } : prev));
                            setDiscordSavedMsg(`Pengingat harian diatur ke ${String(nextHour).padStart(2, '0')}:00 WIB.`);
                          } catch (err) {
                            setDiscordError(displayApiError(err, 'Gagal menyimpan jam pengingat.'));
                          } finally {
                            setDiscordBusy(false);
                          }
                        }}
                      >
                        {Array.from({ length: 24 }, (_, hour) => (
                          <option key={hour} value={hour}>
                            {String(hour).padStart(2, '0')}:00 WIB
                          </option>
                        ))}
                      </select>
                    </label>

                    {discordSavedMsg && <small className="form-hint discord-saved-msg">{discordSavedMsg}</small>}
                  </div>
                </div>
              )}

              <div className="discord-banner-card">
                <div className="discord-banner-copy">
                  <h2 className="discord-banner-title">Perintah Bot yang Tersedia</h2>
                  <ul className="discord-command-list">
                    <li><code>/today</code> — Lihat tugas yang jatuh tempo hari ini</li>
                    <li><code>/upcoming</code> — Lihat daftar tugas mendatang</li>
                    <li><code>/overdue</code> — Lihat tugas terlambat yang belum selesai</li>
                    <li><code>/summary</code> — Ringkasan lengkap semua deadline aktif</li>
                    <li><code>/setchannel</code> — Atur pengingat harian ke channel server ini atau DM pribadi</li>
                  </ul>
                </div>
              </div>
            </section>
          ) : activeArea === 'grades' ? (
            <GradeTracker user={user} activities={activityOptions} />
          ) : (
            <StudyPlanner user={user} activities={activityOptions} />
          )}
        </main>
      </div>

      <dialog
        ref={logoutDialogRef}
        className="settings-modal confirm-dialog"
        aria-labelledby="logout-confirm-title"
        onClose={() => setLogoutConfirmOpen(false)}
      >
        <div className="settings-modal-header">
          <div>
            <p className="brand-kicker">Konfirmasi</p>
            <h2 id="logout-confirm-title" className="panel-title">Keluar dari Scheduler?</h2>
          </div>
        </div>
        <p className="confirm-dialog-copy">
          Kamu perlu memasukkan akun SCELE lagi untuk menyinkronkan tugas berikutnya.
        </p>
        <div className="confirm-dialog-actions">
          <button
            type="button"
            className="ghost-action"
            autoFocus
            onClick={() => logoutDialogRef.current?.close()}
          >
            Batal
          </button>
          <button
            type="button"
            className="ghost-action ghost-action-danger"
            onClick={() => {
              logoutDialogRef.current?.close();
              void handleLogout();
            }}
          >
            <LogOut size={15} aria-hidden="true" />
            Keluar
          </button>
        </div>
      </dialog>

      <div role="region" aria-label="Notifikasi" className="toast-region">
        <p className="sr-only">Pengumuman notifikasi</p>
        <div aria-live="polite" className="sr-only">{toastAnnouncement}</div>
        <div
          id="undo-toast"
          ref={undoToastRef}
          popover="manual"
          className="undo-toast"
          onFocusCapture={() => {
            toastFocusedRef.current = true;
            if (toastTimerRef.current !== null) {
              window.clearTimeout(toastTimerRef.current);
              toastTimerRef.current = null;
            }
          }}
          onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              toastFocusedRef.current = false;
              if (undoToast) scheduleToastDismiss();
            }
          }}
        >
          {undoToast && (
            <>
              <span className="undo-toast-text">{undoToast.text}</span>
              <div className="undo-toast-actions">
                <button
                  type="button"
                  className="undo-toast-action"
                  onClick={() => {
                    const targetTask = undoToast.task;
                    dismissUndoToast();
                    toggleDone(targetTask, { showToast: false });
                  }}
                >
                  Urungkan
                </button>
                <button
                  type="button"
                  className="undo-toast-close"
                  popoverTarget="undo-toast"
                  popoverTargetAction="hide"
                  onClick={dismissUndoToast}
                  aria-label="Tutup notifikasi"
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <dialog
        ref={settingsDialogRef}
        className="settings-modal"
        aria-labelledby="settings-modal-title"
        {...({ closedby: 'any' } as Record<string, string>)}
        onClose={() => setSettingsOpen(false)}
      >
        <div className="settings-modal-header">
          <div>
            <p className="brand-kicker">Pengaturan</p>
            <h2 id="settings-modal-title" className="panel-title">Profil dashboard</h2>
          </div>
          <button
            type="button"
            className="ghost-action"
            onClick={() => settingsDialogRef.current?.close()}
          >
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

        <label className="form-field" htmlFor="profile-display-name">
          <span>Username tampilan</span>
          <input
            id="profile-display-name"
            name="profileDisplayName"
            type="text"
            autoComplete="nickname"
            autoFocus
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

        <div className="settings-photo">
          <span className="settings-photo-label">Foto profil</span>
          <div className="settings-photo-actions">
            <label className="profile-upload">
              <ImageIcon size={15} aria-hidden="true" />
              <span>{profile.photo ? 'Ganti foto' : 'Unggah foto'}</span>
              <input type="file" accept="image/*" onChange={handlePhotoChange} />
            </label>
            {profile.photo && (
              <button
                type="button"
                className="profile-photo-remove"
                onClick={() => saveProfile({ ...profile, photo: '' })}
              >
                <Trash2 size={15} aria-hidden="true" />
                Hapus foto
              </button>
            )}
          </div>
          <small className="form-hint">JPG, PNG, atau WebP, maksimal 10 MB.</small>
        </div>

        {profileError && <p className="form-error" role="alert">{profileError}</p>}
      </dialog>
    </div>
  );
}
