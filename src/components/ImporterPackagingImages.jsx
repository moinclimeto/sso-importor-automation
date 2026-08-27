import { useState } from 'react';
import { ImagePlus, Loader2, Trash2, FileText, CheckCircle2 } from 'lucide-react';
import { PLASTIC_CATEGORIES } from '../../shared/plasticCategories.js';
import { storeCompressedUpload } from '../utils/storeUploadFile.js';
import LocalFilePreview from './LocalFilePreview.jsx';

const CATEGORY_LABELS = {
  'Cat-I': 'Cat-I — Rigid Plastic',
  'Cat-II': 'Cat-II — Flexible Plastic',
  'Cat-III': 'Cat-III — Multilayered Plastic',
  'Cat-IV': 'Cat-IV — Compostable Plastic',
};

export default function ImporterPackagingImages({
  companyName = 'Importer',
  images: initialImages = [],
  generatedPdfPath = '',
  onChange,
  showToast,
}) {
  const [images, setImages] = useState(initialImages);
  const [pdfPath, setPdfPath] = useState(generatedPdfPath);
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);

  const updateImages = (next) => {
    setImages(next);
    onChange?.({ images: next, generatedPdfPath: pdfPath });
  };

  const handleAddImage = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const stored = await storeCompressedUpload(file, { destSubdir: 'processed_registration_docs' });
      if (!stored.success || !stored.filePath) {
        showToast?.(stored.message || 'Upload failed', 'error');
        return;
      }
      const next = [
        ...images,
        {
          id: `img-${Date.now()}`,
          filePath: stored.filePath,
          category: 'Cat-I',
          label: file.name.replace(/\.[^.]+$/, ''),
        },
      ];
      updateImages(next);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const removeImage = (id) => {
    updateImages(images.filter((img) => img.id !== id));
  };

  const patchImage = (id, patch) => {
    updateImages(images.map((img) => (img.id === id ? { ...img, ...patch } : img)));
  };

  const handleGeneratePdf = async () => {
    if (!images.length) {
      showToast?.('Add at least one packaging image', 'error');
      return;
    }
    if (!window.pwp?.importerEpr?.generate3bPdf) {
      showToast?.('PDF generation needs the Electron app.', 'error');
      return;
    }
    setGenerating(true);
    try {
      const res = await window.pwp.importerEpr.generate3bPdf({
        companyName,
        images,
      });
      if (res.success) {
        setPdfPath(res.representativePicturePath);
        onChange?.({
          images,
          generatedPdfPath: res.representativePicturePath,
          importer3bJson: res.importer3bJson,
          representativePicturePath: res.representativePicturePath,
        });
        showToast?.('Section 3b PDF generated', 'success');
      } else {
        showToast?.(res.error || 'PDF generation failed', 'error');
      }
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-slate-800">3b) Representative picture of Plastic Packaging *</h4>
          <p className="text-xs text-slate-500 mt-1 max-w-xl">
            Upload representative images of plastic packaging, then generate the PDF required by CPCB portal upload.
          </p>
        </div>
        <label className="inline-flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg bg-teal-700 text-white hover:bg-teal-800 cursor-pointer shrink-0">
          {uploading ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
          Add Image
          <input
            type="file"
            accept=".png,.jpg,.jpeg,.pdf"
            className="hidden"
            disabled={uploading}
            onChange={handleAddImage}
          />
        </label>
      </div>

      {images.length === 0 ? (
        <p className="text-sm text-slate-500 italic py-6 text-center border border-dashed rounded-lg bg-slate-50">
          No images yet — add photos of plastic packaging (one image per category or product type)
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {images.map((img) => (
            <div key={img.id} className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50/50">
              <div className="aspect-video bg-white border-b border-slate-100 p-2">
                <LocalFilePreview filePath={img.filePath} />
              </div>
              <div className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">EPR Category</label>
                    <select
                      className="input text-xs py-1.5 w-full mt-0.5"
                      value={img.category}
                      onChange={(e) => patchImage(img.id, { category: e.target.value })}
                    >
                      {PLASTIC_CATEGORIES.map((c) => (
                        <option key={c} value={c}>{CATEGORY_LABELS[c] || c}</option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeImage(img.id)}
                    className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg shrink-0 mt-4"
                    title="Remove image"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <input
                  type="text"
                  className="input text-xs py-1 w-full"
                  placeholder="Optional label (product name)"
                  value={img.label || ''}
                  onChange={(e) => patchImage(img.id, { label: e.target.value })}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-slate-100">
        <button
          type="button"
          onClick={handleGeneratePdf}
          disabled={generating || !images.length}
          className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg bg-[#0b6c7a] text-white hover:bg-teal-800 disabled:opacity-50"
        >
          {generating ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
          {pdfPath ? 'Regenerate 3b PDF' : 'Generate 3b PDF *'}
        </button>
        {pdfPath && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
            <CheckCircle2 size={14} />
            <span>PDF generated: <strong>{pdfPath.split(/[/\\]/).pop()}</strong></span>
            <LocalFilePreview filePath={pdfPath} />
          </div>
        )}
      </div>
    </div>
  );
}
