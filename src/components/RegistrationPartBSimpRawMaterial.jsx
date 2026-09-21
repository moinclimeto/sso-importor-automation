import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, RefreshCw, Download, Upload } from 'lucide-react';
import { getCpcbPortalPartA3cYears } from '../../shared/financialYearScope.js';
import {
  SIMP_PLASTIC_TYPES,
  SIMP_REGISTRATION_TYPES,
  SIMP_SALES_ENTITY_TYPES,
  SIMP_IMPORT_EXCEL_FILE_NAME,
  SIMP_SUPPLY_EXCEL_FILE_NAME,
  emptySimpImportRow,
  emptySimpSupplyRow,
  validateSimpRawMaterialSupplyAgainstImport,
  validateSimpImportCoveringRequiredYears,
  buildSimpImportRowsFromPurchases,
  buildSimpSupplyRowsFromSales,
  requiredSimpImportFinancialYears,
  importRowQuantity,
  generateSimpImportDetailsExcelBuffer,
  generateSimpSupplyDetailsExcelBuffer,
  parseSimpImportDetailsExcelBuffer,
  parseSimpSupplyDetailsExcelBuffer,
  prepareSimpSupplyRowsForPortal,
  validateSimpSupplyPortalRows,
} from '../../shared/simpRawMaterialPartB.js';
import { resolveCompanyIdFromGstin } from '../utils/resolveCompanyIdFromGstin.js';

const inputClass =
  'w-full min-w-[7rem] px-2 py-1.5 border border-slate-300 rounded-md text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white';

