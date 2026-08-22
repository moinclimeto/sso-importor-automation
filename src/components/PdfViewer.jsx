import { useState, useRef, useCallback, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { ZoomIn, ZoomOut, Maximize, Loader2, AlertCircle, RotateCcw, Hand } from 'lucide-react';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export default function PdfViewer({ url, className = '' }) {
  const [numPages, setNumPages] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);

  const viewportRef = useRef(null);
  const dragRef = useRef({ pointerId: null, startX: 0, startY: 0, originX: 0, originY: 0 });

  function onDocumentLoadSuccess({ numPages: pages }) {
    setNumPages(pages);
    setLoading(false);
  }

  const resetView = useCallback(() => {
    setScale(1);
    setRotation(0);
    setOffset({ x: 0, y: 0 });
  }, []);

  const zoomIn = () => setScale((s) => Math.min(Number((s + 0.25).toFixed(2)), 4));
  const zoomOut = () => setScale((s) => Math.max(Number((s - 0.25).toFixed(2)), 0.25));
  const rotate = () => setRotation((r) => (r + 90) % 360);
  const nextPage = () => {
    setCurrentPage((prev) => Math.min(prev + 1, numPages || 1));
    setOffset({ x: 0, y: 0 });
  };
  const prevPage = () => {
    setCurrentPage((prev) => Math.max(prev - 1, 1));
    setOffset({ x: 0, y: 0 });
  };

  const onPointerDown = useCallback((e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: offset.x,
      originY: offset.y,
    };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  }, [offset.x, offset.y]);

  const onPointerMove = useCallback((e) => {
    if (!dragging || dragRef.current.pointerId !== e.pointerId) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setOffset({
      x: dragRef.current.originX + dx,
      y: dragRef.current.originY + dy,
    });
    e.preventDefault();
  }, [dragging]);

  const onPointerUp = useCallback((e) => {
    if (dragRef.current.pointerId !== e.pointerId) return;
    setDragging(false);
    dragRef.current.pointerId = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;

    const onWheel = (e) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        if (e.deltaY < 0) zoomIn();
        else zoomOut();
        return;
      }
      setOffset((prev) => ({
        x: prev.x - e.deltaX,
        y: prev.y - e.deltaY,
      }));
    };

    viewport.addEventListener('wheel', onWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', onWheel);
  }, []);

  return (
    <div className={`relative flex flex-col bg-slate-100/50 overflow-hidden min-h-0 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-white border-b border-slate-200 shrink-0 z-10">
        <div className="flex items-center gap-1 text-[11px] text-slate-500">
          <Hand size={13} className="shrink-0" />
          <span>Drag anywhere to move · Scroll to pan · Ctrl+scroll to zoom</span>
        </div>
        <div className="flex items-center gap-1">
          {numPages > 1 && (
            <>
              <button type="button" onClick={prevPage} disabled={currentPage <= 1} className="p-1.5 hover:bg-slate-100 disabled:opacity-30 rounded text-slate-600" title="Previous page">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
              </button>
              <span className="text-xs font-medium text-slate-600 px-1 min-w-[3rem] text-center select-none">
                {currentPage}/{numPages}
              </span>
              <button type="button" onClick={nextPage} disabled={currentPage >= numPages} className="p-1.5 hover:bg-slate-100 disabled:opacity-30 rounded text-slate-600" title="Next page">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
              </button>
              <div className="w-px h-4 bg-slate-200 mx-0.5" />
            </>
          )}
          <button type="button" onClick={zoomOut} className="p-1.5 hover:bg-slate-100 rounded text-slate-600" title="Zoom out">
            <ZoomOut size={16} />
          </button>
          <span className="text-xs font-medium text-slate-600 w-11 text-center select-none">
            {Math.round(scale * 100)}%
          </span>
          <button type="button" onClick={zoomIn} className="p-1.5 hover:bg-slate-100 rounded text-slate-600" title="Zoom in">
            <ZoomIn size={16} />
          </button>
          <button type="button" onClick={rotate} className="p-1.5 hover:bg-slate-100 rounded text-slate-600" title="Rotate 90°">
            <RotateCcw size={16} />
          </button>
          <button type="button" onClick={resetView} className="p-1.5 hover:bg-slate-100 rounded text-slate-600" title="Reset view">
            <Maximize size={16} />
          </button>
        </div>
      </div>

      {/* Free-move viewport — overflow hidden, transform-based pan (no scroll limits) */}
      <div
        ref={viewportRef}
        className={`flex-1 min-h-0 w-full relative overflow-hidden bg-slate-300/40 touch-none ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/50 backdrop-blur-sm z-20">
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            <span className="ml-2 text-sm font-medium text-slate-500">Loading document…</span>
          </div>
        )}

        <div
          className="absolute left-1/2 top-1/2 will-change-transform pointer-events-none select-none"
          style={{
            transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
          }}
        >
          <Document
            file={url}
            onLoadSuccess={onDocumentLoadSuccess}
            loading={null}
            error={
              <div className="flex flex-col items-center justify-center text-red-500 p-8 bg-white rounded-xl shadow-sm border border-red-100">
                <AlertCircle size={32} className="mb-2 opacity-50" />
                <p className="font-medium text-sm">Failed to load PDF</p>
                <p className="text-xs opacity-70 mt-1">The file might be corrupted or in an unsupported format.</p>
              </div>
            }
          >
            <div className="inline-block shadow-xl bg-white">
              <Page
                pageNumber={currentPage}
                scale={scale}
                rotate={rotation}
                renderTextLayer={false}
                renderAnnotationLayer={false}
                loading={
                  <div className="flex items-center justify-center bg-white" style={{ width: 595 * scale, height: 842 * scale }}>
                    <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
                  </div>
                }
              />
            </div>
          </Document>
        </div>
      </div>
    </div>
  );
}
