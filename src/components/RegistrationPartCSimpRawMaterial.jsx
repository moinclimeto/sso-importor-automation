import React from 'react';
import RegistrationPartC from './RegistrationPartC.jsx';

export default function RegistrationPartCSimpRawMaterial({
  generalInfo,
  setGeneralInfo,
  autoData,
  setAutoData,
  email,
  mobile,
  showToast,
  inputClass = 'w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-green-500',
}) {
  const patch = (name, value) => {
    setGeneralInfo((prev) => ({ ...prev, [name]: value }));
  };

  return (
    <div className="space-y-6">
      <div className="mt-8 border-t pt-8 space-y-4">
        <div>
          <h3 className="text-lg font-bold text-slate-800">Part C: Signature</h3>
          <p className="text-sm text-slate-500 mt-1">
            GPS of the unit is filled on the portal. Cover Letter, Signature, and Self Declaration PDFs are uploaded even though company values are prefilled.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Latitude <span className="text-red-500">*</span>
            </label>
            <input
              name="latitude"
              value={generalInfo.latitude || ''}
              onChange={(e) => patch('latitude', e.target.value)}
              placeholder="e.g. 12.88678"
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Longitude <span className="text-red-500">*</span>
            </label>
            <input
              name="longitude"
              value={generalInfo.longitude || ''}
              onChange={(e) => patch('longitude', e.target.value)}
              placeholder="e.g. 78.145844"
              className={inputClass}
            />
          </div>
        </div>
      </div>

      <RegistrationPartC
        generalInfo={generalInfo}
        setGeneralInfo={setGeneralInfo}
        autoData={autoData}
        setAutoData={setAutoData}
        email={email}
        mobile={mobile}
        showToast={showToast}
        variant="simp"
      />
    </div>
  );
}
