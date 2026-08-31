import React, { useEffect, useMemo, useState } from 'react';
import { FileSignature, FileText, PenLine, Sparkles, Upload } from 'lucide-react';
import UploadedFilePreview from './UploadedFilePreview.jsx';
import LetterStudioModal from './LetterStudioModal.jsx';
import {
  buildLetterValues,
  getApplicableLetters,
  loadLetterSourceRecords,
  missingLetterFields,
  resolveIecNumber,
} from '../utils/partCLetterValues.js';
import { storeCompressedUpload } from '../utils/storeUploadFile.js';
import { registrationDocFileName } from '../utils/registrationDataMapper.js';

function DocumentCard({
  title,
  hint,
  required,
  filePath,
  onUpload,
  onPrepare,
  prepareLabel,
  icon: Icon,
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 flex flex-col gap-3 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
          <Icon size={18} />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-sm font-semibold text-slate-800">{title}</h4>
            {required && (
              <span className="text-[10px] font-semibold uppercase tracking-wide text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded">
                Required
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">{hint}</p>
        </div>
      </div>

      {filePath ? (
        <UploadedFilePreview filePath={filePath} className="mt-0" />
      ) : (
        <p className="text-xs text-slate-400">No signed PDF attached yet.</p>
      )}

      <div className="flex flex-col sm:flex-row gap-2 mt-auto">
        <label className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer">
          <Upload size={15} />
          Upload PDF
          <input
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) onUpload(file);
            }}
          />
        </label>
        {onPrepare && (
          <button
            type="button"
            onClick={onPrepare}
            className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-emerald-600 text-sm font-medium text-white hover:bg-emerald-700"
          >
            <Sparkles size={15} />
            {prepareLabel}
          </button>
        )}
      </div>
    </div>
  );
}