function downloadExcelBuffer(buffer, fileName) {
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function ExcelActionButtons({ onDownload, onUploadClick, busy }) {
  return (
    <>
      <button
        type="button"
        onClick={onDownload}
        disabled={busy}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/15 hover:bg-white/25 text-xs font-medium disabled:opacity-60"
      >
        <Download size={14} />
        Download Excel
      </button>
      <button
        type="button"
        onClick={onUploadClick}
        disabled={busy}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/15 hover:bg-white/25 text-xs font-medium disabled:opacity-60"
      >
        <Upload size={14} />
        Upload Excel
      </button>
    </>
  );
}

function TableCard({ title, columns, rows, onAdd, onRemove, onChange, children, extraActions, isPreview = false }) {
  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
      <div className="flex items-center justify-between gap-3 px-4 py-3 bg-teal-700 text-white">
        <h4 className="text-sm font-semibold">{title}</h4>
        {!isPreview ? (
        <div className="flex items-center gap-2">
          {extraActions}
          <button
            type="button"
            onClick={onAdd}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/15 hover:bg-white/25 text-xs font-medium"
          >
            <Plus size={14} />
            Add row
          </button>
        </div>
        ) : null}
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-teal-800 text-white">
            <tr>
              <th className="px-2 py-2 text-left font-medium whitespace-nowrap">Sr No.</th>
              {columns.map((col) => (
                <th key={col.key} className="px-2 py-2 text-left font-medium whitespace-nowrap">{col.header}</th>
              ))}
              <th className="px-2 py-2 w-10" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 2} className="px-4 py-6 text-center text-slate-500 text-sm">
                  No rows yet. Add at least the last two financial years if you have import / supply quantities (TPA).
                </td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr key={row.id || index} className="border-t border-slate-100 align-top">
                  <td className="px-2 py-2 text-slate-500">{index + 1}</td>
                  {columns.map((col) => (
                    <td key={col.key} className="px-2 py-2">
                      {isPreview
                        ? <span className="text-slate-800">{String(row[col.key] ?? '').trim() || (col.key === 'quantityTons' ? String(row.quantityTpa || '') : '') || '—'}</span>
                        : col.render(row, (value) => onChange(index, col.key, value))}
                    </td>
                  ))}
                  {!isPreview ? (
                  <td className="px-2 py-2">
                    <button
                      type="button"
                      onClick={() => onRemove(index)}
                      className="p-1.5 text-slate-400 hover:text-rose-600"
                      aria-label="Remove row"
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {children}
    </div>
  );
}

export default function RegistrationPartBSimpRawMaterial({
  generalInfo,
  setGeneralInfo,
  onPersist,
  gstin = '',
  fallbackContact = '',
  isPreview = false,
}) {
  const fyOptions = useMemo(() => getCpcbPortalPartA3cYears(), []);
  const requiredYears = useMemo(() => requiredSimpImportFinancialYears(), []);
  const importRows = Array.isArray(generalInfo.simpImportDetails) ? generalInfo.simpImportDetails : [];
  const supplyRows = Array.isArray(generalInfo.simpSupplyDetails) ? generalInfo.simpSupplyDetails : [];
  const gstinValue = gstin || generalInfo.gstin || generalInfo.unitGst || generalInfo.plantGst || '';
  const contactFallback = fallbackContact || generalInfo.mobile || '';
  const supplyHasData = supplyRows.some(
    (row) => importRowQuantity(row) > 0 || String(row.entityName || '').trim(),
  );
  const issues = useMemo(
    () => validateSimpRawMaterialSupplyAgainstImport(importRows, supplyRows),
    [importRows, supplyRows],
  );
  const yearIssues = useMemo(
    () => validateSimpImportCoveringRequiredYears(importRows, requiredYears),
    [importRows, requiredYears],
  );
  const contactIssues = useMemo(
    () => validateSimpSupplyPortalRows(
      (supplyRows || []).filter((row) => importRowQuantity(row) > 0),
    ),
    [supplyRows],
  );
  const [preparing, setPreparing] = useState(false);
  const [excelBusy, setExcelBusy] = useState(false);
  const [prepareMessage, setPrepareMessage] = useState('');
  const importExcelInputRef = useRef(null);
  const supplyExcelInputRef = useRef(null);
  const autoLoadedSupplyRef = useRef(false);

  const patch = (key, nextRows) => {
    setGeneralInfo((prev) => {
      const next = { ...prev, [key]: nextRows };
      Promise.resolve(onPersist?.(next)).catch((err) => console.error('Failed to save SIMP Part B:', err));
      return next;
    });
  };

  const fySelect = (value, onValue) => (
    <select value={value || ''} onChange={(e) => onValue(e.target.value)} className={inputClass}>
      <option value="">FY</option>
      {fyOptions.map((fy) => (
        <option key={fy} value={fy}>{fy}</option>
      ))}
    </select>
  );

  const plasticSelect = (value, onValue) => (
    <select value={value || ''} onChange={(e) => onValue(e.target.value)} className={inputClass}>
      <option value="">Type</option>
      {value && !SIMP_PLASTIC_TYPES.includes(value) ? (
        <option value={value}>{value}</option>
      ) : null}
      {SIMP_PLASTIC_TYPES.map((pt) => (
        <option key={pt} value={pt}>{pt}</option>
      ))}
    </select>
  );

  const importColumns = [
    {
      header: 'Name',
      key: 'entityName',
      render: (row, onValue) => (
        <input value={row.entityName || ''} onChange={(e) => onValue(e.target.value)} className={inputClass} />
      ),
    },
    {
      header: 'Country',
      key: 'country',
      render: (row, onValue) => (
        <input value={row.country || ''} onChange={(e) => onValue(e.target.value)} className={inputClass} />
      ),
    },
    {
      header: 'Address',
      key: 'address',
      render: (row, onValue) => (
        <input value={row.address || ''} onChange={(e) => onValue(e.target.value)} className={inputClass} />
      ),
    },
    {
      header: 'Contact *',
      key: 'contact',
      render: (row, onValue) => (
        <input value={row.contact || ''} onChange={(e) => onValue(e.target.value)} className={inputClass} />
      ),
    },
    { header: 'Financial Year', key: 'financialYear', render: (row, onValue) => fySelect(row.financialYear, onValue) },
    { header: 'Type Of Plastic Raw Material', key: 'plasticType', render: (row, onValue) => plasticSelect(row.plasticType, onValue) },
    {
      header: 'Quantity (tons)',
      key: 'quantityTons',
      render: (row, onValue) => (
        <input
          type="number"
          min="0"
          step="0.01"
          value={row.quantityTons ?? row.quantityTpa ?? ''}
          onChange={(e) => onValue(e.target.value)}
          className={inputClass}
        />
      ),
    },
    {
      header: 'Import Date (YYYY-MM-DD)',
      key: 'importDate',
      render: (row, onValue) => (
        <input
          type="date"
          value={row.importDate || ''}
          onChange={(e) => onValue(e.target.value)}
          className={inputClass}
        />
      ),
    },
  ];

  const supplyColumns = [
    {
      header: 'Registration Type',
      key: 'registrationType',
      render: (row, onValue) => (
        <select value={row.registrationType || 'Registered'} onChange={(e) => onValue(e.target.value)} className={inputClass}>
          {SIMP_REGISTRATION_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      ),
    },
    {
      header: 'Entity Type',
      key: 'entityType',
      render: (row, onValue) => (
        <select value={row.entityType || ''} onChange={(e) => onValue(e.target.value)} className={inputClass}>
          <option value="">Type</option>
          {row.entityType && !SIMP_SALES_ENTITY_TYPES.includes(row.entityType) ? (
            <option value={row.entityType}>{row.entityType}</option>
          ) : null}
          {SIMP_SALES_ENTITY_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      ),
    },
    {
      header: 'EPR Registration No.',
      key: 'eprRegistrationNo',
      render: (row, onValue) => (
        <input value={row.eprRegistrationNo || ''} onChange={(e) => onValue(e.target.value)} className={inputClass} />
      ),
    },
    {
      header: 'Name',
      key: 'entityName',
      render: (row, onValue) => (
        <input value={row.entityName || ''} onChange={(e) => onValue(e.target.value)} className={inputClass} />
      ),
    },
    {
      header: 'Country',
      key: 'country',
      render: (row, onValue) => (
        <input value={row.country || ''} onChange={(e) => onValue(e.target.value)} className={inputClass} />
      ),
    },
    {
      header: 'Address',
      key: 'address',
      render: (row, onValue) => (
        <input value={row.address || ''} onChange={(e) => onValue(e.target.value)} className={inputClass} />
      ),
    },
    {
      header: 'Contact *',
      key: 'contact',
      render: (row, onValue) => (
        <input value={row.contact || ''} onChange={(e) => onValue(e.target.value)} className={inputClass} />
      ),
    },
    { header: 'Financial Year', key: 'financialYear', render: (row, onValue) => fySelect(row.financialYear, onValue) },
    { header: 'Type Of Plastic Raw Material', key: 'plasticType', render: (row, onValue) => plasticSelect(row.plasticType, onValue) },
    {
      header: 'Quantity (tons)',
      key: 'quantityTons',
      render: (row, onValue) => (
        <input
          type="number"
          min="0"
          step="0.01"
          value={row.quantityTons ?? row.quantityTpa ?? ''}
          onChange={(e) => onValue(e.target.value)}
          className={inputClass}
        />
      ),
    },
    {
      header: 'Sales Date (YYYY-MM-DD)',
      key: 'salesDate',
      render: (row, onValue) => (
        <input
          type="date"
          value={row.salesDate || ''}
          onChange={(e) => onValue(e.target.value)}
          className={inputClass}
        />
      ),
    },
  ];

  const updateRow = (listKey, index, field, value) => {
    const list = listKey === 'simpImportDetails' ? importRows : supplyRows;
    const next = list.map((row, i) => {
      if (i !== index) return row;
      const patched = { ...row, [field]: value };
      if (field === 'quantityTons') patched.quantityTpa = value;
      if (field === 'quantityTpa') patched.quantityTons = value;
      return patched;
    });
    patch(listKey, next);
  };

  const prepareFromDocProcessor = async () => {
    setPreparing(true);
    setPrepareMessage('');
    try {
      if (!window.pwp?.purchases?.getAll) {
        setPrepareMessage('Open the desktop app to prepare import rows from Doc Processor.');
        return;
      }
      const [purchases, companies, supplierMaster] = await Promise.all([
        window.pwp.purchases.getAll(),
        window.pwp.companies?.getAll?.() ?? [],
        window.pwp.supplierMaster?.getAll?.() ?? [],
      ]);
      const companyId = resolveCompanyIdFromGstin(companies, gstinValue);
      const rows = buildSimpImportRowsFromPurchases(purchases || [], {
        reportingYears: requiredYears,
        companyId,
        supplierMaster: supplierMaster || [],
      });
      if (!rows.length) {
        setPrepareMessage('No published purchase invoices found for 2024-25 / 2025-26. Add rows manually or publish purchases in Doc Processor.');
        return;
      }
      patch('simpImportDetails', rows);
      setPrepareMessage(`Prepared ${rows.length} import row(s) from published Doc Processor purchases.`);
    } catch (err) {
      setPrepareMessage(err?.message || 'Could not prepare import details from Doc Processor.');
    } finally {
      setPreparing(false);
    }
  };

  const prepareSupplyFromDocProcessor = async ({ silent = false } = {}) => {
    setPreparing(true);
    if (!silent) setPrepareMessage('');
    try {
      if (!window.pwp?.sales?.getAll) {
        if (!silent) setPrepareMessage('Open the desktop app to prepare sales rows from Doc Processor.');
        return;
      }
      const [publishedSales, companies, supplierMaster] = await Promise.all([
        window.pwp.sales.getAll({ doc_status: 'published' }),
        window.pwp.companies?.getAll?.() ?? [],
        window.pwp.supplierMaster?.getAll?.() ?? [],
      ]);
      let sales = Array.isArray(publishedSales) ? publishedSales : [];
      if (!sales.length) {
        const allSales = await window.pwp.sales.getAll();
        sales = Array.isArray(allSales) ? allSales : [];
      }
      const companyId = resolveCompanyIdFromGstin(companies, gstinValue);
      const rows = buildSimpSupplyRowsFromSales(sales, {
        reportingYears: requiredYears,
        companyId,
        supplierMaster: supplierMaster || [],
      });
      if (!rows.length) {
        if (!silent) {
          setPrepareMessage('No published sales invoices found for 2024-25 / 2025-26. Add rows manually or publish sales in Doc Processor.');
        }
        return;
      }
      patch('simpSupplyDetails', prepareSimpSupplyRowsForPortal(rows, { fallbackContact: contactFallback }));
      setPrepareMessage(`Prepared ${rows.length} sales row(s) from published Doc Processor sales.`);
    } catch (err) {
      if (!silent) setPrepareMessage(err?.message || 'Could not prepare sales details from Doc Processor.');
    } finally {
      setPreparing(false);
    }
  };

  useEffect(() => {
    if (supplyHasData || autoLoadedSupplyRef.current || !window.pwp?.sales?.getAll) return undefined;
    autoLoadedSupplyRef.current = true;
    prepareSupplyFromDocProcessor({ silent: true });
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gstinValue]);

  const downloadImportExcel = async () => {
    setExcelBusy(true);
    setPrepareMessage('');
    try {
      const buffer = await generateSimpImportDetailsExcelBuffer(importRows);
      downloadExcelBuffer(buffer, SIMP_IMPORT_EXCEL_FILE_NAME);
      setPrepareMessage(
        importRows.length
          ? `Downloaded ${SIMP_IMPORT_EXCEL_FILE_NAME}. Edit or add rows in Excel, then Upload Excel.`
          : `Downloaded empty ${SIMP_IMPORT_EXCEL_FILE_NAME}. Fill rows and Upload Excel.`,
      );
    } catch (err) {
      setPrepareMessage(err?.message || 'Could not download import Excel.');
    } finally {
      setExcelBusy(false);
    }
  };

  const downloadSupplyExcel = async () => {
    setExcelBusy(true);
    setPrepareMessage('');
    try {
      const buffer = await generateSimpSupplyDetailsExcelBuffer(supplyRows, {
        fallbackContact: contactFallback,
      });
      downloadExcelBuffer(buffer, SIMP_SUPPLY_EXCEL_FILE_NAME);
      setPrepareMessage(
        supplyRows.length
          ? `Downloaded ${SIMP_SUPPLY_EXCEL_FILE_NAME}. Edit or add rows in Excel, then Upload Excel.`
          : `Downloaded empty ${SIMP_SUPPLY_EXCEL_FILE_NAME}. Fill rows and Upload Excel.`,
      );
    } catch (err) {
      setPrepareMessage(err?.message || 'Could not download supply Excel.');
    } finally {
      setExcelBusy(false);
    }
  };

  const readExcelFile = (file) => file.arrayBuffer();

  const uploadImportExcel = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setExcelBusy(true);
    setPrepareMessage('');
    try {
      const rows = await parseSimpImportDetailsExcelBuffer(await readExcelFile(file));
      if (!rows.length) {
        setPrepareMessage('No import rows found in that Excel. Check the Operations sheet headers match the CPCB template.');
        return;
      }
      patch('simpImportDetails', rows);
      setPrepareMessage(`Loaded ${rows.length} import row(s) from Excel. You can still edit cells or add rows here.`);
    } catch (err) {
      setPrepareMessage(err?.message || 'Could not read import Excel.');
    } finally {
      setExcelBusy(false);
    }
  };

  const uploadSupplyExcel = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setExcelBusy(true);
    setPrepareMessage('');
    try {
      const rows = await parseSimpSupplyDetailsExcelBuffer(await readExcelFile(file));
      if (!rows.length) {
        setPrepareMessage('No supply rows found in that Excel. Use Importer Sales Template headers (Operations sheet).');
        return;
      }
      patch('simpSupplyDetails', prepareSimpSupplyRowsForPortal(rows, { fallbackContact: contactFallback }));
      setPrepareMessage(`Loaded ${rows.length} supply row(s) from Excel. You can still edit cells or add rows here.`);
    } catch (err) {
      setPrepareMessage(err?.message || 'Could not read supply Excel.');
    } finally {
      setExcelBusy(false);
    }
  };

  return (
    <div className="space-y-6 mt-8 border-t pt-8">
      <div>
        <h3 className="text-lg font-bold text-slate-800">Part B: Production and Sales Bulk Entry</h3>
        <p className="text-sm text-slate-500 mt-1">
          Import table uses CPCB <strong>Importer Import Template.xlsx</strong>. Supply table uses <strong>Importer Sales Template.xlsx</strong> (Operations sheet).
          Prepare from published Doc Processor purchases/sales, or download Excel, edit rows, and upload it back.
          Automation uploads these Excels on the portal. Portal needs at least one import row in each of {requiredYears.join(' and ')}.
        </p>
      </div>

      <TableCard
        title="Import Details of last two Financial Years"
        columns={importColumns}
        rows={importRows}
        isPreview={isPreview}
        onAdd={() => patch('simpImportDetails', [...importRows, emptySimpImportRow()])}
        onRemove={(index) => patch('simpImportDetails', importRows.filter((_, i) => i !== index))}
        onChange={(index, key, value) => updateRow('simpImportDetails', index, key, value)}
        extraActions={(
          <>
            <ExcelActionButtons
              busy={excelBusy}
              onDownload={downloadImportExcel}
              onUploadClick={() => importExcelInputRef.current?.click()}
            />
            <button
              type="button"
              onClick={prepareFromDocProcessor}
              disabled={preparing || excelBusy}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/15 hover:bg-white/25 text-xs font-medium disabled:opacity-60"
            >
              <RefreshCw size={14} className={preparing ? 'animate-spin' : ''} />
              {preparing ? 'Preparing…' : 'Prepare from Doc Processor'}
            </button>
            <input
              ref={importExcelInputRef}
              type="file"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              className="hidden"
              onChange={uploadImportExcel}
            />
          </>
        )}
      />

      <TableCard
        title="List of Producers and Quantum of Raw Materials supplied to Producers/Sellers in last two Financial Years"
        columns={supplyColumns}
        rows={supplyRows}
        isPreview={isPreview}
        onAdd={() => patch('simpSupplyDetails', [...supplyRows, emptySimpSupplyRow()])}
        onRemove={(index) => patch('simpSupplyDetails', supplyRows.filter((_, i) => i !== index))}
        onChange={(index, key, value) => updateRow('simpSupplyDetails', index, key, value)}
        extraActions={(
          <>
            <ExcelActionButtons
              busy={excelBusy}
              onDownload={downloadSupplyExcel}
              onUploadClick={() => supplyExcelInputRef.current?.click()}
            />
            <button
              type="button"
              onClick={prepareSupplyFromDocProcessor}
              disabled={preparing || excelBusy}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/15 hover:bg-white/25 text-xs font-medium disabled:opacity-60"
            >
              <RefreshCw size={14} className={preparing ? 'animate-spin' : ''} />
              {preparing ? 'Preparing…' : 'Prepare from Doc Processor'}
            </button>
            <input
              ref={supplyExcelInputRef}
              type="file"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              className="hidden"
              onChange={uploadSupplyExcel}
            />
          </>
        )}
      />

      {prepareMessage ? (
        <p className="text-sm text-slate-600 -mt-4">{prepareMessage}</p>
      ) : null}

      {yearIssues.length > 0 ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 space-y-1">
          {yearIssues.map((issue) => (
            <p key={issue.missingYears.join('-')}>{issue.message}</p>
          ))}
        </div>
      ) : null}

      {contactIssues.length > 0 ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 space-y-1">
          <p className="font-medium">CPCB sales Excel will reject these rows:</p>
          {contactIssues.map((issue) => (
            <p key={`${issue.row}-${issue.field}`}>{issue.message}</p>
          ))}
          <p>Fill Contact (mobile) on every sales row. If the buyer mobile is missing, enter it here before Register.</p>
        </div>
      ) : null}

      {issues.length > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 space-y-1">
          {issues.map((issue) => (
            <p key={`${issue.financialYear}-${issue.plasticType}`}>{issue.message}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
