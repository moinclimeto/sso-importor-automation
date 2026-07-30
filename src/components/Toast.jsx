import { useEffect, useState, useCallback } from 'react';
import { CheckCircle2, XCircle, X } from 'lucide-react';

export function useToast() {
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ id: Date.now(), message, type });
  }, []);

  const hideToast = useCallback(() => setToast(null), []);

  return { toast, showToast, hideToast };
}

export function Toast({ toast, onClose }) {
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(onClose, 2800);
    return () => clearTimeout(t);
  }, [toast, onClose]);

  if (!toast) return null;

  const ok = toast.type !== 'error';

  return (
    <div className="fixed top-5 right-5 z-[100] animate-[fadeIn_0.2s_ease-out]">
      <div
        className={`flex items-start gap-3 min-w-[260px] max-w-sm rounded-xl border px-4 py-3 shadow-lg ${
          ok
            ? 'bg-white border-green-200 text-slate-800'
            : 'bg-white border-red-200 text-slate-800'
        }`}
      >
        {ok ? (
          <CheckCircle2 size={18} className="text-green-600 mt-0.5 flex-shrink-0" />
        ) : (
          <XCircle size={18} className="text-red-500 mt-0.5 flex-shrink-0" />
        )}
        <p className="text-sm font-medium flex-1">{toast.message}</p>
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
