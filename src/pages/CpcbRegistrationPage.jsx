import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { flushSync } from 'react-dom';
import { usePageHeader } from '../context/PageHeaderContext.jsx';
import { useNavigate } from 'react-router-dom';
import { useToast, Toast } from '../components/Toast.jsx';
import RegistrationDocUpload from '../components/RegistrationDocUpload.jsx';
import RegistrationPartB from '../components/RegistrationPartB.jsx';
import RegistrationPartC from '../components/RegistrationPartC.jsx';
import UploadedFilePreview from '../components/UploadedFilePreview.jsx';
import {
  AUTO_FILLED_FIELDS,
  parseGstLabeledAddress,
  collectRegistrationUploadFileIssues,
  formatCpcbFileNameIssue,
  registrationDocFileName,
} from '../utils/registrationDataMapper.js';
import {
  resolveRegistrationData,
  isRegistrationReadyWithFallback,
  resolveRegistrationLoginCredentials,
} from '../utils/registrationDummyData.js';
import {
  TYPE_OF_BUSINESS_OPTIONS,
  TYPE_OF_COMPANY_OPTIONS,
  INDIAN_STATES,
  GENERAL_INFO_EMPTY,
} from '../utils/registrationGeneralInfo.js';
import {
  buildRegistrationSavePayload,
  fetchRegistrationDocData,
  hasPersistableFormContent,
  mergeAutoData,
  mergeGeneralInfoFromSources,
  pickNonEmpty,
} from '../utils/registrationFormPersistence.js';
import { storeCompressedUpload } from '../utils/storeUploadFile.js';
import { normalizeRegistrationPaths } from '../utils/normalizeRegistrationPaths.js';
import { getStartRegistrationBlockers } from '../utils/registrationStartReadiness.js';
import { sanitizeAutomationUserError } from '../utils/automationLogFilter.js';
import { showRegistrationAutomationError } from '../utils/registrationAutomationErrors.js';
import { useCpcbPortalToasts } from '../hooks/useCpcbPortalToasts.js';
import RegistrationAutomationModal, {
  appendAutomationLog,
  applyAutomationLogUpdate,
} from '../components/RegistrationAutomationModal.jsx';
import CpcbPortalToastFeed from '../components/CpcbPortalToastFeed.jsx';
import OperatingStatesMultiSelect from '../components/OperatingStatesMultiSelect.jsx';
import RegistrationPartACompanyProfile from '../components/RegistrationPartACompanyProfile.jsx';
import ImporterEprPreparedReview from '../components/importerEpr/ImporterEprPreparedReview.jsx';
import {
  fetchComputedPlasticConsumed3c,
  shouldHydratePlasticConsumed,
} from '../utils/registrationPlasticConsumed.js';
import { getImporterReportingFinancialYears } from '../../shared/financialYearScope.js';
import { requiresHistoricalEprData } from '../../shared/commencementYearScope.js';
import {
  validateSection4AgainstPlasticConsumed,
  formatSection4PartAIssue,
} from '../utils/registrationPartBSection4.js';
import { Loader2, X, Sparkles, Mail, Phone, FlaskConical, Building2, Eye, EyeOff, RefreshCw, FilePlus, CheckCircle2, AlertCircle, Terminal, ChevronLeft, ChevronRight } from 'lucide-react';

const inputClass =
  'w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none';
const selectClass = inputClass;

const EMPTY_AUTO = {
  gstin: '',
  companyPan: '',
  companyName: '',
  legalName: '',
  dateOfEstablishment: '',
  authPan: '',
  authName: '',
  authDob: '',
  constitutionOfBusiness: '',
  registeredAddress: '',
  district: '',
  cin: '',
  iec: '',
  ctoNumber: '',
  ctoValidity: '',
  dateOfCommencement: '',
  iecDocumentPath: '',
  unitGstDoc: '',
};

