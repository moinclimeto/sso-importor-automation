import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { INDIAN_STATES } from '../utils/registrationGeneralInfo.js';

export default function OperatingStatesMultiSelect({
  value = [],
  onChange,
  disabled = false,
  placeholder = 'Select one or more states',
  helperText = 'Select one or more states (Auto-saves)',
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const selected = Array.isArray(value) ? value : [];

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const toggleState = (state) => {
    const isSelected = selected.includes(state);
    const next = isSelected
      ? selected.filter((s) => s !== state)
      : [...selected, state];
    onChange?.(next);
  };

  const displayText = selected.length > 0 ? selected.join(', ') : '';

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left border border-slate-300 rounded-lg bg-white hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 disabled:opacity-50 disabled:cursor-not-allowed min-h-[42px]"
      >
        <span className={`flex-1 text-sm ${displayText ? 'text-slate-800' : 'text-slate-400'}`}>
          {displayText || placeholder}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-slate-500 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg">
          {INDIAN_STATES.map((state) => {
            const isChecked = selected.includes(state);
            return (
              <label
                key={state}
                className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer border-b border-slate-100 last:border-b-0"
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggleState(state)}
                  className="rounded border-slate-300 text-green-600 focus:ring-green-500"
                />
                <span className="text-sm text-slate-700">{state}</span>
              </label>
            );
          })}
        </div>
      )}

      {helperText ? (
        <p className="text-xs text-slate-500 mt-1">{helperText}</p>
      ) : null}
    </div>
  );
}
