import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { entityOptionLabel } from '../../shared/entityRegistrationTypes.js';
import { PIBO_NOT_FOUND_WARNING } from '../../shared/piboEntityMasterData.js';

async function checkPiboWarning({ gst, entity, entityType, state }) {
  if (!window.pwp?.pibo?.search || entity?.registration_type !== 'Registered') {
    return '';
  }

  const type = entityType || entity?.entity_type || '';
  const normalizedGst = String(gst || entity?.gst || '').replace(/[^A-Za-z0-9]/g, '');

  if (normalizedGst.length === 15) {
    const byGst = await window.pwp.pibo.search({ search: normalizedGst, entityType: type, state });
    if (byGst?.success && byGst.entities?.length) return '';
  }

  const name = String(entity?.trade_name || entity?.entity_name || '').trim();
  if (name) {
    const byName = await window.pwp.pibo.search({ search: name, entityType: type, state });
    if (byName?.success && !byName.entities?.length) {
      return PIBO_NOT_FOUND_WARNING;
    }
    return '';
  }

  if (normalizedGst.length === 15) {
    return PIBO_NOT_FOUND_WARNING;
  }

  return '';
}

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
  const [requiresSelection, setRequiresSelection] = useState(false);
  const [registrationType, setRegistrationType] = useState('');

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
    setRequiresSelection(false);
    setRegistrationType('');

    try {
      const res = await window.pwp.entityVerify.lookupByGst({ gst: normalized, companyId });
      if (!res?.success) {
        setError(res?.error || 'Could not verify registered entity.');
        setEntities([]);
        setSelectedId('');
        return;
      }

      const selectable = res.selectableEntities?.length
        ? res.selectableEntities
        : (res.entities || []).filter((item) => item.source !== 'climeto_gst' && item.source !== 'fallback');

      setEntities(selectable);
      setMessage(res.message || '');
      setPiboWarning(res.piboWarning || '');
      setRequiresSelection(Boolean(res.requiresUserSelection));
      setRegistrationType(res.gstVerified?.registration_type || res.bestEntity?.registration_type || '');

      const needsPick = res.requiresUserSelection || selectable.length > 1;

      if (needsPick) {
        setSelectedId('');
        if (!selectable.length && res.gstVerified?.registration_type === 'Unregistered') {
          onApply?.(res.bestEntity || res.gstProfile);
        }
        return;
      }

      const best = res.bestEntity
        || (selectable.length === 1 ? selectable[0] : null)
        || res.gstProfile
        || null;

      if (best) {
        setSelectedId(best.id);
        setRegistrationType(best.registration_type || '');
        onApply?.(best);
      } else {
        setSelectedId('');
      }

      if (!res.piboWarning && best?.registration_type === 'Registered') {
        const warning = await checkPiboWarning({
          gst: normalized,
          entity: best,
          entityType: entityType || best?.entity_type || '',
          state,
        });
        if (warning) setPiboWarning(warning);
      }
    } catch (err) {
      setError(err.message || 'Verification failed.');
      setEntities([]);
      setSelectedId('');
    } finally {
      setLoading(false);
    }
  }, [gst, companyId, entityType, state, onApply]);

  useEffect(() => {
    setEntities([]);
    setSelectedId('');
    setMessage('');
    setPiboWarning('');
    setError('');
    setRequiresSelection(false);
    setRegistrationType('');
  }, [gst]);

  const handleSelect = async (entityId) => {
    setSelectedId(entityId);
    const entity = entities.find((item) => item.id === entityId);
    if (entity) {
      setRegistrationType(entity.registration_type || '');
      setPiboWarning('');
      onApply?.(entity);
      if (companyId && window.pwp?.entityVerify?.applySelection) {
        try {
          await window.pwp.entityVerify.applySelection({ companyId, entity });
        } catch {
          /* persist best-effort */
        }
      }
      const warning = await checkPiboWarning({
        gst,
        entity,
        entityType: entityType || entity.entity_type || '',
        state,
      });
      if (warning) setPiboWarning(warning);
    }
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

      {registrationType ? (
        <p className="text-xs text-slate-600 mb-2">
          Master / GST status:{' '}
          <span className={registrationType === 'Registered' ? 'text-emerald-700 font-medium' : 'text-amber-700 font-medium'}>
            {registrationType}
          </span>
          {registrationType === 'Registered' ? (
            <span className="text-slate-500"> — from Supplier/Customer Master or GST API</span>
          ) : null}
        </p>
      ) : null}

      {entities.length > 0 ? (
        <div>
          <label className="label text-xs text-slate-500 mb-1">
            {requiresSelection || entities.length > 1
              ? 'Select registration (multiple found for this GST)'
              : 'Registered Entity (API)'}
          </label>
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
                {entity.epr_registration_number ? ` · EPR ${entity.epr_registration_number}` : ''}
                {entity.gst ? ` — ${entity.gst}` : ''}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {message ? (
        <p className={`mt-2 text-xs ${message.includes('Supplier/Customer Master') || message.includes('Supplier Master') ? 'text-indigo-700' : 'text-emerald-700'}`}>
          {message}
        </p>
      ) : null}
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
