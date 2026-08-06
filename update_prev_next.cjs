const fs = require('fs');
let code = fs.readFileSync('src/components/SingleRecordModal.jsx', 'utf8');

code = code.replace(
  "import { X, Loader2, Plus, ArrowLeftRight } from 'lucide-react';",
  "import { X, Loader2, Plus, ArrowLeftRight, ChevronLeft, ChevronRight } from 'lucide-react';"
);

code = code.replace(
  "export default function SingleRecordModal({ type, initialData, onClose, onSaved, hasNext, onSaveAndNext }) {",
  "export default function SingleRecordModal({ type, initialData, onClose, onSaved, hasNext, onSaveAndNext, hasPrev, onNext, onPrev }) {"
);

let headerTarget = `<div className="flex items-center gap-2">
            {previewUrl && (
              <button
                type="button"
                onClick={() => setPdfOnLeft(!pdfOnLeft)}
                className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 flex items-center gap-1 text-sm font-medium transition-colors"
                title="Swap PDF Position"
              >
                <ArrowLeftRight size={16} />
                <span className="hidden sm:inline">Swap Sides</span>
              </button>
            )}
            <div className="w-px h-5 bg-slate-200 mx-1" />
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
            <X size={18} />
          </button>
          </div>`;

let headerReplacement = `<div className="flex items-center gap-2">
            {isEdit && (
              <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg mr-2">
                <button
                  type="button"
                  onClick={onPrev}
                  disabled={!hasPrev || saving}
                  className="p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed rounded-l-lg transition-colors border-r border-slate-200"
                  title="Previous Record"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  type="button"
                  onClick={onNext}
                  disabled={!hasNext || saving}
                  className="p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed rounded-r-lg transition-colors"
                  title="Next Record"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
            {previewUrl && (
              <button
                type="button"
                onClick={() => setPdfOnLeft(!pdfOnLeft)}
                className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 flex items-center gap-1 text-sm font-medium transition-colors"
                title="Swap PDF Position"
              >
                <ArrowLeftRight size={16} />
                <span className="hidden sm:inline">Swap Sides</span>
              </button>
            )}
            <div className="w-px h-5 bg-slate-200 mx-1" />
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
            <X size={18} />
          </button>
          </div>`;

code = code.replace(headerTarget, headerReplacement);

fs.writeFileSync('src/components/SingleRecordModal.jsx', code, 'utf8');