function AutoFilledPreview({ data, isDummy }) {
  const filled = AUTO_FILLED_FIELDS.filter((f) => String(data[f.key] || '').trim());
  if (!filled.length) {
    return null;
  }

  return (
    <div className={`rounded-xl border p-4 space-y-3 ${isDummy ? 'border-amber-200 bg-amber-50/40' : 'border-green-100 bg-green-50/30'}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <Sparkles size={16} className="text-green-600" />
        <h3 className="text-sm font-semibold text-slate-800">
          Auto-filled from documents
        </h3>
        <span className={`text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full text-green-700 bg-green-100`}>
          {filled.length} fields
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {filled.map((field) => (
          <div key={field.key} className="rounded-lg bg-white border border-slate-100 px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{field.label}</p>
            <p className="text-sm font-medium text-slate-800 mt-0.5 break-words">{data[field.key]}</p>
            <p className="text-[10px] text-green-600 mt-0.5">{field.source}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CpcbRegistrationPage() {
  const { setPageHeader } = usePageHeader();
  const navigate = useNavigate();
  const { toast, showToast, hideToast } = useToast();
  const { portalToasts, clearPortalToasts } = useCpcbPortalToasts(showToast);

  const [autoData, setAutoData] = useState(EMPTY_AUTO);
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [generalInfo, setGeneralInfo] = useState({ ...GENERAL_INFO_EMPTY });
  const [docReady, setDocReady] = useState(true);
  const [missingDocs, setMissingDocs] = useState([]);
  const [fileNameIssues, setFileNameIssues] = useState([]);

  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [otpSubmitting, setOtpSubmitting] = useState(false);
  const [resendingMobileOtp, setResendingMobileOtp] = useState(false);

  const [showEmailOtp, setShowEmailOtp] = useState(false);
  const [emailOtp, setEmailOtp] = useState('');
  const [showMobileOtp, setShowMobileOtp] = useState(false);
  const [mobileOtp, setMobileOtp] = useState('');
  const [otpTimer, setOtpTimer] = useState(120);
  const [isResendActive, setIsResendActive] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [showCaptchaModal, setShowCaptchaModal] = useState(false);
  const [captchaImage, setCaptchaImage] = useState('');
  const [captchaText, setCaptchaText] = useState('');
  const [captchaError, setCaptchaError] = useState('');
  const [captchaSubmitting, setCaptchaSubmitting] = useState(false);
  const [captchaRefreshing, setCaptchaRefreshing] = useState(false);

  const [showLoginCaptchaModal, setShowLoginCaptchaModal] = useState(false);
  const [loginCaptchaImage, setLoginCaptchaImage] = useState('');
  const [loginCaptchaText, setLoginCaptchaText] = useState('');
  const [loginCaptchaError, setLoginCaptchaError] = useState('');
  const [loginCaptchaSubmitting, setLoginCaptchaSubmitting] = useState(false);
  const [loginCaptchaRefreshing, setLoginCaptchaRefreshing] = useState(false);

  const [showLoginOtpModal, setShowLoginOtpModal] = useState(false);
  const [loginOtp, setLoginOtp] = useState('');
  const [loginOtpError, setLoginOtpError] = useState('');
  const [loginOtpSubmitting, setLoginOtpSubmitting] = useState(false);
  const [loginOtpTimer, setLoginOtpTimer] = useState(600);
  const [loginOtpResendActive, setLoginOtpResendActive] = useState(false);
  const [savedCeprId, setSavedCeprId] = useState('');
  const [registrationComplete, setRegistrationComplete] = useState(false);
  const [loadingSavedRegistration, setLoadingSavedRegistration] = useState(true);

  const [showAutomationLogsModal, setShowAutomationLogsModal] = useState(false);
  const [automationLogs, setAutomationLogs] = useState([]);
  const [showAutomationModal, setShowAutomationModal] = useState(false);
  const [automationPhase, setAutomationPhase] = useState('running');
  const [currentAutomationStep, setCurrentAutomationStep] = useState('');
  const [otpInputError, setOtpInputError] = useState('');
  const [registrationBlocker, setRegistrationBlocker] = useState('');
  const [wizardStep, setWizardStep] = useState('account');
  const [showPaymentBypassModal, setShowPaymentBypassModal] = useState(false);
  const [paymentBypassTxnId, setPaymentBypassTxnId] = useState('');
  const [paymentBypassMode, setPaymentBypassMode] = useState('choose');
  const [plasticConsumedSource, setPlasticConsumedSource] = useState('');
  const [uploadingPdfField, setUploadingPdfField] = useState('');
  const automationBusyRef = useRef(false);

  const formatTimer = useCallback(
    (time) => `${Math.floor(time / 60).toString().padStart(2, '0')}:${(time % 60).toString().padStart(2, '0')}`,
    [],
  );

  const openAutomationModal = useCallback((step = 'Starting CPCB registration…') => {
    flushSync(() => {
      setAutomationLogs([]);
      setCurrentAutomationStep(step);
      setOtpInputError('');
      setShowAutomationModal(true);
      setAutomationPhase('running');
    });
  }, []);

  const closeAutomationModal = useCallback(() => {
    automationBusyRef.current = false;
    setShowAutomationModal(false);
    setAutomationPhase('running');
    setCurrentAutomationStep('');
    setLoading(false);
    setLoadingMsg('');
    setOtpSubmitting(false);
    setShowEmailOtp(false);
    setShowMobileOtp(false);
    setShowCaptchaModal(false);
    setOtpInputError('');
  }, []);

  const completeAutomationModal = useCallback((message) => {
    if (message) appendAutomationLog(setAutomationLogs, message, 'success');
    setAutomationPhase('complete');
    setCurrentAutomationStep('Registration complete');
    window.setTimeout(() => {
      closeAutomationModal();
    }, 2500);
  }, [closeAutomationModal]);

  const failAutomationModal = useCallback((message) => {
    if (message) appendAutomationLog(setAutomationLogs, message, 'error');
    setAutomationPhase('error');
    setCurrentAutomationStep(message || 'Automation failed');
    setOtpInputError('');
  }, []);

  const reportOtpRetryError = useCallback((phase, message) => {
    const text = sanitizeAutomationUserError(message || 'Incorrect OTP — please try again');
    appendAutomationLog(setAutomationLogs, text, 'error');
    setAutomationPhase(phase);
    setCurrentAutomationStep(text);
    setOtpInputError(text);
  }, []);

  const lockedInputClass = registrationComplete
    ? `${inputClass} bg-slate-50 text-slate-700 cursor-not-allowed`
    : inputClass;
  const lockedSelectClass = registrationComplete
    ? `${selectClass} bg-slate-50 text-slate-700 cursor-not-allowed`
    : selectClass;

  const applySavedRegistration = useCallback(async (saved) => {
    if (!saved) return;

    const form = saved.formData || {};
    const loginCreds = resolveRegistrationLoginCredentials({
      email: saved.email || form.email,
      mobile: saved.mobile || form.mobile,
      password: saved.password || form.generalInfo?.password,
    });

    if (saved.cepr_id) {
      setRegistrationComplete(true);
      setSavedCeprId(saved.cepr_id);
      setWizardStep('partA');
    }

    if (form.autoData && typeof form.autoData === 'object') {
      setAutoData({ ...EMPTY_AUTO, ...form.autoData });
    }

    if (form.autoData) {
      setAutoData((prev) => ({ ...EMPTY_AUTO, ...pickNonEmpty(form.autoData), ...pickNonEmpty(prev) }));
    }

    if (form.generalInfo) {
      const parsedAddr = parseGstLabeledAddress(
        form.generalInfo.registeredAddressLine1 || form.autoData?.registeredAddress || ''
      );
      setGeneralInfo((prev) => ({
        ...prev,
        ...form.generalInfo,
        registeredAddressLine1: parsedAddr.address || form.generalInfo.registeredAddressLine1,
        district: form.generalInfo.district || parsedAddr.district || prev.district,
        password: loginCreds.password,
        confirmPassword: loginCreds.password,
      }));
    } 

    setEmail(loginCreds.email);
    setMobile(loginCreds.mobile);

    const needsPersist =
      !saved.email ||
      !saved.mobile ||
      !saved.password ||
      !saved.form_data_json;

    if (needsPersist && window.pwp?.registration?.save) {
      await window.pwp.registration.save({
        applicant_type: saved.applicant_type || 'PIBO',
        sub_applicant_type: saved.sub_applicant_type || 'Importer',
        cepr_id: saved.cepr_id,
        success_screenshot_path: saved.success_screenshot_path,
        email: loginCreds.email,
        mobile: loginCreds.mobile,
        password: loginCreds.password,
        form_data_json:
          saved.form_data_json ||
          JSON.stringify({
            email: loginCreds.email,
            mobile: loginCreds.mobile,
            autoData: form.autoData,
            generalInfo: form.generalInfo || {
              password: loginCreds.password,
              confirmPassword: loginCreds.password,
            },
          }),
      });
    }
  }, []);

  useEffect(() => {
    setLoading(false);
    automationBusyRef.current = false;
  }, []);

  useEffect(() => {
    setPageHeader({
      title: 'Registration Form',
      subtitle: registrationComplete
        ? `Registration complete — CEPR ID ${savedCeprId}`
        : 'Upload documents & fill General Information for CPCB registration',
      onBack: () => navigate(-1),
    });
    return () => setPageHeader(null);
  }, [setPageHeader, navigate, registrationComplete, savedCeprId]);

  useEffect(() => {
    let interval = null;
    if (
      showAutomationModal
      && (automationPhase === 'email_otp' || automationPhase === 'mobile_otp')
      && otpTimer > 0
    ) {
      interval = setInterval(() => setOtpTimer((prev) => prev - 1), 1000);
    } else if (otpTimer === 0) {
      setIsResendActive(true);
      if (interval) clearInterval(interval);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [showAutomationModal, automationPhase, otpTimer]);

  useEffect(() => {
    let interval = null;
    if (showLoginOtpModal && loginOtpTimer > 0) {
      interval = setInterval(() => setLoginOtpTimer((prev) => prev - 1), 1000);
    } else if (showLoginOtpModal && loginOtpTimer === 0) {
      setLoginOtpResendActive(true);
      if (interval) clearInterval(interval);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [showLoginOtpModal, loginOtpTimer]);

  useEffect(() => {
    if (!window.pwp?.scraper?.onLog) return undefined;
    return window.pwp.scraper.onLog((payload) => {
      const text = typeof payload === 'string' ? payload : (payload?.text || payload?.message || '');
      if (!text) return;
      const { stepHint } = applyAutomationLogUpdate(setAutomationLogs, text);
      if (stepHint) setCurrentAutomationStep(stepHint);
    });
  }, []);

  useEffect(() => {
    if (!window.pwp?.scraper?.onPaymentBypassPrompt) return undefined;
    return window.pwp.scraper.onPaymentBypassPrompt(() => {
      setPaymentBypassTxnId('');
      setPaymentBypassMode('choose');
      setShowPaymentBypassModal(true);
      showToast('Payment Bypass popup — choose Yes or No in the app.', 'success', { duration: 12000 });
    });
  }, [showToast]);

  const applyRegistrationData = useCallback(async (docData = {}, { savedForm = null } = {}) => {
    const { data } = resolveRegistrationData(docData);

    setAutoData((prev) => mergeAutoData(EMPTY_AUTO, data, savedForm?.autoData || prev));
    setGeneralInfo((prev) => {
      const merged = mergeGeneralInfoFromSources(data, savedForm?.generalInfo || prev);
      return {
        ...merged,
        password: savedForm?.generalInfo?.password || prev.password || merged.password || '',
        confirmPassword:
          savedForm?.generalInfo?.confirmPassword ||
          savedForm?.generalInfo?.password ||
          prev.confirmPassword ||
          merged.confirmPassword ||
          '',
      };
    });

    let docs = [];
    if (window.pwp?.documents?.getAll) {
      docs = await window.pwp.documents.getAll();
    }
    const { ready, missing } = isRegistrationReadyWithFallback(docs, data);
    setDocReady(ready);
    setMissingDocs(missing);
    setFileNameIssues(
      collectRegistrationUploadFileIssues({
        docs,
        autoData: mergeAutoData(EMPTY_AUTO, data, savedForm?.autoData || {}),
        generalInfo: mergeGeneralInfoFromSources(data, savedForm?.generalInfo || {}),
      })
    );
  }, []);

  const [savedRegistration, setSavedRegistration] = useState(null);

  useEffect(() => {
    const load = async () => {
      setLoadingSavedRegistration(true);
      try {
        let saved = null;
        if (window.pwp?.registration?.get) {
          const res = await window.pwp.registration.get();
          if (res.success && res.data) {
            saved = res.data;
            setSavedRegistration(res.data);
          }
        }

        const { docData } = await fetchRegistrationDocData();

        if (saved?.cepr_id) {
          await applySavedRegistration(saved);
          if (Object.keys(pickNonEmpty(docData)).length) {
            setAutoData((prev) => ({ ...EMPTY_AUTO, ...pickNonEmpty(docData), ...pickNonEmpty(prev) }));
          }
          return;
        }

        const savedForm = saved?.formData || null;
        await applyRegistrationData(docData, { savedForm });
        if (saved) {
          setEmail(String(saved.email || savedForm?.email || '').trim());
          setMobile(String(saved.mobile || savedForm?.mobile || '').trim());
        }
      } finally {
        setLoadingSavedRegistration(false);
      }
    };
    load();
  }, [applyRegistrationData, applySavedRegistration]);

  useEffect(() => {
    if (registrationComplete || loadingSavedRegistration || !window.pwp?.registration?.save) return undefined;

    const timer = setTimeout(() => {
      if (!hasPersistableFormContent({ autoData, generalInfo, email, mobile })) return;

      window.pwp.registration
        .save(
          buildRegistrationSavePayload({
            savedRegistration,
            email,
            mobile,
            autoData,
            generalInfo,
            ceprId: savedCeprId || savedRegistration?.cepr_id,
          })
        )
        .catch((err) => console.error('Auto-save failed:', err));
    }, 1200);

    return () => clearTimeout(timer);
  }, [
    generalInfo,
    autoData,
    email,
    mobile,
    savedRegistration,
    savedCeprId,
    registrationComplete,
    loadingSavedRegistration,
  ]);

  const handleGeneralChange = (e) => {
    const { name, value } = e.target;
    setGeneralInfo((prev) => ({ ...prev, [name]: value }));
  };

  const reportingFys = useMemo(() => getImporterReportingFinancialYears(), []);
  const showHistoricalEprSections = useMemo(
    () => requiresHistoricalEprData(generalInfo.yearOfCommencement),
    [generalInfo.yearOfCommencement],
  );

  useEffect(() => {
    if (loadingSavedRegistration) return undefined;

    let cancelled = false;
    (async () => {
      try {
        const result = await fetchComputedPlasticConsumed3c({
          gstin: autoData.gstin,
          savedImporter3a: autoData.importer3a,
        });
        if (cancelled || !result?.hasData) return;

        setGeneralInfo((prev) => {
          if (!shouldHydratePlasticConsumed(prev.plasticConsumed)) return prev;
          return { ...prev, plasticConsumed: result.plasticConsumed };
        });
        setPlasticConsumedSource(result.sourceLabel || '');
      } catch (err) {
        console.error('Failed to hydrate Section 3c:', err);
      }
    })();

    return () => { cancelled = true; };
  }, [loadingSavedRegistration, autoData.gstin, autoData.importer3a]);

  const handlePlasticConsumedChange = useCallback((nextPlasticConsumed) => {
    setGeneralInfo((prev) => ({ ...prev, plasticConsumed: nextPlasticConsumed }));
  }, []);

  const handleDocExtracted = useCallback(async (data) => {
    await applyRegistrationData(data);
  }, [applyRegistrationData]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const normalized = await normalizeRegistrationPaths({ autoData, generalInfo });
      if (cancelled) return;
      if (normalized.changed) {
        setAutoData(normalized.autoData);
        setGeneralInfo(normalized.generalInfo);
        return;
      }

      let docs = [];
      if (window.pwp?.documents?.getAll) {
        docs = await window.pwp.documents.getAll();
      }
      if (cancelled) return;
      const { ready, missing } = isRegistrationReadyWithFallback(docs, normalized.autoData);
      setDocReady(ready);
      setMissingDocs(missing);
      setFileNameIssues(
        collectRegistrationUploadFileIssues({
          docs,
          autoData: normalized.autoData,
          generalInfo: normalized.generalInfo,
        }),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [autoData, generalInfo]);

  const persistRegistrationForm = async () => {
    if (!window.pwp?.registration?.save) return;
    if (!hasPersistableFormContent({ autoData, generalInfo, email, mobile })) return;
    await window.pwp.registration.save(
      buildRegistrationSavePayload({
        savedRegistration,
        email,
        mobile,
        autoData,
        generalInfo,
        ceprId: savedCeprId || savedRegistration?.cepr_id,
      })
    );
  };

  const persistPartCFile = async (file, field) => {
    const PART_C_DOC_BASE = {
      detailsOfProductsPath: 'operations_details',
      representativePicturePath: 'plastic_packaging_picture',
      typeOfCompanyDoc: 'supporting_category_doc',
    };
    const docBase = PART_C_DOC_BASE[field] || 'document';
    const ext = file?.name?.match(/\.[^.]+$/i)?.[0] || '.pdf';
    const portalFileName = registrationDocFileName(docBase, ext);
    const stored = await storeCompressedUpload(file, {
      destSubdir: field === 'typeOfCompanyDoc' || field === 'detailsOfProductsPath' || field === 'representativePicturePath'
        ? 'processed_registration_docs'
        : 'processed_part_c',
      fileName: portalFileName,
    });
    if (!stored.success || !stored.filePath) {
      showToast(stored.message || 'Could not save this file for preview. Please upload it again from the desktop app.', 'error');
      return;
    }
    setAutoData((prev) => {
      const next = { ...prev, [field]: stored.filePath };
      const savePayload = {
        ...(savedRegistration || {}),
        email,
        mobile,
        form_data_json: JSON.stringify({
          ...(savedRegistration?.formData || {}),
          email,
          mobile,
          autoData: next,
          generalInfo,
        }),
      };
      if (field === 'detailsOfProductsPath') {
        savePayload.details_of_products_produced_marketed = stored.filePath;
      }
      if (field === 'representativePicturePath') {
        savePayload.representative_picture_of_plastic_packaging = stored.filePath;
      }
      if (window.pwp?.registration?.save) {
        window.pwp.registration.save(savePayload).catch(console.error);
      }
      return next;
    });
  };

  const handlePartAPdfUpload = async (field, file) => {
    setUploadingPdfField(field);
    try {
      await persistPartCFile(file, field);
      showToast('PDF uploaded.', 'success');
    } finally {
      setUploadingPdfField('');
    }
  };

  const handleSaveAndNext = async () => {
    if (wizardStep === 'partA') {
      if (!generalInfo.operatingStates?.length) {
        showToast('Select at least one operating state.', 'error');
        return;
      }
      if (generalInfo.operatingStates.length === 2) {
        showToast('Cannot select exactly 2 states. Select 1, or 3 or more.', 'error');
        return;
      }
      if (!generalInfo.yearOfCommencement && !generalInfo.yearOfCommencement) {
        showToast('Year of Commencement is required.', 'error');
        return;
      }
      if (!generalInfo.complianceStatus && !generalInfo.complianceStatus) {
        showToast('Compliance Status (3d) is required.', 'error');
        return;
      }
      if (!String(generalInfo.thicknessOfPlastic || generalInfo.thicknessOfPlastic || '').trim()) {
        showToast('Thickness of Plastic (3e) is required.', 'error');
        return;
      }
      await persistRegistrationForm();
      showToast('Part A saved.', 'success');
      setWizardStep('partB');
      return;
    }
    if (wizardStep === 'partB') {
      await persistRegistrationForm();
      showToast('Part B saved.', 'success');
      setWizardStep('partC');
    }
  };

  const handleStartRegistration = async () => {
    if (registrationComplete) return;
    if (automationBusyRef.current) return;

    openAutomationModal();
    clearPortalToasts();

    const blockers = getStartRegistrationBlockers({
      docReady,
      missingDocs,
      fileNameIssues,
      autoData,
      email,
      mobile,
      generalInfo,
    });
    if (blockers.length > 0) {
      const msg = blockers.map((item) => item.label).join(', ');
      failAutomationModal(msg);
      showToast(`Complete pending items: ${msg}`, 'error', { duration: 12000 });
      return;
    }

    let docs = [];
    if (window.pwp?.documents?.getAll) {
      docs = await window.pwp.documents.getAll();
    }
    const uploadNameIssues = collectRegistrationUploadFileIssues({ docs, autoData, generalInfo });
    if (uploadNameIssues.length) {
      setFileNameIssues(uploadNameIssues);
      const issueMsg = formatCpcbFileNameIssue(uploadNameIssues[0]);
      failAutomationModal(issueMsg);
      showToast(issueMsg, 'error', { duration: 14000 });
      return;
    }

    if (!window.pwp?.scraper?.startRegistrationFlow) {
      failAutomationModal('Start the desktop app (Electron) to run CPCB automation.');
      showToast('CPCB automation is only available in the desktop app.', 'error');
      return;
    }

    const payload = {
      gstin: autoData.gstin,
      companyPan: autoData.companyPan,
      companyName: autoData.companyName,
      dateOfEstablishment: autoData.dateOfEstablishment,
      authPan: autoData.authPan,
      authName: autoData.authName,
      authDob: autoData.authDob,
      email,
      mobile,
      constitutionOfBusiness: autoData.constitutionOfBusiness,
      registeredAddress: generalInfo.registeredAddressLine1,
      registeredAddressLine2: generalInfo.registeredAddressLine2,
      district: generalInfo.district,
      stateUt: generalInfo.stateUt,
      cin: autoData.cin,
      iec: autoData.iec,
      typeOfBusiness: generalInfo.typeOfBusiness,
      typeOfCompany: generalInfo.typeOfCompany,
      authDesignation: generalInfo.authDesignation,
      password: generalInfo.password,
      ctoNumber: autoData.ctoNumber,
      ctoValidity: autoData.ctoValidity,
      dateOfCommencement: autoData.dateOfCommencement,
      panDocumentPath: autoData.panDocumentPath,
      companyPanDocumentPath: autoData.companyPanDocumentPath,
      personPanDocumentPath: autoData.personPanDocumentPath,
      gstDocumentPath: autoData.gstDocumentPath,
      cinDocumentPath: autoData.cinDocumentPath,
      iecDocumentPath: autoData.iecDocumentPath,
      plasticConsumed: generalInfo.plasticConsumed,
      complianceStatus: generalInfo.complianceStatus,
      thicknessOfPlastic: generalInfo.thicknessOfPlastic,
    };

    automationBusyRef.current = true;
    setLoading(true);
    setLoadingMsg('Starting automation process...');

    try {
      if (window.pwp?.registration?.save) {
        await window.pwp.registration.save({
          email,
          mobile,
          password: generalInfo.password,
          form_data_json: JSON.stringify({ email, mobile, autoData, generalInfo }),
        });
      }

      const res = await window.pwp.scraper.startRegistrationFlow(payload);
      if (res.success && res.step === 'WAITING_EMAIL_OTP') {
        setRegistrationBlocker('');
        setAutomationPhase('email_otp');
        setCurrentAutomationStep('Waiting for Email OTP');
        setOtpInputError('');
        appendAutomationLog(setAutomationLogs, 'Email OTP sent — enter the code below', 'success');
        setOtpTimer(120);
        setIsResendActive(false);
      } else {
        const errMsg = res.error || 'Unexpected step received.';
        setRegistrationBlocker(errMsg);
        failAutomationModal(errMsg);
        showRegistrationAutomationError(showToast, setAutomationLogs, errMsg);
      }
    } catch (err) {
      failAutomationModal(err.message);
      showRegistrationAutomationError(showToast, setAutomationLogs, err.message);
    } finally {
      automationBusyRef.current = false;
      setLoading(false);
      setLoadingMsg('');
    }
  };

  const handleFormSubmit = (e) => {
    e.preventDefault();
  };

  const handleResendEmailOtp = async () => {
    try {
      setLoading(true);
      setLoadingMsg('Resending Email OTP...');
      const res = await window.pwp.scraper.resendEmailOtp();
      if (res.success) {
        showToast('OTP Resent to Email', 'success');
        setOtpTimer(120);
        setIsResendActive(false);
      } else {
        showToast('Failed to resend OTP: ' + res.error, 'error');
      }
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyEmailOtp = async () => {
    if (!emailOtp?.trim()) {
      showToast('Please enter Email OTP', 'error');
      return;
    }
    setOtpSubmitting(true);
    setOtpInputError('');
    setCurrentAutomationStep('Verifying email OTP…');
    try {
      const res = await window.pwp.scraper.submitEmailOtp({ otp: emailOtp.trim(), mobile });
      if (res.success && res.step === 'WAITING_MOBILE_OTP') {
        setEmailOtp('');
        setOtpInputError('');
        setAutomationPhase('mobile_otp');
        setCurrentAutomationStep('Waiting for Mobile OTP');
        appendAutomationLog(setAutomationLogs, `Email verified — OTP sent to ${mobile}`, 'success');
        setOtpTimer(120);
        setIsResendActive(false);
        showToast(`Email verified! Mobile OTP sent to ${mobile}.`, 'success');
      } else {
        const errText = res.error || 'Incorrect OTP — please try again';
        reportOtpRetryError('email_otp', errText);
        showToast('Email OTP failed: ' + errText, 'error');
      }
    } catch (err) {
      reportOtpRetryError('email_otp', err.message);
      showToast('Error: ' + err.message, 'error');
    } finally {
      setOtpSubmitting(false);
    }
  };

  const handleResendMobileOtp = async () => {
    if (resendingMobileOtp || otpSubmitting) return;
    setResendingMobileOtp(true);
    setOtpInputError('');
    try {
      const res = await window.pwp.scraper.resendMobileOtp();
      if (res.success) {
        appendAutomationLog(setAutomationLogs, 'Mobile OTP resent', 'success');
        setAutomationPhase('mobile_otp');
        setCurrentAutomationStep(mobile ? `Enter OTP sent to ${mobile}` : 'Enter OTP sent to mobile number');
        showToast('OTP resent to mobile', 'success');
        setMobileOtp('');
        setOtpTimer(120);
        setIsResendActive(false);
      } else {
        const errText = res.error || 'Failed to resend OTP';
        reportOtpRetryError('mobile_otp', errText);
        showToast('Failed to resend OTP: ' + errText, 'error');
      }
    } catch (err) {
      reportOtpRetryError('mobile_otp', err.message);
      showToast('Error: ' + err.message, 'error');
    } finally {
      setResendingMobileOtp(false);
    }
  };

  const handleVerifyMobileOtp = async () => {
    if (!mobileOtp?.trim()) {
      showToast('Please enter Mobile OTP', 'error');
      return;
    }
    setOtpSubmitting(true);
    setOtpInputError('');
    setCurrentAutomationStep('Verifying mobile OTP…');
    try {
      const verifyRes = await window.pwp.scraper.submitMobileOtp({
        mobile,
        otp: mobileOtp.trim(),
        verifyOnly: true,
      });

      if (!verifyRes.success) {
        const errText = verifyRes.error || 'Incorrect OTP — please try again';
        setRegistrationBlocker(errText);
        reportOtpRetryError('mobile_otp', errText);
        showToast('Mobile OTP failed: ' + errText, 'error');
        return;
      }

      setOtpSubmitting(false);
      appendAutomationLog(setAutomationLogs, 'Mobile OTP verified', 'success');
      setAutomationPhase('running');
      setCurrentAutomationStep('Filling registration form on CPCB portal…');
      setLoading(true);
      setLoadingMsg('Completing registration on CPCB portal...');

      const res = await window.pwp.scraper.submitMobileOtp({
        mobile,
        otp: mobileOtp.trim(),
        skipOtpVerify: true,
      });

      if (res.success && res.warning && res.step !== 'WAITING_CAPTCHA') {
        const warnText = res.warning;
        setRegistrationBlocker(warnText);
        failAutomationModal(warnText);
        showToast(warnText, 'error', { duration: 15000 });
        return;
      }

      if (res.success && res.step === 'WAITING_CAPTCHA') {
        setRegistrationBlocker('');
        setMobileOtp('');
        setOtpTimer(0);
        setIsResendActive(false);
        setCaptchaImage(res.captchaImage || '');
        setCaptchaText('');
        setCaptchaError('');
        setAutomationPhase('captcha');
        setCurrentAutomationStep('Enter captcha to complete registration');
        appendAutomationLog(setAutomationLogs, 'Mobile OTP verified — enter captcha below', 'success');
        showToast('PAN uploaded. Enter the captcha below to complete registration.', 'success', { duration: 8000 });
        return;
      }

      if (
        res.success &&
        (res.step === 'REGISTRATION_COMPLETE' ||
          res.step === 'SUPPORTING_DOC_COMPLETE' ||
          res.step === 'SUPPORTING_DOC_UPLOADED' ||
          res.step === 'GENERAL_INFO_FILLED' ||
          res.step === 'USER_VERIFICATION_DONE' ||
          res.step === 'COMPLETED')
      ) {
        setRegistrationBlocker('');
        setMobileOtp('');
        setOtpTimer(0);
        setIsResendActive(false);

        if (res.step !== 'REGISTRATION_COMPLETE') {
          await window.pwp.registration.save({
            applicant_type: 'PIBO',
            sub_applicant_type: 'Importer',
            cepr_id: res.ceprId || undefined,
            success_screenshot_path: res.screenshotPath || undefined,
            email: email || undefined,
            mobile: mobile || undefined,
            password: generalInfo.password || undefined,
            confirm_password: generalInfo.confirmPassword || undefined,
          });
        }

        if (res.warning && res.step !== 'REGISTRATION_COMPLETE') {
          showToast(`Registration partial: ${res.warning}`, 'warning', { duration: 12000 });
          completeAutomationModal('Registration partially complete');
        } else if (res.step === 'REGISTRATION_COMPLETE') {
          await saveRegistrationSnapshot(res.ceprId, res.screenshotPath);
          showToast(
            `Registration complete! CEPR ID: ${res.ceprId || 'saved'} — screenshot stored in database.`,
            'success',
            { duration: 12000 }
          );
          completeAutomationModal(`Registration complete — CEPR ID: ${res.ceprId || 'saved'}`);
        } else if (res.step === 'SUPPORTING_DOC_COMPLETE') {
          showToast(
            'Registration complete! User Verification, General Information & PAN upload done on CPCB portal.',
            'success',
            { duration: 10000 }
          );
          completeAutomationModal('Supporting documents uploaded on CPCB portal');
        } else if (res.step === 'SUPPORTING_DOC_UPLOADED') {
          setAutomationPhase('captcha');
          setCurrentAutomationStep('Enter captcha to finish registration');
          appendAutomationLog(setAutomationLogs, 'PAN uploaded — enter captcha to finish', 'success');
          showToast(
            'PAN uploaded on CPCB portal. Enter captcha in the app to finish.',
            'success',
            { duration: 10000 }
          );
        } else {
          showToast(
            res.step === 'GENERAL_INFO_FILLED'
              ? 'General Information filled on CPCB portal — Supporting Documents may need manual steps.'
              : 'Step 1 complete! Browser is open — continue on CPCB portal.',
            'success',
            { duration: 8000 }
          );
          completeAutomationModal('CPCB portal step completed');
        }
      } else {
        const errText = res.error || res.warning || 'Registration failed on CPCB portal';
        setRegistrationBlocker(errText);
        if (
          res.errorCode === 'DUPLICATE_AUTH_PERSON'
          || /already exists|authorised person|authorized person/i.test(errText)
        ) {
          failAutomationModal(errText);
          showToast(errText, 'error', { duration: 15000 });
        } else if (automationPhase === 'email_otp' || automationPhase === 'mobile_otp') {
          reportOtpRetryError(automationPhase, errText);
          showToast(errText, 'error');
        } else {
          failAutomationModal(errText);
          showToast(errText, 'error', { duration: 12000 });
        }
      }
    } catch (err) {
      const errText = sanitizeAutomationUserError(err.message);
      setRegistrationBlocker(errText);
      if (/already exists|authorised person|authorized person/i.test(errText)) {
        failAutomationModal(errText);
      } else if (automationPhase === 'email_otp' || automationPhase === 'mobile_otp') {
        reportOtpRetryError(automationPhase, errText);
      } else {
        failAutomationModal(errText);
      }
      showToast('Error: ' + errText, 'error');
    } finally {
      setOtpSubmitting(false);
      setLoading(false);
      setLoadingMsg('');
    }
  };

  const handleRefreshCaptcha = async () => {
    setCaptchaRefreshing(true);
    setCaptchaError('');
    try {
      const res = await window.pwp.scraper.refreshRegistrationCaptcha();
      if (res.success && res.captchaImage) {
        setCaptchaImage(res.captchaImage);
        setCaptchaText('');
      } else {
        setCaptchaError(res.error || 'Could not refresh captcha');
      }
    } catch (err) {
      setCaptchaError(err.message);
    } finally {
      setCaptchaRefreshing(false);
    }
  };

  const saveRegistrationSnapshot = async (ceprId, screenshotPath) => {
    const loginCreds = resolveRegistrationLoginCredentials({
      email,
      mobile,
      password: generalInfo.password,
    });
    await window.pwp.registration.save({
      applicant_type: 'PIBO',
      sub_applicant_type: 'Importer',
      cepr_id: ceprId,
      success_screenshot_path: screenshotPath,
      email: loginCreds.email,
      mobile: loginCreds.mobile,
      password: loginCreds.password,
      confirm_password: loginCreds.password,
      form_data_json: JSON.stringify({
        email: loginCreds.email,
        mobile: loginCreds.mobile,
        autoData,
        generalInfo: {
          ...generalInfo,
          password: loginCreds.password,
          confirmPassword: loginCreds.password,
        },
      }),
    });
    setEmail(loginCreds.email);
    setMobile(loginCreds.mobile);
    setGeneralInfo((prev) => ({
      ...prev,
      password: loginCreds.password,
      confirmPassword: loginCreds.password,
    }));
    setRegistrationComplete(true);
    setSavedCeprId(ceprId || '');
    setWizardStep('partA');
  };

  const handleNewApplication = async () => {
    if (!savedCeprId) {
      showToast('CEPR ID not found — complete registration first.', 'error');
      return;
    }

    // Strict Validation for Automation
    const requiredGeneral = [
      { key: 'typeOfBusiness', label: 'Type of Business' },
      { key: 'typeOfCompany', label: 'Type of Company' },
      { key: 'registeredAddressLine1', label: 'Registered Address' },
      { key: 'yearOfCommencement', label: 'Year of Commencement' },
      { key: 'stateUt', label: 'State/UT' },
      { key: 'complianceStatus', label: 'Compliance Status (3d)' },
      { key: 'thicknessOfPlastic', label: 'Thickness of Plastic (3e)' },
      { key: 'partCCoveringLetter', label: 'Part C: Covering Letter' },
      { key: 'partCSignature', label: 'Part C: Signature' },
      { key: 'partCAuditedStatement', label: 'Part C: Audited Statement' },
    ];

    const missing = [];
    for (const req of requiredGeneral) {
      if (!generalInfo[req.key]) missing.push(req.label);
    }
    
    if (!generalInfo.operatingStates || generalInfo.operatingStates.length === 0) {
      missing.push('Operating States (minimum 1 required)');
    } else if (generalInfo.operatingStates.length === 2) {
      missing.push('Operating States (Cannot select exactly 2 states. Select 1, or 3+ states)');
    }
    
    if (['Micro', 'Small', 'Medium', 'Large'].includes(generalInfo.typeOfCompany) && !autoData.typeOfCompanyDoc) {
      missing.push('Type of Company Document (MSME/Declaration)');
    }
    if (!autoData.detailsOfProductsPath) {
      missing.push('Details (Type & Quantity) of products produced/marketed');
    }
    if (!autoData.representativePicturePath) {
      missing.push('Representative picture of Plastic Packaging');
    }

    if (!generalInfo.isSameAsRegisteredAddress) {
      if (!generalInfo.plantAddress) missing.push('Plant/Unit Address');
      if (!generalInfo.unitGst) missing.push('Unit GST');
      if (!autoData.unitGstDoc) missing.push('Unit GST Document');
    }

    if (missing.length > 0) {
      const partAHints = [
        'Type of Business',
        'Type of Company',
        'State/UT',
        'Operating States',
        'Year of Commencement',
        'Compliance Status',
        'Thickness',
        'Details (Type & Quantity) of products produced/marketed',
        'Representative picture of Plastic Packaging',
        'Type of Company Document',
      ];
      if (missing.some((label) => partAHints.some((hint) => label.includes(hint)))) {
        setWizardStep('partA');
      } else if (missing.some((label) => label.startsWith('Part C'))) {
        setWizardStep('partC');
      }
      showToast(`Missing required fields: ${missing.join(', ')}`, 'error');
      return;
    }

    const section4Issues = showHistoricalEprSections
      ? validateSection4AgainstPlasticConsumed(
        generalInfo.partBSection4 || [],
        generalInfo.plasticConsumed || {},
        getImporterReportingFinancialYears(),
      )
      : [];
    if (section4Issues.length) {
      setWizardStep('partB');
      showToast(formatSection4PartAIssue(section4Issues[0]), 'error', { duration: 14000 });
      if (section4Issues.length > 1) {
        showToast(
          `${section4Issues.length} Section 4 rows are outside the ±40% range of Part A 3c. Update the values in Part B.`,
          'warning',
          { duration: 12000 },
        );
      }
      return;
    }

    // Save all form data to database so the backend automation can read the latest fields
    if (window.pwp?.registration?.save) {
      try {
        await window.pwp.registration.save({
          email,
          mobile,
          applicant_type: generalInfo.applicantType || 'PIBO',
          sub_applicant_type: generalInfo.subApplicantType || 'Importer',
          cepr_id: savedCeprId || '',
          form_data_json: JSON.stringify({
            email,
            mobile,
            generalInfo,
            autoData,
          })
        });
      } catch (err) {
        console.error('Failed to save data before automation', err);
      }
    }

    setAutomationLogs([]);
    clearPortalToasts();
    setLoading(true);
    await beginLoginFlow(savedCeprId);
    setLoading(false);
  };

  const beginLoginFlow = async (ceprId) => {
    setSavedCeprId(ceprId || '');
    setLoadingMsg('Starting CPCB login...');
    const loginCreds = resolveRegistrationLoginCredentials({
      email,
      mobile,
      password: generalInfo.password,
    });
    try {
      const loginRes = await window.pwp.scraper.startLoginFlow({
        ceprId,
        password: loginCreds.password,
        email: loginCreds.email,
        mobile: loginCreds.mobile,
      });
      if (loginRes.success && loginRes.step === 'WAITING_LOGIN_CAPTCHA') {
        setLoginCaptchaImage(loginRes.captchaImage || '');
        setLoginCaptchaText('');
        setLoginCaptchaError('');
        setShowLoginCaptchaModal(true);
        showToast('Enter login captcha to continue to application form.', 'success', { duration: 10000 });
      } else if (loginRes.success && loginRes.step === 'APPLICATION_ONBOARDING_COMPLETE') {
        setAutomationLogs(prev => [...prev, { type: 'success', message: 'Application onboarding completed successfully!' }]);
        showToast('Application onboarding completed successfully!', 'success');
      } else {
        const err = loginRes.error || 'Could not start login flow';
        setAutomationLogs(prev => [...prev, { type: 'error', message: err }]);
        showToast(err, 'error');
      }
    } catch (err) {
      setAutomationLogs(prev => [...prev, { type: 'error', message: 'Login error: ' + err.message }]);
      showToast('Login error: ' + err.message, 'error');
    } finally {
      setLoadingMsg('');
    }
  };

  const handleRefreshLoginCaptcha = async () => {
    setLoginCaptchaRefreshing(true);
    setLoginCaptchaError('');
    try {
      const res = await window.pwp.scraper.refreshLoginCaptcha();
      if (res.success && res.captchaImage) {
        setLoginCaptchaImage(res.captchaImage);
        setLoginCaptchaText('');
      } else {
        setLoginCaptchaError(res.error || 'Could not refresh captcha');
      }
    } catch (err) {
      setLoginCaptchaError(err.message);
    } finally {
      setLoginCaptchaRefreshing(false);
    }
  };

  const handleSubmitLoginCaptcha = async () => {
    const text = loginCaptchaText.trim();
    if (!text) {
      setLoginCaptchaError('Please enter captcha');
      return;
    }
    setLoginCaptchaSubmitting(true);
    setLoginCaptchaError('');
    setLoadingMsg('Submitting login captcha on CPCB portal...');
    try {
      const res = await window.pwp.scraper.submitLoginCaptcha({ captcha: text });

      if (res.success && res.step === 'WAITING_LOGIN_OTP') {
        setShowLoginCaptchaModal(false);
        setLoginCaptchaText('');
        setLoginCaptchaImage('');
        setLoginOtp('');
        setLoginOtpError('');
        setLoginOtpTimer(600);
        setLoginOtpResendActive(false);
        setShowLoginOtpModal(true);
        showToast('Login OTP sent — enter OTP from email/SMS.', 'success');
        return;
      }

      if (res.captchaImage) {
        setLoginCaptchaImage(res.captchaImage);
      }
      setLoginCaptchaText('');
      const errMsg = res.error || 'Invalid captcha. Please try again.';
      setLoginCaptchaError(errMsg);
      setAutomationLogs(prev => [...prev, { type: 'error', message: errMsg }]);
    } catch (err) {
      setLoginCaptchaError(err.message);
      setAutomationLogs(prev => [...prev, { type: 'error', message: 'Captcha submit error: ' + err.message }]);
    } finally {
      setLoginCaptchaSubmitting(false);
      setLoadingMsg('');
    }
  };

  const handleResendLoginOtp = async () => {
    try {
      const res = await window.pwp.scraper.resendLoginOtp();
      if (res.success) {
        setLoginOtpTimer(600);
        setLoginOtpResendActive(false);
        showToast('Login OTP resent', 'success');
      } else {
        showToast(res.error || 'Resend failed', 'error');
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleLoginOnboardingResult = (res) => {
    if (res.success && res.step === 'APPLICATION_ONBOARDING_COMPLETE') {
      showToast(
        `Application started! ${res.applicantType || 'PIBO'} — ${res.subApplicantType || 'Importer'} selected on CPCB portal. Browser is open.`,
        'success',
        { duration: 15000 },
      );
      return true;
    }

    if (
      res.success &&
      (res.step === 'APPLICATION_ONBOARDING_AND_SCRAPE_COMPLETE')
    ) {
      const scrapeOk = res.scrape?.success !== false;
      showToast(
        scrapeOk
          ? 'Registration pipeline complete! Application started and portal data synced to the app.'
          : `Application started, but portal sync failed: ${res.scrape?.error || 'Unknown error'}.`,
        scrapeOk ? 'success' : 'error',
        { duration: 15000 },
      );
      return true;
    }

    if (res.success && res.step === 'LOGIN_COMPLETE') {
      setAutomationLogs((prev) => [
        ...prev,
        { type: 'error', message: 'Login succeeded but application onboarding failed: ' + res.error },
      ]);
      showToast('Login successful, but onboarding failed. See logs for details.', 'error', { duration: 15000 });
      return true;
    }

    return false;
  };

  const handleVerifyLoginOtp = async () => {
    const otp = loginOtp.trim().replace(/\D/g, '');
    if (otp.length !== 6) {
      setLoginOtpError('Please enter 6-digit OTP');
      return;
    }
    setLoginOtpSubmitting(true);
    setLoginOtpError('');
    setLoadingMsg('Verifying login OTP on CPCB portal...');
    try {
      const res = await window.pwp.scraper.submitLoginOtp({ otp });

      if (res.success && res.step === 'LOGIN_OTP_VERIFIED') {
        setShowLoginOtpModal(false);
        setLoginOtp('');
        setLoginOtpSubmitting(false);
        setLoading(true);
        setLoadingMsg('Filling application on CPCB portal...');
        showToast('Login OTP verified. Filling application form...', 'success', { duration: 8000 });
        try {
          const onboard = await window.pwp.scraper.runApplicationOnboardingAfterLogin({ autoScrape: false });
          handleLoginOnboardingResult(onboard);
          if (!onboard.success) {
            const errMsg = onboard.error || 'Application onboarding failed.';
            setAutomationLogs((prev) => [...prev, { type: 'error', message: errMsg }]);
          }
        } finally {
          setLoading(false);
          setLoadingMsg('');
        }
        return;
      }

      if (handleLoginOnboardingResult(res)) {
        setShowLoginOtpModal(false);
        setLoginOtp('');
        return;
      }

      const errMsg = res.error || 'Invalid OTP. Please try again.';
      setLoginOtpError(errMsg);
      setAutomationLogs((prev) => [...prev, { type: 'error', message: errMsg }]);
    } catch (err) {
      setLoginOtpError(err.message);
      setAutomationLogs((prev) => [...prev, { type: 'error', message: 'OTP verification error: ' + err.message }]);
    } finally {
      setLoginOtpSubmitting(false);
      setLoadingMsg('');
    }
  };

  const handleSubmitCaptcha = async () => {
    const text = captchaText.trim();
    if (!text) {
      setCaptchaError('Please enter captcha');
      return;
    }
    setCaptchaSubmitting(true);
    setCaptchaError('');
    setLoadingMsg('Submitting captcha on CPCB portal...');
    appendAutomationLog(setAutomationLogs, 'Submitting captcha…');
    setCurrentAutomationStep('Submitting captcha…');
    try {
      const res = await window.pwp.scraper.submitRegistrationCaptcha({ captcha: text });

      if (res.success && res.step === 'REGISTRATION_COMPLETE') {
        setCaptchaText('');
        setCaptchaImage('');
        setCaptchaSubmitting(false);
        setLoadingMsg('');
        await saveRegistrationSnapshot(res.ceprId, res.screenshotPath);
        showToast(
          `Registration complete! CEPR ID: ${res.ceprId || 'saved'}${res.screenshotPath ? ' — screenshot saved' : ''}. Click New Application to login.`,
          'success',
          { duration: 15000 }
        );
        completeAutomationModal(`Registration complete — CEPR ID: ${res.ceprId || 'saved'}`);
        return;
      }

      if (res.captchaImage) {
        setCaptchaImage(res.captchaImage);
      }
      setCaptchaText('');
      setCaptchaError(res.error || 'Invalid captcha. Please try again.');
      appendAutomationLog(setAutomationLogs, res.error || 'Invalid captcha — try again', 'error');
    } catch (err) {
      setCaptchaError(err.message);
      appendAutomationLog(setAutomationLogs, err.message, 'error');
    } finally {
      setCaptchaSubmitting(false);
      setLoadingMsg('');
    }
  };

  const startRegistrationBlockers = useMemo(
    () => getStartRegistrationBlockers({
      docReady,
      missingDocs,
      fileNameIssues,
      autoData,
      email,
      mobile,
      generalInfo,
    }),
    [docReady, missingDocs, fileNameIssues, autoData, email, mobile, generalInfo],
  );

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 relative">
      <Toast toast={toast} onClose={hideToast} />
      <CpcbPortalToastFeed items={portalToasts} />

      <h2 className="text-lg font-semibold text-slate-800 mb-1">PIBO & Importer Registration</h2>
      <p className="text-sm text-slate-500 mb-6">
        {registrationComplete
          ? 'CPCB account is ready. Complete Part A, Part B and Part C, then click Register to fill the CPCB portal.'
          : 'Only CPCB account registration fields are shown here. After the profile is created, New Application (Part A, B, C) will open.'}
      </p>

      {loadingSavedRegistration && (
        <div className="mb-4 flex items-center gap-2 text-sm text-slate-500">
          <Loader2 size={16} className="animate-spin" />
          Loading saved registration...
        </div>
      )}

      {registrationComplete && (
        <div className="mb-6 rounded-xl border border-green-200 bg-green-50 p-4 flex items-start gap-3">
          <CheckCircle2 size={22} className="text-green-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-green-800">Registration Complete</p>
            <p className="text-sm text-green-700 mt-1">
              CEPR ID: <span className="font-mono font-medium">{savedCeprId}</span>
            </p>
            <p className="text-xs text-green-600 mt-1">
              Fill Part A, B and C in steps, then click <strong>Register</strong> to send data to the CPCB portal.
            </p>
          </div>
        </div>
      )}

      {registrationComplete && (
        <div className="mb-6 grid grid-cols-3 gap-2">
          {[
            { id: 'partA', label: 'Part A' },
            { id: 'partB', label: 'Part B' },
            { id: 'partC', label: 'Part C' },
          ].map((step, idx) => {
            const active = wizardStep === step.id;
            const done = ['partA', 'partB', 'partC'].indexOf(wizardStep) > idx;
            return (
              <button
                key={step.id}
                type="button"
                onClick={() => setWizardStep(step.id)}
                className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                  active
                    ? 'border-green-600 bg-green-50 text-green-800'
                    : done
                      ? 'border-green-200 bg-white text-green-700'
                      : 'border-slate-200 bg-slate-50 text-slate-500'
                }`}
              >
                {idx + 1}. {step.label}
              </button>
            );
          })}
        </div>
      )}

      {!registrationComplete && (
      <div className="mb-6 pb-6 border-b border-slate-100 space-y-4">
        <RegistrationDocUpload onExtracted={handleDocExtracted} showToast={showToast} />

        {fileNameIssues.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 space-y-2">
            <p className="text-sm font-semibold text-amber-900">
              Some uploaded files still need processing
            </p>
            <ul className="space-y-1.5">
              {fileNameIssues.map((issue) => (
                <li key={`${issue.label}-${issue.fileName}`} className="text-xs text-amber-900">
                  {formatCpcbFileNameIssue(issue)}
                </li>
              ))}
            </ul>
            <p className="text-xs text-amber-800">
              Re-upload from Doc Processor — the app will auto-rename and compress files for CPCB.
            </p>
          </div>
        )}
      </div>
      )}

      {!registrationComplete && (
      <div className="mb-6">
        <AutoFilledPreview data={autoData} isDummy={false} />
      </div>
      )}

      {registrationBlocker ? (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <p className="font-semibold">CPCB registration blocked</p>
          <p className="mt-1">{registrationBlocker}</p>
        </div>
      ) : null}

      <form onSubmit={handleFormSubmit} noValidate className="space-y-8">
        {!registrationComplete && (
        <div>
          <h3 className="text-md font-medium text-slate-800 mb-1 flex items-center gap-2">
            <Building2 size={16} className="text-green-600" />
            General Information
            <span className="text-xs font-normal text-slate-400">(Step 2 — CPCB portal fields)</span>
          </h3>

          <p className="text-xs text-slate-500 mb-4">
            Company Details — blank fields from CPCB portal. Fill manually if documents are not uploaded.
          </p>

          <div className="md:col-span-2 mb-6">
            <h4 className="text-sm font-semibold text-slate-800 mb-3">Extracted Details (Verify/Edit)</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">GSTIN *</label>
                <input name="gstin" value={autoData.gstin || ''} onChange={(e) => setAutoData(prev => ({...prev, gstin: e.target.value}))} className={lockedInputClass} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Company PAN *</label>
                <input name="companyPan" value={autoData.companyPan || ''} onChange={(e) => setAutoData(prev => ({...prev, companyPan: e.target.value}))} className={lockedInputClass} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Company Name</label>
                <input name="companyName" value={autoData.companyName || ''} onChange={(e) => setAutoData(prev => ({...prev, companyName: e.target.value}))} className={lockedInputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Auth Person Name *</label>
                <input name="authName" value={autoData.authName || ''} onChange={(e) => setAutoData(prev => ({...prev, authName: e.target.value}))} className={lockedInputClass} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Auth Person PAN *</label>
                <input name="authPan" value={autoData.authPan || ''} onChange={(e) => setAutoData(prev => ({...prev, authPan: e.target.value}))} className={lockedInputClass} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Auth Person DOB *</label>
                <input type="date" name="authDob" value={autoData.authDob || ''} onChange={(e) => setAutoData(prev => ({...prev, authDob: e.target.value}))} className={lockedInputClass} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">CIN (If Applicable)</label>
                <input name="cin" value={autoData.cin || ''} onChange={(e) => setAutoData(prev => ({...prev, cin: e.target.value}))} className={`${lockedInputClass} uppercase`} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">IEC (If Applicable)</label>
                <input name="iec" value={autoData.iec || ''} onChange={(e) => setAutoData(prev => ({...prev, iec: e.target.value}))} className={`${lockedInputClass} uppercase`} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Type of Business *</label>
              <select
                name="typeOfBusiness"
                value={generalInfo.typeOfBusiness}
                onChange={handleGeneralChange}
                className={lockedSelectClass}
                
                required
              >
                <option value="">Select</option>
                {TYPE_OF_BUSINESS_OPTIONS.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Type of Company *</label>
              <select
                name="typeOfCompany"
                value={generalInfo.typeOfCompany}
                onChange={handleGeneralChange}
                className={lockedSelectClass}
                
                required
              >
                <option value="">Select</option>
                {TYPE_OF_COMPANY_OPTIONS.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>
            
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Registered Address Line 1 *</label>
              <input
                name="registeredAddressLine1"
                value={generalInfo.registeredAddressLine1}
                onChange={handleGeneralChange}
                type="text"
                placeholder="Enter registered address"
                className={lockedInputClass}
                
                
                required
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Registered Address Line 2</label>
              <input
                name="registeredAddressLine2"
                value={generalInfo.registeredAddressLine2}
                onChange={handleGeneralChange}
                type="text"
                placeholder="Enter (optional)"
                className={lockedInputClass}
              />
            </div>
            <div className="md:col-span-2 mt-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={generalInfo.isSameAsRegisteredAddress}
                  onChange={(e) => setGeneralInfo(prev => ({ ...prev, isSameAsRegisteredAddress: e.target.checked }))}
                  className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-slate-700">Plant/Unit Address is same as Registered Address</span>
              </label>
            </div>
            
            {!generalInfo.isSameAsRegisteredAddress && (
              <>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Plant/Unit Address *</label>
                  <input
                    name="plantAddress"
                    value={generalInfo.plantAddress}
                    onChange={handleGeneralChange}
                    type="text"
                    placeholder="Enter Plant/Unit Address"
                    className={inputClass}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Unit GST Number *</label>
                  <input
                    name="unitGst"
                    value={generalInfo.unitGst}
                    onChange={handleGeneralChange}
                    type="text"
                    placeholder="Enter Unit GST"
                    className={`${inputClass} uppercase`}
                    required
                  />
                  {autoData.unitGstDoc ? (
                    <UploadedFilePreview
                      filePath={autoData.unitGstDoc}
                      prefix="Certificate from documents"
                      suffix="— uploaded automatically in Part A"
                    />
                  ) : null}
                </div>
                {/* Already captured by the document extractor — no manual upload needed. */}
                {!autoData.unitGstDoc && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Upload Unit GST Certificate *</label>
                    <input
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg"
                      onChange={async (e) => {
                        const file = e.target.files[0];
                        if (file) await persistPartCFile(file, 'unitGstDoc');
                      }}
                      className={inputClass}
                      required
                    />
                  </div>
                )}
              </>
            )}
            <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">State/UT *</label>
              <select
                name="stateUt"
                value={generalInfo.stateUt}
                onChange={handleGeneralChange}
                className={lockedSelectClass}
                
                required
              >
                <option value="">Select</option>
                {INDIAN_STATES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">District *</label>
              <input
                name="district"
                value={generalInfo.district || ''}
                onChange={handleGeneralChange}
                type="text"
                placeholder="Enter district"
                className={lockedInputClass}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Designation *</label>
              <input
                name="authDesignation"
                value={generalInfo.authDesignation}
                onChange={handleGeneralChange}
                type="text"
                placeholder="e.g. Director, Manager"
                className={lockedInputClass}
                required
              />
            </div>
            </div>
          </div>
        </div>
        )}

        {registrationComplete && wizardStep === 'partA' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-bold text-slate-800 border-b pb-2 mb-4">Part A: General Information</h3>
              <div className="bg-white border rounded-xl shadow-sm p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <RegistrationPartACompanyProfile
                    generalInfo={generalInfo}
                    onChange={handleGeneralChange}
                    autoData={autoData}
                    onTypeOfCompanyDocSelect={(file) => persistPartCFile(file, 'typeOfCompanyDoc')}
                    inputClass={inputClass}
                    selectClass={inputClass}
                  />
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-2">Operating States *</label>
                    <OperatingStatesMultiSelect
                      value={generalInfo.operatingStates || []}
                      onChange={(newState) => {
                        setGeneralInfo((prev) => {
                          const newStateObj = { ...prev, operatingStates: newState };

                          if (window.pwp?.registration?.save) {
                            const updatedFormData = {
                              ...(savedRegistration?.formData || {}),
                              email,
                              mobile,
                              autoData,
                              generalInfo: newStateObj,
                            };
                            window.pwp.registration.save({
                              ...(savedRegistration || {}),
                              email,
                              mobile,
                              form_data_json: JSON.stringify(updatedFormData),
                            }).catch(console.error);
                          }

                          return newStateObj;
                        });
                      }}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Does the Importer have a Production Facility *</label>
                    <select
                      name="hasProductionFacility"
                      value={generalInfo.hasProductionFacility || 'Not Applicable'}
                      onChange={async (e) => {
                        handleGeneralChange(e);
                        // Auto-save logic
                        if (window.pwp?.registration?.save) {
                          const newStateObj = { ...generalInfo, hasProductionFacility: e.target.value };
                          const updatedFormData = {
                            ...(savedRegistration?.formData || {}),
                            email, mobile, autoData, generalInfo: newStateObj
                          };
                          window.pwp.registration.save({
                            ...(savedRegistration || {}),
                            email, mobile,
                            form_data_json: JSON.stringify(updatedFormData)
                          }).catch(console.error);
                        }
                      }}
                      className={inputClass}
                    >
                      <option value="Not Applicable">Not Applicable</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Total Capital Invested in the Project (Rs in Crores) *</label>
                    <input
                      name="capitalInvested"
                      value={generalInfo.capitalInvested || ''}
                      onChange={handleGeneralChange}
                      onBlur={async () => {
                        // Auto-save on blur
                        if (window.pwp?.registration?.save) {
                          const updatedFormData = {
                            ...(savedRegistration?.formData || {}),
                            email, mobile, autoData, generalInfo
                          };
                          window.pwp.registration.save({
                            ...(savedRegistration || {}),
                            email, mobile,
                            form_data_json: JSON.stringify(updatedFormData)
                          }).catch(console.error);
                        }
                      }}
                      type="text"
                      placeholder="Enter Total Capital Invested"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Year of Commencement of Operations *</label>
                    <select
                      name="yearOfCommencement"
                      value={generalInfo.yearOfCommencement || ''}
                      onChange={async (e) => {
                        handleGeneralChange(e);
                        // Auto-save logic
                        if (window.pwp?.registration?.save) {
                          const newStateObj = { ...generalInfo, yearOfCommencement: e.target.value };
                          const updatedFormData = {
                            ...(savedRegistration?.formData || {}),
                            email, mobile, autoData, generalInfo: newStateObj
                          };
                          window.pwp.registration.save({
                            ...(savedRegistration || {}),
                            email, mobile,
                            form_data_json: JSON.stringify(updatedFormData)
                          }).catch(console.error);
                        }
                      }}
                      className={inputClass}
                    >
                      <option value="">Enter year</option>
                      {Array.from({ length: new Date().getFullYear() - 1890 + 1 }, (_, i) => new Date().getFullYear() - i).map((year) => (
                        <option key={year} value={year}>{year}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">District *</label>
                    <input
                      name="district"
                      value={generalInfo.district || ''}
                      onChange={handleGeneralChange}
                      type="text"
                      placeholder="Enter district"
                      className={lockedInputClass}
                      required
                    />
                  </div>
                  
                  <ImporterEprPreparedReview
                    detailsOfProductsPath={autoData.detailsOfProductsPath || ''}
                    representativePicturePath={autoData.representativePicturePath || ''}
                    yearOfCommencement={generalInfo.yearOfCommencement || ''}
                    plasticConsumed={
                      generalInfo.plasticConsumed || Object.fromEntries(
                        reportingFys.map((fy) => [fy, { cat1: '0', cat2: '0', cat3: '0', cat4: '0' }]),
                      )
                    }
                    reportingYears={reportingFys}
                    onPdfUpload={handlePartAPdfUpload}
                    uploadingPdfField={uploadingPdfField}
                    onPlasticConsumedChange={handlePlasticConsumedChange}
                    plasticConsumedSource={plasticConsumedSource}
                  />

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">3d) Status of compliance with PWM Rules *</label>
                    <select
                      name="complianceStatus"
                      value={generalInfo.complianceStatus || ''}
                      onChange={handleGeneralChange}
                      className={inputClass}
                    >
                      <option value="">Select</option>
                      <option value="Yes">Yes</option>
                      <option value="No">No</option>
                    </select>
                    {generalInfo.complianceStatus === 'No' && (
                      <p className="text-xs text-red-600 mt-1 font-medium">
                        ⚠️ Alert: Selecting "No" can lead to rejection of your application.
                      </p>
                    )}
                  </div>

            <div className="mt-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                3e) Thickness of Plastic Packaging (In Microns) *
              </label>
              <input
                type="text"
                name="thicknessOfPlastic"
                value={generalInfo.thicknessOfPlastic || ''}
                onChange={handleGeneralChange}
                placeholder="Enter thickness"
                className={inputClass}
                required
              />
              <div className="mt-2 text-xs text-slate-500 bg-slate-50 p-2 rounded border border-slate-200">
                <strong>Approved Minimum Thickness:</strong>
                <ul className="list-disc pl-4 mt-1 space-y-0.5">
                  <li><strong>Cat-II (Plastic carry bag):</strong> Minimum 120 Micron</li>
                  <li><strong>Cat-II (Plastic sheet/cover):</strong> Minimum 50 Micron</li>
                  <li><strong>Cat IV (Compostable plastic bags):</strong> No Minimum Limit (subject to IS 17088 and CPCB certificate)</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
        </div>
        </div>
        )}

        {registrationComplete && wizardStep === 'partB' && (
          <RegistrationPartB generalInfo={generalInfo} setGeneralInfo={setGeneralInfo} gstin={autoData.gstin} />
        )}

        {registrationComplete && wizardStep === 'partC' && (
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-bold text-slate-800 border-b pb-2 mb-4">Part C: Document Uploads</h3>
            <div className="bg-white border rounded-xl shadow-sm p-6 space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {['Micro', 'Small', 'Medium'].includes(generalInfo.typeOfCompany)
                    ? 'Type of Company Document — MSME Certificate (PDF) *'
                    : 'Type of Company Document — Large Entity Declaration (PDF) *'}
                </label>
                <input
                  type="file"
                  accept=".pdf"
                  onChange={async (e) => {
                    const file = e.target.files[0];
                    if (file) await persistPartCFile(file, 'typeOfCompanyDoc');
                  }}
                  className={inputClass}
                />
                {autoData.typeOfCompanyDoc && (
                  <UploadedFilePreview filePath={autoData.typeOfCompanyDoc} />
                )}
              </div>
            </div>
          </div>

          <RegistrationPartC
            generalInfo={generalInfo}
            setGeneralInfo={setGeneralInfo}
            autoData={autoData}
            setAutoData={setAutoData}
            email={email}
            mobile={mobile}
            showToast={showToast}
          />
        </div>
        )}

        {!registrationComplete && (
        <>
        <div className="mt-8">
          <p className="text-xs text-slate-500 mt-6 mb-4">
            Authorized Person Details &amp; Set Password
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Password *</label>
              <div className="relative">
                <input
                  name="password"
                  value={generalInfo.password}
                  onChange={handleGeneralChange}
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter Password (min 8 chars)"
                  className={`${lockedInputClass} pr-10`}
                  
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Confirm Password *</label>
              <div className="relative">
                <input
                  name="confirmPassword"
                  value={generalInfo.confirmPassword}
                  onChange={handleGeneralChange}
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="Confirm Password"
                  className={`${lockedInputClass} pr-10`}
                  
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  tabIndex={-1}
                  aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                >
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-md font-medium text-slate-800 mb-1 flex items-center gap-2">
            <Mail size={16} className="text-green-600" />
            Contact Details
            <span className="text-xs font-normal text-slate-400">(Step 1 — User Verification)</span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email Address *</label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                placeholder="Enter Email Address"
                className={lockedInputClass}
                
                
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Mobile Number *</label>
              <input
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                type="tel"
                placeholder="Enter Mobile Number"
                className={lockedInputClass}
                
                
                required
              />
            </div>
          </div>
        </div>
        </>
        )}

        {!registrationComplete && (
          <div
            className={`rounded-xl border px-4 py-3 ${
              startRegistrationBlockers.length === 0
                ? 'border-green-200 bg-green-50'
                : 'border-amber-200 bg-amber-50'
            }`}
          >
            <div className="flex items-start gap-2">
              {startRegistrationBlockers.length === 0 ? (
                <CheckCircle2 size={18} className="text-green-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle size={18} className="text-amber-600 shrink-0 mt-0.5" />
              )}
              <div className="min-w-0">
                <p className={`text-sm font-semibold ${startRegistrationBlockers.length === 0 ? 'text-green-800' : 'text-amber-900'}`}>
                  {startRegistrationBlockers.length === 0
                    ? 'Ready — you can start CPCB registration'
                    : `Complete ${startRegistrationBlockers.length} item${startRegistrationBlockers.length === 1 ? '' : 's'} to enable Start Registration`}
                </p>
                {startRegistrationBlockers.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {startRegistrationBlockers.map((item) => (
                      <li key={item.id} className="text-xs text-amber-900 flex items-start gap-1.5">
                        <span className="text-amber-500 mt-0.5">•</span>
                        <span>{item.label}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="pt-4 border-t border-slate-100 flex justify-between gap-3">
          {registrationComplete && wizardStep !== 'partA' ? (
            <button
              type="button"
              onClick={() => setWizardStep(wizardStep === 'partC' ? 'partB' : 'partA')}
              disabled={loading}
              className="inline-flex items-center gap-1 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50"
            >
              <ChevronLeft size={16} />
              Back
            </button>
          ) : (
            <button
              type="button"
              onClick={() => navigate(-1)}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
          )}

          {!registrationComplete ? (
            <button
              type="button"
              onClick={handleStartRegistration}
              disabled={
                startRegistrationBlockers.length > 0
                || (showAutomationModal && automationPhase !== 'error')
              }
              title={
                startRegistrationBlockers.length > 0
                  ? `Complete ${startRegistrationBlockers.length} pending item(s) above`
                  : 'Start CPCB account registration'
              }
              className="inline-flex items-center gap-2 px-6 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Phone size={16} />}
              Start Registration
            </button>
          ) : wizardStep !== 'partC' ? (
            <button
              type="button"
              onClick={handleSaveAndNext}
              disabled={loading}
              className="inline-flex items-center gap-2 px-6 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 shadow-sm disabled:opacity-50"
            >
              Save & Next
              <ChevronRight size={16} />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleNewApplication}
              disabled={loading}
              className="inline-flex items-center gap-2 px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-sm disabled:opacity-50"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <FilePlus size={16} />}
              Register
            </button>
          )}
        </div>
      </form>

      {loading && !showAutomationModal && !showLoginCaptchaModal && !showLoginOtpModal && !showPaymentBypassModal && (
        <div className="fixed inset-0 z-[90] bg-white/85 flex flex-col items-center justify-center">
          <Loader2 size={40} className="animate-spin text-green-600 mb-4" />
          <p className="text-slate-800 font-semibold">Please wait</p>
          <p className="text-sm text-slate-500 mt-1">{loadingMsg || 'Your request is being processed'}</p>
        </div>
      )}

      <RegistrationAutomationModal
        open={showAutomationModal}
        phase={automationPhase}
        currentStep={currentAutomationStep}
        logs={automationLogs}
        loading={loading || captchaSubmitting}
        loadingMsg={loadingMsg}
        onClose={closeAutomationModal}
        canClose={automationPhase === 'error' || automationPhase === 'complete' || (!loading && automationPhase === 'running')}
        email={email}
        emailOtp={emailOtp}
        onEmailOtpChange={(value) => {
          setEmailOtp(value);
          if (otpInputError) setOtpInputError('');
        }}
        onVerifyEmailOtp={handleVerifyEmailOtp}
        onResendEmailOtp={handleResendEmailOtp}
        otpTimer={otpTimer}
        isResendActive={isResendActive}
        formatTimer={formatTimer}
        otpSubmitting={otpSubmitting}
        otpResending={resendingMobileOtp}
        mobile={mobile}
        mobileOtp={mobileOtp}
        onMobileOtpChange={(value) => {
          setMobileOtp(value);
          if (otpInputError) setOtpInputError('');
        }}
        otpError={otpInputError}
        onVerifyMobileOtp={handleVerifyMobileOtp}
        onResendMobileOtp={handleResendMobileOtp}
        captchaImage={captchaImage}
        captchaText={captchaText}
        onCaptchaTextChange={(value) => {
          setCaptchaText(String(value || '').slice(0, 6));
          if (captchaError) setCaptchaError('');
        }}
        onSubmitCaptcha={handleSubmitCaptcha}
        onRefreshCaptcha={handleRefreshCaptcha}
        captchaError={captchaError}
        captchaSubmitting={captchaSubmitting}
        captchaRefreshing={captchaRefreshing}
      />

      {showLoginCaptchaModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Login Captcha</h3>
                <p className="text-xs text-slate-500 mt-0.5">Enter captcha to request login OTP</p>
              </div>
              <button
                type="button"
                onClick={() => !loginCaptchaSubmitting && setShowLoginCaptchaModal(false)}
                disabled={loginCaptchaSubmitting}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 disabled:opacity-50"
              >
                <X size={18} />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="flex items-center gap-3">
                {loginCaptchaImage ? (
                  <img
                    src={loginCaptchaImage}
                    alt="Login captcha"
                    className="h-12 border border-slate-200 rounded bg-slate-50"
                  />
                ) : (
                  <div className="h-12 w-32 border border-dashed border-slate-300 rounded bg-slate-50 flex items-center justify-center text-xs text-slate-400">
                    No image
                  </div>
                )}
                <button
                  type="button"
                  onClick={handleRefreshLoginCaptcha}
                  disabled={loginCaptchaRefreshing || loginCaptchaSubmitting}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50"
                >
                  {loginCaptchaRefreshing ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <RefreshCw size={14} />
                  )}
                  Refresh
                </button>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Captcha</label>
                <input
                  type="text"
                  value={loginCaptchaText}
                  onChange={(e) => {
                    setLoginCaptchaText(e.target.value.slice(0, 6));
                    if (loginCaptchaError) setLoginCaptchaError('');
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && handleSubmitLoginCaptcha()}
                  placeholder="Enter captcha"
                  maxLength={6}
                  disabled={loginCaptchaSubmitting}
                  className={`${inputClass} uppercase tracking-widest ${loginCaptchaError ? 'border-red-400 focus:ring-red-500 focus:border-red-500' : ''}`}
                  autoFocus
                />
                {loginCaptchaError && (
                  <p className="text-xs text-red-600 mt-1.5">{loginCaptchaError}</p>
                )}
              </div>
              {loginCaptchaSubmitting && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
                  <p className="text-xs font-medium text-blue-800 flex items-center gap-2">
                    <Loader2 size={12} className="animate-spin shrink-0" />
                    Please wait
                  </p>
                </div>
              )}
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t flex justify-end">
              <button
                type="button"
                onClick={handleSubmitLoginCaptcha}
                disabled={loginCaptchaSubmitting || !loginCaptchaText.trim()}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {loginCaptchaSubmitting && <Loader2 size={14} className="animate-spin" />}
                Get OTP
              </button>
            </div>
          </div>
        </div>
      )}

      {showLoginOtpModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-lg font-semibold text-slate-800">Login OTP</h3>
              <button
                type="button"
                disabled={loginOtpSubmitting}
                onClick={() => setShowLoginOtpModal(false)}
                className="text-slate-400 hover:text-slate-600 disabled:opacity-50"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6">
              <p className="text-sm text-slate-600 mb-4">
                Enter 6-digit OTP sent to your registered email and mobile
              </p>
              <input
                type="text"
                value={loginOtp}
                onChange={(e) => {
                  setLoginOtp(e.target.value.replace(/\D/g, '').slice(0, 6));
                  if (loginOtpError) setLoginOtpError('');
                }}
                onKeyDown={(e) => e.key === 'Enter' && !loginOtpSubmitting && handleVerifyLoginOtp()}
                placeholder="Enter 6-digit OTP"
                disabled={loginOtpSubmitting}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-60 tracking-widest text-center text-lg ${loginOtpError ? 'border-red-400' : 'border-slate-300'}`}
                autoFocus
                maxLength={6}
              />
              {loginOtpError && (
                <p className="text-xs text-red-600 mt-1.5">{loginOtpError}</p>
              )}
              <div className="mt-4 flex items-center justify-between text-sm">
                {!loginOtpResendActive ? (
                  <span className="text-slate-500">
                    Resend OTP in <span className="font-medium">{formatTimer(loginOtpTimer)}</span>
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={loginOtpSubmitting}
                    onClick={handleResendLoginOtp}
                    className="text-blue-600 hover:text-blue-700 font-medium disabled:opacity-50"
                  >
                    Send OTP again
                  </button>
                )}
              </div>
              {loginOtpSubmitting && (
                <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
                  <p className="text-xs font-medium text-blue-800 flex items-center gap-2">
                    <Loader2 size={12} className="animate-spin shrink-0" />
                    Please wait
                  </p>
                </div>
              )}
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t flex justify-end">
              <button
                type="button"
                onClick={handleVerifyLoginOtp}
                disabled={loginOtpSubmitting || loginOtp.replace(/\D/g, '').length !== 6}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {loginOtpSubmitting && <Loader2 size={14} className="animate-spin" />}
                Verify OTP & Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {showPaymentBypassModal && (
        <div className="fixed inset-0 z-[80] bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b bg-slate-50">
              <h3 className="text-lg font-semibold text-slate-800">Payment Bypass</h3>
              <p className="text-sm text-slate-500 mt-1">
                Have you already completed the payment for a different unit?
              </p>
            </div>
            <div className="p-6 space-y-4">
              {paymentBypassMode === 'txn' ? (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Enter Transaction Id *</label>
                  <input
                    value={paymentBypassTxnId}
                    onChange={(e) => setPaymentBypassTxnId(e.target.value)}
                    placeholder="Enter Transaction Id"
                    className={inputClass}
                  />
                </div>
              ) : (
                <p className="text-sm text-slate-600">
                  <strong>No</strong> — open payment-breakdown, click Click to Pay, and open the PayU link in Chrome.
                  <br />
                  <strong>Yes</strong> — enter the previous Transaction ID on CPCB.
                </p>
              )}
            </div>
            <div className="px-6 py-4 border-t bg-slate-50 flex justify-end gap-2">
              {paymentBypassMode === 'choose' ? (
                <>
                  <button
                    type="button"
                    className="px-4 py-2 text-sm font-medium border border-slate-300 rounded-lg hover:bg-slate-50"
                    onClick={async () => {
                      setShowPaymentBypassModal(false);
                      await window.pwp?.scraper?.answerPaymentBypass?.({ bypass: false });
                    }}
                  >
                    No
                  </button>
                  <button
                    type="button"
                    className="px-4 py-2 text-sm font-medium text-white bg-teal-700 rounded-lg hover:bg-teal-800"
                    onClick={() => setPaymentBypassMode('txn')}
                  >
                    Yes
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="px-4 py-2 text-sm font-medium text-white bg-teal-700 rounded-lg hover:bg-teal-800 disabled:opacity-50"
                  disabled={!paymentBypassTxnId.trim()}
                  onClick={async () => {
                    setShowPaymentBypassModal(false);
                    await window.pwp?.scraper?.answerPaymentBypass?.({
                      bypass: true,
                      transactionId: paymentBypassTxnId.trim(),
                    });
                  }}
                >
                  Submit
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {false && showAutomationLogsModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b flex justify-between items-center bg-slate-50">
              <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                <Terminal size={18} className="text-blue-600" />
                Automation Form Filling Logs
              </h3>
              <button
                type="button"
                onClick={() => setShowAutomationLogsModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
                disabled={loading || loginCaptchaSubmitting || loginOtpSubmitting}
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-4 bg-slate-900 flex-1 overflow-y-auto font-mono text-sm leading-relaxed text-slate-300">
              {automationLogs.length === 0 ? (
                <div className="text-slate-500 italic">Waiting for automation to start...</div>
              ) : (
                <div className="space-y-1">
                  {automationLogs.map((log, i) => (
                    <div key={i} className={log.type === 'error' ? 'text-red-400 font-medium' : log.type === 'success' ? 'text-green-400 font-medium' : 'text-slate-300'}>
                      <span className="text-slate-500 opacity-50 select-none mr-2">[{String(i).padStart(3, '0')}]</span>
                      {log.message}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t flex justify-between items-center">
              <div className="text-sm text-slate-500 flex items-center gap-2">
                {(loading || loginCaptchaSubmitting || loginOtpSubmitting) ? (
                   <><Loader2 size={14} className="animate-spin text-blue-600" /> Automation in progress...</>
                ) : (
                   <><CheckCircle2 size={14} className="text-green-600" /> Process finished or awaiting input.</>
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowAutomationLogsModal(false)}
                disabled={loading || loginCaptchaSubmitting || loginOtpSubmitting}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50"
              >
                Close Logs
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
