import LocalFilePreview from './LocalFilePreview.jsx';
import { TYPE_OF_BUSINESS_OPTIONS, TYPE_OF_COMPANY_OPTIONS, INDIAN_STATES } from '../utils/registrationGeneralInfo.js';

export default function RegistrationPartACompanyProfile({
  generalInfo = {},
  onChange,
  autoData = {},
  onTypeOfCompanyDocSelect,
  inputClass = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm',
  selectClass = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white',
}) {
  const typeOfCompany = generalInfo.typeOfCompany || '';
  const needsCompanyDoc = ['Micro', 'Small', 'Medium', 'Large'].includes(typeOfCompany);

  return (
    <div className="md:col-span-2 rounded-xl border border-amber-200 bg-amber-50/50 p-4 space-y-4">
      <div>
        <h4 className="text-sm font-semibold text-amber-900">Company Profile *</h4>
        <p className="text-xs text-amber-800 mt-1">
          These fields are required for CPCB portal upload. They were collected during account registration — verify and complete if blank.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Type of Business *</label>
          <select
            name="typeOfBusiness"
            value={generalInfo.typeOfBusiness || ''}
            onChange={onChange}
            className={selectClass}
            required
          >
            <option value="">Select</option>
            {TYPE_OF_BUSINESS_OPTIONS.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Type of Company *</label>
          <select
            name="typeOfCompany"
            value={typeOfCompany}
            onChange={onChange}
            className={selectClass}
            required
          >
            <option value="">Select</option>
            {TYPE_OF_COMPANY_OPTIONS.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </div>

        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-slate-700 mb-1">Registered Address Line 1 *</label>
          <input
            name="registeredAddressLine1"
            value={generalInfo.registeredAddressLine1 || ''}
            onChange={onChange}
            type="text"
            placeholder="Enter registered address"
            className={inputClass}
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">State/UT *</label>
          <select
            name="stateUt"
            value={generalInfo.stateUt || ''}
            onChange={onChange}
            className={selectClass}
            required
          >
            <option value="">Select State / UT</option>
            {INDIAN_STATES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        {needsCompanyDoc ? (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {['Micro', 'Small', 'Medium'].includes(typeOfCompany)
                ? 'Type of Company Document — MSME Certificate (PDF) *'
                : 'Type of Company Document — Large Entity Declaration (PDF) *'}
            </label>
            <input
              type="file"
              accept=".pdf"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file && onTypeOfCompanyDocSelect) onTypeOfCompanyDocSelect(file);
                e.target.value = '';
              }}
              className={inputClass}
            />
            {autoData.typeOfCompanyDoc ? (
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <p className="text-xs text-green-600 truncate" title={autoData.typeOfCompanyDoc}>
                  Selected: {autoData.typeOfCompanyDoc.split(/[/\\]/).pop()}
                </p>
                <LocalFilePreview filePath={autoData.typeOfCompanyDoc} />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
