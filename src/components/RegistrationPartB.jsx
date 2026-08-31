import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { INDIAN_STATES } from '../utils/registrationGeneralInfo.js';
import { storeCompressedUpload } from '../utils/storeUploadFile.js';
import UploadedFilePreview from './UploadedFilePreview.jsx';
import {
  fetchComputedPartBSection4,
  mergePartBSection4ForOperatingStates,
  validateSection4AgainstPlasticConsumed,
  formatSection4PartAIssue,
} from '../utils/registrationPartBSection4.js';
import { getCpcbPortalPartA3cYears } from '../../shared/financialYearScope.js';
import {
  fetchComputedPartBSection5,
  mergePartBSection5b,
  mergePartBSection5d,
  refreshSec5RowFromSource,
} from '../utils/registrationPartBSection5.js';
import { PART_B_SECTION4_CATEGORY_LABELS } from '../../shared/partBSection4.js';
import {
  PORTAL_PLASTIC_MATERIALS,
  PORTAL_SEC5_ENTITY_TYPES,
  normalizeSec5bRowForPortal,
  normalizeSec5dRowForPortal,
  toPortalInputDate,
} from '../../shared/partBSection5.js';
import {
  CURRENT_FY_COMMENCEMENT_HINT,
  requiresHistoricalEprData,
} from '../../shared/commencementYearScope.js';

const inputClass = 'w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm';
const selectClass = 'w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm bg-white';
const labelClass = 'block text-xs font-medium text-slate-700 mb-1';

const PLASTIC_CATEGORIES = PART_B_SECTION4_CATEGORY_LABELS;

const FINANCIAL_YEARS = ['2023-24', '2024-25', '2025-26'];

