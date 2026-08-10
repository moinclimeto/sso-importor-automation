const fs = require('fs');
let code = fs.readFileSync('src/components/InvoiceDetailsModal.jsx', 'utf8');

// 1. Imports
code = code.replace(
  "import { Eye, FileText, X } from 'lucide-react';",
  "import { Eye, FileText, X, ArrowLeftRight } from 'lucide-react';\nimport PdfViewer from './PdfViewer';"
);

code = code.replace(
  "import { useState, useEffect } from 'react';",
  "import { useState, useEffect, useRef } from 'react';"
);

// 2. State
code = code.replace(
  "const [loadingFile, setLoadingFile] = useState(false);",
  `const [loadingFile, setLoadingFile] = useState(false);

  const [formWidth, setFormWidth] = useState(50);
  const [pdfOnLeft, setPdfOnLeft] = useState(false);
  const isResizing = useRef(false);

  const startResize = (e) => {
    e.preventDefault();
    isResizing.current = true;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', stopResize);
  };

  const handleMouseMove = (e) => {
    if (!isResizing.current) return;
    const modalElement = document.getElementById('view-record-modal-content');
    if (!modalElement) return;
    const rect = modalElement.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    let newWidthPct = (mouseX / rect.width) * 100;
    if (pdfOnLeft) {
      newWidthPct = 100 - newWidthPct;
    }
    setFormWidth(Math.max(25, Math.min(75, newWidthPct)));
  };

  const stopResize = () => {
    isResizing.current = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', stopResize);
  };

  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', stopResize);
    };
  }, [pdfOnLeft]);`
);

// 3. Header and layout
code = code.replace(
  `<div className="bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden w-[95vw] h-[95vh] max-w-none">`,
  `<div id="view-record-modal-content" className="bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden w-[95vw] lg:w-[90vw] h-[95vh] lg:h-[90vh]">`
);
// Actually, earlier I saw the modal layout was:
// <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
//   <div className="bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden w-[95vw] h-[95vh] max-w-none">
// Or was it Transition.Root? Let me match the button close
code = code.replace(
  `<button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 z-10"
            aria-label="Close"
          >
            <X size={18} />
          </button>`,
  `<div className="absolute right-3 top-3 flex items-center gap-2 z-10">
            {previewUrl && (
              <button
                type="button"
                onClick={() => setPdfOnLeft(!pdfOnLeft)}
                className="p-1 rounded text-blue-600 hover:bg-blue-50 flex items-center gap-1 transition-colors"
                title="Swap PDF Position"
              >
                <ArrowLeftRight size={18} />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>`
);

// Ah wait, it's NOT Transition.Root. In the previous grep for InvoiceDetailsModal, it showed:
// <div className={\`flex-1 min-h-0 \${previewUrl ? 'flex flex-col lg:flex-row' : ''}\`}>
code = code.replace(
  /<div className=\{\`flex-1 min-h-0 \$\{previewUrl \? 'flex flex-col lg:flex-row' : ''\}\`\}>/,
  `<div className={\`flex-1 min-h-0 \${previewUrl ? (pdfOnLeft ? 'flex flex-col lg:flex-row-reverse' : 'flex flex-col lg:flex-row') : ''}\`} style={{ '--form-width': \`\${formWidth}%\` }}>`
);

// Now for the Data section
code = code.replace(
  /<div className=\{\`px-5 py-4 overflow-y-auto \$\{previewUrl \? 'lg:w-\[45%\] border-b lg:border-b-0 lg:border-r border-slate-200' : 'flex-1'\}\`\}>/,
  `<div className={\`px-5 py-4 overflow-y-auto \${previewUrl ? 'lg:w-[var(--form-width)] border-b lg:border-b-0 lg:border-r border-slate-200' : 'flex-1'}\`}>`
);

// Preview section exactly as retrieved
let previewBlock = `          {/* Preview Section */}
          {previewUrl && (
            <div className="flex-1 min-h-0 bg-slate-100/50 flex flex-col p-2">
              <iframe
                src={previewUrl}
                title="Invoice Preview"
                className="w-full h-full rounded-xl border border-slate-200 shadow-sm bg-white"
              />
            </div>
          )}
          {loadingFile && !previewUrl && (
            <div className="flex-1 flex items-center justify-center bg-slate-50">
              <span className="text-slate-400 text-sm">Loading invoice preview...</span>
            </div>
          )}`;

let newPreviewBlock = `          {previewUrl && (
            <div
              className="hidden lg:flex w-2 bg-slate-200 hover:bg-slate-300 cursor-col-resize items-center justify-center flex-shrink-0 relative z-10 transition-colors"
              onMouseDown={startResize}
              title="Drag to resize"
            >
              <div className="w-0.5 h-8 bg-slate-400 rounded-full" />
            </div>
          )}
          {/* Preview Section */}
          {previewUrl && (
            <div className="flex-1 min-h-0 bg-slate-100/50 flex flex-col relative overflow-hidden border-t lg:border-t-0">
              <PdfViewer url={previewUrl} className="w-full h-full rounded-none" />
            </div>
          )}
          {loadingFile && !previewUrl && (
            <div className="flex-1 flex items-center justify-center bg-slate-50">
              <span className="text-slate-400 text-sm">Loading invoice preview...</span>
            </div>
          )}`;

code = code.replace(previewBlock, newPreviewBlock);

// Modal container ID for resize event
code = code.replace(
  `<div className="bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden w-[95vw] h-[95vh] max-w-none">`,
  `<div id="view-record-modal-content" className="bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden w-[95vw] lg:w-[90vw] h-[95vh] lg:h-[90vh]">`
);

// Some code use Dialog.Panel
code = code.replace(
  /<div[\s\S]*?className=\`relative flex flex-col rounded-2xl border border-slate-200 bg-white shadow-xl \$\{previewUrl \? 'w-\[95vw\] h-\[95vh\] max-w-none' : 'w-full max-w-5xl max-h-\[90vh\]'\}\`/,
  `<div id="view-record-modal-content" className={\`relative flex flex-col rounded-2xl border border-slate-200 bg-white shadow-xl \${previewUrl ? 'w-[95vw] lg:w-[90vw] h-[95vh] lg:h-[90vh] max-w-none' : 'w-full max-w-5xl max-h-[90vh]'}\``
);

fs.writeFileSync('src/components/InvoiceDetailsModal.jsx', code, 'utf8');
