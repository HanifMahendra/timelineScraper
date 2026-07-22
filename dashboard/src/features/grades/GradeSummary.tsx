import {
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  Sigma,
  Target,
} from 'lucide-react';
import type {
  GradeCategory,
  GradeComponent,
  GradeWarning,
  GradebookResult,
} from './types';

export function formatGradeNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('id-ID', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(value);
}

function targetLabel(status: GradebookResult['targetStatus']): string {
  const labels: Record<GradebookResult['targetStatus'], string> = {
    not_set: 'Target belum ditetapkan',
    already_achieved: 'Target sudah tercapai',
    reachable: 'Target masih dapat dicapai',
    requires_perfect_score: 'Membutuhkan nilai sempurna',
    impossible: 'Target tidak mungkin dicapai',
    indeterminate: 'Belum dapat dipastikan',
  };
  return labels[status];
}

function warningLabel(
  warning: GradeWarning,
  componentById: Map<string, GradeComponent>,
  categoryById: Map<string, GradeCategory>
): string {
  const component = warning.componentId
    ? componentById.get(warning.componentId)?.name
    : undefined;
  const category = warning.categoryId
    ? categoryById.get(warning.categoryId)?.name
    : undefined;
  const subject = component || category;
  const labels: Record<string, string> = {
    UNKNOWN_WEIGHT: `Bobot${subject ? ` ${subject}` : ''} belum diketahui.`,
    TOTAL_WEIGHT_BELOW_100: `Total bobot baru ${formatGradeNumber(warning.total)}%.`,
    TOTAL_WEIGHT_ABOVE_100: `Total bobot ${formatGradeNumber(warning.total)}% melebihi 100%.`,
    PENDING_SCORE: `Nilai${subject ? ` ${subject}` : ''} belum tersedia.`,
    INVALID_MAX_SCORE: `${subject || 'Komponen'} belum memiliki nilai maksimum yang valid.`,
    TARGET_INDETERMINATE: 'Target belum dapat dipastikan karena bobot belum lengkap.',
    TARGET_IMPOSSIBLE: 'Target melampaui nilai maksimum dari bobot yang tersisa.',
    INSUFFICIENT_COMPONENTS_FOR_DROP: `Komponen bernilai pada ${subject || 'kategori'} belum cukup untuk drop lowest.`,
    SCORE_ABOVE_MAX: `${subject || 'Nilai'} melebihi 100; periksa kebijakan bonus.`,
    CATEGORY_WEIGHT_UNALLOCATED: `Sebagian bobot ${subject || 'kategori'} belum dialokasikan.`,
    CATEGORY_COMPONENT_WEIGHT_ABOVE_100: `Bobot komponen ${subject || 'kategori'} melebihi 100%.`,
    UNKNOWN_CATEGORY: `${subject || 'Komponen'} merujuk kategori yang tidak aktif.`,
    EMPTY_CATEGORY: `${subject || 'Kategori'} belum memiliki komponen aktif.`,
  };
  return labels[warning.code] || `Peringatan perhitungan: ${warning.code}`;
}

function sourceLabel(source: string | undefined): string {
  if (source === 'actual') return 'Aktual';
  if (source === 'assumed') return 'Asumsi';
  if (source === 'pending') return 'Pending';
  if (source === 'invalid') return 'Tidak valid';
  return 'Dikeluarkan';
}

