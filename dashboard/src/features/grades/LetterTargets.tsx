'use client';

import { Target } from 'lucide-react';
import type { LetterSummary } from './types';
import { PASSING_LETTERS, formatScaleNumber, letterTargetLabel } from './letterGrades';

export default function LetterTargets({ letters }: { letters: LetterSummary }) {
  const targets = letters.targets.filter((target) => PASSING_LETTERS.includes(target.letter));
  return (
    <section className="grade-panel">
      <div className="grade-panel-heading">
        <div>
          <span>Huruf mutu</span>
          <h3>Target per huruf</h3>
        </div>
        <Target size={18} aria-hidden="true" />
      </div>

      <div className="letter-metrics">
        <div>
          <span>Nilai terkumpul</span>
          <strong>
            {formatScaleNumber(letters.currentScore)}
            <small> / {letters.scaleMax}</small>
          </strong>
        </div>
        <div>
          <span>{letters.currentLetter ? 'Huruf akhir' : 'Minimal pasti dapat'}</span>
          <strong>{letters.currentLetter ?? letters.guaranteedLetter ?? '—'}</strong>
        </div>
        <div>
          <span>Maksimal masih bisa</span>
          <strong>{letters.bestPossibleLetter ?? '—'}</strong>
        </div>
      </div>

      {letters.hasUnknownWeight && (
        <p className="grade-form-note">
          Masih ada komponen tanpa kategori atau kategori tanpa bobot. Masukkan setiap komponen
          (termasuk yang dari SCELE) ke kategori dan isi bobot kategori agar target bisa dihitung.
        </p>
      )}

      <ul className="letter-target-list">
        {targets.map((target) => (
          <li key={target.letter} className={`letter-target letter-target-${target.status}`}>
            <strong>{target.letter}</strong>
            <span className="letter-target-min">≥ {formatScaleNumber(target.min)}</span>
            <span>{letterTargetLabel(target)}</span>
          </li>
        ))}
      </ul>
      <p className="grade-form-note">
        &quot;Butuh rata-rata&quot; adalah nilai rata-rata yang perlu kamu dapat di semua komponen yang
        belum dinilai (bobot tersisa).
      </p>
    </section>
  );
}
