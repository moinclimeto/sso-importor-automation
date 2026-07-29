import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, ArrowRight } from 'lucide-react';

const categories = [
  {
    type: 'purchase',
    title: 'Procurement',
    description: 'Purchase invoices from registered suppliers',
  },
  {
    type: 'sale',
    title: 'Post Consumer',
    description: 'Sales and post consumer documents',
  },
];

export default function DocProcessor() {
  const navigate = useNavigate();
  const [counts, setCounts] = useState({ purchase: 0, sale: 0 });

  useEffect(() => {
    const load = async () => {
      if (!window.pwp) return;
      try {
        const [purchases, sales] = await Promise.all([
          window.pwp.purchases.getAll(),
          window.pwp.sales.getAll(),
        ]);
        setCounts({
          purchase: purchases?.length || 0,
          sale: sales?.length || 0,
        });
      } catch {
        /* ignore */
      }
    };
    load();
  }, []);

  const totalRecords = counts.purchase + counts.sale;

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
          Records: <span className="ml-1 font-semibold text-slate-800">{totalRecords}</span>
        </span>
        <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
          Categories: <span className="ml-1 font-semibold text-slate-800">2</span>
        </span>
      </div>

      <div className="flex items-center justify-between pt-1">
        <p className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
          Document Categories
        </p>
        <p className="text-xs text-slate-400">2 folders</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {categories.map((cat) => {
          const count = counts[cat.type] || 0;
          return (
            <div
              key={cat.type}
              className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50 text-green-600 flex-shrink-0">
                    <Package size={18} />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-base font-bold text-slate-900">{cat.title}</h2>
                    <p className="text-sm text-slate-500 mt-0.5 leading-snug">{cat.description}</p>
                  </div>
                </div>
                <span className="flex-shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                  {count} records
                </span>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-2 border-t border-slate-100 pt-4">
                <div>
                  <p className="text-lg font-bold text-slate-900">{count}</p>
                  <p className="text-xs text-slate-400">Extracted</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-slate-900">0</p>
                  <p className="text-xs text-slate-400">Cached</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-slate-900">0</p>
                  <p className="text-xs text-slate-400">Failed</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => navigate('/doc-table', { state: { type: cat.type } })}
                className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-green-600 hover:text-green-700"
              >
                View table
                <ArrowRight size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
