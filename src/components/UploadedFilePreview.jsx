import LocalFilePreview from './LocalFilePreview.jsx';

/** Green "Selected: filename" row + eye Preview link — use under every registration file input. */
export default function UploadedFilePreview({
  filePath,
  fileName,
  label,
  prefix = 'Selected',
  suffix = '',
  className = 'mt-1',
  previewUrl = '',
}) {
  if (!filePath && !previewUrl) return null;

  const name = fileName || String(filePath || '').split(/[/\\]/).pop() || 'Document';

  return (
    <div className={`flex flex-wrap items-center gap-2 text-xs text-emerald-800 ${className}`}>
      <span className="truncate min-w-0" title={filePath || name}>
        {label ?? (
          <>
            {prefix}: <strong>{name}</strong>
            {suffix ? ` ${suffix}` : ''}
          </>
        )}
      </span>
      <LocalFilePreview filePath={filePath} fileName={name} previewUrl={previewUrl} />
    </div>
  );
}
