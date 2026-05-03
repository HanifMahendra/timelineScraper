import AuthGate from '@/components/AuthGate';

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">SCELE Timeline</h1>
            <p className="text-xs text-slate-400 mt-0.5">cs.ui.ac.id</p>
          </div>
          <span className="text-xs text-slate-400 hidden sm:block">
            Data diambil langsung dari SCELE
          </span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        <AuthGate />
      </main>
    </div>
  );
}