export default function RegistrationPartC({
  generalInfo,
  setGeneralInfo,
  autoData,
  setAutoData,
  email,
  mobile,
  showToast,
}) {
  const [studioOpen, setStudioOpen] = useState(false);
  const [studioLetterId, setStudioLetterId] = useState('coveringLetter');
  const [iec, setIec] = useState('');
  const [docs, setDocs] = useState([]);
  const [companies, setCompanies] = useState([]);

  const applicableLetters = useMemo(
    () => getApplicableLetters(generalInfo.typeOfCompany),
    [generalInfo.typeOfCompany]
  );

  const letterValues = useMemo(
    () => buildLetterValues({ generalInfo, autoData, email, mobile, iec, docs, companies }),
    [generalInfo, autoData, email, mobile, iec, docs, companies]
  );

  const missing = useMemo(() => missingLetterFields(letterValues), [letterValues]);

  useEffect(() => {
    let alive = true;
    Promise.all([
      resolveIecNumber(),
      loadLetterSourceRecords(),
    ]).then(([iecValue, sources]) => {
      if (!alive) return;
      setIec(iecValue);
      setDocs(sources.docs || []);
      setCompanies(sources.companies || []);
    });
    return () => {
      alive = false;
    };
  }, []);

  const attached = {
    coveringLetter: generalInfo.partCCoveringLetter,
    selfDeclaration: generalInfo.partCAuditedStatement,
    largeEntity: autoData?.typeOfCompanyDoc,
  };

  const validatePdf = async (file, docBase = 'document') => {
    if (!file) return null;
    if (!/\.pdf$/i.test(file.name)) {
      showToast?.('Please upload a PDF file.', 'error');
      return null;
    }
    const ext = file.name.match(/\.[^.]+$/i)?.[0] || '.pdf';
    const portalFileName = registrationDocFileName(docBase, ext);
    const stored = await storeCompressedUpload(file, {
      destSubdir: 'processed_part_c',
      fileName: portalFileName,
    });
    if (!stored.success || !stored.filePath) {
      showToast?.(stored.message || 'Could not save PDF.', 'error');
      return null;
    }
    return stored.filePath;
  };

  const PART_C_DOC_BASE = {
    partCCoveringLetter: 'covering_letter',
    partCAuditedStatement: 'self_declaration',
    partCSignature: 'signature',
    typeOfCompanyDoc: 'supporting_category_doc',
  };

  const handlePdfUpload = async (field, store, file) => {
    const filePath = await validatePdf(file, PART_C_DOC_BASE[field] || 'document');
    if (!filePath) return;
    if (store === 'autoData') {
      setAutoData((prev) => ({ ...prev, [field]: filePath }));
    } else {
      setGeneralInfo((prev) => ({ ...prev, [field]: filePath }));
    }
  };

  const openStudio = (letterId) => {
    setStudioLetterId(letterId);
    setStudioOpen(true);
  };

  const handleAttachFromStudio = (letter, filePath) => {
    if (letter.store === 'autoData') {
      setAutoData((prev) => ({ ...prev, [letter.field]: filePath }));
    } else {
      setGeneralInfo((prev) => ({ ...prev, [letter.field]: filePath }));
    }
  };

  return (
    <div id="part-c-letters" className="space-y-6 mt-8 border-t pt-8">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-slate-800">Part C: EPR Action Plan</h3>
          <p className="text-sm text-slate-500 mt-1">
            Attach portal PDFs here before CPCB upload. Use Ready Letters to auto-fill covering letter and declarations from Part A.
          </p>
        </div>
        <button
          type="button"
          onClick={() => openStudio(applicableLetters[0]?.id)}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold shadow-sm hover:bg-emerald-700"
        >
          <Sparkles size={16} />
          Ready Letters
        </button>
      </div>

      <div className="rounded-2xl border border-emerald-100 bg-gradient-to-r from-emerald-50 via-white to-slate-50 p-5">
        <div className="flex items-start gap-3">
          <div className="h-11 w-11 rounded-2xl bg-white border border-emerald-100 text-emerald-700 flex items-center justify-center shadow-sm">
            <PenLine size={18} />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-slate-800">Draft → print → seal &amp; sign → re-upload</p>
            <p className="text-sm text-slate-600 mt-1">
              Ready Letters fills company name, address, GSTIN, PAN, IEC, authorised person and date into the official Word drafts.
              Download the <strong>.docx</strong>, print on letterhead, stamp and sign, then upload a short-named PDF.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-800">
        EPR targets (total EPR target and minimum recycling target) are calculated by the CPCB portal from Part A and Part B.
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <DocumentCard
          title="Covering Letter"
          hint="Official covering letter for the EPR application. PDF only."
          required
          icon={FileText}
          filePath={generalInfo.partCCoveringLetter}
          onUpload={(file) => handlePdfUpload('partCCoveringLetter', 'generalInfo', file)}
          onPrepare={() => openStudio('coveringLetter')}
          prepareLabel="Fill covering letter"
        />
        <DocumentCard
          title="Self-declaration"
          hint="Self-declaration based on audited statements. PDF only."
          required
          icon={FileText}
          filePath={generalInfo.partCAuditedStatement}
          onUpload={(file) => handlePdfUpload('partCAuditedStatement', 'generalInfo', file)}
          onPrepare={() => openStudio('selfDeclaration')}
          prepareLabel="Fill declaration"
        />
        <DocumentCard
          title="Signature"
          hint="Scan of authorised signatory signature. PDF only."
          required
          icon={FileSignature}
          filePath={generalInfo.partCSignature}
          onUpload={(file) => handlePdfUpload('partCSignature', 'generalInfo', file)}
        />
        {String(generalInfo.typeOfCompany || '').toLowerCase() === 'large' && (
          <DocumentCard
            title="Large-entity declaration"
            hint="Used as supporting document for company category instead of Udyam."
            required
            icon={FileText}
            filePath={autoData?.typeOfCompanyDoc}
            onUpload={(file) => handlePdfUpload('typeOfCompanyDoc', 'autoData', file)}
            onPrepare={() => openStudio('largeEntity')}
            prepareLabel="Fill large-entity letter"
          />
        )}
      </div>

      <LetterStudioModal
        open={studioOpen}
        onClose={() => setStudioOpen(false)}
        letters={applicableLetters}
        values={letterValues}
        missing={missing}
        initialId={studioLetterId}
        attached={attached}
        onAttachPdf={handleAttachFromStudio}
        onNotify={showToast}
      />
    </div>
  );
}
