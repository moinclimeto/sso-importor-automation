import { useEffect, useState } from 'react';
import { CreditCard, Edit2, Check, X, UserCheck, Loader2 } from 'lucide-react';
import { Toast, useToast } from './Toast.jsx';

const APPLICANT_OPTIONS = ['PIBO', 'SIMP'];
const SUB_APPLICANT_OPTIONS_MAP = {
  PIBO: ['Importer', 'Brand Owner'],
  SIMP: [
    'Importer of raw material',
    'Seller of raw material',
    'Producer (Small or Micro)',
    'Manufacturer of raw material',
  ],
};

export default function DashboardSettingsCards() {
  const { toast, showToast, hideToast } = useToast();
  const [bankDetails, setBankDetails] = useState({ account_number: '', ifsc_code: '' });
  const [isEditingBank, setIsEditingBank] = useState(false);
  const [editBankDetails, setEditBankDetails] = useState({ account_number: '', ifsc_code: '' });
  const [bankSaveMessage, setBankSaveMessage] = useState('');
  const [applicantType, setApplicantType] = useState('PIBO');
  const [subApplicantType, setSubApplicantType] = useState('Importer');
  const [savingReg, setSavingReg] = useState(false);
  const [regSaveMessage, setRegSaveMessage] = useState('');

  useEffect(() => {
    window.pwp?.settings?.get?.('global_bank_details')?.then((data) => {
      if (data) setBankDetails(data);
    });
    window.pwp?.registration?.get?.().then((res) => {
      if (res?.success && res?.data) {
        const appType = res.data.applicant_type || 'PIBO';
        setApplicantType(appType);
        if (res.data.sub_applicant_type) {
          setSubApplicantType(res.data.sub_applicant_type);
        } else if (appType === 'SIMP') {
          setSubApplicantType('Importer of raw material');
        }
      }
    });
  }, []);

  const handleSaveBankDetails = async () => {
    const account_number = String(editBankDetails.account_number || '').trim();
    const ifsc_code = String(editBankDetails.ifsc_code || '').trim().toUpperCase();
    if (!account_number || !ifsc_code) {
      setBankSaveMessage('Account Number and IFSC Code are both required.');
      return;
    }
    const payload = { account_number, ifsc_code };
    if (!window.pwp?.settings) {
      setBankSaveMessage('Settings API not available.');
      return;
    }
    await window.pwp.settings.set('global_bank_details', payload);
    setBankDetails(payload);
    setIsEditingBank(false);
    setBankSaveMessage('');

    if (window.pwp.sales?.applyBankDetailsToAll) {
      const res = await window.pwp.sales.applyBankDetailsToAll({
        ...payload,
        overwriteAll: true,
      });
      if (res?.success) {
        setBankSaveMessage(`Saved. Applied to ${res.updated ?? 0} sale record(s).`);
      } else {
        setBankSaveMessage(res?.error || 'Saved globally, but failed to update sale records.');
      }
    } else {
      setBankSaveMessage('Saved globally.');
    }
  };

  const saveRegistrationTypes = async ({ applicant, subApplicant }) => {
    const nextApplicant = applicant || applicantType || 'PIBO';
    let nextSub = subApplicant || subApplicantType;
    
    // Auto-select valid default sub-applicant type if switching applicant type
    const availableSubs = SUB_APPLICANT_OPTIONS_MAP[nextApplicant] || SUB_APPLICANT_OPTIONS_MAP.PIBO;
    if (!availableSubs.includes(nextSub)) {
      nextSub = availableSubs[0];
    }

    if (nextApplicant === applicantType && nextSub === subApplicantType) return;
    setSavingReg(true);
    setRegSaveMessage('');
    try {
      if (!window.pwp?.registration?.save) {
        setRegSaveMessage('Registration API not available.');
        return;
      }
      const res = await window.pwp.registration.save({
        applicant_type: nextApplicant,
        sub_applicant_type: nextSub,
      });
      if (res?.success) {
        setApplicantType(nextApplicant);
        setSubApplicantType(nextSub);
        setRegSaveMessage(`Saved — ${nextApplicant} / ${nextSub}`);
        setTimeout(() => setRegSaveMessage(''), 4000);
      } else {
        setRegSaveMessage('Failed to update: ' + (res?.error || 'Unknown error'));
      }
    } catch (err) {
      setRegSaveMessage('Error: ' + err.message);
    } finally {
      setSavingReg(false);
    }
  };

  const currentSubOptions = SUB_APPLICANT_OPTIONS_MAP[applicantType] || SUB_APPLICANT_OPTIONS_MAP.PIBO;

  return (
    <>
      <Toast toast={toast} onClose={hideToast} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Global Bank Details */}
        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-4 min-w-0">
            <div className="p-3 rounded-lg bg-indigo-500 flex-shrink-0">
              <CreditCard size={22} className="text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-sm text-slate-500 font-medium truncate">Global Sale Bank Details</p>
              <p className="text-xs text-slate-400 mt-0.5 truncate">Auto-fills Post Consumer (Sale) entries</p>
              {bankSaveMessage && (
                <p className={`text-xs mt-1 truncate ${bankSaveMessage.includes('required') || bankSaveMessage.includes('Failed') || bankSaveMessage.includes('not available') ? 'text-red-600' : 'text-emerald-600'}`}>
                  {bankSaveMessage}
                </p>
              )}
              {isEditingBank ? (
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="text"
                    placeholder="Account No"
                    value={editBankDetails.account_number}
                    onChange={(e) => setEditBankDetails({ ...editBankDetails, account_number: e.target.value })}
                    className="border border-slate-200 rounded-md px-2 py-1 text-xs outline-none focus:border-indigo-500 w-28"
                  />
                  <input
                    type="text"
                    placeholder="IFSC"
                    value={editBankDetails.ifsc_code}
                    onChange={(e) => setEditBankDetails({
                      ...editBankDetails,
                      ifsc_code: e.target.value.toUpperCase(),
                    })}
                    className="border border-slate-200 rounded-md px-2 py-1 text-xs outline-none focus:border-indigo-500 w-24"
                  />
                </div>
              ) : (
                <p className="text-sm font-semibold text-slate-800 mt-0.5 truncate">
                  {bankDetails.account_number || 'Not Added'} <span className="text-slate-400 mx-1">|</span> {bankDetails.ifsc_code || 'Not Added'}
                </p>
              )}
            </div>
          </div>
          <div className="flex-shrink-0 ml-2">
            {isEditingBank ? (
              <div className="flex items-center gap-1.5">
                <button onClick={handleSaveBankDetails} className="p-1.5 bg-green-50 text-green-600 rounded-md hover:bg-green-100 transition" title="Save">
                  <Check size={16} />
                </button>
                <button onClick={() => setIsEditingBank(false)} className="p-1.5 bg-red-50 text-red-600 rounded-md hover:bg-red-100 transition" title="Cancel">
                  <X size={16} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setEditBankDetails(bankDetails);
                  setBankSaveMessage('');
                  setIsEditingBank(true);
                }}
                className="p-1.5 bg-slate-50 text-slate-600 rounded-md hover:bg-slate-100 transition"
                title="Edit Bank Details"
              >
                <Edit2 size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Registration Applicant Type */}
        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-4 min-w-0">
              <div className="p-3 rounded-lg bg-emerald-500 flex-shrink-0">
                <UserCheck size={22} className="text-white" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm text-slate-500 font-medium truncate">Applicant Type</p>
                  <span className="text-xs px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full font-semibold border border-emerald-200">
                    {applicantType} · {subApplicantType}
                  </span>
                </div>
                {regSaveMessage && (
                  <p className={`text-xs mt-1 truncate ${regSaveMessage.startsWith('Saved') ? 'text-emerald-600' : 'text-red-600'}`}>
                    {regSaveMessage}
                  </p>
                )}
                
                {/* Level 1: Applicant Type (PIBO / SIMP) */}
                <div className="mt-2.5 flex items-center gap-3">
                  <span className="text-xs font-semibold text-slate-600">Type:</span>
                  <div className="flex items-center gap-2.5">
                    {APPLICANT_OPTIONS.map((type) => (
                      <label key={type} className="inline-flex items-center gap-1 text-xs font-medium text-slate-700 cursor-pointer">
                        <input
                          type="radio"
                          name="applicantType"
                          value={type}
                          checked={applicantType === type}
                          disabled={savingReg}
                          onChange={() => saveRegistrationTypes({ applicant: type, subApplicant: null })}
                          className="accent-emerald-600"
                        />
                        {type}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Level 2: Sub-Applicant Category */}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-slate-600">Category:</span>
                  <div className="flex flex-wrap items-center gap-2">
                    {currentSubOptions.map((type) => (
                      <label key={type} className="inline-flex items-center gap-1 text-xs font-medium text-slate-700 cursor-pointer">
                        <input
                          type="radio"
                          name="subApplicantType"
                          value={type}
                          checked={subApplicantType === type}
                          disabled={savingReg}
                          onChange={() => saveRegistrationTypes({ applicant: applicantType, subApplicant: type })}
                          className="accent-emerald-600"
                        />
                        {type}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            {savingReg && <Loader2 size={18} className="animate-spin text-emerald-600 mt-1 flex-shrink-0" />}
          </div>
        </div>
      </div>
    </>
  );
}


