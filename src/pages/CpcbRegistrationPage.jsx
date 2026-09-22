import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { flushSync } from 'react-dom';
import { usePageHeader } from '../context/PageHeaderContext.jsx';
import { useNavigate } from 'react-router-dom';
import { useToast, Toast } from '../components/Toast.jsx';
import RegistrationDocUpload from '../components/RegistrationDocUpload.jsx';
import RegistrationPartB from '../components/RegistrationPartB.jsx';
import RegistrationPartC from '../components/RegistrationPartC.jsx';
import RegistrationPartBSimpRawMaterial from '../components/RegistrationPartBSimpRawMaterial.jsx';
import RegistrationPartCSimpRawMaterial from '../components/RegistrationPartCSimpRawMaterial.jsx';
import EprTargetsConfirmationModal from '../components/EprTargetsConfirmationModal.jsx';
import RegistrationPaymentModal from '../components/RegistrationPaymentModal.jsx';
import RegistrationPreviewModal from '../components/RegistrationPreviewModal.jsx';
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
import { SUB_APPLICANT_OPTIONS_MAP, isSimpRawMaterial } from '../../shared/entityRegistrationTypes.js';
import { validateSimpSupplyPortalRows } from '../../shared/simpRawMaterialPartB.js';
import { getStartRegistrationBlockers, getRegistrationChecklist } from '../utils/registrationStartReadiness.js';
import { sanitizeAutomationUserError } from '../utils/automationLogFilter.js';
import { downloadExcelTemplate, parseExcelFile, importExcelRows } from '../utils/excelImport.js';
import { showRegistrationAutomationError, isLoginOtpFailureResult } from '../utils/registrationAutomationErrors.js';
import { useCpcbPortalToasts } from '../hooks/useCpcbPortalToasts.js';
import RegistrationAutomationModal, {
  appendAutomationLog,
  applyAutomationLogUpdate,
} from '../components/RegistrationAutomationModal.jsx';
import CpcbPortalToastFeed from '../components/CpcbPortalToastFeed.jsx';
import LocalFilePreview from '../components/LocalFilePreview.jsx';
import OperatingStatesMultiSelect from '../components/OperatingStatesMultiSelect.jsx';
import RegistrationPartACompanyProfile from '../components/RegistrationPartACompanyProfile.jsx';
import RegistrationPartALoginCredentials from '../components/RegistrationPartALoginCredentials.jsx';
import RegistrationPartASimpRawMaterial from '../components/RegistrationPartASimpRawMaterial.jsx';
import ImporterEprPreparedReview from '../components/importerEpr/ImporterEprPreparedReview.jsx';
import RegistrationPreviewSummary from '../components/RegistrationPreviewSummary.jsx';
import {
  fetchComputedPlasticConsumed3c,
  shouldHydratePlasticConsumed,
} from '../utils/registrationPlasticConsumed.js';
import { getImporterReportingFinancialYears } from '../../shared/financialYearScope.js';
import { prunePlasticConsumedForPortal } from '../../shared/plasticConsumed3c.js';
import { requiresHistoricalEprData } from '../../shared/commencementYearScope.js';
import {
  prunePartBSection4ForPortal,
  validateSection4AgainstPlasticConsumed,
} from '../utils/registrationPartBSection4.js';
import { formatSection4IssuesAsPortalMessage } from '../../shared/partBSection4.js';
import {
  validateSection5bAgainstPlasticConsumed,
  prepareSec5bForPortal,
} from '../../shared/partBSection5.js';
import {
  getRegisterApplicationBlockers,
  navigateToRegisterBlockerSection,
  summarizeRegisterBlockers,
  formatPartBPlasticValidationToasts,
} from '../utils/registrationApplicationReadiness.js';
import LetterStudioModal from '../components/LetterStudioModal.jsx';
import {
  getApplicableLetters,
  loadLetterSourceRecords,
  missingLetterFields,
  buildLetterValues,
  resolveIecNumber,
} from '../utils/partCLetterValues.js';
import { Loader2, X, Sparkles, Mail, Phone, FlaskConical, Building2, Eye, EyeOff, RefreshCw, FilePlus, CheckCircle2, AlertCircle, Terminal, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Lock, IdCard, User, Calendar, Upload, Image as ImageIcon, FileText, PenTool, Briefcase, MapPin, Download, FileSpreadsheet } from 'lucide-react';

/** Dev-only shortcut — hidden for full Register automation testing. */
const SHOW_RESUME_DRAFT_DEV_BUTTON = false;

const inputClass =
  'w-full px-4 py-2.5 bg-slate-50/60 border border-slate-200/80 text-slate-800 rounded-xl focus:bg-white focus:ring-[3px] focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all duration-300 placeholder:text-slate-400 font-medium shadow-[inset_0px_2px_4px_rgba(0,0,0,0.01)] hover:border-slate-300 hover:bg-slate-50';
const selectClass = inputClass;

const modernInputClass =
  'w-full pl-10 pr-4 py-2.5 bg-slate-50/60 border border-slate-200/80 text-slate-800 rounded-xl focus:bg-white focus:ring-[3px] focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all duration-300 placeholder:text-slate-400 font-medium shadow-[inset_0px_2px_4px_rgba(0,0,0,0.01)] hover:border-slate-300 hover:bg-slate-50';
const modernLockedInputClass = `${modernInputClass} opacity-80 bg-slate-100/50 cursor-not-allowed hover:border-slate-200/80 hover:bg-slate-100/50`;
const modernSelectClass = modernInputClass;
const modernLockedSelectClass = modernLockedInputClass;

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

