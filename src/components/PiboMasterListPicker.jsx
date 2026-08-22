import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Building2,
  Info,
  Loader2,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  isPiboSearchEligible,
  sortPiboEntitiesByHierarchy,
  toPiboApiEntityType,
} from '../../shared/piboEntityMasterData.js';

const DEBOUNCE_MS = 350;

function formatDropdownState(state) {
  const value = String(state || '').trim();
  if (!value) return '';
  return value
    .toLowerCase()
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export default function PiboMasterListPicker({
  entityType = '',
  registrationType = '',
  onSelect,
  disabled = false,
  className = '',
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const debounceRef = useRef(null);
  const containerRef = useRef(null);
  const eligible = isPiboSearchEligible(registrationType, entityType);

  useEffect(() => {
    if (!eligible) {
      setQuery('');
      setSelectedId('');
    }
  }, [eligible, entityType]);

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

  const runSearch = useCallback(async (term) => {
    if (!eligible || !window.pwp?.pibo?.search) return;
    const search = String(term || '').trim();

    setLoading(true);
    setError('');
    try {
      const payload = { entityType: toPiboApiEntityType(entityType) };
      if (search) payload.search = search;

      const res = await window.pwp.pibo.search(payload);
      if (!res?.success) {
        setResults([]);
        setError(res?.error || 'PIBO search failed.');
        return;
      }
      const sorted = sortPiboEntitiesByHierarchy(res.entities || [], search);
      setResults(sorted);
    } catch (err) {
      setResults([]);
      setError(err.message || 'PIBO search failed.');
    } finally {
      setLoading(false);
    }
  }, [eligible, entityType]);

  useEffect(() => {
    if (!eligible) {
      setResults([]);
      setOpen(false);
      setError('');
      return undefined;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    const delay = query.trim() ? DEBOUNCE_MS : 0;
    debounceRef.current = setTimeout(() => {
      runSearch(query);
    }, delay);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, eligible, entityType, runSearch]);

  const handlePick = (entity) => {
    const label = entity.entity_name || entity.trade_name || '';
    setQuery(label);
    setSelectedId(entity.id);
    setOpen(false);
    onSelect?.(entity);
  };

  const clearSearch = () => {
    setQuery('');
    setSelectedId('');
    setOpen(true);
  };

  if (!eligible) return null;

  const resultLabel = query.trim()
    ? `${results.length} match${results.length === 1 ? '' : 'es'}`
    : `${results.length} shown`;

  return (
    <div ref={containerRef} className={`rounded-xl border border-indigo-200/80 bg-gradient-to-br from-indigo-50/90 to-white p-4 shadow-sm ${className}`}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-sm">
            <ShieldCheck size={16} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-800">PIBO Registered Lookup</p>
            <p className="mt-0.5 text-xs text-slate-500 leading-relaxed">
              Browse CPCB records for <span className="font-medium text-indigo-700">{entityType}</span>.
              Up to 20 results load initially — search by name or GST for more.
            </p>
          </div>
        </div>
        {!loading && results.length > 0 ? (
          <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-indigo-700 ring-1 ring-indigo-100">
            {resultLabel}
          </span>
        ) : null}
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={query}
          disabled={disabled || loading}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelectedId('');
            setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            if (!results.length && !loading) runSearch(query);
          }}
          placeholder="Search by company name or GST number…"
          className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-10 text-sm shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
        />
        {loading ? (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-indigo-500" />
        ) : query ? (
          <button
            type="button"
            onClick={clearSearch}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Clear search"
          >
            <X size={14} />
          </button>
        ) : null}

        {open && results.length > 0 ? (
          <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-[60] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-3 py-2">
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                Select a record
              </p>
              <p className="text-[11px] text-slate-400">{results.length} result{results.length === 1 ? '' : 's'}</p>
            </div>
            <ul className="max-h-80 overflow-y-auto divide-y divide-slate-100">
              {results.map((entity) => {
                const isSelected = selectedId === entity.id;
                const name = entity.entity_name || entity.trade_name || '—';
                const gst = entity.gst || '';
                const state = formatDropdownState(entity.state);
                const regNo = entity.registration_number || entity.epr_registration_number || '';
                const address = String(entity.address || '').trim();
                const metaLine = [
                  regNo ? `Reg: ${regNo}` : '',
                  gst ? `GST: ${gst}` : '',
                  state ? `State: ${state}` : '',
                ].filter(Boolean).join(' · ');
                return (
                  <li key={entity.id}>
                    <button
                      type="button"
                      onClick={() => handlePick(entity)}
                      className={`w-full px-3 py-2.5 text-left transition-colors ${
                        isSelected
                          ? 'bg-indigo-50 ring-1 ring-inset ring-indigo-200'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-start gap-2 min-w-0">
                        <Building2 size={14} className="mt-0.5 shrink-0 text-indigo-500" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold leading-snug text-slate-800 break-words" title={name}>
                            {name}
                          </p>
                          {metaLine ? (
                            <p className="mt-0.5 text-[11px] leading-4 text-slate-600 break-words">
                              {metaLine}
                            </p>
                          ) : null}
                          {address ? (
                            <p className="mt-0.5 text-[11px] leading-4 text-slate-500 break-words whitespace-normal" title={address}>
                              <span className="font-medium text-slate-600">Address:</span>{' '}
                              {address}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </div>

      <div className="mt-2.5 flex items-start gap-1.5 rounded-lg bg-white/70 px-2.5 py-2 ring-1 ring-indigo-100">
        <Info size={13} className="mt-0.5 shrink-0 text-indigo-500" />
        <p className="text-[11px] leading-relaxed text-slate-500">
          Click a result to auto-fill registration number, GST, company name, address, state, mobile, and PAN below. You can still edit any field before saving.
        </p>
      </div>

      {!loading && open && !results.length && !error ? (
        <p className="mt-2 text-xs text-slate-500 text-center py-2">No PIBO records found.</p>
      ) : null}
      {error ? (
        <p className="mt-2 rounded-lg bg-red-50 px-2.5 py-2 text-xs text-red-600 ring-1 ring-red-100">{error}</p>
      ) : null}
    </div>
  );
}