export default function RegistrationPartB({
  generalInfo,
  setGeneralInfo,
  gstin = '',
}) {
  const [activeModal, setActiveModal] = useState(null);
  const [modalData, setModalData] = useState({});
  const operatingStatesKey = JSON.stringify(generalInfo.operatingStates || []);
  const hydrateRef = useRef('');
  const showHistoricalSections = requiresHistoricalEprData(generalInfo.yearOfCommencement);

  const section4PartAIssues = useMemo(
    () => (showHistoricalSections
      ? validateSection4AgainstPlasticConsumed(
        generalInfo.partBSection4 || [],
        generalInfo.plasticConsumed || {},
        getCpcbPortalPartA3cYears(),
      )
      : []),
    [generalInfo.partBSection4, generalInfo.plasticConsumed, showHistoricalSections],
  );

  useEffect(() => {
    if (!showHistoricalSections) return undefined;
    const operatingStates = generalInfo.operatingStates || [];
    if (!operatingStates.length) {
      if ((generalInfo.partBSection4 || []).length) {
        setGeneralInfo((prev) => ({ ...prev, partBSection4: [] }));
      }
      return undefined;
    }

    const hydrateKey = `${operatingStatesKey}::${gstin || ''}::${getCpcbPortalPartA3cYears().join('|')}`;
    if (hydrateRef.current === hydrateKey) return undefined;

    let cancelled = false;
    (async () => {
      try {
        const result = await fetchComputedPartBSection4({
          gstin,
          operatingStates,
        });
        if (cancelled || !result) return;

        setGeneralInfo((prev) => {
          const merged = mergePartBSection4ForOperatingStates(
            prev.partBSection4,
            result.groups,
            operatingStates,
          );
          const same = JSON.stringify(prev.partBSection4 || []) === JSON.stringify(merged);
          if (same) return prev;
          return { ...prev, partBSection4: merged };
        });
        hydrateRef.current = hydrateKey;
      } catch (err) {
        console.error('Failed to hydrate Part B Section 4:', err);
      }
    })();

    return () => { cancelled = true; };
  }, [operatingStatesKey, gstin, setGeneralInfo, showHistoricalSections]);

  useEffect(() => {
    if (!showHistoricalSections) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const result = await fetchComputedPartBSection5({ gstin });
        if (cancelled || !result) return;

        setGeneralInfo((prev) => {
          const existing5b = prev.partBTransactions?.sec5b || [];
          const existing5d = prev.partBTransactions?.sec5d || [];
          const sec5b = mergePartBSection5b(existing5b, result.sec5b || []);
          const sec5d = mergePartBSection5d(existing5d, result.sec5d || []);
          const same = JSON.stringify(existing5b) === JSON.stringify(sec5b)
            && JSON.stringify(existing5d) === JSON.stringify(sec5d);
          if (same) return prev;
          return {
            ...prev,
            partBTransactions: {
              ...(prev.partBTransactions || {}),
              sec5b,
              sec5d,
            },
          };
        });
      } catch (err) {
        console.error('Failed to hydrate Part B Section 5:', err);
      }
    })();

    return () => { cancelled = true; };
  }, [gstin, setGeneralInfo, showHistoricalSections]);

  const updateSection4Cell = (groupIndex, catIndex, field, value) => {
    setGeneralInfo((prev) => {
      const groups = [...(prev.partBSection4 || [])];
      const group = { ...groups[groupIndex], categories: [...(groups[groupIndex]?.categories || [])] };
      group.categories[catIndex] = { ...group.categories[catIndex], [field]: value };
      groups[groupIndex] = group;
      return { ...prev, partBSection4: groups };
    });
  };

  const openModal = async (secKey, title, existingData = null, editIndex = null) => {
    let row = existingData;
    if (row?.sourceRecordId && (secKey === 'sec5b' || secKey === 'sec5d')) {
      try {
        const fresh = await refreshSec5RowFromSource({
          secKey,
          sourceRecordId: row.sourceRecordId,
          gstin,
        });
        if (fresh) {
          row = {
            ...row,
            ...fresh,
            invoiceDoc: row.invoiceDoc || fresh.invoiceDoc || '',
          };
        }
      } catch (err) {
        console.error('Failed to refresh Section 5 row from Doc Processor:', err);
      }
    }
    if (row) {
      if (secKey === 'sec5b') row = normalizeSec5bRowForPortal(row);
      if (secKey === 'sec5d') row = normalizeSec5dRowForPortal(row);
    }
    setModalData(
      row
        ? {
            ...row,
            _title: title,
            _secKey: secKey,
            _isView: false,
            _editIndex: editIndex,
          }
        : {
            _title: title,
            _secKey: secKey,
            _isView: false,
            _editIndex: null,
            ...(secKey === 'sec5b'
              ? {
                  regType: 'UnRegistered',
                  country: 'India',
                  recycledPercent: '0',
                  entityType: 'Importer',
                  materialType: 'Others',
                }
              : secKey === 'sec5d'
                ? {
                    regType: 'UnRegistered',
                    recycledPercent: '0',
                    entityType: 'Brand Owner',
                    materialType: 'Others',
                  }
                : {}),
          },
    );
    setActiveModal(secKey);
  };

  const saveModalData = () => {
    if (modalData._secKey === 'sec5b' || modalData._secKey === 'sec5d') {
      if (!modalData.entityName?.trim()) {
        alert('Name of the Entity is required');
        return;
      }
      if (!modalData.quantity) {
        alert('Total Plastic Quantity is required');
        return;
      }
    } else if (!modalData.quantity) {
      alert('Quantity is required');
      return;
    }

    const { _secKey, _title, _isView, _editIndex, ...data } = modalData;

    setGeneralInfo((prev) => {
      const currentRows = [...(prev.partBTransactions?.[_secKey] || [])];
      if (_editIndex != null && _editIndex >= 0) {
        currentRows[_editIndex] = data;
      } else {
        currentRows.push(data);
      }
      return {
        ...prev,
        partBTransactions: {
          ...(prev.partBTransactions || {}),
          [_secKey]: currentRows,
        },
      };
    });
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
      {renderSelect('Entity Type', 'entityType', PORTAL_SEC5_ENTITY_TYPES)}
      {renderInput('Name Of The Entity', 'entityName')}
      {renderSelect('Country', 'country', ['India', 'Other'])}
      {renderInput('Address', 'address')}
      {renderInput('Mobile Number', 'mobile')}
      {renderSelect('Plastic Material Type', 'materialType', PORTAL_PLASTIC_MATERIALS)}
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
        {modalData.invoiceDoc && (
          <UploadedFilePreview filePath={modalData.invoiceDoc} />
        )}
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
      {renderSelect('Entity Type', 'entityType', PORTAL_SEC5_ENTITY_TYPES)}
      {renderInput('Name of the Entity', 'entityName')}
      {renderInput('Address', 'address')}
      {renderSelect('State', 'state', INDIAN_STATES)}
      {renderInput('Mobile Number', 'mobile')}
      {renderSelect('Plastic Material Type', 'materialType', PORTAL_PLASTIC_MATERIALS)}
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

  const renderSec5bTable = () => {
    const rows = (generalInfo.partBTransactions?.sec5b || []).map(normalizeSec5bRowForPortal);
    return (
      <div className="mb-6 border rounded-lg overflow-hidden bg-white">
        <div className="bg-[#0b6c7a] px-4 py-3 border-b flex justify-between items-center text-white">
          <div>
            <h4 className="font-semibold text-sm">5 b) Details of Plastic Raw Material/Packaging Procured from Non-Registered Entity</h4>
            <p className="text-[11px] text-white/80 mt-1">Prefilled from published Unregistered procurement invoices — review, edit, then upload via automation.</p>
          </div>
          <button
            type="button"
            onClick={() => openModal('sec5b', 'Add Section 5b Entry')}
            className="flex items-center justify-center bg-white/20 hover:bg-white/30 rounded-full w-6 h-6"
            title="Add manually"
          >
            <Plus size={16} />
          </button>
        </div>
        <div className="overflow-x-auto">
          {rows.length === 0 ? (
            <div className="text-center text-sm text-slate-500 py-8 bg-slate-50 italic">
              No Unregistered procurement records found. Publish procurement documents with Registration Type = Unregistered.
            </div>
          ) : (
            <table className="w-full text-sm text-left min-w-[960px]">
              <thead className="bg-[#0b6c7a] text-white">
                <tr>
                  <th className="px-3 py-2 font-medium">Sr.</th>
                  <th className="px-3 py-2 font-medium">Entity Name</th>
                  <th className="px-3 py-2 font-medium">Entity Type</th>
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Quantity (Ton)</th>
                  <th className="px-3 py-2 font-medium">Category</th>
                  <th className="px-3 py-2 font-medium">Financial Year</th>
                  <th className="px-3 py-2 font-medium">Invoice PDF</th>
                  <th className="px-3 py-2 font-medium text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {rows.map((row, i) => (
                  <tr key={row.sourceRecordId || i} className="hover:bg-slate-50">
                    <td className="px-3 py-2">{i + 1}</td>
                    <td className="px-3 py-2">{row.entityName || '—'}</td>
                    <td className="px-3 py-2">{row.entityType || '—'}</td>
                    <td className="px-3 py-2">{toPortalInputDate(row.date) || row.date || '—'}</td>
                    <td className="px-3 py-2 tabular-nums">{row.quantity || '—'}</td>
                    <td className="px-3 py-2">{row.category || '—'}</td>
                    <td className="px-3 py-2">{row.financialYear || '—'}</td>
                    <td className="px-3 py-2 text-xs text-emerald-700">
                      {row.invoiceDoc ? (
                        <UploadedFilePreview filePath={row.invoiceDoc} className="mt-0" />
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <div className="flex justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => openModal('sec5b', 'Edit Section 5b Entry', row, i)}
                          className="text-blue-600 hover:text-blue-800 p-1 text-xs font-medium"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setGeneralInfo((prev) => ({
                              ...prev,
                              partBTransactions: {
                                ...prev.partBTransactions,
                                sec5b: prev.partBTransactions.sec5b.filter((_, idx) => idx !== i),
                              },
                            }));
                          }}
                          className="text-red-500 hover:text-red-700 p-1"
                          title="Delete"
                        >
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

  const renderSec5dTable = () => {
    const rows = (generalInfo.partBTransactions?.sec5d || []).map(normalizeSec5dRowForPortal);
    return (
      <div className="mb-6 border rounded-lg overflow-hidden bg-white">
        <div className="bg-[#0b6c7a] px-4 py-3 border-b flex justify-between items-center text-white">
          <div>
            <h4 className="font-semibold text-sm">5 d) Details of Plastic Raw Material/Packaging Sold to UnRegistered PIBOs</h4>
            <p className="text-[11px] text-white/80 mt-1">Prefilled from published Unregistered sales invoices — review, edit, then upload via automation.</p>
          </div>
          <button
            type="button"
            onClick={() => openModal('sec5d', 'Add Section 5d Entry')}
            className="flex items-center justify-center bg-white/20 hover:bg-white/30 rounded-full w-6 h-6"
            title="Add manually"
          >
            <Plus size={16} />
          </button>
        </div>
        <div className="overflow-x-auto">
          {rows.length === 0 ? (
            <div className="text-center text-sm text-slate-500 py-8 bg-slate-50 italic">
              No Unregistered sales records found. Publish sales documents with Registration Type = Unregistered.
            </div>
          ) : (
            <table className="w-full text-sm text-left min-w-[1100px]">
              <thead className="bg-[#0b6c7a] text-white">
                <tr>
                  <th className="px-3 py-2 font-medium">Sr.</th>
                  <th className="px-3 py-2 font-medium">Entity Name</th>
                  <th className="px-3 py-2 font-medium">Entity Type</th>
                  <th className="px-3 py-2 font-medium">State</th>
                  <th className="px-3 py-2 font-medium">Quantity (Ton)</th>
                  <th className="px-3 py-2 font-medium">Category</th>
                  <th className="px-3 py-2 font-medium">Financial Year</th>
                  <th className="px-3 py-2 font-medium">GST</th>
                  <th className="px-3 py-2 font-medium">E-Invoice No.</th>
                  <th className="px-3 py-2 font-medium text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {rows.map((row, i) => (
                  <tr key={row.sourceRecordId || i} className="hover:bg-slate-50">
                    <td className="px-3 py-2">{i + 1}</td>
                    <td className="px-3 py-2">{row.entityName || '—'}</td>
                    <td className="px-3 py-2">{row.entityType || '—'}</td>
                    <td className="px-3 py-2">{row.state || '—'}</td>
                    <td className="px-3 py-2 tabular-nums">{row.quantity || '—'}</td>
                    <td className="px-3 py-2">{row.category || '—'}</td>
                    <td className="px-3 py-2">{row.financialYear || '—'}</td>
                    <td className="px-3 py-2 text-xs">{row.gst || '—'}</td>
                    <td className="px-3 py-2 text-xs">{row.invoiceNo || '—'}</td>
                    <td className="px-3 py-2 text-center">
                      <div className="flex justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => openModal('sec5d', 'Edit Section 5d Entry', row, i)}
                          className="text-blue-600 hover:text-blue-800 p-1 text-xs font-medium"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setGeneralInfo((prev) => ({
                              ...prev,
                              partBTransactions: {
                                ...prev.partBTransactions,
                                sec5d: prev.partBTransactions.sec5d.filter((_, idx) => idx !== i),
                              },
                            }));
                          }}
                          className="text-red-500 hover:text-red-700 p-1"
                          title="Delete"
                        >
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

        {!showHistoricalSections ? (
          <div className="text-sm text-teal-800 bg-teal-50 border border-teal-100 rounded-lg px-4 py-3 mb-6">
            {CURRENT_FY_COMMENCEMENT_HINT}
          </div>
        ) : null}
        
        {showHistoricalSections ? (
        <div className="bg-white border rounded-xl shadow-sm p-5 mb-6">
          <div className="mb-3">
            <h4 className="font-semibold text-slate-700 text-sm">
              4. State-wise, Category-wise Quantity of PW generated (TPA)
            </h4>
            <p className="text-xs text-slate-500 mt-1">
              Rows are created from Part A <strong>Operating States</strong>. Post-consumer values come from published sales MT by state; pre-consumer from procurement MT. Edit before upload if needed.
            </p>
            {!generalInfo.operatingStates?.length ? (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-md px-3 py-2 mt-2">
                Select operating states in Part A to show state-wise rows here.
              </p>
            ) : null}
            {section4PartAIssues.length > 0 ? (
              <div className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mt-2 space-y-1">
                <p className="font-semibold">Part A 3c and Section 4 do not match (CPCB ±40% rule)</p>
                {section4PartAIssues.map((issue) => (
                  <p key={`${issue.year}-${issue.catKey}`}>{formatSection4PartAIssue(issue)}</p>
                ))}
                <p className="text-amber-800">
                  Align Part A → Plastic Consumed (3c) with Part B → Section 4 totals, then run Register / automation.
                </p>
              </div>
            ) : null}
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
                    <td colSpan={7} className="text-center py-8 text-slate-500 italic bg-slate-50">No data available</td>
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
                          <input
                            type="number"
                            min="0"
                            step="any"
                            className="w-full px-2 py-1 border border-slate-300 rounded text-slate-800 outline-none focus:ring-1 focus:ring-teal-500 tabular-nums"
                            value={cat.preConsumer ?? '0'}
                            onChange={(e) => updateSection4Cell(groupIndex, catIndex, 'preConsumer', e.target.value)}
                          />
                        </td>
                        <td className="px-3 py-2 border-r">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            className="w-full px-2 py-1 border border-slate-300 rounded text-slate-800 outline-none focus:ring-1 focus:ring-teal-500 tabular-nums"
                            value={cat.postConsumer ?? '0'}
                            onChange={(e) => updateSection4Cell(groupIndex, catIndex, 'postConsumer', e.target.value)}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            className="w-full px-2 py-1 border border-slate-300 rounded text-slate-800 outline-none focus:ring-1 focus:ring-teal-500 tabular-nums"
                            value={cat.exportQuantity ?? '0'}
                            onChange={(e) => updateSection4Cell(groupIndex, catIndex, 'exportQuantity', e.target.value)}
                          />
                        </td>
                      </tr>
                    ))
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        ) : null}

        {showHistoricalSections ? (
        <div className="bg-white border rounded-xl shadow-sm p-5">
          <h4 className="font-semibold text-slate-800 text-base mb-4 border-b pb-2">5. Details of Plastic Raw Material/Packaging</h4>
          
          {renderTransactionTable('Details of Plastic Raw Material/Packaging Procured from Registered Entity', 'sec5a')}
          {renderSec5bTable()}
          {renderTransactionTable('Details of Plastic Raw Material/Packaging Sold to Registered PIBOs', 'sec5c')}
          {renderSec5dTable()}
        </div>
        ) : null}
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
                  <button type="button" onClick={saveModalData} className="px-6 py-2 bg-[#0b6c7a] text-white rounded-lg hover:bg-teal-800 text-sm font-medium">
                    {modalData._editIndex != null ? 'Save Changes' : 'Save & Add'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
