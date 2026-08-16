'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  Archive,
  ArrowLeft,
  BookOpenCheck,
  Calculator,
  Link2,
  Pencil,
  Plus,
  RefreshCw,
  Sparkles,
  Upload,
} from 'lucide-react';
import {
  archiveCategory,
  archiveComponent,
  archiveGradebook,
  archiveScenario,
  calculateScenario,
  createCategory,
  createComponent,
  createGradebook,
  createScenario,
  getGradebook,
  listGradebooks,
  updateCategory,
  updateComponent,
  updateGradebook,
  updateScenario,
} from './gradeApi';
import {
  CategoryForm,
  ComponentForm,
  GradebookForm,
  ScenarioForm,
} from './GradeForms';
import GradeSummary, { formatGradeNumber } from './GradeSummary';
import { fetchGradeActivityOptions } from './activityOptions';
import GradeImportWizard from './imports/GradeImportWizard';
import type {
  ActivityOption,
  CategoryInput,
  ComponentInput,
  GradeCategory,
  GradeComponent,
  Gradebook,
  GradebookDetail,
  GradebookInput,
  GradebookResult,
  GradebookSummary,
  GradeScenario,
  ScenarioInput,
} from './types';
import { displayApiError } from '@/lib/apiErrors';

type EditState<T> = 'new' | T | null;

function errorMessage(error: unknown): string {
  return displayApiError(error, 'Grade tracker gagal memproses data.');
}

function targetStatusLabel(status: GradebookSummary['summary']['targetStatus']) {
  const labels = {
    not_set: 'Target belum disetel',
    already_achieved: 'Target tercapai',
    reachable: 'Target terjangkau',
    requires_perfect_score: 'Perlu nilai sempurna',
    impossible: 'Target tidak mungkin',
    indeterminate: 'Belum dapat dipastikan',
  };
  return labels[status];
}

function componentScoreLabel(
  component: GradeComponent,
  gradebook: Gradebook
): string {
  if (component.scoreStatus === 'pending') return 'Belum tersedia';
  if (component.scoreStatus === 'excluded') return 'Dikeluarkan';
  if (component.scoreStatus === 'not_applicable') return 'Tidak berlaku';
  if (gradebook.gradingScale === 'points') {
    return `${formatGradeNumber(component.earnedScore)} / ${formatGradeNumber(component.maxScore)}`;
  }
  return `${formatGradeNumber(component.earnedScore)} / 100`;
}

