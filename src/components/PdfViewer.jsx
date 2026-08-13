import { useState, useRef, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { ZoomIn, ZoomOut, Maximize, Loader2, AlertCircle } from 'lucide-react';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export default function PdfViewer({ url, className = '' }) {
  const [numPages, setNumPages] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef(null);

  function onDocumentLoadSuccess({ numPages }) {
    setNumPages(numPages);
    setLoading(false);
  }

  const zoomIn = () => setScale((s) => Math.min(s + 0.25, 3));
  const zoomOut = () => setScale((s) => Math.max(s - 0.25, 0.5));
  const zoomFit = () => setScale(1);

  const nextPage = () => setCurrentPage((prev) => Math.min(prev + 1, numPages || 1));
  const prevPage = () => setCurrentPage((prev) => Math.max(prev - 1, 1));

  useEffect(() => {
    const handleWheel = (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        if (e.deltaY < 0) zoomIn();
        else zoomOut();
      }
    };
    const container = containerRef.current;
    if (container) {
      container.addEventListener('wheel', handleWheel, { passive: false });
    }
    return () => {
      if (container) container.removeEventListener('wheel', handleWheel);
    };
  }, []);

  return (
    <div className={`relative flex flex-col bg-slate-100/50 rounded-xl border border-slate-200 overflow-hidden ${className}`}>
      {/* Custom Toolbar */}
      <div className="absolute top-4 right-4 flex items-center gap-1 bg-white/95 backdrop-blur shadow-sm rounded-lg p-1 z-10 border border-slate-200">
        {numPages > 1 && (
          <>
            <button type="button" onClick={prevPage} disabled={currentPage <= 1} className="p-1.5 hover:bg-slate-100 disabled:opacity-30 rounded text-slate-600 transition-colors" title="Previous Page">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
            </button>
            <span className="text-xs font-medium text-slate-600 px-2 text-center select-none">
              {currentPage} / {numPages}
            </span>
            <button type="button" onClick={nextPage} disabled={currentPage >= numPages} className="p-1.5 hover:bg-slate-100 disabled:opacity-30 rounded text-slate-600 transition-colors" title="Next Page">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </button>
            <div className="w-px h-4 bg-slate-200 mx-1" />
          </>
        )}
        <button type="button" onClick={zoomOut} className="p-1.5 hover:bg-slate-100 rounded text-slate-600 transition-colors" title="Zoom Out">
          <ZoomOut size={16} />
        </button>
        <span className="text-xs font-medium text-slate-600 w-12 text-center select-none">
          {Math.round(scale * 100)}%
        </span>
        <button type="button" onClick={zoomIn} className="p-1.5 hover:bg-slate-100 rounded text-slate-600 transition-colors" title="Zoom In">
          <ZoomIn size={16} />
        </button>
        <div className="w-px h-4 bg-slate-200 mx-1" />
        <button type="button" onClick={zoomFit} className="p-1.5 hover:bg-slate-100 rounded text-slate-600 transition-colors" title="Reset Zoom">
          <Maximize size={16} />
        </button>
      </div>

      {/* PDF Container */}
      <div 
        ref={containerRef}
        className="w-full h-full overflow-auto bg-slate-200/50 custom-scrollbar relative"
        style={{ padding: '20px' }}
      >
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/50 backdrop-blur-sm z-20">
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            <span className="ml-2 text-sm font-medium text-slate-500">Loading document...</span>
          </div>
        )}
        
        <Document
          file={url}
          onLoadSuccess={onDocumentLoadSuccess}
          loading={null}
          error={
            <div className="flex flex-col items-center justify-center text-red-500 h-full p-8 bg-white rounded-xl shadow-sm border border-red-100 mt-20">
              <AlertCircle size={32} className="mb-2 opacity-50" />
              <p className="font-medium text-sm">Failed to load PDF</p>
              <p className="text-xs opacity-70 mt-1">The file might be corrupted or in an unsupported format.</p>
            </div>
          }
          className="w-full flex justify-center"
        >
          <div className="inline-block shadow-lg bg-white overflow-hidden" style={{ transition: 'width 0.2s, height 0.2s' }}>
            <Page
              pageNumber={currentPage}
              scale={scale}
              renderTextLayer={true}
              renderAnnotationLayer={true}
              loading={
                <div className="flex items-center justify-center bg-white" style={{ width: 600 * scale, height: 800 * scale }}>
                  <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
                </div>
              }
            />
          </div>
        </Document>
      </div>
    </div>
  );
}
