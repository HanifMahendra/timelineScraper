'use client';

import { FormEvent, useState } from 'react';
import type {
  ActivityOption,
  CategoryAggregation,
  CategoryInput,
  CategoryWeightMode,
  ComponentInput,
  ComponentType,
  ComponentWeightMode,
  FinalScale,
  GradeCategory,
  GradeComponent,
  Gradebook,
  GradebookInput,
  GradeScenario,
  GradingScale,
  ScenarioInput,
  ScoreStatus,
} from './types';
import { DEFAULT_LETTER_BOUNDS, previewThresholds } from './letterGrades';

function optionalNumber(value: string): number | undefined {
  if (value.trim() === '') return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

interface FormActionsProps {
  busy: boolean;
  editing: boolean;
  onCancel?: () => void;
}

function FormActions({ busy, editing, onCancel }: FormActionsProps) {
  return (
    <div className="grade-form-actions">
      {onCancel && (
        <button type="button" className="ghost-action" onClick={onCancel}>
          Batal
        </button>
      )}
      <button type="submit" className="primary-action grade-primary" disabled={busy}>
        {busy ? 'Menyimpan...' : editing ? 'Simpan perubahan' : 'Tambahkan'}
      </button>
    </div>
  );
}

export function GradebookForm({
  initial,
  busy,
  onSubmit,
  onCancel,
}: {
  initial?: Gradebook;
  busy: boolean;
  onSubmit: (input: GradebookInput) => Promise<void>;
  onCancel?: () => void;
}) {
  const [courseName, setCourseName] = useState(initial?.courseName ?? '');
  const [courseCode, setCourseCode] = useState(initial?.courseCode ?? '');
  const [courseId, setCourseId] = useState(initial?.courseId ?? '');
  const [semester, setSemester] = useState(initial?.semester ?? '');
  const [gradingScale, setGradingScale] = useState<GradingScale>(
    initial?.gradingScale ?? 'percentage'
  );
  const [targetScore, setTargetScore] = useState(
    initial?.targetScore === null || initial?.targetScore === undefined
      ? ''
      : String(initial.targetScore)
  );
  const [capFinalScoreAt100, setCapFinalScoreAt100] = useState(
    initial?.capFinalScoreAt100 ?? false
  );
  const [credits, setCredits] = useState(
    initial?.credits ? String(initial.credits) : ''
  );
  const [finalScale, setFinalScale] = useState<FinalScale>(
    initial?.finalScale ?? 'hundred'
  );
  const initialBounds = initial?.letterBounds ?? DEFAULT_LETTER_BOUNDS[finalScale];
  const [aMin, setAMin] = useState(String(initialBounds.aMin));
  const [cMin, setCMin] = useState(String(initialBounds.cMin));
  const preview = previewThresholds(Number(aMin), Number(cMin));

  function changeFinalScale(next: FinalScale) {
    setFinalScale(next);
    // Bounds are expressed in the scale's own units, so reset them.
    setAMin(String(DEFAULT_LETTER_BOUNDS[next].aMin));
    setCMin(String(DEFAULT_LETTER_BOUNDS[next].cMin));
    if (next === 'four') setGradingScale('points');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSubmit({
      courseName,
      courseCode: courseCode || undefined,
      courseId: courseId || undefined,
      semester: semester || undefined,
      gradingScale,
      targetScore: targetScore === '' ? null : optionalNumber(targetScore),
      capFinalScoreAt100,
      credits: credits === '' ? null : optionalNumber(credits),
      finalScale,
      letterBounds: { aMin: Number(aMin), cMin: Number(cMin) },
    });
  }

  return (
    <form className="grade-form" onSubmit={submit}>
      <div className="grade-form-grid">
        <label className="grade-field grade-field-wide">
          <span>Nama mata kuliah</span>
          <input
            value={courseName}
            onChange={(event) => setCourseName(event.target.value)}
            maxLength={120}
            required
          />
        </label>
        <label className="grade-field">
          <span>Kode mata kuliah</span>
          <input
            value={courseCode}
            onChange={(event) => setCourseCode(event.target.value)}
            maxLength={40}
            placeholder="Opsional"
          />
        </label>
        <label className="grade-field">
          <span>Semester</span>
          <input
            value={semester}
            onChange={(event) => setSemester(event.target.value)}
            maxLength={60}
            placeholder="Contoh: 2026/2027 Ganjil"
          />
        </label>
        <label className="grade-field">
          <span>Moodle course ID</span>
          <input
            value={courseId}
            onChange={(event) => setCourseId(event.target.value)}
            maxLength={128}
            placeholder="Opsional"
          />
        </label>
        <label className="grade-field">
          <span>SKS</span>
          <input
            type="number"
            min="1"
            max="24"
            step="1"
            value={credits}
            onChange={(event) => setCredits(event.target.value)}
            placeholder="Untuk hitung IP"
          />
        </label>
        <label className="grade-field">
          <span>Skala nilai akhir</span>
          <select
            value={finalScale}
            onChange={(event) => changeFinalScale(event.target.value as FinalScale)}
          >
            <option value="hundred">0–100</option>
            <option value="four">Desimal 0.0–4.0</option>
          </select>
        </label>
        {finalScale === 'hundred' && (
          <label className="grade-field">
            <span>Mode nilai komponen</span>
            <select
              value={gradingScale}
              onChange={(event) =>
                setGradingScale(event.target.value as GradingScale)
              }
            >
              <option value="percentage">Persentase</option>
              <option value="points">Poin</option>
            </select>
          </label>
        )}
        <label className="grade-field">
          <span>Batas bawah A</span>
          <input
            type="number"
            min="0"
            max={finalScale === 'four' ? 4.4 : 110}
            step="0.01"
            value={aMin}
            onChange={(event) => setAMin(event.target.value)}
            required
          />
        </label>
        <label className="grade-field">
          <span>Batas bawah C</span>
          <input
            type="number"
            min="0"
            max={finalScale === 'four' ? 4.4 : 110}
            step="0.01"
            value={cMin}
            onChange={(event) => setCMin(event.target.value)}
            required
          />
        </label>
        <label className="grade-field">
          <span>Target nilai akhir</span>
          <input
            type="number"
            min="0"
            max="100"
            step="0.01"
            value={targetScore}
            onChange={(event) => setTargetScore(event.target.value)}
            placeholder="Belum ditetapkan"
          />
        </label>
      </div>
      <label className="grade-check">
        <input
          type="checkbox"
          checked={capFinalScoreAt100}
          onChange={(event) => setCapFinalScoreAt100(event.target.checked)}
        />
        <span>Batasi nilai akhir maksimal 100</span>
      </label>
      <p className="grade-form-note">
        Default tidak dibatasi agar kontribusi bonus tidak tersembunyi.
      </p>
      {finalScale === 'four' && (
        <p className="grade-form-note">
          Skala desimal: isi nilai tiap komponen/kategori dalam 0.0–4.0 (poin dari 4). Nilai akhir
          ditampilkan dalam 0.0–4.0.
        </p>
      )}
      {preview ? (
        <div className="grade-letter-preview" aria-label="Pratinjau batas huruf mutu">
          {preview.map(({ letter, min }) => (
            <span key={letter}>
              <strong>{letter}</strong> ≥ {min.toLocaleString('id-ID')}
            </span>
          ))}
        </div>
      ) : (
        <p className="form-error">Batas A harus lebih tinggi dari batas C.</p>
      )}
      <FormActions busy={busy} editing={Boolean(initial)} onCancel={onCancel} />
    </form>
  );
}

export function CategoryForm({
  initial,
  busy,
  onSubmit,
  onCancel,
}: {
  initial?: GradeCategory;
  busy: boolean;
  onSubmit: (input: CategoryInput) => Promise<void>;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [weightMode, setWeightMode] = useState<CategoryWeightMode>(
    initial?.weightMode ?? 'unknown'
  );
  const [weight, setWeight] = useState(
    initial?.weight === null || initial?.weight === undefined
      ? ''
      : String(initial.weight)
  );
  const [aggregation, setAggregation] = useState<CategoryAggregation>(
    initial?.aggregation ?? 'simple_mean'
  );
  const [dropLowestCount, setDropLowestCount] = useState(
    String(initial?.dropLowestCount ?? 0)
  );
  const [optional, setOptional] = useState(initial?.optional ?? false);
  const [order, setOrder] = useState(String(initial?.order ?? 0));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSubmit({
      name,
      description: description || undefined,
      weightMode,
      weight: weightMode === 'fixed' ? optionalNumber(weight) : undefined,
      aggregation,
      dropLowestCount: optionalNumber(dropLowestCount) ?? 0,
      optional,
      order: optionalNumber(order) ?? 0,
    });
  }

  return (
    <form className="grade-form" onSubmit={submit}>
      <div className="grade-form-grid">
        <label className="grade-field">
          <span>Nama kategori</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={100}
            required
          />
        </label>
        <label className="grade-field">
          <span>Mode bobot</span>
          <select
            value={weightMode}
            onChange={(event) =>
              setWeightMode(event.target.value as CategoryWeightMode)
            }
          >
            <option value="fixed">Fixed</option>
            <option value="derived">Dari komponen</option>
            <option value="unknown">Belum diketahui</option>
          </select>
        </label>
        {weightMode === 'fixed' && (
          <label className="grade-field">
            <span>Bobot kategori (%)</span>
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={weight}
              onChange={(event) => setWeight(event.target.value)}
              required
            />
          </label>
        )}
        <label className="grade-field">
          <span>Agregasi</span>
          <select
            value={aggregation}
            onChange={(event) =>
              setAggregation(event.target.value as CategoryAggregation)
            }
          >
            <option value="simple_mean">Rata-rata sederhana</option>
            <option value="weighted_mean">Rata-rata berbobot</option>
            <option value="sum_points">Jumlah poin</option>
          </select>
        </label>
        <label className="grade-field">
          <span>Drop nilai terendah</span>
          <input
            type="number"
            min="0"
            step="1"
            value={dropLowestCount}
            onChange={(event) => setDropLowestCount(event.target.value)}
          />
        </label>
        <label className="grade-field">
          <span>Urutan</span>
          <input
            type="number"
            min="0"
            step="1"
            value={order}
            onChange={(event) => setOrder(event.target.value)}
          />
        </label>
        <label className="grade-field grade-field-wide">
          <span>Deskripsi</span>
          <input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={500}
            placeholder="Opsional"
          />
        </label>
      </div>
      <label className="grade-check">
        <input
          type="checkbox"
          checked={optional}
          onChange={(event) => setOptional(event.target.checked)}
        />
        <span>Kategori opsional</span>
      </label>
      <FormActions busy={busy} editing={Boolean(initial)} onCancel={onCancel} />
    </form>
  );
}

export function ComponentForm({
  initial,
  gradebook,
  categories,
  activities,
  busy,
  onSubmit,
  onCancel,
}: {
  initial?: GradeComponent;
  gradebook: Gradebook;
  categories: GradeCategory[];
  activities: ActivityOption[];
  busy: boolean;
  onSubmit: (input: ComponentInput) => Promise<void>;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? '');
  const [componentType, setComponentType] = useState<ComponentType>(
    initial?.componentType ?? 'assignment'
  );
  const [weightMode, setWeightMode] = useState<ComponentWeightMode>(
    initial?.weightMode ?? 'unknown'
  );
  const [weight, setWeight] = useState(
    initial?.weight === null || initial?.weight === undefined
      ? ''
      : String(initial.weight)
  );
  const [maxScore, setMaxScore] = useState(
    initial?.maxScore === null || initial?.maxScore === undefined
      ? gradebook.finalScale === 'four' ? '4' : ''
      : String(initial.maxScore)
  );
  const [earnedScore, setEarnedScore] = useState(
    initial?.earnedScore === null || initial?.earnedScore === undefined
      ? ''
      : String(initial.earnedScore)
  );
  const [scoreStatus, setScoreStatus] = useState<ScoreStatus>(
    initial?.scoreStatus ?? 'pending'
  );
  const [isBonus, setIsBonus] = useState(initial?.isBonus ?? false);
  const [isOptional, setIsOptional] = useState(initial?.isOptional ?? false);
  const [isDropped, setIsDropped] = useState(initial?.isDropped ?? false);
  const [linkedActivityId, setLinkedActivityId] = useState(
    initial?.linkedActivityId ?? ''
  );
  const [dueDate, setDueDate] = useState(
    initial?.dueDate ? initial.dueDate.slice(0, 10) : ''
  );
  const [order, setOrder] = useState(String(initial?.order ?? 0));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSubmit({
      name,
      description: description || undefined,
      categoryId: categoryId || null,
      componentType: isBonus ? 'bonus' : componentType,
      weightMode,
      weight: weightMode === 'fixed' ? optionalNumber(weight) : undefined,
      maxScore: maxScore === '' ? null : optionalNumber(maxScore),
      earnedScore:
        scoreStatus === 'known' ? (optionalNumber(earnedScore) ?? null) : null,
      scoreStatus,
      isBonus,
      isOptional,
      isDropped,
      replacementForComponentId: initial?.replacementForComponentId ?? null,
      linkedActivityId: linkedActivityId || null,
      dueDate: dueDate || null,
      order: optionalNumber(order) ?? 0,
    });
  }

  const linkedStillAvailable =
    !initial?.linkedActivityId ||
    activities.some(
      (activity) => activity.activityId === initial.linkedActivityId
    );

  return (
    <form className="grade-form" onSubmit={submit}>
      <div className="grade-form-grid">
        <label className="grade-field grade-field-wide">
          <span>Nama komponen</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={120}
            required
          />
        </label>
        <label className="grade-field">
          <span>Kategori</span>
          <select
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
          >
            <option value="">Tanpa kategori</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grade-field">
          <span>Jenis</span>
          <select
            value={componentType}
            onChange={(event) =>
              setComponentType(event.target.value as ComponentType)
            }
            disabled={isBonus}
          >
            <option value="assignment">Tugas</option>
            <option value="quiz">Kuis</option>
            <option value="exam">Ujian</option>
            <option value="project">Proyek</option>
            <option value="participation">Partisipasi</option>
            <option value="lab">Lab</option>
            <option value="other">Lainnya</option>
          </select>
        </label>
        <label className="grade-field">
          <span>Mode bobot</span>
          <select
            value={weightMode}
            onChange={(event) =>
              setWeightMode(event.target.value as ComponentWeightMode)
            }
          >
            <option value="fixed">Fixed</option>
            <option value="equal_in_category">Sama rata dalam kategori</option>
            <option value="unknown">Belum diketahui</option>
          </select>
        </label>
        {weightMode === 'fixed' && (
          <label className="grade-field">
            <span>Bobot (%)</span>
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={weight}
              onChange={(event) => setWeight(event.target.value)}
              required
            />
          </label>
        )}
        <label className="grade-field">
          <span>Status nilai</span>
          <select
            value={scoreStatus}
            onChange={(event) =>
              setScoreStatus(event.target.value as ScoreStatus)
            }
          >
            <option value="pending">Belum tersedia</option>
            <option value="known">Sudah diketahui</option>
            <option value="not_applicable">Tidak berlaku</option>
            <option value="excluded">Dikeluarkan</option>
          </select>
        </label>
        {gradebook.gradingScale === 'points' && (
          <label className="grade-field">
            <span>Nilai maksimum</span>
            <input
              type="number"
              min="0.000001"
              step="0.01"
              value={maxScore}
              onChange={(event) => setMaxScore(event.target.value)}
              required={scoreStatus === 'known'}
            />
          </label>
        )}
        {scoreStatus === 'known' && (
          <label className="grade-field">
            <span>
              Nilai diperoleh {gradebook.gradingScale === 'percentage' ? '(%)' : ''}
            </span>
            <input
              type="number"
              min="0"
              max={!isBonus && gradebook.gradingScale === 'percentage' ? '100' : undefined}
              step="0.01"
              value={earnedScore}
              onChange={(event) => setEarnedScore(event.target.value)}
              required
            />
          </label>
        )}
        <label className="grade-field">
          <span>Activity SCELE</span>
          <select
            value={linkedActivityId}
            onChange={(event) => setLinkedActivityId(event.target.value)}
          >
            <option value="">Tidak dihubungkan</option>
            {!linkedStillAvailable && initial?.linkedActivityId && (
              <option value={initial.linkedActivityId}>
                Activity tersimpan (tidak aktif di timeline)
              </option>
            )}
            {activities.map((activity) => (
              <option key={activity.activityId} value={activity.activityId}>
                {activity.course} — {activity.title}
                {activity.lifecycleState === 'missing' ? ' (missing)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="grade-field">
          <span>Tanggal</span>
          <input
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
          />
        </label>
        <label className="grade-field">
          <span>Urutan</span>
          <input
            type="number"
            min="0"
            step="1"
            value={order}
            onChange={(event) => setOrder(event.target.value)}
          />
        </label>
        <label className="grade-field grade-field-wide">
          <span>Deskripsi</span>
          <input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={500}
            placeholder="Opsional"
          />
        </label>
      </div>
      <div className="grade-check-row">
        <label className="grade-check">
          <input
            type="checkbox"
            checked={isBonus}
            onChange={(event) => {
              const checked = event.target.checked;
              setIsBonus(checked);
              setComponentType((current) =>
                checked ? 'bonus' : current === 'bonus' ? 'other' : current
              );
            }}
          />
          <span>Bonus</span>
        </label>
        <label className="grade-check">
          <input
            type="checkbox"
            checked={isOptional}
            onChange={(event) => setIsOptional(event.target.checked)}
          />
          <span>Opsional</span>
        </label>
        <label className="grade-check">
          <input
            type="checkbox"
            checked={isDropped}
            onChange={(event) => setIsDropped(event.target.checked)}
          />
          <span>Dropped manual</span>
        </label>
      </div>
      <p className="grade-form-note">
        Link SCELE hanya untuk referensi tugas/deadline; nilai tidak pernah diambil otomatis.
      </p>
      <FormActions busy={busy} editing={Boolean(initial)} onCancel={onCancel} />
    </form>
  );
}

export function ScenarioForm({
  initial,
  pendingComponents,
  busy,
  onSubmit,
  onCancel,
}: {
  initial?: GradeScenario;
  pendingComponents: GradeComponent[];
  busy: boolean;
  onSubmit: (input: ScenarioInput) => Promise<void>;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [targetScore, setTargetScore] = useState(
    initial?.targetScore === null || initial?.targetScore === undefined
      ? ''
      : String(initial.targetScore)
  );
  const [assumptions, setAssumptions] = useState<Record<string, string>>(
    Object.fromEntries(
      (initial?.assumptions ?? []).map((assumption) => [
        assumption.componentId,
        String(assumption.assumedScore),
      ])
    )
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSubmit({
      name,
      targetScore: targetScore === '' ? null : optionalNumber(targetScore),
      assumptions: pendingComponents.flatMap((component) => {
        const value = assumptions[component.id]?.trim();
        return value
          ? [{ componentId: component.id, assumedScore: Number(value) }]
          : [];
      }),
    });
  }

  return (
    <form className="grade-form" onSubmit={submit}>
      <div className="grade-form-grid">
        <label className="grade-field">
          <span>Nama skenario</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={100}
            required
          />
        </label>
        <label className="grade-field">
          <span>Target khusus skenario</span>
          <input
            type="number"
            min="0"
            max="100"
            step="0.01"
            value={targetScore}
            onChange={(event) => setTargetScore(event.target.value)}
            placeholder="Gunakan target gradebook"
          />
        </label>
      </div>
      <div className="scenario-assumptions">
        {pendingComponents.length === 0 ? (
          <p className="grade-form-note">Tidak ada komponen pending untuk disimulasikan.</p>
        ) : (
          pendingComponents.map((component) => (
            <label className="grade-field" key={component.id}>
              <span>
                Asumsi {component.name} {component.isBonus ? '(bonus)' : ''}
              </span>
              <input
                type="number"
                min="0"
                max={component.isBonus ? '1000' : '100'}
                step="0.01"
                value={assumptions[component.id] ?? ''}
                onChange={(event) =>
                  setAssumptions((current) => ({
                    ...current,
                    [component.id]: event.target.value,
                  }))
                }
                placeholder="Kosongkan bila tidak diasumsikan"
              />
            </label>
          ))
        )}
      </div>
      <p className="grade-form-note">
        Asumsi hanya memengaruhi proyeksi skenario, bukan nilai aktual komponen.
      </p>
      <FormActions busy={busy} editing={Boolean(initial)} onCancel={onCancel} />
    </form>
  );
}
