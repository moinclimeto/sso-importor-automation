import { ChevronDown, ChevronRight, HelpCircle } from 'lucide-react';
import { useState } from 'react';

export default function ImporterEprHelp() {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left text-sm font-medium text-slate-800 hover:bg-slate-50"
      >
        <span className="inline-flex items-center gap-2">
          <HelpCircle size={16} className="text-teal-700" />
          How is Section 3a calculated?
        </span>
        {open ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
      </button>
      {open && (
        <div className="px-3 pb-3 pt-0 text-xs text-slate-600 space-y-3 border-t border-slate-100">
          <div className="rounded-md bg-slate-50 border border-slate-100 px-3 py-2 font-mono text-[11px] text-slate-700 leading-relaxed">
            Imported purchase
            <br />
            ↓ Domestic sale matching
            <br />
            ↓ Plastic category + conversion factor
            <br />
            ↓ Plastic packaging quantity (MT)
            <br />
            ↓ Section 3a report
            <br />
            ↓ Section 3c totals
          </div>
          <p className="text-amber-900 bg-amber-50 border border-amber-100 rounded-md px-2.5 py-2 font-medium">
            Product quantity is not the same as plastic packaging quantity.
          </p>
          <div className="rounded-md border border-teal-100 bg-teal-50/50 px-3 py-2 space-y-1">
            <p className="font-semibold text-teal-900">Example</p>
            <ul className="list-disc pl-4 space-y-0.5">
              <li>Imported: 10,000 Nos</li>
              <li>Domestic sale: 4,000 Nos</li>
              <li>Conversion factor: 0.05 kg/Nos</li>
              <li>Plastic packaging quantity: <strong>0.20 MT</strong></li>
            </ul>
            <p className="text-[11px] text-teal-800 pt-1">
              Formula: sale quantity × conversion factor (kg per unit) ÷ 1000 = MT
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
