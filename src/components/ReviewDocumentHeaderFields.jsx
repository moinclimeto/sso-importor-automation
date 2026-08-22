import { INDIAN_STATES } from './SingleRecordModal';
import { normalizePlasticMaterial } from '../../shared/reviewEnrichment';
import { FINANCIAL_YEAR_OPTIONS } from '../../shared/procurementConversionFactor.js';
import {
  ENTITY_TYPE_OPTIONS,
  PURCHASE_ENTITY_TYPES,
  REGISTRATION_TYPE_OPTIONS,
} from '../../shared/entityRegistrationTypes.js';

export { FINANCIAL_YEAR_OPTIONS, ENTITY_TYPE_OPTIONS, PURCHASE_ENTITY_TYPES, REGISTRATION_TYPE_OPTIONS };

export function buildMaterialOptions(current, materials = []) {
  const cur = normalizePlasticMaterial(current);
  if (!cur) return materials;
  return materials.includes(cur) ? materials : [cur, ...materials];
}

export function buildStateOptions(current) {
  const cur = String(current ?? '').trim();
  if (!cur) return INDIAN_STATES;
  const exists = INDIAN_STATES.some(
    (s) => s.toLowerCase() === cur.toLowerCase() || cur.toLowerCase().includes(s.toLowerCase()),
  );
  return exists ? INDIAN_STATES : [cur, ...INDIAN_STATES];
}
export function ReadonlyHeaderField({ label, value, multiline, required }) {
  return (
    <div>
      <label className="label text-xs text-slate-500">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      <div className={`text-sm text-slate-800 ${multiline ? 'whitespace-pre-wrap' : ''}`}>
        {value || '—'}
      </div>
    </div>
  );
}

export function EditableHeaderField({ label, value, onChange, type = 'text', readOnly, required, disabled }) {
  if (readOnly) {
    return <ReadonlyHeaderField label={label} value={value} required={required} />;
  }
  return (
    <div>
      <label className="label text-xs text-slate-500">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      <input
        type={type}
        className="input text-sm w-full bg-white"
        value={value || ''}
        disabled={disabled}
        placeholder={type === 'text' ? `Enter ${label}` : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

export function EditableHeaderTextarea({ label, value, onChange, readOnly, required, disabled, rows = 3 }) {
  if (readOnly) {
    return <ReadonlyHeaderField label={label} value={value} multiline required={required} />;
  }
  return (
    <div className="md:col-span-2">
      <label className="label text-xs text-slate-500">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      <textarea
        className="input text-sm w-full bg-white resize-y min-h-[72px]"
        rows={rows}
        value={value || ''}
        disabled={disabled}
        placeholder={`Enter ${label}`}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

export function EditableHeaderSelect({ label, value, onChange, options, readOnly, placeholder = 'Select', disabled }) {
  if (readOnly) {
    return <ReadonlyHeaderField label={label} value={value} />;
  }
  return (
    <div>
      <label className="label text-xs text-slate-500">{label}</label>
      <select
        className="input text-sm w-full bg-white"
        value={value || ''}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  );
}
