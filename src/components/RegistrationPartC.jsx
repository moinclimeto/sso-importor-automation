import React from 'react';

const inputClass = 'w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm';

export default function RegistrationPartC({ generalInfo, setGeneralInfo }) {
  
  const handleFileUpload = (field, e) => {
    const file = e.target.files[0];
    if (file) {
      setGeneralInfo(prev => ({
        ...prev,
        [field]: file.path || file.name
      }));
    }
  };

  return (
    <div className="space-y-6 mt-8 border-t pt-8">
      <div>
        <h3 className="text-lg font-bold text-slate-800 border-b pb-2 mb-4">Part C: EPR Action Plan</h3>
        
        <div className="bg-white border rounded-xl shadow-sm p-6 space-y-6">
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-blue-800 mb-6">
            <strong>Note:</strong> EPR Targets (Total EPR Target and Minimum Recycling Target) will be auto-calculated by the CPCB portal based on your Part A and Part B inputs.
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Please attach Covering Letter(Only PDF) <span className="text-red-500">*</span>
            </label>
            <input
              type="file"
              accept=".pdf"
              onChange={(e) => handleFileUpload('partCCoveringLetter', e)}
              className={inputClass}
            />
            {generalInfo.partCCoveringLetter && (
              <p className="text-xs text-green-600 mt-1 truncate" title={generalInfo.partCCoveringLetter}>
                Selected: {generalInfo.partCCoveringLetter.split(/[/\\]/).pop()}
              </p>
            )}
            <p className="text-xs text-slate-500 mt-1">(Max File Size of PDF is 1 MB)</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Signature <span className="text-red-500">*</span>
            </label>
            <input
              type="file"
              accept=".pdf"
              onChange={(e) => handleFileUpload('partCSignature', e)}
              className={inputClass}
            />
            {generalInfo.partCSignature && (
              <p className="text-xs text-green-600 mt-1 truncate" title={generalInfo.partCSignature}>
                Selected: {generalInfo.partCSignature.split(/[/\\]/).pop()}
              </p>
            )}
            <p className="text-xs text-slate-500 mt-1">(Max File Size of PDF is 1 MB)</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Any Other Information & Self declaration of enterprise based upon Audited Statement (Only PDF) <span className="text-red-500">*</span>
            </label>
            <input
              type="file"
              accept=".pdf"
              onChange={(e) => handleFileUpload('partCAuditedStatement', e)}
              className={inputClass}
            />
            {generalInfo.partCAuditedStatement && (
              <p className="text-xs text-green-600 mt-1 truncate" title={generalInfo.partCAuditedStatement}>
                Selected: {generalInfo.partCAuditedStatement.split(/[/\\]/).pop()}
              </p>
            )}
            <p className="text-xs text-slate-500 mt-1">(Max File Size of PDF is 1 MB)</p>
          </div>
        </div>
      </div>
    </div>
  );
}
