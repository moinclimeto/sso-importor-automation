import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, ArrowRight, Zap, Folder, CheckCircle } from 'lucide-react';

const categories = [
  {
    type: 'purchase',
    title: 'Procurement',
    description: 'Purchase invoices from registered suppliers',
    color: 'from-emerald-500 to-teal-400',
    bgLight: 'bg-emerald-50',
    textDark: 'text-emerald-700',
    icon: Package
  },
  {
    type: 'sale',
    title: 'Post Consumer',
    description: 'Sales and post consumer documents',
    color: 'from-blue-500 to-indigo-400',
    bgLight: 'bg-blue-50',
    textDark: 'text-blue-700',
    icon: Folder
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
    <div className="space-y-6 max-w-6xl mx-auto py-2">
      {/* Sleek, Compact Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-green-50 text-green-600">
              <Zap size={16} />
            </div>
            <h1 className="text-xl font-bold text-slate-800 tracking-tight">Document Processor</h1>
          </div>
          <p className="text-slate-500 text-sm max-w-lg">
            View and manage your extracted invoice records across all categories.
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex flex-col px-3 border-r border-slate-100">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Records</span>
            <span className="text-lg font-bold text-slate-700 leading-tight">{totalRecords}</span>
          </div>
          <div className="flex flex-col px-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Categories</span>
            <span className="text-lg font-bold text-slate-700 leading-tight">2</span>
          </div>
        </div>
      </div>

      {/* Categories Grid */}
      <div>
        <div className="flex items-center justify-between mb-3 px-1">
          <h2 className="text-xs font-bold tracking-widest text-slate-400 uppercase">
            Document Categories
          </h2>
          <span className="text-xs font-medium text-slate-400 bg-slate-100 px-2 py-1 rounded-md">
            2 active folders
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {categories.map((cat) => {
            const count = counts[cat.type] || 0;
            const Icon = cat.icon;
            return (
              <div
                key={cat.type}
                className="group relative flex flex-col bg-white rounded-2xl border border-slate-200 p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-200/50 hover:border-slate-300 overflow-hidden"
              >
                {/* Decorative Top Border */}
                <div className={`absolute top-0 left-0 h-1 w-full bg-gradient-to-r ${cat.color} opacity-80`}></div>
                
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4 min-w-0">
                    <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${cat.bgLight} ${cat.textDark} shadow-inner flex-shrink-0 transition-transform group-hover:scale-110 duration-300`}>
                      <Icon size={22} strokeWidth={2.5} />
                    </div>
                    <div className="min-w-0 pt-1">
                      <h2 className="text-lg font-bold text-slate-900 group-hover:text-slate-800 transition-colors">{cat.title}</h2>
                      <p className="text-sm text-slate-500 mt-1 leading-relaxed">{cat.description}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-8 flex items-center justify-between border-t border-slate-100 pt-5">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-full ${cat.bgLight} ${cat.textDark}`}>
                      <CheckCircle size={16} />
                    </div>
                    <div>
                      <p className="text-2xl font-black text-slate-900 tracking-tight leading-none">{count}</p>
                      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mt-1">Extracted</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => navigate('/doc-table', { state: { type: cat.type } })}
                    className={`inline-flex items-center gap-2 rounded-xl bg-slate-50 px-5 py-2.5 text-sm font-semibold ${cat.textDark} transition-all duration-300 hover:${cat.bgLight} hover:scale-105 active:scale-95 border border-slate-100 group-hover:border-transparent`}
                  >
                    View table
                    <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
