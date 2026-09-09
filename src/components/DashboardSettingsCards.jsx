import { useEffect, useState } from 'react';
import { CreditCard, Edit2, Check, X, UserCheck, Loader2 } from 'lucide-react';

const SUB_APPLICANT_OPTIONS = ['Importer', 'Brand Owner'];

export default function DashboardSettingsCards() {
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
        setApplicantType(res.data.applicant_type || 'PIBO');
        if (res.data.sub_applicant_type) {
          setSubApplicantType(res.data.sub_applicant_type);
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
    const nextApplicant = applicant || 'PIBO';
    const nextSub = subApplicant || subApplicantType;
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

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-lg bg-indigo-500">
            <CreditCard size={22} className="text-white" />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Global Sale Bank Details</p>
            <p className="text-xs text-slate-400 mt-0.5">Account No & IFSC auto-fill all Post Consumer (Sale) entries</p>
            {bankSaveMessage && (
              <p className={`text-xs mt-1 ${bankSaveMessage.includes('required') || bankSaveMessage.includes('Failed') || bankSaveMessage.includes('not available') ? 'text-red-600' : 'text-emerald-600'}`}>
                {bankSaveMessage}
              </p>
            )}
            {isEditingBank ? (
              <div className="flex items-center gap-3 mt-1">
                <input
                  type="text"
                  placeholder="Account Number"
                  value={editBankDetails.account_number}
                  onChange={(e) => setEditBankDetails({ ...editBankDetails, account_number: e.target.value })}
                  className="border border-slate-200 rounded-md px-2 py-1 text-sm outline-none focus:border-indigo-500 w-40"
                />
                <input
                  type="text"
                  placeholder="IFSC Code"
                  value={editBankDetails.ifsc_code}
                  onChange={(e) => setEditBankDetails({
                    ...editBankDetails,
                    ifsc_code: e.target.value.toUpperCase(),
                  })}
                  className="border border-slate-200 rounded-md px-2 py-1 text-sm outline-none focus:border-indigo-500 w-32"
                />
              </div>
            ) : (
              <p className="text-sm font-semibold text-slate-800 mt-0.5">
                {bankDetails.account_number || 'Not Added'} <span className="text-slate-400 mx-1">|</span> {bankDetails.ifsc_code || 'Not Added'}
              </p>
            )}
          </div>
        </div>
        <div>
          {isEditingBank ? (
            <div className="flex items-center gap-2">
              <button onClick={handleSaveBankDetails} className="p-1.5 bg-green-50 text-green-600 rounded-md hover:bg-green-100 transition">
                <Check size={16} />
              </button>
              <button onClick={() => setIsEditingBank(false)} className="p-1.5 bg-red-50 text-red-600 rounded-md hover:bg-red-100 transition">
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

      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-lg bg-emerald-500">
              <UserCheck size={22} className="text-white" />
            </div>
            <div>
              <p className="text-sm text-slate-500 font-medium">Registration Applicant Type</p>
              <p className="text-xs text-slate-400 mt-0.5">
                Saved in registration details and used on the CPCB portal
              </p>
              {regSaveMessage && (
                <p className={`text-xs mt-1 ${regSaveMessage.startsWith('Saved') ? 'text-emerald-600' : 'text-red-600'}`}>
                  {regSaveMessage}
                </p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-6">
                <div>
                  <p className="text-xs font-medium text-slate-500 mb-1.5">Applicant</p>
                  <label className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                    <input type="radio" name="applicantType" checked readOnly className="accent-emerald-600" />
                    PIBO
                  </label>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500 mb-1.5">Sub-Applicant</p>
                  <div className="flex items-center gap-4">
                    {SUB_APPLICANT_OPTIONS.map((type) => (
                      <label key={type} className="inline-flex items-center gap-1.5 text-sm cursor-pointer">
                        <input
                          type="radio"
                          name="subApplicantType"
                          value={type}
                          checked={subApplicantType === type}
                          disabled={savingReg}
                          onChange={() => saveRegistrationTypes({ applicant: 'PIBO', subApplicant: type })}
                          className="accent-emerald-600"
                        />
                        {type}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
          {savingReg && <Loader2 size={18} className="animate-spin text-emerald-600 mt-1" />}
        </div>
      </div>
    </div>
  );
}
