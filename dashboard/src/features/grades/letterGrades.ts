import type { FinalScale, LetterGrade, LetterTarget } from './types';

// Mirrors timeline-scele-auth/src/grades/gradeLetters.js for form previews;
// the backend remains the source of every calculated result.
export const PASSING_LETTERS: LetterGrade[] = ['A', 'A-', 'B+', 'B', 'B-', 'C+', 'C'];

export const DEFAULT_LETTER_BOUNDS: Record<FinalScale, { aMin: number; cMin: number }> = {
  hundred: { aMin: 85, cMin: 55 },
  four: { aMin: 3.33, cMin: 2 },
};

export function previewThresholds(aMin: number, cMin: number) {
  if (!Number.isFinite(aMin) || !Number.isFinite(cMin) || aMin <= cMin) return null;
  const step = (aMin - cMin) / (PASSING_LETTERS.length - 1);
  return PASSING_LETTERS.map((letter, index) => ({
    letter,
    min: Math.round((aMin - step * index) * 1000) / 1000,
  }));
}

export function formatScaleNumber(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return value.toLocaleString('id-ID', { maximumFractionDigits: 2 });
}

export function letterTargetLabel(target: LetterTarget): string {
  switch (target.status) {
    case 'already_achieved':
      return 'Sudah aman';
    case 'reachable':
      return `Butuh rata-rata ${formatScaleNumber(target.requiredAverageInScale)}`;
    case 'requires_perfect_score':
      return 'Butuh nilai sempurna';
    case 'impossible':
      return 'Tidak mungkin lagi';
    default:
      return 'Lengkapi bobot dulu';
  }
}
