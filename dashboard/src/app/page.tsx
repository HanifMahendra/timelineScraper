import { getTimeline } from '@/lib/getTimeline';
import DashboardClient from './DashboardClient';

export const dynamic = 'force-dynamic';

export default function Home() {
  let timeline;
  let error: string | null = null;

  try {
    timeline = getTimeline();
  } catch (e) {
    error = e instanceof Error ? e.message : 'Gagal memuat data.';
    timeline = { today: [], upcoming: [], overdue: [] };
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">SCELE Timeline</h1>
            <p className="text-xs text-slate-400 mt-0.5">cs.ui.ac.id</p>
          </div>
          <span className="text-xs text-slate-400 hidden sm:block">
            Diperbarui otomatis 2x sehari
          </span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <strong>Gagal memuat data:</strong> {error}. Pastikan{' '}
            <code className="font-mono text-xs bg-red-100 px-1 rounded">data/timeline.json</code>{' '}
            sudah ada.
          </div>
        )}

        <DashboardClient timeline={timeline} />
      </main>
    </div>
  );
}
