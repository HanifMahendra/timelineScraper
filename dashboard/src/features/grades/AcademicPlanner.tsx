'use client';

import { FormEvent, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { GraduationCap } from 'lucide-react';
import { getAcademicPlan, saveAcademicProfile } from './gradeApi';
import type { AcademicProfile, SemesterPlan } from './types';
import { formatScaleNumber } from './letterGrades';
import { displayApiError } from '@/lib/apiErrors';

type ProfileFields = Record<keyof AcademicProfile, string>;

const EMPTY_FIELDS: ProfileFields = { previousGpa: '', previousCredits: '', targetGpa: '', targetSemesterGpa: '' };

function toFields(profile: AcademicProfile): ProfileFields {
  return Object.fromEntries(
    Object.entries(profile).map(([key, value]) => [key, value === null ? '' : String(value)])
  ) as ProfileFields;
}

function toProfile(fields: ProfileFields): AcademicProfile {
  const number = (value: string) => (value.trim() === '' ? null : Number(value.replace(',', '.')));
  return {
    previousGpa: number(fields.previousGpa),
    previousCredits: number(fields.previousCredits),
    targetGpa: number(fields.targetGpa),
    targetSemesterGpa: number(fields.targetSemesterGpa),
  };
}

function ip(value: number | null | undefined) {
  return value === null || value === undefined ? '—' : value.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function statusMessage(plan: SemesterPlan): string {
  switch (plan.status) {
    case 'no_courses':
      return 'Belum ada mata kuliah semester ini yang punya SKS. Isi SKS di tiap gradebook (Edit → SKS).';
    case 'no_target':
      return 'Isi target IPK (beserta IPK & SKS sebelumnya) atau target IP semester untuk melihat rencana.';
    case 'impossible':
      return `Target belum mungkin tercapai: IP maksimal yang masih bisa diraih ${ip(plan.maxIp)}, sedangkan dibutuhkan ${ip(plan.requiredIp)}.`;
    case 'already_guaranteed':
      return 'Target sudah aman dengan nilai yang terkumpul sekarang.';
    default:
      return 'Kombinasi huruf paling ringan untuk mencapai target:';
  }
}

export default function AcademicPlanner({ user, refreshKey }: { user: User; refreshKey: unknown }) {
  const [fields, setFields] = useState<ProfileFields>(EMPTY_FIELDS);
  const [plan, setPlan] = useState<SemesterPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await getAcademicPlan(await user.getIdToken());
        if (!active) return;
        setFields(toFields(response.profile));
        setPlan(response.plan);
        setError(null);
      } catch (loadError) {
        if (active) setError(displayApiError(loadError, 'Rencana IP gagal dimuat.'));
      }
    })();
    return () => {
      active = false;
    };
  }, [user, refreshKey]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const response = await saveAcademicProfile(await user.getIdToken(), toProfile(fields));
      setFields(toFields(response.profile));
      setPlan(response.plan);
    } catch (saveError) {
      setError(displayApiError(saveError, 'Profil akademik gagal disimpan.'));
    } finally {
      setSaving(false);
    }
  }

  const field = (key: keyof AcademicProfile, label: string, props: Record<string, string>) => (
    <label className="grade-field">
      <span>{label}</span>
      <input
        type="number"
        inputMode="decimal"
        value={fields[key]}
        onChange={(event) => setFields((current) => ({ ...current, [key]: event.target.value }))}
        {...props}
      />
    </label>
  );

  return (
    <section className="grade-panel academic-planner">
      <div className="grade-panel-heading">
        <div>
          <span>{plan?.semester ?? 'Semester ini'}</span>
          <h3>Rencana IP &amp; IPK</h3>
        </div>
        <GraduationCap size={18} aria-hidden="true" />
      </div>

      <form className="grade-form" onSubmit={submit}>
        <div className="grade-form-grid">
          {field('previousGpa', 'IPK sebelumnya', { min: '0', max: '4', step: '0.01', placeholder: 'Dari SIAK-NG' })}
          {field('previousCredits', 'SKS lulus sebelumnya', { min: '0', max: '300', step: '1', placeholder: 'Dari SIAK-NG' })}
          {field('targetGpa', 'Target IPK', { min: '0', max: '4', step: '0.01', placeholder: 'Contoh: 3.60' })}
          {field('targetSemesterGpa', 'atau target IP semester', { min: '0', max: '4', step: '0.01', placeholder: 'Opsional' })}
        </div>
        <div className="grade-form-actions">
          <button type="submit" className="primary-action grade-primary" disabled={saving}>
            {saving ? 'Menghitung…' : 'Simpan & hitung'}
          </button>
        </div>
      </form>

      {error && <div className="grade-error">{error}</div>}

      {plan && (
        <>
          <div className="letter-metrics">
            <div><span>SKS semester ini</span><strong>{plan.semesterCredits}</strong></div>
            <div><span>IP dibutuhkan</span><strong>{ip(plan.requiredIp)}</strong></div>
            <div><span>IP minimum pasti</span><strong>{ip(plan.guaranteedIp)}</strong></div>
            <div><span>IP maksimum mungkin</span><strong>{ip(plan.maxIp)}</strong></div>
          </div>

          <p className={`academic-plan-status academic-plan-${plan.status}`}>{statusMessage(plan)}</p>

          {plan.courses.length > 0 && (
            <ul className="academic-plan-list">
              {plan.courses.map((course) => (
                <li key={course.gradebookId}>
                  <div>
                    <strong>{course.courseName}</strong>
                    <span>
                      {course.credits} SKS · kemungkinan {course.guaranteedLetter} s.d. {course.bestPossibleLetter}
                    </span>
                  </div>
                  {plan.status === 'achievable' || plan.status === 'already_guaranteed' ? (
                    <div className="academic-plan-choice">
                      <strong>{course.letter}</strong>
                      <span>
                        {course.requiredAverage <= 0
                          ? 'sudah aman'
                          : `butuh rata-rata ${formatScaleNumber(course.requiredAverageInScale)}${course.estimated ? '*' : ''}`}
                      </span>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          {plan.courses.some((course) => course.estimated) && (
            <p className="grade-form-note">
              * Perkiraan: bobot mata kuliah ini belum lengkap, jadi dihitung seolah seluruh nilainya masih terbuka.
            </p>
          )}
          {plan.resultingIp !== undefined && (
            <p className="grade-form-note">
              Hasil kombinasi ini: IP {ip(plan.resultingIp)}
              {plan.resultingGpa !== null && plan.resultingGpa !== undefined ? ` · IPK ${ip(plan.resultingGpa)}` : ''}.
            </p>
          )}
          {plan.excluded.length > 0 && (
            <p className="grade-form-note">
              Tidak dihitung:{' '}
              {plan.excluded
                .map((item) => `${item.courseName} (${item.reason === 'NO_CREDITS' ? 'SKS belum diisi' : 'semester lain'})`)
                .join(', ')}
              .
            </p>
          )}
        </>
      )}
    </section>
  );
}
