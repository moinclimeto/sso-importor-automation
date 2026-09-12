import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';

const BRAND_OWNER_GUIDELINES = [
  {
    title: 'Scanned copy of Company PAN in PDF Format',
    subtitle: 'Maximum file size should be 1 MB',
  },
  {
    title: 'Scanned copy of Company CIN in PDF Format (If any)',
    subtitle: 'Maximum file size should be 1 MB',
  },
  {
    title: 'Scanned copy of Company GST in PDF Format',
    subtitle: 'Maximum file size should be 1 MB',
  },
  {
    title: "Scanned copy of Authorized Person's PAN in PDF Format",
    subtitle: 'Maximum file size should be 1 MB',
  },
  {
    title:
      'If the production facility registered with the District Industries Centre of the State Government or Union Territory, upload registration copy in PDF Format',
    subtitle: 'Maximum file size should be 1 MB',
  },
  {
    title: 'Scanned copy of details (Type & Quantity) of products Produced/Marketed in PDF Format',
    subtitle: 'Maximum file size should be 1 MB',
  },
  {
    title:
      'Representative Picture of packaged covering different plastic categories under EPR in jpeg, jpg, png Format',
    subtitle: 'Maximum file size should be 1 MB',
  },
  {
    title: 'Scanned PDF copy of Process flow diagram',
    subtitle: 'Maximum file size should be 1 MB',
  },
  {
    title: 'Combine copy of Consent (Air & Water Act) in PDF Format',
    subtitle: 'Maximum file size should be 1 MB',
  },
  {
    title: 'Covering Letter in PDF Format',
    subtitle: 'Maximum file size should be 1 MB',
  },
  {
    title: 'Scanned copy of Signature in png, jpeg, jpg Format',
    subtitle: 'Maximum file size should be 1 MB',
  },
  {
    title: 'Document of Any other information (If any) in PDF Format',
    subtitle: 'Maximum file size should be 1 MB',
  },
  {
    title: 'Scanned copy of Raw material storage area in png, jpeg, jpg Format',
    subtitle: 'Maximum file size should be 1 MB',
  },
  {
    title: 'Scanned copy of Production process in png, jpeg, jpg Format',
    subtitle: 'Maximum file size should be 1 MB',
  },
  {
    title: 'Scanned copy of Products dispatch area in png, jpeg, jpg Format',
    subtitle: 'Maximum file size should be 1 MB',
  },
  {
    title: 'Scanned copy of machinery in png, jpeg, jpg Format',
    subtitle: 'Maximum file size should be 1 MB',
  },
  {
    title: 'Document for supporting offsite facility for disaster management in PDF Format',
    subtitle: 'Maximum file size should be 1 MB',
  },
];

const IMPORTER_GUIDELINES = [
  {
    title: 'Company PAN *',
    subtitle: 'Scanned copy of Company PAN in PDF Format',
  },
  {
    title: 'GST registration certificate of Plant/Unit *',
    subtitle: 'Enter a valid 15-character GSTIN or upload PDF',
  },
  {
    title: 'CIN (Number or Upload)',
    subtitle: 'Scanned copy of Company CIN in PDF Format (If any)',
  },
  {
    title: 'GST certificate of Company/Business *',
    subtitle: 'Scanned copy of Company GST in PDF Format',
  },
  {
    title: 'IEC *',
    subtitle: 'Required IEC number, or upload IEC Certificate',
  },
  {
    title: 'Supporting document for company category *',
    subtitle: 'MSME Certificate or Declaration for Large Entity',
  },
  {
    title: 'Authorized person PAN *',
    subtitle: "Scanned copy of Authorized Person's PAN in PDF Format",
  },
  {
    title: 'Details (Type & Quantity) of products produced/marketed *',
    subtitle: 'Scanned copy of details in PDF Format',
  },
  {
    title: 'Representative picture of Plastic Packaging *',
    subtitle: 'Plastic packaging for commodities covering different EPR categories',
  },
  {
    title: 'Covering Letter *',
    subtitle: 'Please attach Covering Letter (Only PDF)',
  },
  {
    title: 'Signature *',
    subtitle: 'Authorized person signature',
  },
  {
    title: 'Any Other Information & Self declaration',
    subtitle: 'Based upon Audited Statement (Only PDF)',
  },
  {
    title: 'File naming (important)',
    subtitle:
      'The CPCB portal accepts simple file names such as person_pan.pdf and gst.pdf. Spaces, brackets (1), and double extensions (.pdf.pdf) are not allowed. An invalid name returns an "Invalid filename" error.',
  },
];

export default function ReadinessGuidelinesModal({
  isOpen,
  onClose,
  defaultType,
  subApplicantType,
}) {
  const [activeType, setActiveType] = useState('Brand Owner');

  useEffect(() => {
    if (!isOpen) return;

    if (subApplicantType) {
      setActiveType(
        /brand\s*owner/i.test(subApplicantType) ? 'Brand Owner' : 'Importer'
      );
      return;
    }

    if (defaultType) {
      setActiveType(
        /brand\s*owner/i.test(defaultType) ? 'Brand Owner' : 'Importer'
      );
      return;
    }

    // Auto-detect from stored registration if available
    const checkSaved = async () => {
      try {
        if (window.pwp?.registration?.get) {
          const res = await window.pwp.registration.get();
          const savedType = res?.data?.sub_applicant_type;
          if (savedType) {
            setActiveType(
              /brand\s*owner/i.test(savedType) ? 'Brand Owner' : 'Importer'
            );
          }
        }
      } catch (err) {
        console.warn('Failed to load sub_applicant_type for guidelines:', err);
      }
    };
    checkSaved();
  }, [isOpen, subApplicantType, defaultType]);

  if (!isOpen) return null;

  const currentList =
    activeType === 'Brand Owner' ? BRAND_OWNER_GUIDELINES : IMPORTER_GUIDELINES;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-slate-50 rounded-xl shadow-xl w-full max-w-3xl flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-white rounded-t-xl">
          <h2 className="text-xl font-semibold text-slate-800">
            Readiness Guidelines for EPR Registration
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-8 py-6 overflow-y-auto space-y-5">
          {currentList.map((item, i) => (
            <div key={i} className="space-y-0.5">
              <p className="text-[15px] font-medium text-slate-800">
                {String(i + 1).padStart(2, '0')}. {item.title}
              </p>
              {item.subtitle && (
                <p className="text-[13px] text-slate-500 pl-6">{item.subtitle}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
