import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, CheckCircle2, FileText, AlertTriangle, CheckCircle } from 'lucide-react';


export default function RegistrationPreviewModal({ 
  show, 
  onClose, 
  onConfirm, 
  isRegistrationComplete,
  autoData = {},
  generalInfo = {},
  children 
}) {
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  useEffect(() => {
    if (show) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [show]);

  if (!show) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[1200px] h-[95vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header Section */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white relative z-10">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-100 rounded-lg text-emerald-600">
              <FileText size={22} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">Registration Form Preview</h2>
              <p className="text-sm text-slate-500 mt-0.5">Please review all auto-filled and manually entered data before confirming.</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex gap-2">
              <div className="px-3 py-1 bg-green-50 text-green-700 border border-green-200 rounded-full text-xs font-semibold flex items-center gap-1.5">
                <FileText size={12} />
                GST: 23AEPJD20GC1Z7
              </div>
              <div className="px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-semibold flex items-center gap-1.5">
                <CheckCircle size={12} />
                Form Auto-filled
              </div>
            </div>
            <button 
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-[#f8fafc]">
          <div className="max-w-6xl mx-auto">
            {children}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 bg-white flex items-center justify-between">
          <p className="text-xs text-slate-500 font-medium">
            Double-check the Operations Details and Part B tables.
          </p>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-5 py-2.5 text-sm font-semibold text-slate-600 bg-white border border-slate-300 hover:bg-slate-50 rounded-xl transition-all"
            >
              Close
            </button>
            <button
              onClick={() => setShowConfirmModal(true)}
              className="px-6 py-2.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 hover:shadow-lg hover:shadow-emerald-600/20 rounded-xl transition-all flex items-center gap-2"
            >
              <CheckCircle2 size={18} />
              {isRegistrationComplete ? 'Confirm & Register Application' : 'Confirm & Start Registration'}
            </button>
          </div>
        </div>
      </div>

      {showConfirmModal && (
        <div className="fixed inset-0 z-[10000] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-amber-600 mb-4">
              <AlertTriangle size={24} />
              <h3 className="text-lg font-bold text-slate-800">Final Confirmation</h3>
            </div>
            <p className="text-sm text-slate-600 mb-6">
              Are you sure you want to proceed? Please ensure all details in the preview are correct. Once submitted, some data cannot be easily changed without department approval.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 text-sm font-semibold text-slate-600 bg-slate-50 border border-slate-200 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Review Again
              </button>
              <button
                onClick={() => {
                  setShowConfirmModal(false);
                  onConfirm();
                }}
                className="px-4 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
              >
                Yes, Proceed
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
