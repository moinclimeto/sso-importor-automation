import React, { useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { INDIAN_STATES } from '../utils/registrationGeneralInfo.js';
import { storeCompressedUpload } from '../utils/storeUploadFile.js';

const inputClass = 'w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm';
const selectClass = 'w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm bg-white';
const labelClass = 'block text-xs font-medium text-slate-700 mb-1';

const PLASTIC_CATEGORIES = [
  'Rigid Plastic (Cat-I)',
  'Flexible Plastic (Cat-II)',
  'MLP (Cat-III)',
  'Compostable Plastic (Cat-IV)'
];

const FINANCIAL_YEARS = ['2023-24', '2024-25', '2025-26'];

export default function RegistrationPartB({ generalInfo, setGeneralInfo }) {
  const [activeModal, setActiveModal] = useState(null);
  const [modalData, setModalData] = useState({});

  const openModal = (secKey, title, existingData = null) => {
    setModalData(existingData ? { ...existingData, _title: title, _secKey: secKey, _isView: true } : { _title: title, _secKey: secKey, _isView: false });
    setActiveModal(secKey);
  };

  const saveModalData = () => {
    if (modalData._secKey === 'sec4') {
      if (!modalData.state || !modalData.year) {
        alert("State and Year are required");
        return;
      }
      const { _secKey, _title, _isView, ...data } = modalData;
      setGeneralInfo(prev => ({
        ...prev,
        partBSection4: [...(prev.partBSection4 || []), data]
      }));
      setActiveModal(null);
      return;
    }

    // Basic validation for Section 5
    if (!modalData.quantity) {
      alert("Quantity is required");
      return;
    }
    
    const { _secKey, _title, _isView, ...data } = modalData;
    
    if (_isView) {
      setActiveModal(null);
      return;
    }
    
    setGeneralInfo(prev => ({
      ...prev,
      partBTransactions: {
        ...(prev.partBTransactions || {}),
        [_secKey]: [...(prev.partBTransactions?.[_secKey] || []), data]
      }
    }));
    setActiveModal(null);
  };

  const renderInput = (label, field, type="text", placeholder="") => (
    <div>
      <label className={labelClass}>{label} *</label>
      <input type={type} className={inputClass} placeholder={placeholder} value={modalData[field] || ''} onChange={e => setModalData({...modalData, [field]: e.target.value})} disabled={modalData._isView} />
    </div>
  );

  const renderSelect = (label, field, options) => (
    <div>
      <label className={labelClass}>{label} *</label>
      <select className={selectClass} value={modalData[field] || ''} onChange={e => setModalData({...modalData, [field]: e.target.value})} disabled={modalData._isView}>
        <option value="">Select</option>
        {options.map(o => (typeof o === 'string' ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>))}
      </select>
    </div>
  );

  const renderModal4 = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label className={labelClass}>State *</label>
          <select className={selectClass} value={modalData.state || ''} onChange={e => setModalData({...modalData, state: e.target.value})} disabled={modalData._isView}>
            <option value="">Select State</option>
            {(generalInfo.operatingStates || []).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>Year *</label>
          <select className={selectClass} value={modalData.year || ''} onChange={e => setModalData({...modalData, year: e.target.value})} disabled={modalData._isView}>
            <option value="2024-25">2024-25</option>
            <option value="2025-26">2025-26</option>
          </select>
        </div>
      </div>
      
      <div className="overflow-x-auto border border-slate-300 rounded-lg">
        <table className="w-full text-sm text-left">
          <thead className="bg-[#0b6c7a] text-white">
            <tr>
              <th className="px-3 py-2 font-medium">Category of Plastic</th>
              <th className="px-3 py-2 font-medium">Pre Consumer Waste (TPA)</th>
              <th className="px-3 py-2 font-medium">Post Consumer Waste (TPA)</th>
              <th className="px-3 py-2 font-medium">Export Quantity (TPA)</th>
            </tr>
          </thead>
          <tbody>
            {(modalData.categories || []).map((cat, idx) => (
              <tr key={idx} className="border-t hover:bg-slate-50">
                <td className="px-3 py-2 font-medium bg-slate-50 border-r">{cat.category}</td>
                <td className="px-3 py-2 border-r">
                  <input type="number" className={inputClass} value={cat.preConsumer} onChange={e => {
                    const newCats = [...modalData.categories];
                    newCats[idx].preConsumer = e.target.value;
                    setModalData({...modalData, categories: newCats});
                  }} disabled={modalData._isView} />
                </td>
                <td className="px-3 py-2 border-r">
                  <input type="number" className={inputClass} value={cat.postConsumer} onChange={e => {
                    const newCats = [...modalData.categories];
                    newCats[idx].postConsumer = e.target.value;
                    setModalData({...modalData, categories: newCats});
                  }} disabled={modalData._isView} />
                </td>
                <td className="px-3 py-2">
                  <input type="number" className={inputClass} value={cat.exportQuantity} onChange={e => {
                    const newCats = [...modalData.categories];
                    newCats[idx].exportQuantity = e.target.value;
                    setModalData({...modalData, categories: newCats});
                  }} disabled={modalData._isView} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderModal5a = () => (
    <div className="grid grid-cols-2 gap-4">
      {renderSelect('Registration Type', 'regType', ['Registered'])}
      {renderSelect('Procurement Type', 'procType', ['Producer', 'Importer', 'Brand Owner', 'Plastic Waste Processor'])}
      {renderInput('EPR E-Invoice No', 'invoiceNo')}
      {renderInput('Quantity (Ton)', 'quantity', 'number')}
      {renderInput('Recycled Plastic %', 'recycledPercent', 'number')}
      {renderSelect('Category of Plastic', 'category', PLASTIC_CATEGORIES)}
      {renderSelect('Financial Year', 'financialYear', FINANCIAL_YEARS)}
    </div>
  );

  const renderModal5b = () => (
    <div className="grid grid-cols-2 gap-4">
      {renderSelect('Registration Type', 'regType', ['UnRegistered'])}
      {renderSelect('Entity Type', 'entityType', ['Producer', 'Importer'])}
      {renderInput('Name Of The Entity', 'entityName')}
      {renderSelect('Country', 'country', ['India', 'Other'])}
      {renderInput('Address', 'address')}
      {renderInput('Mobile Number', 'mobile')}
      {renderSelect('Plastic Material Type', 'materialType', ['Raw Material', 'Packaging'])}
      {renderSelect('Category Of Plastic', 'category', PLASTIC_CATEGORIES)}
      {renderSelect('Financial Year', 'financialYear', FINANCIAL_YEARS)}
      {renderInput('Date', 'date', 'date')}
      {renderInput('Total Plastic Quantity (Ton)', 'quantity', 'number')}
      {renderInput('Recycled Plastic % (0 for virgin)', 'recycledPercent', 'number')}
      <div className="col-span-2">
        <label className={labelClass}>Upload Invoice/GST E-Invoice *</label>
        <input type="file" accept=".pdf" className={inputClass} onChange={async (e) => {
          const file = e.target.files[0];
          if (!file) return;
          const stored = await storeCompressedUpload(file, { destSubdir: 'processed_part_b' });
          if (stored.success && stored.filePath) {
            setModalData({ ...modalData, invoiceDoc: stored.filePath });
          }
        }} disabled={modalData._isView} />
        {modalData.invoiceDoc && <p className="text-xs text-green-600 mt-1">{modalData.invoiceDoc.split(/[/\\]/).pop()}</p>}
      </div>
    </div>
  );

  const renderModal5c = () => (
    <div className="grid grid-cols-2 gap-4">
      {renderSelect('Registration Type', 'regType', ['Registered'])}
      <div>
        <label className={labelClass}>Type *</label>
        <div className="flex gap-4 mt-2">
          <label className="flex items-center gap-1 text-sm"><input type="radio" name="type5c" value="Application Number" onChange={e => setModalData({...modalData, type: e.target.value})} disabled={modalData._isView} /> Application Number</label>
          <label className="flex items-center gap-1 text-sm"><input type="radio" name="type5c" value="Entity Details" onChange={e => setModalData({...modalData, type: e.target.value})} disabled={modalData._isView} defaultChecked /> Entity Details</label>
        </div>
      </div>
      {renderSelect('Entity Type', 'entityType', ['Producer', 'Brand Owner'])}
      {renderInput('Name of the Entity', 'entityName')}
      {renderInput('Address', 'address')}
      {renderSelect('State', 'state', INDIAN_STATES)}
      {renderInput('Mobile Number', 'mobile')}
      {renderSelect('Plastic Material Type', 'materialType', ['Raw Material', 'Packaging'])}
      {renderSelect('Category Of Plastic', 'category', PLASTIC_CATEGORIES)}
      {renderSelect('Financial Year', 'financialYear', FINANCIAL_YEARS)}
      {renderInput('GST', 'gst')}
      {renderInput('Bank Account No', 'bankAccount')}
      {renderInput('IFSC Code', 'ifsc')}
      {renderInput('GST Paid / Total GST Paid', 'gstPaid', 'number')}
      {renderInput('GST E-Invoice Number', 'invoiceNo')}
      {renderInput('Total Plastic Quantity (Tons)', 'quantity', 'number')}
      {renderInput('Recycled Plastic Content %', 'recycledPercent', 'number')}
    </div>
  );

  const renderModal5d = () => (
    <div className="grid grid-cols-2 gap-4">
      {renderSelect('Registration Type', 'regType', ['UnRegistered'])}
      {renderSelect('Entity Type', 'entityType', ['Producer', 'Brand Owner'])}
      {renderInput('Name of the Entity', 'entityName')}
      {renderInput('Address', 'address')}
      {renderSelect('State', 'state', INDIAN_STATES)}
      {renderInput('Mobile Number', 'mobile')}
      {renderSelect('Plastic Material Type', 'materialType', ['Raw Material', 'Packaging'])}
      {renderSelect('Category Of Plastic', 'category', PLASTIC_CATEGORIES)}
      {renderSelect('Financial Year', 'financialYear', FINANCIAL_YEARS)}
      {renderInput('GST', 'gst')}
      {renderInput('Bank Account No', 'bankAccount')}
      {renderInput('IFSC Code', 'ifsc')}
      {renderInput('GST Paid / Total GST Paid', 'gstPaid', 'number')}
      {renderInput('GST E-Invoice Number', 'invoiceNo')}
      {renderInput('Total Plastic Quantity (Tons)', 'quantity', 'number')}
      {renderInput('Recycled Plastic Content %', 'recycledPercent', 'number')}
    </div>
  );

  const renderTransactionTable = (title, secKey) => {
    const rows = generalInfo.partBTransactions?.[secKey] || [];
    return (
      <div className="mb-6 border rounded-lg overflow-hidden bg-white">
        <div className="bg-[#0b6c7a] px-4 py-3 border-b flex justify-between items-center text-white">
          <h4 className="font-semibold text-sm">{title}</h4>
          <button 
            type="button"
            onClick={() => openModal(secKey, title)}
            className="flex items-center justify-center bg-white/20 hover:bg-white/30 rounded-full w-6 h-6"
            title="Add New"
          >
            <Plus size={16} />
          </button>
        </div>
        <div className="overflow-x-auto">
          {rows.length === 0 ? (
            <div className="text-center text-sm text-slate-500 py-8 bg-slate-50 italic">No data available</div>
          ) : (
            <table className="w-full text-sm text-left">
              <thead className="bg-[#0b6c7a] text-white">
                <tr>
                  <th className="px-4 py-3 font-medium">Sr. No</th>
                  <th className="px-4 py-3 font-medium">Quantity (Ton)</th>
                  <th className="px-4 py-3 font-medium">Recycled %</th>
                  <th className="px-4 py-3 font-medium">Plastic Category</th>
                  <th className="px-4 py-3 font-medium">Financial Year</th>
                  <th className="px-4 py-3 font-medium text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {rows.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-4 py-3">{i + 1}</td>
                    <td className="px-4 py-3">{r.quantity || '-'}</td>
                    <td className="px-4 py-3">{r.recycledPercent || '-'}</td>
                    <td className="px-4 py-3">{r.category || '-'}</td>
                    <td className="px-4 py-3">{r.financialYear || '-'}</td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex justify-center gap-2">
                        <button type="button" onClick={() => openModal(secKey, title, r)} className="text-blue-600 hover:text-blue-800 p-1" title="View">
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                        </button>
                        <button type="button" onClick={() => {
                          setGeneralInfo(prev => {
                            const newRows = prev.partBTransactions[secKey].filter((_, idx) => idx !== i);
                            return { ...prev, partBTransactions: { ...prev.partBTransactions, [secKey]: newRows } };
                          });
                        }} className="text-red-500 hover:text-red-700 p-1" title="Delete">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8 mt-8 border-t pt-8 relative">
      <div>
        <h3 className="text-lg font-bold text-slate-800 border-b pb-2 mb-4">Part B: Pertaining to Liquid Effluent and Gaseous Emissions</h3>
        
        <div className="bg-white border rounded-xl shadow-sm p-5 mb-6">
          <div className="flex justify-between items-center mb-2">
            <h4 className="font-semibold text-slate-700 text-sm">4. State-wise, Category-wise Quantity of PW generated (TPA)</h4>
            <button type="button" onClick={() => {
              setModalData({
                _secKey: 'sec4',
                _title: 'Add Section 4 Entry',
                state: '',
                year: '2024-25',
                categories: PLASTIC_CATEGORIES.map(c => ({ category: c, preConsumer: '0', postConsumer: '0', exportQuantity: '0' }))
              });
              setActiveModal('sec4');
            }} className="flex items-center gap-1 text-sm bg-[#0b6c7a] text-white px-3 py-1.5 rounded-lg hover:bg-teal-800 transition-colors font-medium">
              <Plus size={16} /> Add Entry
            </button>
          </div>
          
          <div className="overflow-x-auto border border-slate-300">
            <table className="w-full text-sm text-left">
              <thead className="bg-[#0b6c7a] text-white text-xs">
                <tr>
                  <th className="px-3 py-2 border-r font-medium text-center" rowSpan={2}>Sl.No.</th>
                  <th className="px-3 py-2 border-r font-medium text-center" rowSpan={2}>State Name</th>
                  <th className="px-3 py-2 border-r font-medium text-center" rowSpan={2}>Year</th>
                  <th className="px-3 py-2 border-r font-medium text-center" rowSpan={2}>Category of Plastic</th>
                  <th className="px-3 py-2 border-r border-b font-medium text-center">Pre Consumer Waste</th>
                  <th className="px-3 py-2 border-r border-b font-medium text-center">Plastic Packaging put in market (Post Consumer)</th>
                  <th className="px-3 py-2 border-b font-medium text-center">Export Quantity(TPA)</th>
                  <th className="px-3 py-2 border-l border-b font-medium text-center w-10" rowSpan={2}>Action</th>
                </tr>
                <tr>
                  <th className="px-3 py-2 border-r font-medium text-center">Plastic Quantity (TPA)</th>
                  <th className="px-3 py-2 border-r font-medium text-center">Plastic Quantity (TPA)</th>
                  <th className="px-3 py-2 font-medium text-center">Plastic Quantity (TPA)</th>
                </tr>
              </thead>
              <tbody>
                {(generalInfo.partBSection4 || []).length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-slate-500 italic bg-slate-50">No data available</td>
                  </tr>
                ) : (
                  (generalInfo.partBSection4 || []).map((group, groupIndex) => (
                    group.categories.map((cat, catIndex) => (
                      <tr key={`${groupIndex}-${catIndex}`} className="border-b bg-white">
                        {catIndex === 0 && (
                          <>
                            <td className="px-3 py-2 border-r text-center" rowSpan={4}>{groupIndex + 1}</td>
                            <td className="px-3 py-2 border-r text-center" rowSpan={4}>{group.state}</td>
                            <td className="px-3 py-2 border-r text-center" rowSpan={4}>{group.year}</td>
                          </>
                        )}
                        <td className="px-3 py-2 border-r">{cat.category}</td>
                        <td className="px-3 py-2 border-r">
                          <input type="text" readOnly className="w-full px-2 py-1 border border-slate-200 rounded text-slate-600 bg-slate-50 outline-none" value={cat.preConsumer} />
                        </td>
                        <td className="px-3 py-2 border-r">
                          <input type="text" readOnly className="w-full px-2 py-1 border border-slate-200 rounded text-slate-600 bg-slate-50 outline-none" value={cat.postConsumer} />
                        </td>
                        <td className="px-3 py-2 border-r">
                          <input type="text" readOnly className="w-full px-2 py-1 border border-slate-200 rounded text-slate-600 bg-slate-50 outline-none" value={cat.exportQuantity} />
                        </td>
                        {catIndex === 0 && (
                          <td className="px-3 py-2 text-center" rowSpan={4}>
                            <button type="button" onClick={() => {
                              setGeneralInfo(prev => ({ ...prev, partBSection4: prev.partBSection4.filter((_, i) => i !== groupIndex) }));
                            }} className="text-red-500 hover:text-red-700 p-1">
                              <Trash2 size={16} />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white border rounded-xl shadow-sm p-5">
          <h4 className="font-semibold text-slate-800 text-base mb-4 border-b pb-2">5. Details of Plastic Raw Material/Packaging</h4>
          
          {renderTransactionTable('Details of Plastic Raw Material/Packaging Procured from Registered Entity', 'sec5a')}
          {renderTransactionTable('Details of Plastic Raw Material/Packaging Procured from Non-Registered Entity', 'sec5b')}
          {renderTransactionTable('Details of Plastic Raw Material/Packaging Sold to Registered PIBOs', 'sec5c')}
          {renderTransactionTable('Details of Plastic Raw Material/Packaging Sold to UnRegistered PIBOs', 'sec5d')}
        </div>
      </div>

      {activeModal && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center p-4 border-b">
              <h3 className="font-bold text-teal-800">{modalData._title}</h3>
              <button onClick={() => setActiveModal(null)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto">
              {activeModal === 'sec4' && renderModal4()}
              {activeModal === 'sec5a' && renderModal5a()}
              {activeModal === 'sec5b' && renderModal5b()}
              {activeModal === 'sec5c' && renderModal5c()}
              {activeModal === 'sec5d' && renderModal5d()}
            </div>
            <div className="p-4 border-t bg-slate-50 flex justify-end gap-3 rounded-b-xl">
              {modalData._isView ? (
                <button type="button" onClick={() => setActiveModal(null)} className="px-6 py-2 bg-slate-200 text-slate-800 rounded-lg hover:bg-slate-300 text-sm font-medium">Close</button>
              ) : (
                <>
                  <button type="button" onClick={() => setActiveModal(null)} className="px-4 py-2 border rounded-lg hover:bg-white text-sm font-medium">Cancel</button>
                  <button type="button" onClick={saveModalData} className="px-6 py-2 bg-[#0b6c7a] text-white rounded-lg hover:bg-teal-800 text-sm font-medium">Save & Add</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
