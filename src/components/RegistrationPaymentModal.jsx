import React from 'react';
import { CreditCard, Building2, User, IndianRupee, ExternalLink, X } from 'lucide-react';

function Field({ label, value }) {
  if (!value) return null;
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="text-sm text-slate-800 mt-0.5 break-words">{value}</p>
    </div>
  );
}

export default function RegistrationPaymentModal({
  isOpen,
  data,
  onClose,
  onOpenPayu,
}) {
  if (!isOpen) return null;

  const company = data?.company || {};
  const contact = data?.contact || {};
  const fee = data?.fee || {};
  const payuUrl = String(data?.payuUrl || '').trim();
  const screenshot = data?.screenshotDataUrl || '';

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] overflow-hidden border border-slate-200 flex flex-col">
        <div className="px-6 py-4 border-b bg-gradient-to-r from-teal-800 to-cyan-900 text-white flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold">CPCB Payment</h3>
            <p className="text-xs text-teal-100/80 mt-0.5">
              Application fee breakdown from the portal, then PayU checkout
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 bg-slate-50 grid lg:grid-cols-2 gap-4">
          <div className="space-y-4">
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-teal-800 font-semibold text-sm mb-3">
                <Building2 size={16} /> Company Details
              </div>
              <div className="grid grid-cols-1 gap-3">
                <Field label="Name" value={company.name} />
                <Field label="Residential Address" value={company.address} />
                <Field label="State / UT" value={company.state} />
                <Field label="Type of facility" value={company.typeOfFacility} />
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-teal-800 font-semibold text-sm mb-3">
                <User size={16} /> Contact Person Details
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="Person Name" value={contact.personName} />
                <Field label="Designation" value={contact.designation} />
                <Field label="Mobile Number" value={contact.mobile} />
                <Field label="PAN Number" value={contact.pan} />
                <Field label="Email ID" value={contact.email} />
              </div>
            </section>

            <section className="rounded-xl border border-teal-200 bg-teal-50/70 p-4 shadow-sm">
              <div className="flex items-center gap-2 text-teal-900 font-semibold text-sm mb-3">
                <IndianRupee size={16} /> Application Fee
              </div>
              {fee.description ? (
                <p className="text-xs text-teal-900/80 mb-3">{fee.description}</p>
              ) : null}
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="Average / Fee rate" value={fee.averageRate} />
                <Field label="Waste Generated (TPA)" value={fee.wasteGeneratedTpa} />
                <Field label="Fee in Rs." value={fee.feeInRs} />
                <Field label="Amount to be Paid" value={fee.amountToBePaid} />
              </div>
            </section>
          </div>

          <div className="space-y-4">
            {screenshot ? (
              <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                <p className="px-3 py-2 text-xs font-semibold text-slate-500 border-b bg-slate-50">
                  Portal confirmation page
                </p>
                <img src={screenshot} alt="CPCB payment breakdown" className="w-full object-contain max-h-[360px] bg-slate-100" />
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
                Waiting for payment-breakdown page…
              </div>
            )}

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-teal-800 font-semibold text-sm mb-2">
                <CreditCard size={16} /> PayU checkout
              </div>
              {payuUrl ? (
                <>
                  <p className="text-xs text-slate-600 break-all mb-3">{payuUrl}</p>
                  <button
                    type="button"
                    onClick={() => onOpenPayu?.(payuUrl)}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800"
                  >
                    <ExternalLink size={14} /> Open payment page
                  </button>
                </>
              ) : (
                <p className="text-sm text-slate-500">Click To Pay ke baad PayU yahan open hoga.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