const getFileName = (path) => path ? String(path).split(/[/\\]/).pop() : '';

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
  const [automationFlow, setAutomationFlow] = useState('registration');
  const [otpInputError, setOtpInputError] = useState('');
  const [registrationBlocker, setRegistrationBlocker] = useState('');
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [wizardStep, setWizardStep] = useState('account');
  const [showPaymentBypassModal, setShowPaymentBypassModal] = useState(false);
  const [paymentBypassTxnId, setPaymentBypassTxnId] = useState('');
  const [paymentBypassMode, setPaymentBypassMode] = useState('choose');
  const [showEprTargetsModal, setShowEprTargetsModal] = useState(false);
  const [eprTargetsModalData, setEprTargetsModalData] = useState(null);
  const [paymentReviewData, setPaymentReviewData] = useState(null);
  const [showPaymentReviewModal, setShowPaymentReviewModal] = useState(false);
  const [eprTargetsSubmitting, setEprTargetsSubmitting] = useState(false);
  const [isGeneralInfoExpanded, setIsGeneralInfoExpanded] = useState(true);
  const [isBusinessDetailsExpanded, setIsBusinessDetailsExpanded] = useState(true);
  const [isDirectorsDetailsExpanded, setIsDirectorsDetailsExpanded] = useState(true);
  const [isOperationsDetailsExpanded, setIsOperationsDetailsExpanded] = useState(true);
  const [isReqDocsExpanded, setIsReqDocsExpanded] = useState(true);

  const [isUploadingExcel, setIsUploadingExcel] = useState(false);

  const handleExcelUpload = async (e, type) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingExcel(true);
    try {
      const { rows } = await parseExcelFile(file, type);
      const res = await importExcelRows(type, rows);
      showToast(`Successfully uploaded ${res.saved} new ${type} records, updated ${res.updated}.`, 'success');
    } catch (err) {
      showToast(err.message || 'Error uploading excel', 'error');
    } finally {
      setIsUploadingExcel(false);
      e.target.value = '';
    }
  };
  const [plasticConsumedSource, setPlasticConsumedSource] = useState('');
  const [uploadingPdfField, setUploadingPdfField] = useState('');
  const automationBusyRef = useRef(false);
  /** 'full' = normal Register; 'resumeDraft' = open draft View → Part B (dev). */
  const automationModeRef = useRef('full');
  const simpleFileInputRef = useRef(null);
  const [simpleUploadTarget, setSimpleUploadTarget] = useState(null);

  const handleSimpleFileSelected = useCallback(async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !simpleUploadTarget) return;

    if (!/\.pdf$/i.test(file.name)) {
      showToast?.('Please upload a PDF file.', 'error');
      setSimpleUploadTarget(null);
      return;
    }
    const ext = file.name.match(/\.[^.]+$/i)?.[0] || '.pdf';

    const PART_C_DOC_BASE = {
      partCCoveringLetter: 'covering_letter',
      partCAuditedStatement: 'self_declaration',
      partCSignature: 'signature',
      detailsOfProductsPath: 'operations_details',
      representativePicturePath: 'plastic_packaging_picture',
    };
    const { field, store } = simpleUploadTarget;
    const docBase = PART_C_DOC_BASE[field] || 'document';
    const portalFileName = registrationDocFileName(docBase, ext);

    const stored = await storeCompressedUpload(file, {
      destSubdir: 'processed_part_c',
      fileName: portalFileName,
    });

    if (!stored || !stored.success || !stored.filePath) {
      showToast?.(stored?.message || 'Could not save PDF.', 'error');
      setSimpleUploadTarget(null);
      return;
    }

    if (store === 'autoData') {
      setAutoData((prev) => ({ ...prev, [field]: stored.filePath }));
    } else {
      setGeneralInfo((prev) => ({ ...prev, [field]: stored.filePath }));
    }
    showToast?.('Document uploaded successfully', 'success');
    setSimpleUploadTarget(null);
  }, [simpleUploadTarget, showToast]);

  const triggerSimpleUpload = useCallback((field, store) => {
    setSimpleUploadTarget({ field, store });
    simpleFileInputRef.current?.click();
  }, []);

  const [studioOpen, setStudioOpen] = useState(false);
  const [studioLetterId, setStudioLetterId] = useState(null);
  const [studioDocs, setStudioDocs] = useState([]);
  const [studioCompanies, setStudioCompanies] = useState([]);
  const [studioIec, setStudioIec] = useState('');

  useEffect(() => {
    let alive = true;
    if (studioOpen) {
      Promise.all([
        resolveIecNumber(),
        loadLetterSourceRecords(),
      ]).then(([iecValue, sources]) => {
        if (!alive) return;
        setStudioIec(iecValue);
        setStudioDocs(sources.docs || []);
        setStudioCompanies(sources.companies || []);
      });
    }
    return () => {
      alive = false;
    };
  }, [studioOpen]);

  const sourceRecords = useMemo(
    () => ({ generalInfo, autoData, iec: studioIec, docs: studioDocs, companies: studioCompanies }),
    [generalInfo, autoData, studioIec, studioDocs, studioCompanies]
  );
  const applicableLetters = useMemo(
    () => getApplicableLetters(generalInfo.typeOfCompany),
    [generalInfo.typeOfCompany]
  );
  const missingFields = useMemo(
    () => missingLetterFields(sourceRecords, applicableLetters),
    [sourceRecords, applicableLetters]
  );

  const handleAttachFromStudio = useCallback((letter, filePath) => {
    if (!filePath) return;
    if (letter.store === 'autoData') {
      setAutoData((prev) => ({ ...prev, [letter.field]: filePath }));
    } else {
      setGeneralInfo((prev) => ({ ...prev, [letter.field]: filePath }));
    }
    showToast?.('Document attached successfully', 'success');
  }, [showToast]);

  const handlePrepareLetter = useCallback((letterId) => {
    setStudioLetterId(letterId);
    setStudioOpen(true);
  }, []);

  const formatTimer = useCallback(
    (time) => `${Math.floor(time / 60).toString().padStart(2, '0')}:${(time % 60).toString().padStart(2, '0')}`,
    [],
  );

  const openAutomationModal = useCallback((step = 'Starting CPCB registration…', flow = 'registration') => {
    flushSync(() => {
      setAutomationLogs([]);
      setAutomationFlow(flow);
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
    setAutomationFlow('registration');
    setCurrentAutomationStep('');
    setLoading(false);
    setLoadingMsg('');
    setOtpSubmitting(false);
    setShowEmailOtp(false);
    setShowMobileOtp(false);
    setShowCaptchaModal(false);
    setShowLoginCaptchaModal(false);
    setShowLoginOtpModal(false);
    setLoginCaptchaSubmitting(false);
    setLoginOtpSubmitting(false);
    setOtpInputError('');
  }, []);

  const completeAutomationModal = useCallback((message) => {
    if (message) appendAutomationLog(setAutomationLogs, message, 'success');
    setAutomationPhase('complete');
    setCurrentAutomationStep(automationFlow === 'login' ? 'Application complete' : 'Registration complete');
    window.setTimeout(() => {
      closeAutomationModal();
    }, 2500);
  }, [automationFlow, closeAutomationModal]);

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

  const loginOtpActive = showLoginOtpModal || (showAutomationModal && automationPhase === 'login_otp');

  const lockedInputClass = registrationComplete
    ? `${inputClass} !bg-slate-100 !border-slate-200/60 !text-slate-500 cursor-not-allowed shadow-none`
    : inputClass;
  const lockedSelectClass = lockedInputClass;

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
        plasticConsumed: prunePlasticConsumedForPortal(
          form.generalInfo.plasticConsumed || prev.plasticConsumed || {},
        ),
        partBSection4: prunePartBSection4ForPortal(
          form.generalInfo.partBSection4 || prev.partBSection4 || [],
          form.generalInfo.operatingStates || prev.operatingStates || [],
        ),
        partBTransactions: {
          sec5a: [],
          sec5b: [],
          sec5c: [],
          sec5d: [],
          ...(prev.partBTransactions || {}),
          ...(form.generalInfo.partBTransactions || {}),
        },
        applicantType: saved.applicant_type || form.generalInfo.applicantType || prev.applicantType || 'PIBO',
        subApplicantType:
          saved.sub_applicant_type || form.generalInfo.subApplicantType || prev.subApplicantType || 'Importer',
      }));
    } else {
      setGeneralInfo((prev) => ({
        ...prev,
        applicantType: saved.applicant_type || prev.applicantType || 'PIBO',
        subApplicantType: saved.sub_applicant_type || prev.subApplicantType || 'Importer',
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
    if (loginOtpActive && loginOtpTimer > 0) {
      interval = setInterval(() => setLoginOtpTimer((prev) => prev - 1), 1000);
    } else if (loginOtpActive && loginOtpTimer === 0) {
      setLoginOtpResendActive(true);
      if (interval) clearInterval(interval);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [loginOtpActive, loginOtpTimer]);

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

  useEffect(() => {
    if (!window.pwp?.scraper?.onEprTargetsPrompt) return undefined;
    return window.pwp.scraper.onEprTargetsPrompt((data) => {
      setEprTargetsModalData(data || {});
      setShowEprTargetsModal(true);
      setEprTargetsSubmitting(false);
      showToast('Section 7 EPR Targets calculated on CPCB portal — please confirm to submit.', 'info', { duration: 10000 });
    });
  }, [showToast]);

  useEffect(() => {
    if (!window.pwp?.scraper?.onPaymentReview) return undefined;
    return window.pwp.scraper.onPaymentReview((data) => {
      setPaymentReviewData((prev) => ({ ...(prev || {}), ...(data || {}) }));
      setShowPaymentReviewModal(true);
      setShowAutomationModal(true);
      setAutomationPhase('running');
      setCurrentAutomationStep(data?.message || (data?.payuUrl ? 'PayU checkout is open' : 'Payment breakdown ready'));
      if (data?.message) appendAutomationLog(setAutomationLogs, data.message, 'success');
      if (data?.payuUrl) {
        showToast('PayU checkout opened in the app.', 'success', { duration: 8000 });
      } else {
        showToast(data?.message || 'CPCB payment breakdown is ready in the app.', 'success', { duration: 8000 });
      }
    });
  }, [showToast]);

  const handleConfirmEprTargets = async () => {
    setEprTargetsSubmitting(true);
    try {
      await window.pwp?.scraper?.answerEprTargetsConfirmation?.({ confirmed: true });
      setShowEprTargetsModal(false);
      showToast('EPR Targets confirmed. Submitting Part C on CPCB portal...', 'success');
    } catch (err) {
      showToast('Failed to confirm EPR targets: ' + err.message, 'error');
    } finally {
      setEprTargetsSubmitting(false);
    }
  };

  const handleCancelEprTargets = async () => {
    setShowEprTargetsModal(false);
    await window.pwp?.scraper?.answerEprTargetsConfirmation?.({ confirmed: false });
    showToast('EPR Targets submission stopped by user.', 'info');
  };

  const applyRegistrationData = useCallback(async (docData = {}, { savedForm = null, overwrite = false } = {}) => {
    const { data } = resolveRegistrationData(docData);

    setAutoData((prev) => {
      if (overwrite) {
        // We do not use pickNonEmpty on data so that if a field is empty in the new document, 
        // it correctly overwrites the old value in prev.
        return { ...EMPTY_AUTO, ...prev, ...data };
      }
      return mergeAutoData(EMPTY_AUTO, data, savedForm?.autoData || prev);
    });
    let mergedGeneralInfo = {};

    setGeneralInfo((prev) => {
      mergedGeneralInfo = overwrite
        ? { ...GENERAL_INFO_EMPTY, ...prev, ...mergeGeneralInfoFromSources(data, {}) }
        : mergeGeneralInfoFromSources(data, savedForm?.generalInfo || prev);
      return {
        ...mergedGeneralInfo,
        password: savedForm?.generalInfo?.password || prev.password || mergedGeneralInfo.password || '',
        confirmPassword:
          savedForm?.generalInfo?.confirmPassword ||
          savedForm?.generalInfo?.password ||
          prev.confirmPassword ||
          mergedGeneralInfo.confirmPassword ||
          '',
      };
    });

    let docs = [];
    if (window.pwp?.documents?.getAll) {
      docs = await window.pwp.documents.getAll();
    }
    const { ready, missing } = isRegistrationReadyWithFallback(docs, data, mergedGeneralInfo?.typeOfBusiness);
    setDocReady(ready);
    setMissingDocs(missing);
    setFileNameIssues(
      collectRegistrationUploadFileIssues({
        docs,
        autoData: mergeAutoData(EMPTY_AUTO, data, savedForm?.autoData || {}),
        generalInfo: mergedGeneralInfo,
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
    if (loadingSavedRegistration || !showHistoricalEprSections) return undefined;

    let cancelled = false;
    (async () => {
      try {
        const result = await fetchComputedPlasticConsumed3c({
          gstin: autoData.gstin,
          savedImporter3a: autoData.importer3a,
          docStatus: 'all',
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
  }, [loadingSavedRegistration, showHistoricalEprSections, autoData.gstin, autoData.importer3a]);

  const handlePlasticConsumedChange = useCallback((nextPlasticConsumed) => {
    setGeneralInfo((prev) => ({ ...prev, plasticConsumed: nextPlasticConsumed }));
  }, []);

  const handleDocExtracted = useCallback(async (data) => {
    await applyRegistrationData(data, { overwrite: true });
  }, [applyRegistrationData]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const normalized = await normalizeRegistrationPaths({ autoData, generalInfo });
      if (cancelled) return;

      const isPropOrPartner = String(normalized.generalInfo?.typeOfBusiness).toLowerCase().includes('proprietorship') || String(normalized.generalInfo?.typeOfBusiness).toLowerCase().includes('partnership');
      if (isPropOrPartner) {
        if (!normalized.autoData.companyPan && normalized.autoData.authPan) {
          normalized.autoData.companyPan = normalized.autoData.authPan;
          normalized.changed = true;
        }
        if (!normalized.autoData.companyPanDocumentPath && normalized.autoData.personPanDocumentPath) {
          normalized.autoData.companyPanDocumentPath = normalized.autoData.personPanDocumentPath;
          normalized.autoData.companyPanOriginalName = normalized.autoData.personPanOriginalName;
          normalized.changed = true;
        }
      }

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
      const { ready, missing } = isRegistrationReadyWithFallback(docs, normalized.autoData, normalized.generalInfo?.typeOfBusiness);
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
      const isSimp = isSimpRawMaterial(generalInfo.applicantType, generalInfo.subApplicantType);
      if (isSimp) {
        if (!generalInfo.plantState && !generalInfo.stateUt && (!generalInfo.operatingStates || !generalInfo.operatingStates.length)) {
          showToast('Plant / Unit State is required.', 'error');
          return;
        }
        if (!generalInfo.yearOfCommencement) {
          showToast('Year of Commencement of Production is required.', 'error');
          return;
        }
        if (!generalInfo.capitalInvested) {
          showToast('Total Capital Invested on the Project is required.', 'error');
          return;
        }
        await persistRegistrationForm();
        showToast('Part A saved.', 'success');
        setWizardStep('partB');
        return;
      }

      if (!generalInfo.operatingStates?.length) {
        showToast('Select at least one operating state.', 'error');
        return;
      }
      if (generalInfo.operatingStates.length === 2) {
        showToast('Cannot select exactly 2 states. Select 1, or 3 or more.', 'error');
        return;
      }
      if (!generalInfo.yearOfCommencement) {
        showToast('Year of Commencement is required.', 'error');
        return;
      }
      if (!generalInfo.complianceStatus) {
        showToast('Compliance Status (3d) is required.', 'error');
        return;
      }
      if (!String(generalInfo.thicknessOfPlastic || '').trim()) {
        showToast('Thickness of Plastic (3e) is required.', 'error');
        return;
      }
      await persistRegistrationForm();
      showToast('Part A saved.', 'success');
      setWizardStep('partB');
      return;
    }
    if (wizardStep === 'partB') {
      const supplyFieldIssues = validateSimpSupplyPortalRows(
        (generalInfo.simpSupplyDetails || []).filter((row) => Number(row.quantityTons || row.quantityTpa || 0) > 0),
      );
      if (isSimpRawMaterial(generalInfo.applicantType, generalInfo.subApplicantType) && supplyFieldIssues.length) {
        showToast(supplyFieldIssues[0].message, 'error', { duration: 14000 });
        return;
      }
      await persistRegistrationForm();
      showToast('Part B saved.', 'success');
      setWizardStep('partC');
    }
  };

  const handlePreviewRegistration = () => {
    const isSimp = isSimpRawMaterial(generalInfo.applicantType, generalInfo.subApplicantType);
    if (isSimp) {
      if (!generalInfo.yearOfCommencement) {
        showToast('Year of Commencement of Production is required.', 'error');
        return;
      }
      setIsPreviewMode(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (!generalInfo.operatingStates?.length) {
      showToast('Select at least one operating state.', 'error');
      return;
    }
    if (generalInfo.operatingStates.length === 2) {
      showToast('Cannot select exactly 2 states. Select 1, or 3 or more.', 'error');
      return;
    }
    if (!generalInfo.yearOfCommencement) {
      showToast('Year of Commencement is required.', 'error');
      return;
    }
    if (!generalInfo.complianceStatus) {
      showToast('Compliance Status (3d) is required.', 'error');
      return;
    }
    if (!String(generalInfo.thicknessOfPlastic || '').trim()) {
      showToast('Thickness of Plastic (3e) is required.', 'error');
      return;
    }

    // if (!registrationComplete) {
    //   const blockers = getStartRegistrationBlockers({
    //     docReady, missingDocs, fileNameIssues, autoData, email, mobile, generalInfo,
    //   });
    //   if (blockers.length > 0) {
    //     const msg = blockers.map((item) => item.label).join(', ');
    //     showToast(`Complete pending items: ${msg}`, 'error', { duration: 12000 });
    //     return;
    //   }
    // }

    setIsPreviewMode(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
    let passedOtp = false;
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

      passedOtp = true;
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
        } else if (res.step === 'MOBILE_OTP_VERIFIED' || res.step === 'WAITING_CAPTCHA' || res.step === 'GENERAL_INFO_FILLED') {
          failAutomationModal(errText);
          showToast(errText, 'error', { duration: 12000 });
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
      } else if (passedOtp) {
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
    
    // Automatically proceed to Importer automation if data is valid
    setTimeout(() => {
      handleNewApplication(ceprId || '');
    }, 1000);
  };

  const handleNewApplication = async (overrideCeprId = null) => {
    automationModeRef.current = 'full';
    const activeCeprId = typeof overrideCeprId === 'string' ? overrideCeprId : savedCeprId;
    if (!activeCeprId) {
      showToast('CEPR ID not found — complete registration first.', 'error');
      return;
    }

    const isSimp = isSimpRawMaterial(generalInfo.applicantType, generalInfo.subApplicantType);

    // Strict Validation for Automation (PIBO / Brand Owner / Importer form)
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

    if (!isSimp && missing.length > 0) {
      showToast(`Missing required fields: ${missing.join(', ')}`, 'error');
      return;
    }

    if (requiresHistoricalEprData(generalInfo.yearOfCommencement)) {
      const plasticConsumed = generalInfo.plasticConsumed || {};
      const s4Issues = validateSection4AgainstPlasticConsumed(
        generalInfo.partBSection4 || [],
        plasticConsumed,
        reportingFys,
      );
      if (s4Issues.length > 0) {
        const portalMsg = formatSection4IssuesAsPortalMessage(s4Issues);
        showToast(portalMsg, 'error', { duration: 16000 });
        setWizardStep('partB');
        return;
      }

      const prepared5b = prepareSec5bForPortal({
        plasticConsumed,
        sec5b: generalInfo.partBTransactions?.sec5b || [],
        years: reportingFys,
        alignToPartA: false,
      });
      const s5bIssues = validateSection5bAgainstPlasticConsumed(
        prepared5b,
        plasticConsumed,
        reportingFys,
      );
      if (s5bIssues.length > 0) {
        const portalMsg = formatSection4IssuesAsPortalMessage(
          s5bIssues.map((i) => ({ ...i, year: i.year, catKey: i.catKey })),
        );
        showToast(portalMsg, 'error', { duration: 16000 });
        setWizardStep('partB');
        return;
      }
    }

    const registerBlockers = getRegisterApplicationBlockers({
      savedCeprId: activeCeprId,
      generalInfo,
      autoData,
      reportingYears: reportingFys,
    });
    if (registerBlockers.length > 0) {
      navigateToRegisterBlockerSection(registerBlockers, { setWizardStep });
      for (const msg of formatPartBPlasticValidationToasts(registerBlockers)) {
        showToast(msg.text, msg.type, { duration: 16000 });
      }
      showToast(summarizeRegisterBlockers(registerBlockers), 'error', { duration: 14000 });
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
          cepr_id: activeCeprId || '',
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

    clearPortalToasts();
    openAutomationModal('Preparing new application…', 'login');
    appendAutomationLog(setAutomationLogs, 'Saving application data…', 'info');
    setLoading(true);
    setCurrentAutomationStep('Starting CPCB login…');
    try {
      await beginLoginFlow(activeCeprId, { automationMode: 'full' });
    } finally {
      setLoading(false);
    }
  };

  const handleResumeDraftPartB = async () => {
    automationModeRef.current = 'resumeDraft';

    if (!String(savedCeprId || '').trim()) {
      showToast('CEPR ID required — complete registration first.', 'error');
      return;
    }
    if (!String(generalInfo.password || '').trim()) {
      showToast('Enter CPCB portal Password in Part A → Login credentials.', 'error');
      setWizardStep('partA');
      return;
    }

    if (requiresHistoricalEprData(generalInfo.yearOfCommencement)) {
      const s4Issues = validateSection4AgainstPlasticConsumed(
        generalInfo.partBSection4 || [],
        generalInfo.plasticConsumed || {},
        reportingFys,
      );
      if (s4Issues.length > 0) {
        const portalMsg = formatSection4IssuesAsPortalMessage(s4Issues);
        showToast(portalMsg, 'error', { duration: 16000 });
        setWizardStep('partB');
        return;
      }
    }

    if (window.pwp?.registration?.save) {
      try {
        await window.pwp.registration.save({
          email,
          mobile,
          applicant_type: generalInfo.applicantType || 'PIBO',
          sub_applicant_type: generalInfo.subApplicantType || 'Importer',
          cepr_id: savedCeprId || '',
          form_data_json: JSON.stringify({ email, mobile, generalInfo, autoData }),
        });
      } catch (err) {
        console.error('Failed to save data before draft resume', err);
      }
    }

    clearPortalToasts();
    openAutomationModal('Resuming draft application…', 'login');
    appendAutomationLog(setAutomationLogs, '[Dev] Resume draft → Part B (skip Part A fill)', 'info');
    setLoading(true);
    setCurrentAutomationStep('Starting CPCB login…');
    try {
      await beginLoginFlow(savedCeprId, { automationMode: 'resumeDraft' });
    } finally {
      setLoading(false);
    }
  };

  const beginLoginFlow = async (ceprId, { automationMode = 'full' } = {}) => {
    automationModeRef.current = automationMode;
    setSavedCeprId(ceprId || '');
    flushSync(() => {
      setShowAutomationModal(true);
      setAutomationFlow('login');
      setAutomationPhase('running');
      setCurrentAutomationStep('Starting CPCB login…');
    });
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
        automationMode,
      });
      if (loginRes.success && loginRes.step === 'WAITING_LOGIN_CAPTCHA') {
        setLoginCaptchaImage(loginRes.captchaImage || '');
        setLoginCaptchaText('');
        setLoginCaptchaError('');
        setShowLoginCaptchaModal(false);
        setAutomationPhase('captcha');
        setCurrentAutomationStep('Enter captcha to request login OTP');
        appendAutomationLog(setAutomationLogs, 'Enter login captcha to continue', 'success');
      } else if (loginRes.success && loginRes.step === 'APPLICATION_ONBOARDING_COMPLETE') {
        completeAutomationModal('Application onboarding completed successfully!');
        showToast('Application onboarding completed successfully!', 'success');
      } else {
        const err = loginRes.error || 'Could not start login flow';
        failAutomationModal(err);
        showToast(err, 'error');
      }
    } catch (err) {
      const errMsg = 'Login error: ' + err.message;
      failAutomationModal(errMsg);
      showToast(errMsg, 'error');
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
      const loginCreds = resolveRegistrationLoginCredentials({
        email,
        mobile,
        password: generalInfo.password,
      });
      const res = await window.pwp.scraper.submitLoginCaptcha({
        captcha: text,
        ceprId: savedCeprId,
        password: loginCreds.password,
      });

      if (res.success && res.step === 'WAITING_LOGIN_OTP') {
        setShowLoginCaptchaModal(false);
        setLoginCaptchaText('');
        setLoginOtp('');
        setOtpInputError('');
        setLoginOtpTimer(600);
        setLoginOtpResendActive(false);
        setShowLoginOtpModal(false);
        setAutomationPhase('login_otp');
        setCurrentAutomationStep('Login OTP sent — enter the code below');
        appendAutomationLog(setAutomationLogs, 'Login OTP sent — enter OTP from email/SMS', 'success');
        return;
      }

      if (res.captchaImage) {
        setLoginCaptchaImage(res.captchaImage);
      }
      setLoginCaptchaText('');
      const errMsg = res.error || 'Invalid captcha. Please try again.';
      appendAutomationLog(setAutomationLogs, errMsg, 'error');
      setAutomationPhase('captcha');
      setCurrentAutomationStep(errMsg);
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
        appendAutomationLog(setAutomationLogs, 'Login OTP resent', 'success');
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
      const msg = `Application submitted — ${res.applicantType || 'PIBO'} / ${res.subApplicantType || 'Importer'}. Complete payment in the app window.`;
      appendAutomationLog(setAutomationLogs, msg, 'success');
      setAutomationPhase('running');
      setCurrentAutomationStep('Complete payment on PayU…');
      showToast('Application submitted. PayU / fee details should open in the app.', 'success', { duration: 15000 });
      return true;
    }

    if (res.success && res.step === 'APPLICATION_ONBOARDING_AND_SCRAPE_COMPLETE') {
      const scrapeOk = res.scrape?.success !== false;
      if (scrapeOk) {
        completeAutomationModal('Application started and portal data synced');
      } else {
        failAutomationModal(`Application started — sync failed: ${res.scrape?.error || 'Unknown error'}`);
      }
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
      const msg = 'Login succeeded but application onboarding failed: ' + (res.error || 'unknown error');
      failAutomationModal(msg);
      showToast('Login successful, but onboarding failed. See progress for details.', 'error', { duration: 15000 });
      return true;
    }

    return false;
  };

  const handleVerifyLoginOtp = async () => {
    const otp = loginOtp.trim().replace(/\D/g, '');
    if (otp.length !== 6) {
      reportOtpRetryError('login_otp', 'Please enter 6-digit OTP');
      return;
    }
    setLoginOtpSubmitting(true);
    setLoginOtpError('');
    setOtpInputError('');
    setLoadingMsg('Verifying login OTP on CPCB portal...');
    try {
      const res = await window.pwp.scraper.submitLoginOtp({ otp });

      if (res.success && res.step === 'LOGIN_OTP_VERIFIED') {
        setShowLoginOtpModal(false);
        setLoginOtp('');
        setAutomationPhase('running');
        setCurrentAutomationStep('Filling application on CPCB portal…');
        appendAutomationLog(setAutomationLogs, 'Login OTP verified — filling application form', 'success');
        setLoading(true);
        try {
          const onboard = await window.pwp.scraper.runApplicationOnboardingAfterLogin({
            autoScrape: false,
            automationMode: automationModeRef.current,
          });
          if (!handleLoginOnboardingResult(onboard) && !onboard.success) {
            failAutomationModal(onboard.error || 'Application onboarding failed.');
          }
        } finally {
          setLoading(false);
          setLoadingMsg('');
        }
        return;
      }

      if (isLoginOtpFailureResult(res)) {
        reportOtpRetryError('login_otp', res.error || 'Invalid OTP. Please try again.');
        return;
      }

      if (handleLoginOnboardingResult(res)) {
        setShowLoginOtpModal(false);
        setLoginOtp('');
        return;
      }

      reportOtpRetryError('login_otp', res.error || 'Invalid OTP. Please try again.');
    } catch (err) {
      reportOtpRetryError('login_otp', err.message);
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

  const handleChangeDocument = useCallback(async (docTypeHint) => {
    try {
      const picker = window.pwp?.ocr?.selectUploads || window.pwp?.ocr?.selectFiles;
      if (!picker) {
        showToast('File picker not available', 'error');
        return;
      }
      const paths = await picker();
      if (!paths || !paths.length) return;
      const newPath = paths[0];

      setLoadingMsg('Extracting data from new document...');

      const batch = await window.pwp.ocr.extractBatch({
        filePaths: [newPath],
        type: 'company_document',
        companyDocType: docTypeHint,
      });

      const res = batch?.results?.[0];
      if (!res || !res.ok || res.skipped) {
        showToast(res?.message || 'Extraction failed', 'error');
        return;
      }

      const data = { ...(res.data || {}) };
      const originalFileName = String(newPath).split(/[/\\]/).pop();
      data.original_name = originalFileName;
      const extractedType = data.doc_type;

      if (extractedType && typeof extractedType === 'string') {
        const ext = extractedType.toLowerCase();
        // Ignore generic types that the AI might spit out
        if (ext !== 'company_document' && ext !== 'unknown') {
          const isPan = ext.includes('pan');
          const isGst = ext.includes('gst');
          const isCin = ext.includes('cin') || ext.includes('incorporation');
          const isIec = ext.includes('iec') || ext.includes('import');

          let isWrong = false;
          if ((docTypeHint === 'gst' || docTypeHint === 'unit_gst') && (isPan || isCin || isIec) && !isGst) isWrong = true;
          else if ((docTypeHint === 'person_pan' || docTypeHint === 'company_pan') && (isGst || isCin || isIec) && !isPan) isWrong = true;
          else if (docTypeHint === 'cin' && (isGst || isPan || isIec) && !isCin) isWrong = true;
          else if (docTypeHint === 'iec' && (isGst || isPan || isCin) && !isIec) isWrong = true;

          if (isWrong) {
            showToast(`Wrong document uploaded! Please re-upload the correct document.`, 'error');
            return;
          }
        }
      }

      // Always use the expected docTypeHint so the mapper finds it by exact key
      const docType = docTypeHint;

      const isPersonPan = docType === 'person_pan';
      const dobValue = data.dob || data.date_of_birth || data.dateOfBirth || data.birth_date || '';

      const payload = {
        doc_type: docType,
        document_number: data.document_number || data.gstin || data.pan || '',
        entity_name: data.entity_name || data.legal_name || data.name || data.company_name || '',
        issue_date: isPersonPan
          ? (dobValue || data.issue_date || '')
          : (data.issue_date || data.registration_date || data.date_of_incorporation || dobValue || ''),
        constitution_of_business: data.constitution_of_business || '',
        address: data.address || '',
        date_of_liability: data.date_of_liability || data.date_of_commencement || '',
        enterprise_type: data.enterprise_type || '',
        social_category: data.social_category || '',
        date_of_incorporation: data.date_of_incorporation || '',
        date_of_commencement: data.date_of_commencement || '',
        industry_category: data.industry_category || '',
        allowed_capacity: data.allowed_capacity || '',
        validity_date: data.validity_date || data.valid_upto || '',
        billing_month: data.billing_month || '',
        amount: Number(data.amount) || 0,
        units_consumed: Number(data.units_consumed) || 0,
        due_date: data.due_date || '',
        provider: data.provider || data.vendor_name || '',
        file_path: newPath,
        fileHash: data.fileHash || '',
        raw_json: JSON.stringify(data),
      };

      if (window.pwp?.documents?.getAll && window.pwp?.documents?.delete) {
        const existingDocs = await window.pwp.documents.getAll();
        const existing = existingDocs.find(d => d.doc_type === docType);
        if (existing && existing.id) {
          await window.pwp.documents.delete(existing.id);
        }
      }

      await window.pwp.documents.add(payload);
      showToast('Document updated successfully', 'success');

      const { docData } = await fetchRegistrationDocData();
      await applyRegistrationData(docData, { overwrite: true });
    } catch (err) {
      showToast(err?.message || 'Failed to process document', 'error');
    } finally {
      setLoadingMsg('');
    }
  }, [applyRegistrationData, showToast]);

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

  const registrationChecklist = useMemo(
    () => getRegistrationChecklist({
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

      <h2 className="text-lg font-semibold text-slate-800 mb-1">
        {generalInfo.applicantType || 'PIBO'} Registration —{' '}
        <span className="text-green-700">{generalInfo.subApplicantType || 'Importer'}</span>
      </h2>

      {!registrationComplete && (
        <div className="mb-5 p-3.5 bg-slate-50 border border-slate-200 rounded-lg flex flex-col gap-2.5">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-slate-600">Applicant Type:</span>
            <div className="flex items-center gap-3">
              {['PIBO', 'SIMP'].map((type) => (
                <label key={type} className="flex items-center gap-1.5 text-xs font-medium text-slate-700 cursor-pointer">
                  <input
                    type="radio"
                    name="applicantType"
                    value={type}
                    checked={(generalInfo.applicantType || 'PIBO') === type}
                    onChange={() => {
                      const subs = SUB_APPLICANT_OPTIONS_MAP[type] || SUB_APPLICANT_OPTIONS_MAP.PIBO;
                      const nextSub = subs.includes(generalInfo.subApplicantType) ? generalInfo.subApplicantType : subs[0];
                      setGeneralInfo((prev) => ({ ...prev, applicantType: type, subApplicantType: nextSub }));
                    }}
                    className="accent-green-600"
                  />
                  {type}
                </label>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-semibold text-slate-600">Sub-Applicant Category:</span>
            <div className="flex flex-wrap items-center gap-3">
              {(SUB_APPLICANT_OPTIONS_MAP[generalInfo.applicantType || 'PIBO'] || SUB_APPLICANT_OPTIONS_MAP.PIBO).map((type) => (
                <label key={type} className="flex items-center gap-1.5 text-xs font-medium text-slate-700 cursor-pointer">
                  <input
                    type="radio"
                    name="subApplicantType"
                    value={type}
                    checked={(generalInfo.subApplicantType || 'Importer') === type}
                    onChange={() =>
                      setGeneralInfo((prev) => ({ ...prev, subApplicantType: type }))
                    }
                    className="accent-green-600"
                  />
                  {type}
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {loadingMsg && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl px-6 py-5 flex flex-col items-center gap-3 animate-in fade-in zoom-in-95 duration-200 min-w-[280px]">
            <Loader2 size={32} className="text-blue-600 animate-spin" />
            <p className="text-sm font-medium text-slate-800 text-center">{loadingMsg}</p>
          </div>
        </div>
      )}

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

      <div className="mb-6 pb-6 border-b border-slate-100 space-y-4">
        <RegistrationDocUpload
          onExtracted={handleDocExtracted}
          showToast={showToast}
          generalInfo={generalInfo}
          autoData={autoData}
          applicantType={generalInfo.applicantType}
          subApplicantType={generalInfo.subApplicantType}
        />

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
      <form onSubmit={handleFormSubmit} noValidate className={`space-y-8 ${isPreviewMode ? 'pointer-events-none opacity-90' : ''}`}>
        <div className="bg-transparent mb-6">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
            <div className="bg-white border border-slate-200/60 rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.02)] p-4 flex flex-col justify-center">
              <label className="block text-xs font-bold text-slate-700 mb-1.5">Type of Company *</label>
              <div className="relative flex items-center">
                <Building2 size={16} className="absolute left-3 text-slate-400" />
                <select name="typeOfCompany" value={generalInfo.typeOfCompany} onChange={handleGeneralChange} className={`${modernLockedSelectClass} !pl-9`} required>
                  <option value="">Select</option>
                  {TYPE_OF_COMPANY_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            </div>

            <div className="bg-white border border-slate-200/60 rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.02)] p-4 flex flex-col justify-center">
              <label className="block text-xs font-bold text-slate-700 mb-1.5">Year of Commencement of Operations *</label>
              <div className="relative flex items-center">
                <Calendar size={16} className="absolute left-3 text-slate-400" />
                <select
                  name="yearOfCommencement"
                  value={generalInfo.yearOfCommencement || ''}
                  onChange={async (e) => {
                    handleGeneralChange(e);
                    if (window.pwp?.registration?.save) {
                      const newStateObj = { ...generalInfo, yearOfCommencement: e.target.value };
                      const updatedFormData = { ...(savedRegistration?.formData || {}), email, mobile, autoData, generalInfo: newStateObj };
                      window.pwp.registration.save({ ...(savedRegistration || {}), email, mobile, form_data_json: JSON.stringify(updatedFormData) }).catch(console.error);
                    }
                  }}
                  className={`${modernLockedSelectClass} !pl-9`}
                  required
                >
                  <option value="">Enter year</option>
                  {Array.from({ length: new Date().getFullYear() - 1890 + 1 }, (_, i) => new Date().getFullYear() - i).map((year) => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>
            </div>

            {generalInfo.yearOfCommencement && requiresHistoricalEprData(generalInfo.yearOfCommencement) && (
              <div className="lg:col-span-2 relative overflow-hidden rounded-xl border border-amber-200/80 bg-gradient-to-r from-amber-50 to-orange-50/60 shadow-sm flex items-center p-5 animate-in fade-in slide-in-from-top-2">
                <div className="absolute right-0 bottom-0 opacity-20 transform translate-x-4 translate-y-4">
                  <svg width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="text-amber-500">
                    <line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line>
                  </svg>
                </div>
                <div className="flex gap-4 relative z-10">
                  <div className="w-10 h-10 rounded-full border border-amber-300 flex items-center justify-center bg-white flex-shrink-0 shadow-sm text-amber-600">
                    <AlertCircle size={20} />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-amber-900 tracking-tight">Historical EPR Data Required</h4>
                    <p className="text-xs text-amber-800 mt-0.5 max-w-sm">
                      Since your operations commenced before the current financial year, you must provide Procurement and Sales data.
                    </p>
                  </div>
                </div>
      </div>
      )}
          </div>

          {generalInfo.yearOfCommencement && requiresHistoricalEprData(generalInfo.yearOfCommencement) && (
            <div className="mt-5 space-y-4 animate-in fade-in slide-in-from-top-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Procurement Section */}
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <div className="bg-emerald-50 p-2 rounded-lg text-emerald-600"><FileSpreadsheet size={18} /></div>
                      <h5 className="font-bold text-slate-800 tracking-tight">Procurement Data</h5>
        </div>
                    <button type="button" onClick={() => downloadExcelTemplate('procurement')} className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1.5 transition-colors">
                      <Download size={14} /> Template
                    </button>
                  </div>
                  <p className="text-xs text-slate-500 font-medium">Upload monthly/annual procurement details in Excel format</p>
                  <div className="flex items-center gap-3 mt-1">
                    <div className="relative flex-1">
                      <input type="file" accept=".xlsx,.xls" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={(e) => handleExcelUpload(e, 'procurement')} disabled={isUploadingExcel} />
                      <button type="button" disabled={isUploadingExcel} className="w-full inline-flex justify-center items-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-slate-700 rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50 shadow-sm">
                        {isUploadingExcel ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                        Upload Excel
                      </button>
                    </div>
                    <button type="button" onClick={() => navigate('/doc-table?tab=procurement')} className="inline-flex justify-center items-center gap-2 px-4 py-2.5 text-sm font-bold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-sm">
                      <Eye size={16} /> View
                    </button>
                  </div>
                </div>

                {/* Sales Section */}
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <div className="bg-emerald-50 p-2 rounded-lg text-emerald-600"><FileSpreadsheet size={18} /></div>
                      <h5 className="font-bold text-slate-800 tracking-tight">Sales Data</h5>
                    </div>
                    <button type="button" onClick={() => downloadExcelTemplate('sale')} className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1.5 transition-colors">
                      <Download size={14} /> Template
                    </button>
                  </div>
                  <p className="text-xs text-slate-500 font-medium">Upload monthly/annual sales details in Excel format</p>
                  <div className="flex items-center gap-3 mt-1">
                    <div className="relative flex-1">
                      <input type="file" accept=".xlsx,.xls" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={(e) => handleExcelUpload(e, 'sale')} disabled={isUploadingExcel} />
                      <button type="button" disabled={isUploadingExcel} className="w-full inline-flex justify-center items-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-slate-700 rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50 shadow-sm">
                        {isUploadingExcel ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                        Upload Excel
                      </button>
                    </div>
                    <button type="button" onClick={() => navigate('/doc-table?tab=sale')} className="inline-flex justify-center items-center gap-2 px-4 py-2.5 text-sm font-bold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-sm">
                      <Eye size={16} /> View
                    </button>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-white border border-amber-200/60 rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.02)] flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3 pl-2">
                  <div className="text-amber-500"><FilePlus size={18} /></div>
                  <span className="text-[11px] font-bold text-amber-700 uppercase tracking-widest">Don't have the Excel filled out?</span>
                  <span className="text-sm text-slate-500 font-medium hidden md:inline">You can also prepare data using our PDF invoice template.</span>
                </div>
                <button type="button" onClick={() => navigate('/doc-upload')} className="inline-flex items-center gap-2 text-sm font-bold text-blue-700 hover:text-blue-900 transition-colors mr-2">
                  Prepare data using PDF Invoices <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-200/60 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.02)] p-6 mb-6">
          <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="bg-emerald-100 text-emerald-700 p-2 rounded-xl">
                <Building2 size={20} strokeWidth={2.5} />
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <h3 className="text-lg font-bold text-slate-800">General Information</h3>
                <span className="bg-emerald-50 border border-emerald-100 text-emerald-700 text-[11px] font-semibold px-2.5 py-1 rounded-full">
                  Step 2 — CPCB portal fields
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsGeneralInfoExpanded(!isGeneralInfoExpanded)}
              className="text-[11px] font-bold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-full shadow-sm transition-colors flex items-center gap-1"
            >
              {isGeneralInfoExpanded ? <><span className="hidden md:inline">Collapse</span> <ChevronUp size={14} className="opacity-70" /></> : <><span className="hidden md:inline">View Details</span> <ChevronDown size={14} className="opacity-70" /></>}
            </button>
          </div>

          {isGeneralInfoExpanded && (
            <div className="animate-in fade-in slide-in-from-top-2">
              <p className="text-xs text-slate-500 mb-6 font-medium">
                Company Details — Blank fields from CPCB portal. Fill manually if documents are not uploaded.
              </p>

              <div className="flex items-center gap-3 mb-4">
                <h4 className="text-sm font-bold text-slate-800">Extracted Details (Verify/Edit)</h4>
                <div className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2 py-1 rounded border border-emerald-100">
                  <Sparkles size={12} /> Auto-filled from documents
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">GSTIN *</label>
                  <div className="relative flex items-center">
                    <Lock size={16} className="absolute left-3.5 text-slate-400" />
                    <input name="gstin" value={autoData.gstin || ''} onChange={(e) => setAutoData(prev => ({ ...prev, gstin: e.target.value }))} className={`${modernLockedInputClass} pr-8`} required placeholder="Enter GSTIN" />
                    {autoData.gstDocumentPath && (
                      <div className="absolute right-2 flex items-center">
                        <LocalFilePreview filePath={autoData.gstDocumentPath} fileName="GST Document" originalFileName={autoData.gstOriginalName} hideText onChangeDocument={() => handleChangeDocument('gst')} />
                      </div>
                    )}
                  </div>
              </div>
              <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Company PAN *</label>
                  <div className="relative flex items-center">
                    <IdCard size={16} className="absolute left-3.5 text-slate-400" />
                    <input name="companyPan" value={autoData.companyPan || ''} onChange={(e) => setAutoData(prev => ({ ...prev, companyPan: e.target.value }))} className={`${modernLockedInputClass} pr-8`} required placeholder="Enter Company PAN" />
                    {autoData.companyPanDocumentPath && (
                      <div className="absolute right-2 flex items-center">
                        <LocalFilePreview filePath={autoData.companyPanDocumentPath} fileName="Company PAN" originalFileName={autoData.companyPanOriginalName} hideText onChangeDocument={() => handleChangeDocument('company_pan')} />
                      </div>
                    )}
                  </div>
              </div>
              <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Company Name</label>
                  <div className="relative flex items-center">
                    <Building2 size={16} className="absolute left-3.5 text-slate-400" />
                    <input name="companyName" value={autoData.companyName || ''} onChange={(e) => setAutoData(prev => ({ ...prev, companyName: e.target.value }))} className={modernLockedInputClass} placeholder="Enter Company Name" />
                  </div>
              </div>
              <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Auth Person Name *</label>
                  <div className="relative flex items-center">
                    <User size={16} className="absolute left-3.5 text-slate-400" />
                    <input name="authName" value={autoData.authName || ''} onChange={(e) => setAutoData(prev => ({ ...prev, authName: e.target.value }))} className={`${modernLockedInputClass} pr-8`} required placeholder="Enter Authorized Person Name" />
                    {autoData.personPanDocumentPath && (
                      <div className="absolute right-2 flex items-center">
                        <LocalFilePreview filePath={autoData.personPanDocumentPath} fileName="Person PAN" originalFileName={autoData.personPanOriginalName} hideText onChangeDocument={() => handleChangeDocument('person_pan')} />
                      </div>
                    )}
                  </div>
              </div>
              <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Auth Person PAN *</label>
                  <div className="relative flex items-center">
                    <IdCard size={16} className="absolute left-3.5 text-slate-400" />
                    <input name="authPan" value={autoData.authPan || ''} onChange={(e) => setAutoData(prev => ({ ...prev, authPan: e.target.value }))} className={`${modernLockedInputClass} pr-8`} required placeholder="Enter Auth Person PAN" />
                    {autoData.personPanDocumentPath && (
                      <div className="absolute right-2 flex items-center">
                        <LocalFilePreview filePath={autoData.personPanDocumentPath} fileName="Person PAN" originalFileName={autoData.personPanOriginalName} hideText onChangeDocument={() => handleChangeDocument('person_pan')} />
                      </div>
                    )}
                  </div>
              </div>
              <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Auth Person DOB *</label>
                  <div className="relative flex items-center">
                    <Lock size={16} className="absolute left-3.5 text-slate-400" />
                    <input type="date" name="authDob" value={autoData.authDob || ''} onChange={(e) => setAutoData(prev => ({ ...prev, authDob: e.target.value }))} className={`${modernLockedInputClass} pr-8`} required />
                    <Calendar size={16} className="absolute right-3 text-slate-400 pointer-events-none" />
                    {autoData.personPanDocumentPath && (
                      <div className="absolute right-8 flex items-center">
                        <LocalFilePreview filePath={autoData.personPanDocumentPath} fileName="Person PAN" originalFileName={autoData.personPanOriginalName} hideText onChangeDocument={() => handleChangeDocument('person_pan')} />
                      </div>
                    )}
                  </div>
              </div>
              <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">CIN (If Applicable)</label>
                  <div className="relative flex items-center">
                    <Lock size={16} className="absolute left-3.5 text-slate-400" />
                    <input name="cin" value={autoData.cin || ''} onChange={(e) => setAutoData(prev => ({ ...prev, cin: e.target.value }))} className={`${modernLockedInputClass} uppercase pr-8`} placeholder="Enter CIN Number" />
                    {autoData.cinDocumentPath && (
                      <div className="absolute right-2 flex items-center">
                        <LocalFilePreview filePath={autoData.cinDocumentPath} fileName="CIN Document" originalFileName={autoData.cinOriginalName} hideText onChangeDocument={() => handleChangeDocument('cin')} />
              </div>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">IEC (If Applicable)</label>
                  <div className="relative flex items-center">
                    <IdCard size={16} className="absolute left-3.5 text-slate-400" />
                    <input name="iec" value={autoData.iec || ''} onChange={(e) => setAutoData(prev => ({ ...prev, iec: e.target.value }))} className={`${modernLockedInputClass} uppercase pr-8`} placeholder="Enter IEC Number" />
                    {autoData.iecDocumentPath && (
                      <div className="absolute right-2 flex items-center">
                        <LocalFilePreview filePath={autoData.iecDocumentPath} fileName="IEC" originalFileName={autoData.iecOriginalName} hideText onChangeDocument={() => handleChangeDocument('iec')} />
                </div>
              )}
            </div>
          </div>
            <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Details of Products</label>
                  <div className="relative flex items-center">
                    <FileText size={16} className="absolute left-3.5 text-slate-400" />
                    <input value={autoData.detailsOfProductsPath ? getFileName(autoData.detailsOfProductsPath) : ''} placeholder="Please upload Details of Products" disabled className={`${modernLockedInputClass} text-slate-500 pr-24 truncate`} />
                    {autoData.detailsOfProductsPath ? (
                      <div className="absolute right-2 flex items-center">
                        <LocalFilePreview filePath={autoData.detailsOfProductsPath} fileName="Details of Products" originalFileName={autoData.detailsOfProductsOriginalName} hideText onChangeDocument={() => triggerSimpleUpload('detailsOfProductsPath', 'autoData')} />
                      </div>
                    ) : (
                      <button type="button" onClick={() => triggerSimpleUpload('detailsOfProductsPath', 'autoData')} className="absolute right-2 px-2.5 py-1 flex items-center gap-1.5 rounded-md text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 transition-colors shadow-sm">
                        <Upload size={14} /> Upload
                      </button>
                    )}
                  </div>
            </div>
            <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Plastic Packaging Picture</label>
                  <div className="relative flex items-center">
                    <ImageIcon size={16} className="absolute left-3.5 text-slate-400" />
                    <input value={autoData.representativePicturePath ? getFileName(autoData.representativePicturePath) : ''} placeholder="Please upload Plastic Packaging Picture" disabled className={`${modernLockedInputClass} text-slate-500 pr-24 truncate`} />
                    {autoData.representativePicturePath ? (
                      <div className="absolute right-2 flex items-center">
                        <LocalFilePreview filePath={autoData.representativePicturePath} fileName="Plastic Packaging Picture" originalFileName={autoData.representativePictureOriginalName} hideText onChangeDocument={() => triggerSimpleUpload('representativePicturePath', 'autoData')} />
                      </div>
                    ) : (
                      <button type="button" onClick={() => triggerSimpleUpload('representativePicturePath', 'autoData')} className="absolute right-2 px-2.5 py-1 flex items-center gap-1.5 rounded-md text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 transition-colors shadow-sm">
                        <Upload size={14} /> Upload
                      </button>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Covering letter</label>
                  <div className="relative flex items-center">
                    <FileText size={16} className="absolute left-3.5 text-slate-400" />
                    <input value={generalInfo.partCCoveringLetter ? getFileName(generalInfo.partCCoveringLetter) : ''} placeholder="Please upload Covering Letter" disabled className={`${modernLockedInputClass} text-slate-500 pr-24 truncate`} />
                    {generalInfo.partCCoveringLetter ? (
                      <div className="absolute right-2 flex items-center">
                        <LocalFilePreview filePath={generalInfo.partCCoveringLetter} fileName="Covering Letter" hideText onChangeDocument={() => triggerSimpleUpload('partCCoveringLetter', 'generalInfo')} />
                      </div>
                    ) : (
                      <button type="button" onClick={() => handlePrepareLetter('coveringLetter')} className="absolute right-2 px-2.5 py-1 flex items-center gap-1.5 rounded-md text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 transition-colors shadow-sm">
                        <Sparkles size={14} /> Prepare
                      </button>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Self Declaration</label>
                  <div className="relative flex items-center">
                    <FileText size={16} className="absolute left-3.5 text-slate-400" />
                    <input value={generalInfo.partCAuditedStatement ? getFileName(generalInfo.partCAuditedStatement) : ''} placeholder="Please upload Self Declaration" disabled className={`${modernLockedInputClass} text-slate-500 pr-24 truncate`} />
                    {generalInfo.partCAuditedStatement ? (
                      <div className="absolute right-2 flex items-center">
                        <LocalFilePreview filePath={generalInfo.partCAuditedStatement} fileName="Self Declaration" hideText onChangeDocument={() => triggerSimpleUpload('partCAuditedStatement', 'generalInfo')} />
                      </div>
                    ) : (
                      <button type="button" onClick={() => handlePrepareLetter('selfDeclaration')} className="absolute right-2 px-2.5 py-1 flex items-center gap-1.5 rounded-md text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 transition-colors shadow-sm">
                        <Sparkles size={14} /> Prepare
                      </button>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Signature</label>
                  <div className="relative flex items-center">
                    <PenTool size={16} className="absolute left-3.5 text-slate-400" />
                    <input value={generalInfo.partCSignature ? getFileName(generalInfo.partCSignature) : ''} placeholder="Please upload Signature" disabled className={`${modernLockedInputClass} text-slate-500 pr-24 truncate`} />
                    {generalInfo.partCSignature ? (
                      <div className="absolute right-2 flex items-center">
                        <LocalFilePreview filePath={generalInfo.partCSignature} fileName="Signature" hideText onChangeDocument={() => triggerSimpleUpload('partCSignature', 'generalInfo')} />
                      </div>
                    ) : (
                      <button type="button" onClick={() => triggerSimpleUpload('partCSignature', 'generalInfo')} className="absolute right-2 px-2.5 py-1 flex items-center gap-1.5 rounded-md text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 transition-colors shadow-sm">
                        <Upload size={14} /> Upload
                      </button>
                    )}
                  </div>
                </div>
                {generalInfo.typeOfCompany === 'Large' && (
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Declaration of Large Entity</label>
                    <div className="relative flex items-center">
                      <FileText size={16} className="absolute left-3.5 text-slate-400" />
                      <input value={autoData.typeOfCompanyDoc ? getFileName(autoData.typeOfCompanyDoc) : ''} placeholder="Please upload Declaration" disabled className={`${modernLockedInputClass} text-slate-500 pr-24 truncate`} />
                      {autoData.typeOfCompanyDoc ? (
                        <div className="absolute right-2 flex items-center">
                          <LocalFilePreview filePath={autoData.typeOfCompanyDoc} fileName="Declaration of Large Entity" hideText onChangeDocument={() => triggerSimpleUpload('typeOfCompanyDoc', 'autoData')} />
                        </div>
                      ) : (
                        <button type="button" onClick={() => handlePrepareLetter('largeEntity')} className="absolute right-2 px-2.5 py-1 flex items-center gap-1.5 rounded-md text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 transition-colors shadow-sm">
                          <Sparkles size={14} /> Prepare
                        </button>
                      )}
                    </div>
                  </div>
                )}
                {['Micro', 'Small', 'Medium'].includes(generalInfo.typeOfCompany) && (
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">MSME Certificate</label>
                    <div className="relative flex items-center">
                      <ImageIcon size={16} className="absolute left-3.5 text-slate-400" />
                      <input value={autoData.typeOfCompanyDoc ? getFileName(autoData.typeOfCompanyDoc) : ''} placeholder="Please upload MSME Certificate" disabled className={`${modernLockedInputClass} text-slate-500 pr-24 truncate`} />
                      {autoData.typeOfCompanyDoc ? (
                        <div className="absolute right-2 flex items-center">
                          <LocalFilePreview filePath={autoData.typeOfCompanyDoc} fileName="MSME Certificate" hideText onChangeDocument={() => triggerSimpleUpload('typeOfCompanyDoc', 'autoData')} />
                        </div>
                      ) : (
                        <button type="button" onClick={() => triggerSimpleUpload('typeOfCompanyDoc', 'autoData')} className="absolute right-2 px-2.5 py-1 flex items-center gap-1.5 rounded-md text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 transition-colors shadow-sm">
                          <Upload size={14} /> Upload
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-200/60 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.02)] p-6 mb-6">
          <div className="flex items-center justify-between mb-5 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="bg-indigo-100 text-indigo-700 p-2 rounded-xl">
                <Briefcase size={20} strokeWidth={2.5} />
              </div>
              <h3 className="text-lg font-bold text-slate-800">Business Details</h3>
            </div>
            <button
              type="button"
              onClick={() => setIsBusinessDetailsExpanded(!isBusinessDetailsExpanded)}
              className="text-[11px] font-bold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-full shadow-sm transition-colors flex items-center gap-1"
            >
              {isBusinessDetailsExpanded ? <><span className="hidden md:inline">Collapse</span> <ChevronUp size={14} className="opacity-70" /></> : <><span className="hidden md:inline">View Details</span> <ChevronDown size={14} className="opacity-70" /></>}
            </button>
          </div>

          {isBusinessDetailsExpanded && (
            <div className="animate-in fade-in slide-in-from-top-2 grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Type of Business *</label>
                <div className="relative flex items-center">
                  <select name="typeOfBusiness" value={generalInfo.typeOfBusiness} onChange={handleGeneralChange} className={modernLockedSelectClass} required>
                <option value="">Select</option>
                    {TYPE_OF_BUSINESS_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Designation *</label>
                <div className="relative flex items-center">
                  <User size={16} className="absolute left-3.5 text-slate-400" />
                  <input name="authDesignation" value={generalInfo.authDesignation} onChange={handleGeneralChange} type="text" placeholder="e.g. Director, Manager" className={modernLockedInputClass} required />
                </div>
            </div>
            
            <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Registered Address Line 1 *</label>
                <div className="relative flex items-center">
                  <MapPin size={16} className="absolute left-3.5 text-slate-400" />
                  <input name="registeredAddressLine1" value={generalInfo.registeredAddressLine1} onChange={handleGeneralChange} type="text" placeholder="Enter registered address" className={`${modernLockedInputClass} pr-8`} required />
                  {autoData.gstDocumentPath && (
                    <div className="absolute right-2 flex items-center">
                      <LocalFilePreview filePath={autoData.gstDocumentPath} fileName="GST Document" originalFileName={autoData.gstOriginalName} hideText onChangeDocument={() => handleChangeDocument('gst')} />
                    </div>
                  )}
                </div>
            </div>
            <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Registered Address Line 2</label>
                <div className="relative flex items-center">
                  <MapPin size={16} className="absolute left-3.5 text-slate-400" />
                  <input name="registeredAddressLine2" value={generalInfo.registeredAddressLine2} onChange={handleGeneralChange} type="text" placeholder="Enter (optional)" className={modernLockedInputClass} />
            </div>
              </div>

              <div className="md:col-span-2 mt-1">
                <label className="flex items-center gap-2.5 cursor-pointer p-3 bg-slate-50/50 border border-slate-200/60 rounded-xl hover:bg-slate-50 transition-colors">
                  <input type="checkbox" checked={generalInfo.isSameAsRegisteredAddress} onChange={(e) => setGeneralInfo(prev => ({ ...prev, isSameAsRegisteredAddress: e.target.checked }))} className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500" />
                  <span className="text-sm font-semibold text-slate-700">Plant/Unit Address is same as Registered Address</span>
              </label>
            </div>
            
            {!generalInfo.isSameAsRegisteredAddress && (
              <>
                <div className="md:col-span-2">
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Plant/Unit Address *</label>
                    <div className="relative flex items-center">
                      <MapPin size={16} className="absolute left-3.5 text-slate-400" />
                      <input name="plantAddress" value={generalInfo.plantAddress} onChange={handleGeneralChange} type="text" placeholder="Enter Plant/Unit Address" className={`${modernInputClass} pr-8`} required />
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Unit GST Number *</label>
                    <div className="relative flex items-center">
                      <Lock size={16} className="absolute left-3.5 text-slate-400" />
                      <input name="unitGst" value={generalInfo.unitGst} onChange={handleGeneralChange} type="text" placeholder="Enter Unit GST" className={`${modernInputClass} uppercase pr-8`} required />
                      {autoData.unitGstDoc && (
                        <div className="absolute right-2 flex items-center">
                          <LocalFilePreview filePath={autoData.unitGstDoc} fileName="Unit GST Document" originalFileName={autoData.unitGstOriginalName} hideText onChangeDocument={() => handleChangeDocument('unit_gst')} />
                </div>
                      )}
                    </div>
                  </div>
                {!autoData.unitGstDoc && (
                  <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">Upload Unit GST Certificate *</label>
                      <input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={async (e) => { const file = e.target.files[0]; if (file) await persistPartCFile(file, 'unitGstDoc'); }} className="w-full px-4 py-2 border border-slate-200 rounded-xl" required />
                  </div>
                )}
              </>
            )}

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">State/UT *</label>
                <div className="relative flex items-center">
                  <select name="stateUt" value={generalInfo.stateUt} onChange={handleGeneralChange} className={modernLockedSelectClass} required>
                <option value="">Select</option>
                    {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
                </div>
            </div>
            <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">District *</label>
                <div className="relative flex items-center">
                  <MapPin size={16} className="absolute left-3.5 text-slate-400" />
                  <input name="district" value={generalInfo.district || ''} onChange={handleGeneralChange} type="text" placeholder="Enter district" className={modernLockedInputClass} required />
            </div>
              </div>


              <div className="md:col-span-2 mt-4 pt-4 border-t border-slate-100">
                <p className="text-xs text-slate-500 font-medium mb-4">Authorised Person Details & Set Password</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Password *</label>
                    <div className="relative flex items-center">
                      <Lock size={16} className="absolute left-3.5 text-slate-400" />
                      <input name="password" value={generalInfo.password} onChange={handleGeneralChange} type={showPassword ? 'text' : 'password'} placeholder="Enter Password (min 8 chars)" className={`${modernLockedInputClass} pr-10`} required minLength={8} autoComplete="new-password" />
                      <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-3 text-slate-400 hover:text-slate-600">
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Confirm Password *</label>
                    <div className="relative flex items-center">
                      <Lock size={16} className="absolute left-3.5 text-slate-400" />
                      <input name="confirmPassword" value={generalInfo.confirmPassword} onChange={handleGeneralChange} type={showConfirmPassword ? 'text' : 'password'} placeholder="Confirm Password" className={`${modernLockedInputClass} pr-10`} required minLength={8} autoComplete="new-password" />
                      <button type="button" onClick={() => setShowConfirmPassword((v) => !v)} className="absolute right-3 text-slate-400 hover:text-slate-600">
                        {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
            </div>
            </div>
          </div>
        </div>
        )}
        </div>

        <div className="bg-white border border-slate-200/60 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.02)] p-6 mb-6">
          <div className="flex items-center justify-between mb-5 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="bg-blue-100 text-blue-700 p-2 rounded-xl">
                <User size={20} strokeWidth={2.5} />
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <h3 className="text-lg font-bold text-slate-800">Contact Details</h3>
                <span className="bg-blue-50 border border-blue-100 text-blue-700 text-[11px] font-semibold px-2.5 py-1 rounded-full">
                  Step 1 — User Verification
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsDirectorsDetailsExpanded(!isDirectorsDetailsExpanded)}
              className="text-[11px] font-bold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-full shadow-sm transition-colors flex items-center gap-1"
            >
              {isDirectorsDetailsExpanded ? <><span className="hidden md:inline">Collapse</span> <ChevronUp size={14} className="opacity-70" /></> : <><span className="hidden md:inline">View Details</span> <ChevronDown size={14} className="opacity-70" /></>}
            </button>
          </div>
          {isDirectorsDetailsExpanded && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 animate-in fade-in slide-in-from-top-2">
            <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Email Address *</label>
                <div className="relative flex items-center">
                  <Mail size={16} className="absolute left-3.5 text-slate-400" />
                  <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Enter Email Address" className={modernLockedInputClass} required />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Mobile Number *</label>
                <div className="relative flex items-center">
                  <Phone size={16} className="absolute left-3.5 text-slate-400" />
                  <input value={mobile} onChange={(e) => setMobile(e.target.value)} type="tel" placeholder="Enter Mobile Number" className={modernLockedInputClass} required />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div>
            <div className="flex justify-between items-center border-b pb-2 mb-4">
              <h3 className="text-lg font-bold text-slate-800">Part A: General Information</h3>
              <button
                type="button"
                onClick={() => setIsOperationsDetailsExpanded(!isOperationsDetailsExpanded)}
                className="text-[11px] font-bold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-full shadow-sm transition-colors flex items-center gap-1"
              >
                {isOperationsDetailsExpanded ? <><span className="hidden md:inline">Collapse</span> <ChevronUp size={14} className="opacity-70" /></> : <><span className="hidden md:inline">View Details</span> <ChevronDown size={14} className="opacity-70" /></>}
              </button>
            </div>
            {isOperationsDetailsExpanded && (
              <div className="bg-white border rounded-xl shadow-sm p-6 space-y-6 animate-in fade-in slide-in-from-top-2">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

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

                      <div>
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
            )}
          </div>
        </div>




        {!registrationComplete && (
          <div
            className={`rounded-xl border px-4 py-3 ${startRegistrationBlockers.length === 0
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
              <div className="min-w-0 w-full">
                <p className={`text-sm font-semibold ${startRegistrationBlockers.length === 0 ? 'text-green-800' : 'text-amber-900'}`}>
                  {startRegistrationBlockers.length === 0
                    ? 'Ready — you can start CPCB registration'
                    : `Complete ${startRegistrationBlockers.length} item${startRegistrationBlockers.length === 1 ? '' : 's'} to enable Start Registration`}
                </p>
                {registrationChecklist.length > 0 && (
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-2">
                    {registrationChecklist.map((item) => (
                      <div key={item.id} className="text-xs text-amber-900 flex items-start gap-2">
                        {item.fulfilled ? (
                          <svg className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                          </svg>
                        ) : (
                          <span className="text-amber-500 mt-0.5 leading-none shrink-0" style={{ fontSize: '14px' }}>•</span>
                        )}
                        <span className="leading-tight">{item.label}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {registrationComplete && isSimpRawMaterial(generalInfo.applicantType, generalInfo.subApplicantType) && wizardStep === 'partA' && (
          <div className="space-y-6">
            <RegistrationPartALoginCredentials
              ceprId={savedCeprId}
              password={generalInfo.password || ''}
              onPasswordChange={(value) =>
                setGeneralInfo((prev) => ({ ...prev, password: value, confirmPassword: value }))
              }
              showPassword={showPassword}
              onToggleShowPassword={() => setShowPassword((v) => !v)}
              onBlur={() => persistRegistrationForm().catch(console.error)}
              inputClass={inputClass}
            />
            <RegistrationPartASimpRawMaterial
            generalInfo={generalInfo}
            autoData={autoData}
            email={email}
            mobile={mobile}
            onChange={handleGeneralChange}
            onFileSelect={(field, file) => handlePartAPdfUpload(field, file)}
            inputClass={inputClass}
            selectClass={inputClass}
            uploadingField={uploadingPdfField}
          />
          </div>
        )}

        {registrationComplete && isSimpRawMaterial(generalInfo.applicantType, generalInfo.subApplicantType) && wizardStep === 'partB' && (
            <RegistrationPartBSimpRawMaterial
              generalInfo={generalInfo}
              setGeneralInfo={setGeneralInfo}
              gstin={autoData.gstin}
              fallbackContact={mobile}
              onPersist={(next) => {
              if (next && window.pwp?.registration?.save) {
                window.pwp.registration.save(
                  buildRegistrationSavePayload({
                    savedRegistration,
                    email,
                    mobile,
                    autoData,
                    generalInfo: next,
                    ceprId: savedCeprId || savedRegistration?.cepr_id,
                  })
                ).catch(console.error);
              } else {
                persistRegistrationForm();
              }
            }}
          />
        )}

        {registrationComplete && isSimpRawMaterial(generalInfo.applicantType, generalInfo.subApplicantType) && wizardStep === 'partC' && (
          <RegistrationPartCSimpRawMaterial
            generalInfo={generalInfo}
            setGeneralInfo={setGeneralInfo}
            autoData={autoData}
            setAutoData={setAutoData}
            email={email}
            mobile={mobile}
            showToast={showToast}
            inputClass={inputClass}
          />
        )}

        <RegistrationPreviewModal
          show={isPreviewMode}
          onClose={() => setIsPreviewMode(false)}
          onConfirm={registrationComplete ? handleNewApplication : handleStartRegistration}
          isRegistrationComplete={registrationComplete}
          autoData={autoData}
          generalInfo={generalInfo}
        >
          <RegistrationPreviewSummary
            generalInfo={generalInfo}
            autoData={autoData}
            email={email}
            mobile={mobile}
          />

          {isSimpRawMaterial(generalInfo.applicantType, generalInfo.subApplicantType) ? (
            <div className="pointer-events-auto space-y-6 mt-6">
              <RegistrationPartASimpRawMaterial
                generalInfo={generalInfo}
                autoData={autoData}
                email={email}
                mobile={mobile}
                inputClass={inputClass}
                selectClass={inputClass}
                uploadingField=""
                isPreview
              />
              <RegistrationPartBSimpRawMaterial
                generalInfo={generalInfo}
                setGeneralInfo={setGeneralInfo}
                gstin={autoData.gstin}
                fallbackContact={mobile}
                isPreview
              />
              <RegistrationPartCSimpRawMaterial
                generalInfo={generalInfo}
                setGeneralInfo={setGeneralInfo}
                autoData={autoData}
                setAutoData={setAutoData}
                email={email}
                mobile={mobile}
                showToast={showToast}
                inputClass={inputClass}
              />
              </div>
          ) : (
            <>
          <div className="pointer-events-auto">
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
            </div>

          <div className="pointer-events-auto">
            <RegistrationPartB generalInfo={generalInfo} setGeneralInfo={setGeneralInfo} gstin={autoData.gstin} isPreview={true} />
        </div>
        </>
        )}
        </RegistrationPreviewModal>

        {!isPreviewMode && (
          <div className="pt-4 border-t border-slate-100 flex justify-between gap-3 pointer-events-auto mt-6">
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

            <div className="flex items-center gap-2 flex-wrap justify-end">
              <button
                type="button"
                onClick={handlePreviewRegistration}
                className="inline-flex items-center gap-2 px-6 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm disabled:opacity-50"
              >
                <Eye size={16} />
                {registrationComplete ? 'Preview Application' : 'Preview Registration'}
              </button>

          {!registrationComplete ? (
            <button
              type="button"
              onClick={handleStartRegistration}
              disabled={
                startRegistrationBlockers.length > 0
                || (showAutomationModal && automationPhase !== 'error')
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
                <>
              {SHOW_RESUME_DRAFT_DEV_BUTTON ? (
                <button
                  type="button"
                  onClick={handleResumeDraftPartB}
                  disabled={
                    loading
                    || loginCaptchaSubmitting
                    || loginOtpSubmitting
                    || (showAutomationModal && automationPhase !== 'error')
                  }
                  className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 shadow-sm disabled:opacity-50"
                >
                  Resume Draft → Part B (Dev)
                </button>
              ) : null}
              <button
                type="button"
                onClick={handleNewApplication}
                disabled={
                  loading
                  || loginCaptchaSubmitting
                  || loginOtpSubmitting
                  || (showAutomationModal && automationPhase !== 'error')
                }
                className="inline-flex items-center gap-2 px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-sm disabled:opacity-50"
              >
                {(loading || loginCaptchaSubmitting || loginOtpSubmitting) ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <FilePlus size={16} />
                )}
                Register
              </button>
                </>
          )}
        </div>
          </div>
        )}
      </form>



      {loading && !showAutomationModal && !showLoginCaptchaModal && !showLoginOtpModal && !showPaymentBypassModal && !showPaymentReviewModal && (
        <div className="fixed inset-0 z-[90] bg-white/85 flex flex-col items-center justify-center">
          <Loader2 size={40} className="animate-spin text-green-600 mb-4" />
          <p className="text-slate-800 font-semibold">Please wait</p>
          <p className="text-sm text-slate-500 mt-1">{loadingMsg || 'Your request is being processed'}</p>
        </div>
      )}

      <RegistrationAutomationModal
        open={showAutomationModal}
        title={automationFlow === 'login' ? 'CPCB New Application' : 'CPCB Registration'}
        subtitle="Live progress from the automation browser"
        completeMessage={
          automationFlow === 'login'
            ? 'Application submitted successfully. Closing…'
            : 'CPCB account created successfully. Closing…'
        }
        captchaStepHint={
          automationFlow === 'login'
            ? 'Enter captcha to request login OTP'
            : 'Enter the captcha to finish registration'
        }
        submitCaptchaLabel={automationFlow === 'login' ? 'Get OTP' : 'Submit Captcha'}
        phase={automationPhase}
        currentStep={currentAutomationStep}
        logs={automationLogs}
        loading={loading || captchaSubmitting || loginCaptchaSubmitting || loginOtpSubmitting}
        loadingMsg={loadingMsg}
        onClose={closeAutomationModal}
        email={email}
        emailOtp={emailOtp}
        onEmailOtpChange={(value) => {
          setEmailOtp(value);
          if (otpInputError) setOtpInputError('');
        }}
        onVerifyEmailOtp={handleVerifyEmailOtp}
        onResendEmailOtp={handleResendEmailOtp}
        otpTimer={automationPhase === 'login_otp' ? loginOtpTimer : otpTimer}
        isResendActive={automationPhase === 'login_otp' ? loginOtpResendActive : isResendActive}
        formatTimer={formatTimer}
        otpSubmitting={automationPhase === 'login_otp' ? loginOtpSubmitting : otpSubmitting}
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
        captchaImage={automationFlow === 'login' ? loginCaptchaImage : captchaImage}
        captchaText={automationFlow === 'login' ? loginCaptchaText : captchaText}
        onCaptchaTextChange={(value) => {
          if (automationFlow === 'login') {
            setLoginCaptchaText(String(value || '').slice(0, 6));
          } else {
            setCaptchaText(String(value || '').slice(0, 6));
            if (captchaError) setCaptchaError('');
          }
        }}
        onSubmitCaptcha={automationFlow === 'login' ? handleSubmitLoginCaptcha : handleSubmitCaptcha}
        onRefreshCaptcha={automationFlow === 'login' ? handleRefreshLoginCaptcha : handleRefreshCaptcha}
        captchaSubmitting={automationFlow === 'login' ? loginCaptchaSubmitting : captchaSubmitting}
        captchaRefreshing={automationFlow === 'login' ? loginCaptchaRefreshing : captchaRefreshing}
        loginOtp={loginOtp}
        onLoginOtpChange={(value) => {
          setLoginOtp(value);
          if (otpInputError) setOtpInputError('');
        }}
        onVerifyLoginOtp={handleVerifyLoginOtp}
        onResendLoginOtp={handleResendLoginOtp}
      />

      {showLoginCaptchaModal && !showAutomationModal && (
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

      {showLoginOtpModal && !showAutomationModal && (
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

      <EprTargetsConfirmationModal
        isOpen={showEprTargetsModal}
        data={eprTargetsModalData}
        submitting={eprTargetsSubmitting}
        onConfirm={handleConfirmEprTargets}
        onCancel={handleCancelEprTargets}
      />

      <RegistrationPaymentModal
        isOpen={showPaymentReviewModal}
        data={paymentReviewData}
        onClose={() => setShowPaymentReviewModal(false)}
        onOpenPayu={(url) => window.pwp?.scraper?.openPayuWindow?.(url)}
      />

      {studioOpen && (
        <LetterStudioModal
          open={studioOpen}
          onClose={() => setStudioOpen(false)}
          initialId={studioLetterId}
          letters={applicableLetters}
          values={buildLetterValues(sourceRecords)}
          missing={missingFields}
          attached={{
            coveringLetter: generalInfo.partCCoveringLetter,
            selfDeclaration: generalInfo.partCAuditedStatement,
            largeEntity: autoData?.typeOfCompanyDoc,
          }}
          onAttachPdf={handleAttachFromStudio}
          onNotify={showToast}
        />
      )}

      <input
        type="file"
        accept=".pdf"
        ref={simpleFileInputRef}
        style={{ display: 'none' }}
        onChange={handleSimpleFileSelected}
      />
    </div>
  );
}
