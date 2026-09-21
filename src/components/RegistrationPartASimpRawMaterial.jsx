import React, { useEffect, useRef, useState } from 'react';
import { Upload, CheckCircle2 } from 'lucide-react';
import { INDIAN_STATES } from '../utils/registrationGeneralInfo.js';
import UploadedFilePreview from './UploadedFilePreview.jsx';
import { panFromGstin, unitGstMatchesCompanyPan } from '../../shared/entityRegistrationTypes.js';

const greyClass =
  'w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-100 text-slate-700 cursor-not-allowed outline-none';

function FileUploadSlot({
  fieldKey,
  label,
  filePath,
  accept = '.pdf',
  isRequired = false,
  isEnabled = true,
  onFileSelect,
  uploadingField = '',
}) {
  const inputRef = useRef(null);
  const [localFile, setLocalFile] = useState(null);
  const [localUrl, setLocalUrl] = useState('');
  const isUploading = uploadingField === fieldKey;
  const displayName = localFile?.name || (filePath ? String(filePath).split(/[/\\]/).pop() : '');
  const hasFile = Boolean(filePath || localFile);

  useEffect(() => {
    if (!localFile) {
      setLocalUrl('');
      return undefined;
    }
    const url = URL.createObjectURL(localFile);
    setLocalUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [localFile]);

  return (
    <div className="mt-2">
      {label ? (
        <p className="text-[11px] font-medium text-slate-600 mb-1.5">
          {label}
          {isRequired ? <span className="text-red-500"> *</span> : null}
        </p>
      ) : null}
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          disabled={!isEnabled || isUploading}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            setLocalFile(file);
            if (onFileSelect) onFileSelect(fieldKey, file);
          }}
        />
        <button
          type="button"
          disabled={!isEnabled || isUploading}
          onClick={() => inputRef.current?.click()}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border ${
            !isEnabled
              ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
              : hasFile
                ? 'bg-white text-emerald-700 border-emerald-300 hover:bg-emerald-50'
                : 'bg-white text-blue-700 border-blue-300 hover:bg-blue-50'
          }`}
        >
          <Upload size={13} />
          {isUploading ? 'Uploading...' : hasFile ? 'Replace' : 'Upload'}
        </button>
        {hasFile ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
            <CheckCircle2 size={12} />
            Attached
          </span>
        ) : (
          <span className="text-[11px] text-slate-400">PDF, max 1MB</span>
        )}
      </div>
      {hasFile ? (
        <div className="mt-2">
          <UploadedFilePreview
            filePath={filePath || displayName}
            fileName={displayName}
            previewUrl={localUrl}
          />
        </div>
      ) : null}
    </div>
  );
}

function FieldLabel({ children, required }) {
  return (
    <label className="block text-xs font-semibold text-slate-700 mb-1">
      {children}
      {required ? <span className="text-red-500"> *</span> : null}
    </label>
  );
}

export default function RegistrationPartASimpRawMaterial({
  generalInfo = {},
  autoData = {},
  email = '',
  mobile = '',
  onChange,
  onFileSelect,
  inputClass = '',
  selectClass = '',
  uploadingField = '',
  isPreview = false,
}) {
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: currentYear - 1950 + 1 }, (_, i) => String(currentYear - i));
  const dicRegistered = /^yes$/i.test(String(generalInfo.dicRegistered || ''));
  const isSameAddress = generalInfo.isSameAsRegisteredAddress ?? true;
  const registeredAddress = generalInfo.registeredAddressLine1 || autoData.registeredAddress || '';
  const companyPan = String(generalInfo.companyPan || autoData.companyPan || autoData.pan || panFromGstin(generalInfo.gstin || autoData.gstin) || '').toUpperCase();
  const unitGstMatchesPan = unitGstMatchesCompanyPan(
    generalInfo.unitGst,
    companyPan,
    generalInfo.gstin || autoData.gstin,
  );
  const patch = (name, value) => onChange?.({ target: { name, value } });

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <h4 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-2">Company Details</h4>
        <p className="text-xs text-slate-500 -mt-2">
          Grey values are already filled on CPCB (readonly). Only Plant/Unit fields, year, capital and DIC are entered. GST, Company PAN, CIN and Person PAN need PDF upload only.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <FieldLabel required>Name of the Organization (Legal Name)</FieldLabel>
            <input
              readOnly
              value={autoData.legalName || autoData.companyName || ''}
              className={greyClass}
            />
          </div>
          <div>
            <FieldLabel required>Trade Name</FieldLabel>
            <input readOnly value={autoData.companyName || autoData.legalName || ''} className={greyClass} />
          </div>

          <div>
            <FieldLabel required>Type of Business</FieldLabel>
            <input readOnly value={generalInfo.typeOfBusiness || autoData.constitutionOfBusiness || ''} className={greyClass} />
          </div>
          <div>
            <FieldLabel required>Plant / Unit State</FieldLabel>
            <select
              name="plantState"
              value={generalInfo.plantState || generalInfo.stateUt || ''}
              onChange={(e) => {
                patch('plantState', e.target.value);
                patch('stateUt', e.target.value);
                patch('operatingStates', [e.target.value]);
              }}
              className={selectClass || inputClass}
              disabled={isPreview}
            >
              <option value="">Select State / UT</option>
              {INDIAN_STATES.map((st) => (
                <option key={st} value={st}>{st}</option>
              ))}
            </select>
          </div>

          <div>
            <FieldLabel required>Registered Address</FieldLabel>
            <textarea readOnly rows={3} value={registeredAddress} className={greyClass} />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <FieldLabel required>Plant / Unit Address</FieldLabel>
              <label className="flex items-center gap-1.5 text-xs text-blue-700 font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={isSameAddress}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    patch('isSameAsRegisteredAddress', checked);
                    if (checked) patch('plantAddress', registeredAddress);
                  }}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                Same as Registered Address
              </label>
            </div>
            <textarea
              name="plantAddress"
              rows={3}
              value={isSameAddress ? (generalInfo.plantAddress || registeredAddress) : (generalInfo.plantAddress || '')}
              onChange={onChange}
              disabled={isSameAddress}
              placeholder="Enter Plant / Unit full address"
              className={`${inputClass} ${isSameAddress ? 'bg-slate-50 text-slate-600' : ''}`}
            />
          </div>

          <div>
            <FieldLabel required>GST</FieldLabel>
            <input readOnly value={generalInfo.gstin || autoData.gstin || autoData.gst || ''} className={`${greyClass} uppercase`} />
            <FileUploadSlot
              fieldKey="gstDoc"
              filePath={autoData.gstDoc || autoData.gstinDoc || autoData.gstDocumentPath}
              isRequired
              onFileSelect={onFileSelect}
              uploadingField={uploadingField}
            />
          </div>
          <div>
            <FieldLabel required>Plant/Unit GST</FieldLabel>
            <input
              type="text"
              name="unitGst"
              value={generalInfo.unitGst || ''}
              onChange={onChange}
              placeholder="15-character Plant GSTIN"
              maxLength={15}
              className={`${inputClass} uppercase ${generalInfo.unitGst && !unitGstMatchesPan ? 'border-red-400' : ''}`}
            />
            {generalInfo.unitGst && !unitGstMatchesPan ? (
              <p className="text-[11px] text-red-600 mt-1">
                CPCB check: PAN in Plant/Unit GST ({panFromGstin(generalInfo.unitGst) || '—'}) must match Company PAN ({companyPan || '—'}).
                Use the company GSTIN if the plant is the same entity.
              </p>
            ) : null}
            <FileUploadSlot
              fieldKey="unitGstDoc"
              filePath={autoData.unitGstDoc}
              isRequired
              onFileSelect={onFileSelect}
              uploadingField={uploadingField}
            />
          </div>

          <div>
            <FieldLabel required>Company PAN</FieldLabel>
            <input readOnly value={generalInfo.companyPan || autoData.companyPan || autoData.pan || ''} className={`${greyClass} uppercase`} />
            <FileUploadSlot
              fieldKey="companyPanDoc"
              filePath={autoData.companyPanDoc || autoData.panDoc || autoData.companyPanDocumentPath || autoData.panDocumentPath}
              isRequired
              onFileSelect={onFileSelect}
              uploadingField={uploadingField}
            />
          </div>
          <div>
            <FieldLabel required>Year of Commencement of Production</FieldLabel>
            <select
              name="yearOfCommencement"
              value={generalInfo.yearOfCommencement || ''}
              onChange={onChange}
              className={selectClass || inputClass}
              disabled={isPreview}
            >
              <option value="">Select year</option>
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          <div>
            <FieldLabel required>CIN</FieldLabel>
            <input readOnly value={generalInfo.cin || autoData.cin || ''} className={`${greyClass} uppercase`} />
            <FileUploadSlot
              fieldKey="cinDoc"
              filePath={autoData.cinDoc || autoData.cinDocumentPath}
              isRequired
              onFileSelect={onFileSelect}
              uploadingField={uploadingField}
            />
          </div>
          <div>
            <FieldLabel required>Total Capital Invested on the Project (Rs in Crores)</FieldLabel>
            <input
              type="text"
              name="capitalInvested"
              value={generalInfo.capitalInvested || ''}
              onChange={onChange}
              placeholder="e.g. 10"
              className={inputClass}
            />
          </div>

          <div>
            <FieldLabel required>Type of Company</FieldLabel>
            <input readOnly value={generalInfo.typeOfCompany || ''} className={greyClass} />
          </div>
          <div>
            <FieldLabel required>
              Is the Unit Registered with the DIC or DCSSI of the State Government or Union Territory ?
            </FieldLabel>
            <select
              name="dicRegistered"
              value={dicRegistered ? 'Yes' : (generalInfo.dicRegistered || 'No')}
              onChange={onChange}
              className={selectClass || inputClass}
              disabled={isPreview}
            >
              <option value="No">No</option>
              <option value="Yes">Yes</option>
            </select>
            {dicRegistered ? (
            <FileUploadSlot
              fieldKey="dicRegistrationDoc"
              label="Please Upload Supporting Document"
              filePath={autoData.dicRegistrationDoc || generalInfo.dicRegistrationDoc}
              isRequired
              onFileSelect={onFileSelect}
              uploadingField={uploadingField}
            />
            ) : (
              <p className="text-[11px] text-slate-500 mt-2">Supporting document is not needed when DIC / DCSSI is No.</p>
            )}
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h4 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-2">Authorized Person details</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <FieldLabel required>Name</FieldLabel>
            <input readOnly value={autoData.authName || ''} className={greyClass} />
          </div>
          <div>
            <FieldLabel required>Designation</FieldLabel>
            <input readOnly value={generalInfo.authDesignation || ''} className={greyClass} />
          </div>
          <div>
            <FieldLabel required>Mobile</FieldLabel>
            <input readOnly value={mobile || autoData.mobile || ''} className={greyClass} />
          </div>
          <div>
            <FieldLabel required>Email</FieldLabel>
            <input readOnly value={email || autoData.email || ''} className={greyClass} />
          </div>
          <div>
            <FieldLabel required>PAN No.</FieldLabel>
            <input readOnly value={generalInfo.personPan || autoData.authPan || autoData.personPan || ''} className={`${greyClass} uppercase`} />
            <FileUploadSlot
              fieldKey="personPanDoc"
              filePath={autoData.personPanDoc || autoData.authPanDoc || autoData.personPanDocumentPath}
              isRequired
              onFileSelect={onFileSelect}
              uploadingField={uploadingField}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
