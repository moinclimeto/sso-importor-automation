import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { entityOptionLabel } from '../../shared/entityRegistrationTypes.js';

export default function RegisteredEntityVerify({
  gst,
  companyId,
  entityName = '',
  entityType = '',
  state = '',
  disabled = false,
  onApply,
  className = '',
}) {
  const [loading, setLoading] = useState(false);
  const [entities, setEntities] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [message, setMessage] = useState('');
  const [piboWarning, setPiboWarning] = useState('');
  const [error, setError] = useState('');

  const runLookup = useCallback(async () => {
    const normalized = String(gst || '').replace(/[^A-Za-z0-9]/g, '');
    if (normalized.length !== 15) {
      setError('Enter a valid 15-character GST number first.');
      setEntities([]);
      setSelectedId('');
      return;
    }

    if (!window.pwp?.entityVerify?.lookupByGst) {
      setError('Entity verify is not available in this build.');
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');
    setPiboWarning('');
    try {
      const res = await window.pwp.entityVerify.lookupByGst({ gst: normalized, companyId });
      if (!res?.success) {
        setError(res?.error || 'Could not verify registered entity.');
        setEntities([]);
        setSelectedId('');
        return;
      }
      setEntities(res.entities || []);
      setMessage(res.message || '');
      setPiboWarning(res.piboWarning || '');

      const best = res.bestEntity && res.bestEntity.source !== 'fallback'
        ? res.bestEntity
        : (res.entities?.length === 1 ? res.entities[0] : null);
      if (best) {
        setSelectedId(best.id);
        onApply?.(best);
      } else {
        setSelectedId('');
      }

      if (
        res.bestEntity?.registration_type === 'Registered'
        && window.pwp?.pibo?.search
        && !res.piboWarning
      ) {
        const pibo = await window.pwp.pibo.search({
          search: entityName || res.bestEntity?.trade_name || normalized,
          entityType: entityType || res.bestEntity?.entity_type || '',
          state,
        });
        if (pibo?.success && !pibo.entities?.length) {
          setPiboWarning('Selected company is not available in CPCB PIBO registered records.');
        }
      }
    } catch (err) {
      setError(err.message || 'Verification failed.');
      setEntities([]);
      setSelectedId('');
    } finally {
      setLoading(false);
    }
  }, [gst, companyId, entityName, entityType, state, onApply]);

  useEffect(() => {
    setEntities([]);
    setSelectedId('');
    setMessage('');
    setPiboWarning('');
    setError('');
  }, [gst]);

  const handleSelect = (entityId) => {
    setSelectedId(entityId);
    const entity = entities.find((item) => item.id === entityId);
    if (entity) onApply?.(entity);
  };

  return (
    <div className={`md:col-span-2 rounded-lg border border-slate-200 bg-slate-50/80 p-3 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
          <ShieldCheck size={14} className="text-indigo-600" />
          PIBO Registered Verify
        </div>
        <button
          type="button"
          disabled={disabled || loading}
          onClick={runLookup}
          className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
        >
          {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          Verify Registration
        </button>
      </div>

      {entities.length > 0 ? (
        <div>
          <label className="label text-xs text-slate-500 mb-1">Registered Entity (API)</label>
          <select
            className="input text-sm w-full bg-white"
            value={selectedId}
            disabled={disabled || loading}
            onChange={(e) => handleSelect(e.target.value)}
          >
            <option value="">Select registered entity</option>
            {entities.map((entity) => (
              <option key={entity.id} value={entity.id}>
                {entityOptionLabel(entity)}
                {entity.gst ? ` — ${entity.gst}` : ''}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {message ? <p className="mt-2 text-xs text-emerald-700">{message}</p> : null}
      {piboWarning ? (
        <p className="mt-2 text-xs text-amber-700 flex items-start gap-1.5">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          {piboWarning}
        </p>
      ) : null}
      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