export default function GradeSummary({
  result,
  categories,
  components,
  scenario = false,
}: {
  result: GradebookResult;
  categories: GradeCategory[];
  components: GradeComponent[];
  scenario?: boolean;
}) {
  const componentById = new Map(
    components.map((component) => [component.id, component])
  );
  const categoryById = new Map(
    categories.map((category) => [category.id, category])
  );
  const warningMessages = [
    ...new Set(
      result.warnings.map((warning) =>
        warningLabel(warning, componentById, categoryById)
      )
    ),
  ];

  return (
    <div className="grade-summary-stack">
      <div className="grade-metrics">
        <article className="grade-metric">
          <span>Nilai terkumpul terhadap final</span>
          <strong>{formatGradeNumber(result.currentWeightedScore)} / 100</strong>
          {result.bonusContribution !== 0 && (
            <small>
              Termasuk bonus {formatGradeNumber(result.bonusContribution)}
            </small>
          )}
        </article>
        <article className="grade-metric">
          <span>Rata-rata komponen yang dinilai</span>
          <strong>
            {formatGradeNumber(result.currentAverageOnGradedWeight)} / 100
          </strong>
          <small>Dari bobot {formatGradeNumber(result.gradedWeight)}%</small>
        </article>
        <article className="grade-metric">
          <span>Bobot tersisa yang diketahui</span>
          <strong>{formatGradeNumber(result.remainingKnownWeight)}%</strong>
          <small>
            {result.unknownWeightItemCount > 0
              ? `${result.unknownWeightItemCount} bobot belum diketahui`
              : 'Tidak ada bobot unknown'}
          </small>
        </article>
        {scenario && (
          <article className="grade-metric grade-metric-projected">
            <span>Proyeksi skenario</span>
            <strong>{formatGradeNumber(result.projectedFinalScore)} / 100</strong>
            <small>
              Asumsi berkontribusi {formatGradeNumber(result.scenarioContribution)}
            </small>
          </article>
        )}
      </div>

      <section className={`grade-target grade-target-${result.targetStatus}`}>
        <div className="grade-target-icon">
          <Target size={18} aria-hidden="true" />
        </div>
        <div>
          <span>Target nilai</span>
          <h3>{targetLabel(result.targetStatus)}</h3>
          {result.targetScore !== null && (
            <p>Target: {formatGradeNumber(result.targetScore)} / 100</p>
          )}
          {result.targetCalculation.requiredAverage !== null && (
            <p>
              Rata-rata yang dibutuhkan pada bobot tersisa:{' '}
              <strong>
                {formatGradeNumber(result.targetCalculation.requiredAverage)}
              </strong>
            </p>
          )}
          {result.targetCalculation.conditional && (
            <p className="grade-conditional">
              Perhitungan ini bersyarat; bobot unknown belum ikut ditentukan.
            </p>
          )}
          {result.targetCalculation.formula && (
            <code>{result.targetCalculation.formula}</code>
          )}
        </div>
      </section>

      {warningMessages.length > 0 && (
        <section className="grade-warnings" aria-label="Peringatan nilai">
          <div className="grade-section-title">
            <AlertTriangle size={16} aria-hidden="true" />
            <h3>Data yang perlu diperhatikan</h3>
          </div>
          <ul>
            {warningMessages.slice(0, 12).map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </section>
      )}

      {result.categoryResults.length > 0 && (
        <section className="grade-category-results">
          <div className="grade-section-title">
            <Sigma size={16} aria-hidden="true" />
            <h3>Ringkasan kategori</h3>
          </div>
          <div className="grade-category-result-grid">
            {result.categoryResults.map((categoryResult) => {
              const category = categoryById.get(categoryResult.categoryId);
              return (
                <article key={categoryResult.categoryId}>
                  <span>{category?.name ?? 'Kategori'}</span>
                  <strong>{formatGradeNumber(categoryResult.score)}</strong>
                  <small>
                    {categoryResult.gradedComponentCount} dinilai ·{' '}
                    {categoryResult.pendingComponentCount} pending
                  </small>
                  {categoryResult.dropped.length > 0 && (
                    <small>
                      {categoryResult.dropped.length} komponen dikeluarkan
                    </small>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}

      <section className="grade-breakdown">
        <div className="grade-section-title">
          <CircleHelp size={16} aria-hidden="true" />
          <h3>Breakdown perhitungan</h3>
        </div>
        {result.breakdown.length === 0 ? (
          <p className="grade-empty-copy">Belum ada komponen untuk dihitung.</p>
        ) : (
          <div className="grade-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Komponen</th>
                  <th>Sumber</th>
                  <th>Nilai</th>
                  <th>Bobot efektif</th>
                  <th>Kontribusi</th>
                </tr>
              </thead>
              <tbody>
                {result.breakdown.map((item) => (
                  <tr key={item.componentId}>
                    <td>
                      <strong>{item.name}</strong>
                      {item.isBonus && <small>Bonus</small>}
                      {!item.included && <small>{item.reason}</small>}
                    </td>
                    <td>
                      <span className={`grade-source grade-source-${item.source ?? 'excluded'}`}>
                        {sourceLabel(item.source)}
                      </span>
                    </td>
                    <td>{formatGradeNumber(item.normalizedScore)}</td>
                    <td>
                      {!item.included
                        ? '—'
                        : item.effectiveWeight === null ||
                            item.effectiveWeight === undefined
                          ? 'Unknown'
                          : `${formatGradeNumber(item.effectiveWeight)}%`}
                    </td>
                    <td>{formatGradeNumber(item.contribution)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {result.isComplete && (
        <div className="grade-complete-note">
          <CheckCircle2 size={15} aria-hidden="true" />
          Semua bobot yang diketahui sudah memiliki nilai.
        </div>
      )}
    </div>
  );
}