export default function GradeTracker({
  user,
  activities,
}: {
  user: User;
  activities: ActivityOption[];
}) {
  const [gradebooks, setGradebooks] = useState<GradebookSummary[]>([]);
  const [detail, setDetail] = useState<GradebookDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreateGradebook, setShowCreateGradebook] = useState(false);
  const [editingGradebook, setEditingGradebook] = useState(false);
  const [categoryForm, setCategoryForm] =
    useState<EditState<GradeCategory>>(null);
  const [componentForm, setComponentForm] =
    useState<EditState<GradeComponent>>(null);
  const [scenarioForm, setScenarioForm] =
    useState<EditState<GradeScenario>>(null);
  const [scenarioProjection, setScenarioProjection] = useState<{
    scenarioId: string;
    result: GradebookResult;
  } | null>(null);
  const [showImportWizard, setShowImportWizard] = useState(false);
  const [activityOptions, setActivityOptions] =
    useState<ActivityOption[]>(activities);

  const loadDetail = useCallback(
    async (gradebookId: string, showLoading = true) => {
      if (showLoading) setLoading(true);
      setError(null);
      try {
        const token = await user.getIdToken();
        const response = await getGradebook(token, gradebookId);
        setDetail(response);
        return response;
      } catch (loadError) {
        setError(errorMessage(loadError));
        return null;
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [user]
  );

  const refreshAfterMutation = useCallback(
    async (gradebookId?: string) => {
      const token = await user.getIdToken();
      const list = await listGradebooks(token);
      setGradebooks(list.gradebooks);
      if (gradebookId) {
        const nextDetail = await getGradebook(token, gradebookId);
        setDetail(nextDetail);
      }
    },
    [user]
  );

  useEffect(() => {
    let active = true;
    async function loadInitialGradebooks() {
      try {
        const token = await user.getIdToken();
        const response = await listGradebooks(token);
        if (active) setGradebooks(response.gradebooks);
      } catch (loadError) {
        if (active) setError(errorMessage(loadError));
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadInitialGradebooks();
    return () => {
      active = false;
    };
  }, [user]);

  useEffect(() => {
    let active = true;
    async function loadActivityOptions() {
      try {
        const snapshots = await fetchGradeActivityOptions(user.uid);
        if (active && snapshots.length > 0) setActivityOptions(snapshots);
      } catch {
        // Timeline-derived options remain a safe fallback.
      }
    }
    void loadActivityOptions();
    return () => {
      active = false;
    };
  }, [user]);

  const runMutation = useCallback(
    async (action: () => Promise<void>) => {
      setSaving(true);
      setError(null);
      try {
        await action();
      } catch (mutationError) {
        setError(errorMessage(mutationError));
      } finally {
        setSaving(false);
      }
    },
    []
  );

  const categoryById = useMemo(
    () =>
      new Map(
        (detail?.categories ?? []).map((category) => [category.id, category])
      ),
    [detail?.categories]
  );
  const activityById = useMemo(
    () =>
      new Map(
        activityOptions.map((activity) => [activity.activityId, activity])
      ),
    [activityOptions]
  );
  const pendingComponents = useMemo(
    () =>
      (detail?.components ?? []).filter(
        (component) => component.scoreStatus === 'pending'
      ),
    [detail?.components]
  );

  async function submitGradebook(input: GradebookInput) {
    await runMutation(async () => {
      const token = await user.getIdToken();
      if (detail && editingGradebook) {
        await updateGradebook(token, detail.gradebook.id, input);
        await refreshAfterMutation(detail.gradebook.id);
        setEditingGradebook(false);
      } else {
        const created = await createGradebook(token, input);
        await refreshAfterMutation(created.gradebook.id);
        setShowCreateGradebook(false);
      }
    });
  }

  async function submitCategory(input: CategoryInput) {
    if (!detail) return;
    await runMutation(async () => {
      const token = await user.getIdToken();
      if (categoryForm && categoryForm !== 'new') {
        await updateCategory(
          token,
          detail.gradebook.id,
          categoryForm.id,
          input
        );
      } else {
        await createCategory(token, detail.gradebook.id, input);
      }
      await refreshAfterMutation(detail.gradebook.id);
      setCategoryForm(null);
    });
  }

  async function submitComponent(input: ComponentInput) {
    if (!detail) return;
    await runMutation(async () => {
      const token = await user.getIdToken();
      if (componentForm && componentForm !== 'new') {
        await updateComponent(
          token,
          detail.gradebook.id,
          componentForm.id,
          input
        );
      } else {
        await createComponent(token, detail.gradebook.id, input);
      }
      await refreshAfterMutation(detail.gradebook.id);
      setComponentForm(null);
      setScenarioProjection(null);
    });
  }

  async function submitScenario(input: ScenarioInput) {
    if (!detail) return;
    await runMutation(async () => {
      const token = await user.getIdToken();
      if (scenarioForm && scenarioForm !== 'new') {
        await updateScenario(
          token,
          detail.gradebook.id,
          scenarioForm.id,
          input
        );
      } else {
        await createScenario(token, detail.gradebook.id, input);
      }
      await refreshAfterMutation(detail.gradebook.id);
      setScenarioForm(null);
      setScenarioProjection(null);
    });
  }

  async function removeGradebook() {
    if (!detail) return;
    if (
      !window.confirm(
        `Arsipkan gradebook ${detail.gradebook.courseName}? Data tidak dihapus permanen.`
      )
    ) {
      return;
    }
    await runMutation(async () => {
      const token = await user.getIdToken();
      await archiveGradebook(token, detail.gradebook.id);
      setDetail(null);
      setScenarioProjection(null);
      await refreshAfterMutation();
    });
  }

  async function removeCategory(category: GradeCategory) {
    if (!detail) return;
    if (
      !window.confirm(
        `Arsipkan kategori ${category.name} beserta komponen aktif di dalamnya?`
      )
    ) {
      return;
    }
    await runMutation(async () => {
      const token = await user.getIdToken();
      await archiveCategory(token, detail.gradebook.id, category.id);
      await refreshAfterMutation(detail.gradebook.id);
      setScenarioProjection(null);
    });
  }

  async function removeComponent(component: GradeComponent) {
    if (!detail) return;
    if (!window.confirm(`Arsipkan komponen ${component.name}?`)) return;
    await runMutation(async () => {
      const token = await user.getIdToken();
      await archiveComponent(token, detail.gradebook.id, component.id);
      await refreshAfterMutation(detail.gradebook.id);
      setScenarioProjection(null);
    });
  }

  async function removeScenario(scenario: GradeScenario) {
    if (!detail) return;
    if (!window.confirm(`Arsipkan skenario ${scenario.name}?`)) return;
    await runMutation(async () => {
      const token = await user.getIdToken();
      await archiveScenario(token, detail.gradebook.id, scenario.id);
      await refreshAfterMutation(detail.gradebook.id);
      if (scenarioProjection?.scenarioId === scenario.id) {
        setScenarioProjection(null);
      }
    });
  }

  async function projectScenario(scenario: GradeScenario) {
    if (!detail) return;
    await runMutation(async () => {
      const token = await user.getIdToken();
      const projection = await calculateScenario(
        token,
        detail.gradebook.id,
        scenario.id
      );
      setScenarioProjection({
        scenarioId: scenario.id,
        result: projection.result,
      });
    });
  }

  if (loading && gradebooks.length === 0 && !detail) {
    return (
      <div className="grade-loading">
        <RefreshCw className="animate-spin" size={18} aria-hidden="true" />
        Memuat gradebook...
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="grade-tracker">
        <section className="grade-toolbar">
          <div>
            <p className="brand-kicker">Manual Grade Tracker</p>
            <h2>Gradebook mata kuliah</h2>
            <p>
              Input nilai dan bobot secara eksplisit. Pending tidak dihitung sebagai nol.
            </p>
          </div>
          <button
            type="button"
            className="primary-action grade-toolbar-action"
            onClick={() => setShowCreateGradebook((current) => !current)}
          >
            <Plus size={15} aria-hidden="true" />
            Gradebook baru
          </button>
        </section>

        {error && <div className="grade-error">{error}</div>}

        {showCreateGradebook && (
          <section className="grade-panel">
            <div className="grade-panel-heading">
              <div>
                <span>Gradebook</span>
                <h3>Mata kuliah baru</h3>
              </div>
            </div>
            <GradebookForm
              key="new-gradebook"
              busy={saving}
              onSubmit={submitGradebook}
              onCancel={() => setShowCreateGradebook(false)}
            />
          </section>
        )}

        {gradebooks.length === 0 ? (
          <section className="grade-empty">
            <BookOpenCheck size={28} aria-hidden="true" />
            <h3>Belum ada gradebook</h3>
            <p>
              Buat satu gradebook per mata kuliah dan semester. Gradebook tidak harus
              terhubung ke course SCELE.
            </p>
          </section>
        ) : (
          <div className="gradebook-grid">
            {gradebooks.map((gradebook) => (
              <button
                type="button"
                className="gradebook-card"
                key={gradebook.id}
                onClick={() => void loadDetail(gradebook.id)}
              >
                <div className="gradebook-card-top">
                  <div>
                    <span>{gradebook.courseCode || gradebook.semester || 'Gradebook'}</span>
                    <h3>{gradebook.courseName}</h3>
                  </div>
                  <BookOpenCheck size={19} aria-hidden="true" />
                </div>
                <div className="gradebook-card-metrics">
                  <div>
                    <span>Terkumpul</span>
                    <strong>
                      {formatGradeNumber(gradebook.summary.currentWeightedScore)}
                    </strong>
                  </div>
                  <div>
                    <span>Rata-rata dinilai</span>
                    <strong>
                      {formatGradeNumber(
                        gradebook.summary.currentAverageOnGradedWeight
                      )}
                    </strong>
                  </div>
                </div>
                <div className="gradebook-card-footer">
                  <span>{targetStatusLabel(gradebook.summary.targetStatus)}</span>
                  {gradebook.summary.warningCount > 0 && (
                    <strong>{gradebook.summary.warningCount} warning</strong>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="grade-tracker">
      <section className="grade-detail-header">
        <button
          type="button"
          className="ghost-action"
          onClick={() => {
            setDetail(null);
            setEditingGradebook(false);
            setCategoryForm(null);
            setComponentForm(null);
            setScenarioForm(null);
            setScenarioProjection(null);
            setShowImportWizard(false);
          }}
        >
          <ArrowLeft size={15} aria-hidden="true" />
          Semua gradebook
        </button>
        <div className="grade-detail-title">
          <p className="brand-kicker">
            {detail.gradebook.courseCode || detail.gradebook.semester || 'Gradebook'}
          </p>
          <h2>{detail.gradebook.courseName}</h2>
          <p>
            Mode {detail.gradebook.gradingScale === 'points' ? 'poin' : 'persentase'}
            {' · '}
            {detail.gradebook.capFinalScoreAt100
              ? 'nilai akhir di-cap 100'
              : 'bonus tidak di-cap'}
          </p>
        </div>
        <div className="grade-detail-actions">
          <button
            type="button"
            className="ghost-action"
            onClick={() => setShowImportWizard((current) => !current)}
          >
            <Upload size={14} aria-hidden="true" />
            Import CSV/XLSX
          </button>
          <button
            type="button"
            className="ghost-action"
            onClick={() => setEditingGradebook((current) => !current)}
          >
            <Pencil size={14} aria-hidden="true" />
            Edit
          </button>
          <button
            type="button"
            className="ghost-action ghost-action-danger"
            onClick={() => void removeGradebook()}
            disabled={saving}
          >
            <Archive size={14} aria-hidden="true" />
            Arsipkan
          </button>
        </div>
      </section>

      {error && <div className="grade-error">{error}</div>}

      {showImportWizard && (
        <GradeImportWizard
          user={user}
          gradebook={detail.gradebook}
          categories={detail.categories}
          onCommitted={async () => {
            await refreshAfterMutation(detail.gradebook.id);
          }}
          onClose={() => setShowImportWizard(false)}
        />
      )}

      {editingGradebook && (
        <section className="grade-panel">
          <div className="grade-panel-heading">
            <div>
              <span>Pengaturan</span>
              <h3>Edit gradebook</h3>
            </div>
          </div>
          <GradebookForm
            key={`gradebook-${detail.gradebook.id}-${detail.gradebook.updatedAt}`}
            initial={detail.gradebook}
            busy={saving}
            onSubmit={submitGradebook}
            onCancel={() => setEditingGradebook(false)}
          />
        </section>
      )}

      <GradeSummary
        result={detail.result}
        categories={detail.categories}
        components={detail.components}
      />

      <section className="grade-panel">
        <div className="grade-panel-heading">
          <div>
            <span>Struktur</span>
            <h3>Kategori penilaian</h3>
          </div>
          <button
            type="button"
            className="ghost-action"
            onClick={() => setCategoryForm('new')}
          >
            <Plus size={14} aria-hidden="true" />
            Kategori
          </button>
        </div>

        {categoryForm && (
          <div className="grade-inline-editor">
            <CategoryForm
              key={
                categoryForm === 'new'
                  ? 'category-new'
                  : `category-${categoryForm.id}`
              }
              initial={categoryForm === 'new' ? undefined : categoryForm}
              busy={saving}
              onSubmit={submitCategory}
              onCancel={() => setCategoryForm(null)}
            />
          </div>
        )}

        {detail.categories.length === 0 ? (
          <p className="grade-empty-copy">
            Belum ada kategori. Komponen tetap dapat dibuat tanpa kategori.
          </p>
        ) : (
          <div className="grade-category-list">
            {detail.categories.map((category) => (
              <article key={category.id}>
                <div>
                  <span>{category.aggregation.replaceAll('_', ' ')}</span>
                  <h4>{category.name}</h4>
                  <p>
                    {category.weightMode === 'fixed'
                      ? `${formatGradeNumber(category.weight)}%`
                      : category.weightMode === 'derived'
                        ? 'Bobot dari komponen'
                        : 'Bobot belum diketahui'}
                    {category.dropLowestCount > 0
                      ? ` · drop ${category.dropLowestCount} terendah`
                      : ''}
                  </p>
                </div>
                <div className="grade-row-actions">
                  <button
                    type="button"
                    className="ghost-action"
                    onClick={() => setCategoryForm(category)}
                  >
                    <Pencil size={13} aria-hidden="true" />
                    Edit
                  </button>
                  <button
                    type="button"
                    className="ghost-action ghost-action-danger"
                    onClick={() => void removeCategory(category)}
                  >
                    <Archive size={13} aria-hidden="true" />
                    Arsip
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="grade-panel">
        <div className="grade-panel-heading">
          <div>
            <span>Nilai aktual</span>
            <h3>Komponen penilaian</h3>
          </div>
          <button
            type="button"
            className="ghost-action"
            onClick={() => setComponentForm('new')}
          >
            <Plus size={14} aria-hidden="true" />
            Komponen
          </button>
        </div>

        {componentForm && (
          <div className="grade-inline-editor">
            <ComponentForm
              key={
                componentForm === 'new'
                  ? 'component-new'
                  : `component-${componentForm.id}`
              }
              initial={componentForm === 'new' ? undefined : componentForm}
              gradebook={detail.gradebook}
              categories={detail.categories}
              activities={activityOptions}
              busy={saving}
              onSubmit={submitComponent}
              onCancel={() => setComponentForm(null)}
            />
          </div>
        )}

        {detail.components.length === 0 ? (
          <p className="grade-empty-copy">
            Belum ada komponen. Tambahkan tugas, kuis, ujian, proyek, atau bonus.
          </p>
        ) : (
          <div className="grade-component-list">
            {detail.components.map((component) => {
              const linkedActivity = component.linkedActivityId
                ? activityById.get(component.linkedActivityId)
                : undefined;
              return (
                <article key={component.id}>
                  <div className="grade-component-main">
                    <div className="grade-component-title">
                      <span>{component.componentType}</span>
                      <h4>{component.name}</h4>
                    </div>
                    <div className="grade-component-badges">
                      <span className={`grade-score-status grade-score-${component.scoreStatus}`}>
                        {componentScoreLabel(component, detail.gradebook)}
                      </span>
                      {component.isBonus && <span>Bonus</span>}
                      {component.isDropped && <span>Dropped</span>}
                    </div>
                    <p>
                      {categoryById.get(component.categoryId || '')?.name ||
                        'Tanpa kategori'}
                      {' · '}
                      {component.weightMode === 'fixed'
                        ? `bobot ${formatGradeNumber(component.weight)}%`
                        : component.weightMode === 'equal_in_category'
                          ? 'bobot sama rata'
                          : 'bobot unknown'}
                    </p>
                    {component.linkedActivityId && (
                      <div className="grade-activity-link">
                        <Link2 size={12} aria-hidden="true" />
                        {linkedActivity
                          ? `${linkedActivity.course} — ${linkedActivity.title}${
                              linkedActivity.lifecycleState === 'missing'
                                ? ' (missing)'
                                : ''
                            }`
                          : `Activity ${component.linkedActivityId} tidak aktif di timeline`}
                      </div>
                    )}
                  </div>
                  <div className="grade-row-actions">
                    <button
                      type="button"
                      className="ghost-action"
                      onClick={() => setComponentForm(component)}
                    >
                      <Pencil size={13} aria-hidden="true" />
                      Edit
                    </button>
                    <button
                      type="button"
                      className="ghost-action ghost-action-danger"
                      onClick={() => void removeComponent(component)}
                    >
                      <Archive size={13} aria-hidden="true" />
                      Arsip
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="grade-panel">
        <div className="grade-panel-heading">
          <div>
            <span>What-if</span>
            <h3>Simulator skenario</h3>
          </div>
          <button
            type="button"
            className="ghost-action"
            onClick={() => setScenarioForm('new')}
          >
            <Plus size={14} aria-hidden="true" />
            Skenario
          </button>
        </div>

        {scenarioForm && (
          <div className="grade-inline-editor">
            <ScenarioForm
              key={
                scenarioForm === 'new'
                  ? 'scenario-new'
                  : `scenario-${scenarioForm.id}`
              }
              initial={scenarioForm === 'new' ? undefined : scenarioForm}
              pendingComponents={pendingComponents}
              busy={saving}
              onSubmit={submitScenario}
              onCancel={() => setScenarioForm(null)}
            />
          </div>
        )}

        {detail.scenarios.length === 0 ? (
          <p className="grade-empty-copy">
            Belum ada skenario. Nilai asumsi tidak akan mengubah nilai aktual.
          </p>
        ) : (
          <div className="grade-scenario-list">
            {detail.scenarios.map((scenario) => (
              <article key={scenario.id}>
                <div>
                  <Sparkles size={16} aria-hidden="true" />
                  <h4>{scenario.name}</h4>
                  <p>
                    {scenario.assumptions.length} asumsi
                    {scenario.targetScore !== null &&
                    scenario.targetScore !== undefined
                      ? ` · target ${formatGradeNumber(scenario.targetScore)}`
                      : ''}
                  </p>
                </div>
                <div className="grade-row-actions">
                  <button
                    type="button"
                    className="ghost-action"
                    onClick={() => void projectScenario(scenario)}
                    disabled={saving}
                  >
                    <Calculator size={13} aria-hidden="true" />
                    Hitung
                  </button>
                  <button
                    type="button"
                    className="ghost-action"
                    onClick={() => setScenarioForm(scenario)}
                  >
                    <Pencil size={13} aria-hidden="true" />
                    Edit
                  </button>
                  <button
                    type="button"
                    className="ghost-action ghost-action-danger"
                    onClick={() => void removeScenario(scenario)}
                  >
                    <Archive size={13} aria-hidden="true" />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}

        {scenarioProjection && (
          <div className="grade-scenario-result">
            <div className="grade-panel-heading">
              <div>
                <span>Hasil asumsi</span>
                <h3>
                  {
                    detail.scenarios.find(
                      (scenario) => scenario.id === scenarioProjection.scenarioId
                    )?.name
                  }
                </h3>
              </div>
            </div>
            <GradeSummary
              result={scenarioProjection.result}
              categories={detail.categories}
              components={detail.components}
              scenario
            />
          </div>
        )}
      </section>
    </div>
  );
}
