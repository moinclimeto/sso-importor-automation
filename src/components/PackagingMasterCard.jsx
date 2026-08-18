import { ArrowRight, Package } from 'lucide-react'

export default function PackagingMasterCard({ savedCount = 0, pendingCount = 0, onOpen }) {
  return (
    <article className="ops-folder-card group flex h-full flex-col overflow-hidden">
      <div className="h-[3px] shrink-0 bg-gradient-to-r from-amber-400 via-amber-500 to-orange-500" />

      <button
        type="button"
        onClick={onOpen}
        className="flex flex-1 flex-col p-4 text-left sm:p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500/25 to-orange-500/10 text-amber-600">
              <Package className="h-5 w-5" strokeWidth={1.75} />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-semibold tracking-tight text-slate-800 sm:text-[1.05rem]">
                Packaging Master
              </h3>
              <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500">
                Map invoice products to plastic category and material — auto-applies on extract
              </p>
            </div>
          </div>

          <span className="inline-flex shrink-0 items-center rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold tabular-nums text-amber-700">
            {savedCount} saved
          </span>
        </div>

        <div className="ops-tab-track ops-tab-track--2 mt-4">
          <span className="ops-tab-btn pointer-events-none">
            <span className="text-lg font-bold tabular-nums leading-none text-slate-800">
              {pendingCount}
            </span>
            <span>Pending</span>
          </span>
          <span className="ops-tab-btn pointer-events-none">
            <span className="text-lg font-bold tabular-nums leading-none text-slate-800">
              {savedCount}
            </span>
            <span>GPL / EPL</span>
          </span>
        </div>

        <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-climeto-green group-hover:gap-2 transition-all">
          Open master list
          <ArrowRight className="h-3.5 w-3.5" />
        </span>
      </button>
    </article>
  )
}
