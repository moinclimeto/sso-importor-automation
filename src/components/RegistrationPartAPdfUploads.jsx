import { Loader2 } from 'lucide-react';
import UploadedFilePreview from './UploadedFilePreview.jsx';

const FIELDS = [
  {
    key: 'detailsOfProductsPath',
    label: '3a) Details (Type & Quantity) of products produced/marketed',
    hint: 'Upload PDF (max 1 MB on CPCB portal)',
    accept: '.pdf',
  },
  {
    key: 'representativePicturePath',
    label: '3b) Representative picture of Plastic Packaging / Plastic packaging for commodities covering different EPR categories',
    hint: 'Upload PDF (max 1 MB on CPCB portal)',
    accept: '.pdf',
  },
];

export default function RegistrationPartAPdfUploads({
  detailsOfProductsPath = '',
  representativePicturePath = '',
  onUpload,
  uploadingField = '',
}) {
  const paths = {
    detailsOfProductsPath,
    representativePicturePath,
  };

  return (
    <div className="space-y-4">
      {FIELDS.map((field) => {
        const filePath = paths[field.key] || '';
        const uploading = uploadingField === field.key;

        return (
          <div
            key={field.key}
            className="rounded-lg border border-slate-200 bg-white p-4 space-y-2"
          >
            <label className="block text-sm font-medium text-slate-800">
              {field.label} *
            </label>
            <p className="text-xs text-slate-500">{field.hint}</p>

            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg bg-[#0b6c7a] text-white hover:bg-teal-800 cursor-pointer">
                {uploading ? <Loader2 size={16} className="animate-spin" /> : null}
                {filePath ? 'Replace PDF' : 'Upload PDF'}
                <input
                  type="file"
                  accept={field.accept}
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file && onUpload) onUpload(field.key, file);
                    e.target.value = '';
                  }}
                />
              </label>

              {filePath ? (
                <UploadedFilePreview
                  filePath={filePath}
                  className="bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 min-w-0 flex-1 mt-0"
                />
              ) : (
                <span className="text-xs text-slate-400 italic">No file selected</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
