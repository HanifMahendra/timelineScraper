'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import { BookOpen, CalendarRange, CheckCircle2, Clock3, ExternalLink, Plus, RefreshCw, Save, Sparkles, TriangleAlert } from 'lucide-react';
import {
  applyCatalog, applyDraft, createSubject, createTopic, generatePlan, getCatalog,
  getPlan, getPreferences, getSubject, listPlans, listSubjects, matchSubject,
  recommendResources, syncSubjects, updatePreferences, updateSession, updateTopic,
} from './studyApi';
import type { CatalogSubject, CuratedResource, FallbackResource, StudyDraft, StudyPlan, StudyPreferences, StudySession, StudySubject, StudyTopic, SubjectMatch } from './types';
import type { ActivityOption } from '@/features/grades/types';
import { displayApiError } from '@/lib/apiErrors';

const DAYS = [
  ['monday', 'Sen'], ['tuesday', 'Sel'], ['wednesday', 'Rab'], ['thursday', 'Kam'],
  ['friday', 'Jum'], ['saturday', 'Sab'], ['sunday', 'Min'],
] as const;
function localDate(offset = 0) { const date = new Date(); date.setDate(date.getDate() + offset); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function nextDate(value: string) { const date = new Date(`${value}T00:00:00.000Z`); date.setUTCDate(date.getUTCDate() + 1); return date.toISOString().slice(0, 10); }
function message(error: unknown) { return displayApiError(error, 'Rencana belajar gagal diproses.'); }
function reasonLabel(reason: string) { return ({ upcoming_deadline: 'Deadline dekat', high_weight_component: 'Bobot besar', low_current_grade: 'Gap target', prerequisite: 'Prasyarat', manual: 'Manual', catalog_order: 'Urutan katalog' } as Record<string, string>)[reason] ?? reason; }
function warningLabel(code: string) { return ({ INSUFFICIENT_CAPACITY: 'Waktu tersedia belum cukup untuk semua materi.', NO_AVAILABLE_TIME: 'Tidak ada hari belajar yang tersedia.', DEADLINE_ALREADY_PASSED: 'Ada deadline yang sudah lewat; cek prioritasnya.', GRADE_WEIGHT_UNKNOWN: 'Bobot nilai belum diketahui dan tidak ditebak.', SESSION_LIMIT_REACHED: 'Batas aman jumlah sesi tercapai.' } as Record<string, string>)[code] ?? code; }
function groupSessions(sessions: StudySession[]) {
  const groups = new Map<string, StudySession[]>();
  for (const session of sessions) groups.set(session.scheduledDate, [...(groups.get(session.scheduledDate) ?? []), session]);
  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right));
}

