import { useEffect, useState, useCallback } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';

export function useToast() {
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, type = 'success', options = {}) => {
    const duration = Number(options.duration) > 0 ? Number(options.duration) : type === 'error' || type === 'warning' ? 4500 : 2800;
    setToast({ id: Date.now(), message, type, duration });
  }, []);

  const hideToast = useCallback(() => setToast(null), []);

  return { toast, showToast, hideToast };
}

export function Toast({ toast, onClose }) {
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(onClose, toast.duration || 2800);
    return () => clearTimeout(t);
  }, [toast, onClose]);

  if (!toast) return null;

  const type = toast.type || 'success';
  const styles =
    type === 'error'
      ? 'border-red-200'
      : type === 'warning'
        ? 'border-amber-200'
        : type === 'info'
          ? 'border-blue-200'
          : 'border-green-200';

  const Icon =
    type === 'error'
      ? XCircle
      : type === 'warning'
        ? AlertTriangle
        : type === 'info'
          ? Info
          : CheckCircle2;

  const iconClass =
    type === 'error'
      ? 'text-red-500'
      : type === 'warning'
        ? 'text-amber-600'
        : type === 'info'
          ? 'text-blue-600'
          : 'text-green-600';

  return (
    <div className="fixed top-5 right-5 z-[100] animate-[fadeIn_0.2s_ease-out]">
      <div
        className={`flex items-start gap-3 min-w-[280px] max-w-md rounded-xl border bg-white px-4 py-3 shadow-lg text-slate-800 ${styles}`}
      >
        <Icon size={18} className={`${iconClass} mt-0.5 flex-shrink-0`} />
        <p className="text-sm font-medium flex-1 whitespace-pre-line">{toast.message}</p>
        <button
          type="button"
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 p-0.5"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
