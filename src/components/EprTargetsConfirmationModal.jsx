import React from 'react';
import { Target, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';

export default function EprTargetsConfirmationModal({
  isOpen,
  data,
  onConfirm,
  onCancel,
  submitting = false,
}) {
  if (!isOpen) return null;

  const table = data?.table || {};
  const rawHeaders = Array.isArray(table.headers) && table.headers.length > 0
    ? table.headers
    : [
        'Year',
        'Rigid Plastic (Cat-I)',
        'Flexible Plastic (Cat-II)',
        'MLP (Cat-III)',
        'Compostable Plastic (Cat-IV)',
        'Total EPR Target',
      ];

  const rawRows = Array.isArray(table.rows) && table.rows.length > 0
    ? table.rows
    : [
        ['Total EPR Target', '0', '0', '0', '0', '0'],
        ['Minimum Recycling Target', '0', '0', '0', '0', '0'],
      ];

  const subType = data?.subApplicantType || 'Brand Owner';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[90vh] overflow-hidden border border-slate-200">
        
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-200 bg-gradient-to-r from-teal-800 to-cyan-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-teal-200 shadow-inner">
              <Target size={22} />
            </div>
            <div>
              <h3 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
                7) EPR Targets Confirmation
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-teal-500/30 text-teal-100 border border-teal-400/30">
                  {subType}
                </span>
              </h3>
              <p className="text-xs text-teal-100/80 mt-0.5">
                Calculated by CPCB portal from your Part A &amp; Part B submissions
              </p>
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 bg-slate-50/50 flex-1">
          
          <div className="rounded-xl border border-teal-200 bg-teal-50/70 p-4 flex items-start gap-3">
            <AlertTriangle className="text-teal-700 shrink-0 mt-0.5" size={18} />
            <div className="text-xs text-teal-900 leading-relaxed">
              <span className="font-semibold text-teal-950">Review Before Final Submission: </span>
              Please check the EPR Targets table below extracted directly from the CPCB portal. Once confirmed, the system will proceed to click <strong>Submit &amp; Pay</strong>.
            </div>
          </div>

          {/* Table Container */}
          <div className="rounded-xl border border-slate-200 overflow-hidden shadow-sm bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-teal-800 text-white font-semibold">
                    {rawHeaders.map((header, idx) => (
                      <th
                        key={idx}
                        className="py-3 px-3.5 border-b border-teal-900/40 first:pl-4 last:pr-4 whitespace-nowrap text-left"
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-800">
                  {rawRows.map((row, rIdx) => (
                    <tr
                      key={rIdx}
                      className={`transition-colors hover:bg-slate-50 ${
                        rIdx % 2 === 1 ? 'bg-slate-50/40' : 'bg-white'
                      }`}
                    >
                      {row.map((cell, cIdx) => (
                        <td
                          key={cIdx}
                          className={`py-3 px-3.5 first:pl-4 last:pr-4 whitespace-nowrap ${
                            cIdx === 0
                              ? 'font-medium text-slate-900'
                              : 'text-slate-700 font-mono'
                          }`}
                        >
                          {cell !== '' ? cell : '-'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-200 bg-white flex items-center justify-between gap-4">
          <button
            type="button"
            disabled={submitting}
            onClick={onCancel}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 font-medium text-xs transition-colors disabled:opacity-50"
          >
            <XCircle size={16} className="text-slate-500" />
            Stop / Reject Submission
          </button>

          <button
            type="button"
            disabled={submitting}
            onClick={onConfirm}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs shadow-md shadow-teal-700/20 transition-all hover:shadow-lg disabled:opacity-50"
          >
            <CheckCircle2 size={16} />
            {submitting ? 'Submitting Form…' : 'Confirm Targets & Submit Form'}
          </button>
        </div>

      </div>
    </div>
  );
}