export default function StudyPlanner({ user, activities }: { user: User; activities: ActivityOption[] }) {
  const [subjects, setSubjects] = useState<StudySubject[]>([]);
  const [selected, setSelected] = useState<StudySubject | null>(null);
  const [topics, setTopics] = useState<StudyTopic[]>([]);
  const [catalog, setCatalog] = useState<CatalogSubject[]>([]);
  const [match, setMatch] = useState<SubjectMatch | null>(null);
  const [catalogChoice, setCatalogChoice] = useState('');
  const [preferences, setPreferences] = useState<StudyPreferences | null>(null);
  const [plans, setPlans] = useState<StudyPlan[]>([]);
  const [activePlan, setActivePlan] = useState<StudyPlan | null>(null);
  const [activeSessions, setActiveSessions] = useState<StudySession[]>([]);
  const [draft, setDraft] = useState<StudyDraft | null>(null);
  const [draftSessions, setDraftSessions] = useState<StudySession[]>([]);
  const [preservedSessions, setPreservedSessions] = useState<StudySession[]>([]);
  const [curated, setCurated] = useState<CuratedResource[]>([]);
  const [fallback, setFallback] = useState<FallbackResource[]>([]);
  const [manualName, setManualName] = useState('');
  const [topicTitle, setTopicTitle] = useState('');
  const [topicMinutes, setTopicMinutes] = useState(60);
  const [planSubjects, setPlanSubjects] = useState<string[]>([]);
  const [planName, setPlanName] = useState('Rencana Belajar');
  const [startDate, setStartDate] = useState(() => localDate());
  const [endDate, setEndDate] = useState(() => localDate(13));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const withToken = useCallback(async <T,>(action: (token: string) => Promise<T>) => action(await user.getIdToken()), [user]);
  const loadBase = useCallback(async () => {
    const [subjectResult, preferenceResult, planResult, catalogResult] = await withToken(async (token) => Promise.all([listSubjects(token), getPreferences(token), listPlans(token), getCatalog(token)]));
    setSubjects(subjectResult.subjects); setPreferences(preferenceResult.preferences); setPlans(planResult.plans); setCatalog(catalogResult.subjects);
    setPlanSubjects((current) => current.length ? current : subjectResult.subjects.map((subject) => subject.id));
  }, [withToken]);

  useEffect(() => { let active = true; (async () => { try { await loadBase(); } catch (loadError) { if (active) setError(message(loadError)); } finally { if (active) setLoading(false); } })(); return () => { active = false; }; }, [loadBase]);

  async function run(action: () => Promise<void>) { setSaving(true); setError(null); try { await action(); } catch (actionError) { setError(message(actionError)); } finally { setSaving(false); } }
  async function openSubject(subject: StudySubject) { await run(async () => { const [detail, resources] = await withToken(async (token) => Promise.all([getSubject(token, subject.id), recommendResources(token, subject.id)])); setSelected({ ...subject, progress: detail.progress }); setTopics(detail.topics); setCurated(resources.curated); setFallback(resources.fallback); setMatch(null); setCatalogChoice(subject.catalogSubjectKey ?? ''); }); }
  async function refreshSubject() { if (!selected) return; const current = subjects.find((subject) => subject.id === selected.id) ?? selected; await openSubject(current); await loadBase(); }
  async function selectTopicResource(topic: StudyTopic) { await run(async () => { const resources = await withToken((token) => recommendResources(token, topic.subjectId, topic.id)); setCurated(resources.curated); setFallback(resources.fallback); }); }
  async function openPlan(plan: StudyPlan) { await run(async () => { const detail = await withToken((token) => getPlan(token, plan.id)); setActivePlan(detail.plan); setActiveSessions(detail.sessions); }); }
  const groupedDraft = useMemo(() => groupSessions(draftSessions), [draftSessions]);
  const groupedActive = useMemo(() => groupSessions(activeSessions.filter((session) => session.status !== 'rescheduled')), [activeSessions]);
  const activityChoices = useMemo(() => selected ? activities.filter((activity) => activity.course === selected.displayName) : [], [activities, selected]);

  if (loading) return <div className="study-loading"><RefreshCw className="animate-spin" size={18} /> Memuat area Belajar...</div>;
  return (
    <div className="study-planner">
      <section className="study-toolbar">
        <div><p className="brand-kicker">Deterministic study planner</p><h2>Rencana Belajar</h2><p>Roadmap lokal, deadline SCELE, dan sinyal nilai yang transparan.</p></div>
        <button className="ghost-action" type="button" disabled={saving} onClick={() => run(loadBase)}><RefreshCw size={14} className={saving ? 'animate-spin' : ''} /> Refresh</button>
      </section>
      {error && <div className="study-error" role="alert">{error}</div>}

      <div className="study-layout">
        <section className="study-panel study-subject-panel">
          <div className="study-heading"><div><span>Mata kuliah</span><h3>Subject</h3></div><button type="button" className="ghost-action" disabled={saving} onClick={() => run(async () => { await withToken(syncSubjects); await loadBase(); })}>Sinkron dari SCELE</button></div>
          <form className="study-inline-form" onSubmit={(event) => { event.preventDefault(); void run(async () => { await withToken((token) => createSubject(token, { displayName: manualName, source: 'manual' })); setManualName(''); await loadBase(); }); }}>
            <input aria-label="Nama subject manual" value={manualName} onChange={(event) => setManualName(event.target.value)} placeholder="Tambah subject manual" required maxLength={160} />
            <button type="submit" className="study-primary" disabled={saving}><Plus size={14} /> Tambah</button>
          </form>
          {subjects.length === 0 ? <div className="study-empty"><BookOpen size={24} /><h4>Belum ada subject</h4><p>Sinkronkan course SCELE atau tambahkan subject manual.</p></div> : <div className="study-subject-list">{subjects.map((subject) => <button type="button" key={subject.id} className={selected?.id === subject.id ? 'is-selected' : ''} onClick={() => openSubject(subject)}><div><strong>{subject.displayName}</strong><span>{subject.source === 'scele' ? 'SCELE' : 'Manual'} · {subject.catalogSubjectKey ? 'Catalog terhubung' : 'Custom'}</span></div><div className="study-progress"><span style={{ width: `${subject.progress.completionPercent}%` }} /><small>{subject.progress.completionPercent}%</small></div>{subject.nearestDeadline && <small>Deadline: {new Date(subject.nearestDeadline).toLocaleDateString('id-ID')}</small>}{subject.gradeTargetGap != null && <small>Gap target: {subject.gradeTargetGap.toFixed(1)}</small>}</button>)}</div>}
        </section>

        <section className="study-panel study-roadmap-panel">
          <div className="study-heading"><div><span>Topik</span><h3>{selected?.displayName ?? 'Roadmap subject'}</h3></div>{selected && <strong>{selected.progress.completedTopics}/{selected.progress.totalTopics} selesai</strong>}</div>
          {!selected ? <div className="study-empty"><Sparkles size={24} /><h4>Pilih subject</h4><p>Roadmap, prasyarat, progress, dan resource akan tampil di sini.</p></div> : <>
            <div className="study-catalog-box">
              <div><strong>{selected.catalogSubjectKey ? `Catalog: ${selected.catalogSubjectKey}` : 'Belum terhubung ke catalog'}</strong><p>Match bersifat deterministik; hasil samar tidak diterapkan otomatis.</p></div>
              <button type="button" className="ghost-action" onClick={() => run(async () => { const result = await withToken((token) => matchSubject(token, selected.id)); setMatch(result.match); if (result.match.catalogSubjectKey) setCatalogChoice(result.match.catalogSubjectKey); })}>Cek match</button>
              <select aria-label="Pilih subject catalog" value={catalogChoice} onChange={(event) => setCatalogChoice(event.target.value)}><option value="">Pilih catalog…</option>{catalog.map((entry) => <option key={entry.key} value={entry.key}>{entry.names[0]}</option>)}</select>
              <button type="button" className="study-primary" disabled={!catalogChoice || saving} onClick={() => run(async () => { await withToken((token) => applyCatalog(token, selected.id, catalogChoice)); await refreshSubject(); })}>Terapkan roadmap</button>
            </div>
            {match && <p className="study-match">Match: <strong>{match.matchType}</strong> · confidence {match.confidence}{!match.catalogSubjectKey && ' — pilih catalog secara manual.'}</p>}
            <form className="study-inline-form" onSubmit={(event) => { event.preventDefault(); void run(async () => { await withToken((token) => createTopic(token, selected.id, { title: topicTitle, estimatedMinutes: topicMinutes, difficulty: 'beginner' })); setTopicTitle(''); await refreshSubject(); }); }}><input aria-label="Judul topik custom" value={topicTitle} onChange={(event) => setTopicTitle(event.target.value)} placeholder="Topik custom" required /><input aria-label="Estimasi menit" type="number" min={1} max={10000} value={topicMinutes} onChange={(event) => setTopicMinutes(Number(event.target.value))} /><button className="study-primary" type="submit"><Plus size={14} /> Topik</button></form>
            <div className="study-topic-list">{topics.map((topic) => <article key={topic.id}><button type="button" className="study-topic-main" onClick={() => selectTopicResource(topic)}><span className={`study-topic-state is-${topic.status}`}><CheckCircle2 size={14} /></span><div><strong>{topic.title}</strong><p><Clock3 size={12} /> {topic.estimatedMinutes} menit · {topic.difficulty}</p><small>Prasyarat: {topic.prerequisiteTopicIds.length ? topic.prerequisiteTopicIds.map((id) => topics.find((entry) => entry.id === id)?.title ?? id).join(', ') : 'Tidak ada'}</small></div><b>{topic.progressPercent}%</b></button><div className="study-topic-actions"><button type="button" disabled={saving} onClick={() => run(async () => { await withToken((token) => updateTopic(token, selected.id, topic.id, { status: topic.status === 'completed' ? 'in_progress' : 'completed' })); await refreshSubject(); })}>{topic.status === 'completed' ? 'Buka lagi' : 'Selesai'}</button><select aria-label={`Mastery ${topic.title}`} value={topic.masteryLevel} onChange={(event) => { const masteryLevel = event.target.value as StudyTopic['masteryLevel']; void run(async () => { await withToken((token) => updateTopic(token, selected.id, topic.id, { masteryLevel })); await refreshSubject(); }); }}><option value="unknown">Mastery: belum tahu</option><option value="learning">Sedang belajar</option><option value="familiar">Familiar</option><option value="confident">Percaya diri</option></select><select aria-label={`Deadline terkait ${topic.title}`} value={topic.linkedActivityIds?.[0] ?? ''} onChange={(event) => { const linkedActivityIds = event.target.value ? [event.target.value] : []; void run(async () => { await withToken((token) => updateTopic(token, selected.id, topic.id, { linkedActivityIds })); await refreshSubject(); }); }}><option value="">Deadline subject-level</option>{activityChoices.map((activity) => <option key={activity.activityId} value={activity.activityId}>{activity.title}</option>)}</select></div></article>)}</div>
          </>}
        </section>
      </div>

      {preferences && <section className="study-panel"><div className="study-heading"><div><span>Preferensi</span><h3>Waktu belajar</h3></div><button type="button" className="study-primary" disabled={saving} onClick={() => run(async () => { const result = await withToken((token) => updatePreferences(token, preferences)); setPreferences(result.preferences); })}><Save size={14} /> Simpan</button></div><div className="study-preference-grid"><label><span>Timezone</span><input value={preferences.timezone} onChange={(event) => setPreferences({ ...preferences, timezone: event.target.value })} /></label><label><span>Menit per hari</span><input type="number" min={1} max={720} value={preferences.defaultDailyMinutes} onChange={(event) => setPreferences({ ...preferences, defaultDailyMinutes: Number(event.target.value) })} /></label><label><span>Durasi pilihan</span><input type="number" min={1} max={720} value={preferences.preferredSessionMinutes} onChange={(event) => setPreferences({ ...preferences, preferredSessionMinutes: Number(event.target.value) })} /></label><label><span>Minimum sesi</span><input type="number" min={1} value={preferences.minimumSessionMinutes} onChange={(event) => setPreferences({ ...preferences, minimumSessionMinutes: Number(event.target.value) })} /></label><label><span>Maksimum sesi</span><input type="number" min={1} value={preferences.maximumSessionMinutes} onChange={(event) => setPreferences({ ...preferences, maximumSessionMinutes: Number(event.target.value) })} /></label><label><span>Horizon (hari)</span><input type="number" min={1} max={90} value={preferences.planningHorizonDays} onChange={(event) => setPreferences({ ...preferences, planningHorizonDays: Number(event.target.value) })} /></label><label><span>Urutan kesulitan</span><select value={preferences.difficultyPreference} onChange={(event) => setPreferences({ ...preferences, difficultyPreference: event.target.value as StudyPreferences['difficultyPreference'] })}><option value="balanced">Seimbang</option><option value="easier_first">Mudah dulu</option><option value="harder_first">Sulit dulu</option></select></label></div><div className="study-days">{DAYS.map(([value, label]) => <label key={value}><input type="checkbox" checked={preferences.availableDays.includes(value)} onChange={(event) => setPreferences({ ...preferences, availableDays: event.target.checked ? [...preferences.availableDays, value] : preferences.availableDays.filter((day) => day !== value) })} />{label}</label>)}<label><input type="checkbox" checked={preferences.includeWeekends} onChange={(event) => setPreferences({ ...preferences, includeWeekends: event.target.checked })} />Izinkan akhir pekan</label></div></section>}

      <section className="study-panel"><div className="study-heading"><div><span>Generate plan</span><h3>Preview sebelum apply</h3></div><CalendarRange size={20} /></div><div className="study-plan-form"><label><span>Nama plan</span><input value={planName} onChange={(event) => setPlanName(event.target.value)} /></label><label><span>Mulai</span><input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label><label><span>Selesai</span><input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label><label><span>Kapasitas harian</span><input type="number" min={1} max={720} value={preferences?.defaultDailyMinutes ?? 60} onChange={(event) => preferences && setPreferences({ ...preferences, defaultDailyMinutes: Number(event.target.value) })} /></label></div><div className="study-plan-subjects">{subjects.map((subject) => <label key={subject.id}><input type="checkbox" checked={planSubjects.includes(subject.id)} onChange={(event) => setPlanSubjects(event.target.checked ? [...planSubjects, subject.id] : planSubjects.filter((id) => id !== subject.id))} />{subject.displayName}</label>)}</div><button type="button" className="study-primary" disabled={saving || !planSubjects.length} onClick={() => run(async () => { const result = await withToken((token) => generatePlan(token, { name: planName, subjectIds: planSubjects, startDate, endDate, dailyMinutes: preferences?.defaultDailyMinutes ?? 60, ...(activePlan ? { existingPlanId: activePlan.id } : {}) })); setDraft(result.draft); setDraftSessions(result.sessions); setPreservedSessions(result.preservedSessions); })}><Sparkles size={14} /> {activePlan ? 'Preview regenerasi' : 'Buat draft'}</button>
        {draft && <div className="study-preview"><div className="study-preview-summary"><div><span>Terjadwal</span><strong>{draft.generationSummary.totalScheduledMinutes} menit</strong></div><div><span>Belum Terjadwal</span><strong>{draft.generationSummary.unscheduledMinutes} menit</strong></div><div><span>Sesi</span><strong>{draftSessions.length}</strong></div></div>{draft.generationSummary.warnings.length > 0 && <div className="study-warnings">{draft.generationSummary.warnings.map((warning, index) => <p key={`${warning.code}-${index}`}><TriangleAlert size={14} /> {warningLabel(warning.code)}</p>)}</div>}{preservedSessions.length > 0 && <p className="study-preserved">{preservedSessions.length} sesi completed/in-progress/manual dipertahankan.</p>}{groupedDraft.map(([date, sessions]) => <div className="study-session-day" key={date}><h4>{new Date(`${date}T00:00:00`).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short' })}</h4>{sessions.map((session) => <article key={session.id}><div><strong>{session.title}</strong><span>{session.plannedMinutes} menit · Prioritas {session.priority}</span></div><small>Alasan Prioritas: {session.sourceReasons.map(reasonLabel).join(', ')} · {session.linkedActivityIds?.length ?? 0} deadline · {session.linkedGradeComponentIds?.length ?? 0} komponen nilai</small></article>)}</div>)}<button type="button" className="study-primary" disabled={saving} onClick={() => run(async () => { const result = await withToken((token) => applyDraft(token, draft)); const planResult = await withToken((token) => getPlan(token, result.planId)); setActivePlan(planResult.plan); setActiveSessions(planResult.sessions); setDraft(null); setDraftSessions([]); await loadBase(); })}>Terapkan rencana</button></div>}
      </section>

      <section className="study-layout"><section className="study-panel"><div className="study-heading"><div><span>Plan aktif</span><h3>Sesi belajar</h3></div></div>{plans.length === 0 ? <p className="study-empty-copy">Belum ada plan aktif. Generate draft lalu terapkan.</p> : <div className="study-plan-list">{plans.map((plan) => <button type="button" key={plan.id} onClick={() => openPlan(plan)} className={activePlan?.id === plan.id ? 'is-selected' : ''}><strong>{plan.name}</strong><span>{plan.startDate} — {plan.endDate}</span></button>)}</div>}{groupedActive.map(([date, sessions]) => <div className="study-session-day" key={date}><h4>{date === localDate() ? `Hari ini · ${date}` : date}</h4>{sessions.map((session) => <article key={session.id} className={session.status === 'completed' ? 'is-completed' : ''}><div><strong>{session.title}</strong><span>{session.actualMinutes ?? session.plannedMinutes} / {session.plannedMinutes} menit</span></div><div className="study-session-actions"><small>{session.sourceReasons.map(reasonLabel).join(', ')}</small>{activePlan && <label className="study-actual-minutes">Aktual <input aria-label={`Menit aktual ${session.title}`} type="number" min={0} max={10000} defaultValue={session.actualMinutes ?? ''} placeholder={String(session.plannedMinutes)} onBlur={(event) => { if (event.target.value !== '') void run(async () => { await withToken((token) => updateSession(token, activePlan.id, session.id, { actualMinutes: Number(event.target.value) })); await openPlan(activePlan); }); }} /></label>}{session.status === 'planned' && <button type="button" onClick={() => run(async () => { if (!activePlan) return; await withToken((token) => updateSession(token, activePlan.id, session.id, { status: 'in_progress' })); await openPlan(activePlan); })}>Mulai</button>}{session.status !== 'completed' && <button type="button" onClick={() => run(async () => { if (!activePlan) return; await withToken((token) => updateSession(token, activePlan.id, session.id, { status: 'planned', scheduledDate: nextDate(session.scheduledDate) })); await openPlan(activePlan); })}>Besok</button>}{session.status !== 'completed' && <button type="button" onClick={() => run(async () => { if (!activePlan) return; await withToken((token) => updateSession(token, activePlan.id, session.id, { status: 'completed', actualMinutes: session.actualMinutes ?? session.plannedMinutes })); await openPlan(activePlan); await loadBase(); })}>Selesai</button>}</div></article>)}</div>)}</section>
        <section className="study-panel"><div className="study-heading"><div><span>Resources</span><h3>Materi belajar</h3></div></div>{curated.length === 0 && fallback.length === 0 ? <p className="study-empty-copy">Pilih subject atau topik untuk melihat resource.</p> : <div className="study-resource-list">{curated.map((resource) => <a key={resource.id} href={resource.url} target="_blank" rel="noopener noreferrer"><div><span className="study-badge is-curated">Resource Terkurasi</span><strong>{resource.title}</strong><small>{resource.provider} · {resource.difficulty} · {resource.language}</small></div><ExternalLink size={14} /></a>)}{fallback.map((resource) => <a key={resource.url} href={resource.url} target="_blank" rel="noopener noreferrer"><div><span className="study-badge is-fallback">Pencarian Terarah</span><strong>{resource.title}</strong><small>{resource.provider} · hasil tidak diklaim terkurasi</small></div><ExternalLink size={14} /></a>)}</div>}</section></section>
    </div>
  );
}
