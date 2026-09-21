import React from 'react';
import { Building2, Briefcase, Phone, FileText, Download, Edit, Plus, Eye, UploadCloud, X } from 'lucide-react';
import LocalFilePreview from './LocalFilePreview.jsx';
import { isSimpRawMaterial } from '../../shared/entityRegistrationTypes.js';

export default function RegistrationPreviewSummary({ generalInfo, autoData, email, mobile }) {
  const isSimp = isSimpRawMaterial(generalInfo?.applicantType, generalInfo?.subApplicantType);

  const SectionHeader = ({ icon: Icon, title, step }) => (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
          <Icon size={18} />
        </div>
        <h2 className="text-[15px] font-bold text-slate-800 flex items-center gap-2">
          {step}. {title}
        </h2>
      </div>
    </div>
  );

  const InputField = ({ label, value, required = false, rightIcon: RightIcon, filePreviewPath, filePreviewName }) => (
    <div>
      <label className="block text-[11px] font-semibold text-slate-700 mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <div className="w-full px-3 py-2 bg-[#f8fafc] border border-slate-200/80 text-sm text-slate-800 rounded-lg font-medium shadow-[inset_0px_1px_2px_rgba(0,0,0,0.02)] break-words min-h-[38px] flex items-center justify-between">
        <span className="truncate">{value || '—'}</span>
        <div className="flex gap-2 shrink-0 items-center">
          {filePreviewPath && (
            <LocalFilePreview filePath={filePreviewPath} originalFileName={filePreviewName} hideText />
          )}
          {RightIcon && <RightIcon size={14} className="text-slate-400" />}
        </div>
      </div>
    </div>
  );

  const getFilename = (path, originalName) => {
    if (originalName) return originalName;
    if (path) return String(path).split(/[/\\]/).pop();
    return 'Upload Document';
  };

  const FileField = ({ label, filePath, originalFileName, required = false }) => {
    const filename = getFilename(filePath, originalFileName);
    return (
      <div>
        <label className="block text-[11px] font-semibold text-slate-700 mb-1.5">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
        <div className="flex items-center justify-between px-3 py-2 bg-white border border-slate-200/80 rounded-lg shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
          <div className="flex items-center gap-2 overflow-hidden">
            <FileText className="text-red-500 shrink-0" size={14} />
            <span className="text-sm text-slate-700 font-medium truncate">{filename}</span>
          </div>
          <div className="flex gap-2 shrink-0">
            {filePath ? (
              <LocalFilePreview filePath={filePath} fileName={filename} originalFileName={originalFileName} hideText />
            ) : (
              <button className="text-slate-400 cursor-not-allowed opacity-50" disabled><Download size={14} /></button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">

      {/* 1. Company & Basic Details */}
      <div className="bg-white rounded-2xl p-6 shadow-[0_2px_10px_rgba(0,0,0,0.04)] border border-slate-100">
        <SectionHeader icon={Building2} title="Company & Basic Details" step="1" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-5">
          <InputField label="Company PAN" value={autoData?.companyPan} filePreviewPath={autoData?.companyPanDocumentPath} filePreviewName={autoData?.companyPanOriginalName} required />
          <InputField label="Company Name" value={autoData?.companyName} required />
          <FileField label="GST Certificate of Company/Business" filePath={autoData?.gstDocumentPath} originalFileName={autoData?.gstOriginalName} />
          <InputField label="CIN (Number or Upload)" value={autoData?.cin} filePreviewPath={autoData?.cinDocumentPath} filePreviewName={autoData?.cinOriginalName} />

          <InputField label="IEC" value={autoData?.iec} filePreviewPath={autoData?.iecDocumentPath} filePreviewName={autoData?.iecOriginalName} required={!isSimp} />
          <InputField label="Authorized Person PAN" value={autoData?.authPan} filePreviewPath={autoData?.personPanDocumentPath} filePreviewName={autoData?.personPanOriginalName} required />
          <InputField label="Authorized Person Name" value={autoData?.authName} required />
          <InputField label="Auth Person DOB" value={autoData?.authDob} required />

          <FileField label="Representative picture of Plastic Packaging" filePath={autoData?.representativePicturePath} originalFileName={autoData?.representativePictureOriginalName} required={!isSimp} />
          <FileField label="Covering Letter" filePath={generalInfo?.partCCoveringLetter} required />
          <FileField label="Signature" filePath={generalInfo?.partCSignature} required />
          <FileField label="Any Other Information & Self declaration" filePath={generalInfo?.partCAuditedStatement} />
        </div>
      </div>

      {/* 2. Business Details */}
      <div className="bg-white rounded-2xl p-6 shadow-[0_2px_10px_rgba(0,0,0,0.04)] border border-slate-100">
        <SectionHeader icon={Briefcase} title="Business Details" step="2" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-5">
          <InputField label="Type of Business" value={generalInfo?.typeOfBusiness} required />
          <InputField label="Designation" value={generalInfo?.authDesignation} required />
          <div className="lg:col-span-2">
            <InputField label="Registered Address Line 1" value={generalInfo?.registeredAddressLine1} required />
          </div>

          <InputField label="State/UT" value={generalInfo?.stateUt} required />
          <InputField label="District" value={generalInfo?.district} required />
          <div className="lg:col-span-2">
            <InputField label="Registered Address Line 2" value={generalInfo?.registeredAddressLine2} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 3. Contact Details */}
        <div className="bg-white rounded-2xl p-6 shadow-[0_2px_10px_rgba(0,0,0,0.04)] border border-slate-100">
          <SectionHeader icon={Phone} title="Contact Details" step="3" />
          <div className="grid grid-cols-1 md:grid-cols-1 gap-x-6 gap-y-5">
            <InputField label="Email Address" value={email} required />
            <InputField label="Mobile Number" value={mobile} required />
          </div>
        </div>

        {/* 4. Part A: General Information */}
        <div className="bg-white rounded-2xl p-6 shadow-[0_2px_10px_rgba(0,0,0,0.04)] border border-slate-100">
          <SectionHeader icon={FileText} title="Part A: General Information" step="4" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
            {isSimp ? (
              <>
                <InputField label="Applicant Type" value={`${generalInfo?.applicantType || 'SIMP'} / ${generalInfo?.subApplicantType || 'Importer of raw material'}`} required />
                <InputField label="Plant / Unit State" value={generalInfo?.plantState || generalInfo?.stateUt} required />
                <InputField label="Plant / Unit GST" value={generalInfo?.unitGst} required />
                <InputField label="Year of Commencement of Production" value={generalInfo?.yearOfCommencement} required />
                <InputField label="Capital Invested (Cr.)" value={generalInfo?.capitalInvested} required />
                <InputField label="DIC / DCSSI Registered" value={generalInfo?.dicRegistered || 'No'} required />
                <InputField label="GPS Latitude" value={generalInfo?.latitude} required />
                <InputField label="GPS Longitude" value={generalInfo?.longitude} required />
              </>
            ) : (
              <>
                <InputField label="Operating Status" value={generalInfo?.operatingStates?.[0] || ''} required />
                <InputField label="Has Production Facility" value={generalInfo?.hasProductionFacility || 'Not Applicable'} required />
                <InputField label="Capital Invested (Cr.)" value={generalInfo?.capitalInvested} required />
                <InputField label="Compliance Status" value={generalInfo?.complianceStatus} required />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
