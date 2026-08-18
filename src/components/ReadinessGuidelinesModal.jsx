import React from 'react';
import { X } from 'lucide-react';

const GUIDELINES = [
  {
    title: 'Company PAN *',
    subtitle: 'Scanned copy of Company PAN in PDF Format',
    subtext: 'Maximum file size should be 1 MB',
  },
  {
    title: 'GST registration certificate of Plant/Unit *',
    subtitle: 'Enter a valid 15-character GSTIN or upload PDF',
    subtext: 'Maximum file size should be 1 MB',
  },
  {
    title: 'CIN (Number or Upload)',
    subtitle: 'Scanned copy of Company CIN in PDF Format (If any)',
    subtext: 'Maximum file size should be 1 MB',
  },
  {
    title: 'GST certificate of Company/Business *',
    subtitle: 'Scanned copy of Company GST in PDF Format',
    subtext: 'Maximum file size should be 1 MB',
  },
  {
    title: 'IEC *',
    subtitle: 'Required IEC number, or upload IEC Certificate',
    subtext: 'Maximum file size should be 1 MB',
  },
  {
    title: 'Supporting document for company category *',
    subtitle: 'MSME Certificate or Declaration for Large Entity',
    subtext: 'Maximum file size should be 1 MB',
  },
  {
    title: 'Authorized person PAN *',
    subtitle: "Scanned copy of Authorized Person's PAN in PDF Format",
    subtext: 'Maximum file size should be 1 MB',
  },
  {
    title: 'Details (Type & Quantity) of products produced/marketed *',
    subtitle: 'Scanned copy of details in PDF Format',
    subtext: 'Maximum file size should be 1 MB',
  },
  {
    title: 'Representative picture of Plastic Packaging *',
    subtitle: 'Plastic packaging for commodities covering different EPR categories',
    subtext: 'Maximum file size should be 1 MB',
  },
  {
    title: 'Covering Letter *',
    subtitle: 'Please attach Covering Letter (Only PDF)',
    subtext: 'Maximum file size should be 1 MB',
  },
  {
    title: 'Signature *',
    subtitle: 'Authorized person signature',
    subtext: 'Maximum file size should be 1 MB',
  },
  {
    title: 'Any Other Information & Self declaration',
    subtitle: 'Based upon Audited Statement (Only PDF)',
    subtext: 'Maximum file size should be 1 MB',
  },
];

export default function ReadinessGuidelinesModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-slate-50 rounded-xl shadow-xl w-full max-w-3xl flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-white rounded-t-xl">
          <h2 className="text-xl font-semibold text-slate-800">
            Readiness Guidelines for EPR Registration
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        <div className="px-8 py-6 overflow-y-auto space-y-6">
          <div className="space-y-6">
            {GUIDELINES.map((item, i) => (
              <div key={i} className="space-y-0.5">
                <p className="text-[15px] font-medium text-slate-800">
                  {String(i + 1).padStart(2, '0')}. {item.title}
                </p>
                {item.subtitle && <p className="text-[15px] text-slate-700">{item.subtitle}</p>}
                <p className="text-sm text-slate-400">{item.subtext}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
