import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { usePageHeader } from '../context/PageHeaderContext.jsx';
import { useNavigate } from 'react-router-dom';
import { useToast, Toast } from '../components/Toast.jsx';
import RegistrationPartB from '../components/RegistrationPartB.jsx';
import RegistrationPartC from '../components/RegistrationPartC.jsx';
import {
  AUTO_FILLED_FIELDS,
  collectRegistrationUploadFileIssues,
  formatCpcbFileNameIssue,
  validateCpcbPortalFileName,
} from '../utils/registrationDataMapper.js';
import {
  resolveRegistrationData,
  isRegistrationReadyWithFallback,
  resolveRegistrationLoginCredentials,
} from '../utils/registrationDummyData.js';
import {
  buildRegistrationSavePayload,
  fetchRegistrationDocData,
  hasPersistableFormContent,
  mergeAutoData,
  mergeGeneralInfoFromSources,
  pickNonEmpty,
} from '../utils/registrationFormPersistence.js';
import {
  TYPE_OF_BUSINESS_OPTIONS,
  TYPE_OF_COMPANY_OPTIONS,
  INDIAN_STATES,
  GENERAL_INFO_EMPTY,
  stateFromGstin,
} from '../utils/registrationGeneralInfo.js';
import { useCpcbPortalToasts } from '../hooks/useCpcbPortalToasts.js';
import CpcbPortalToastFeed from '../components/CpcbPortalToastFeed.jsx';
import { Loader2, X, Sparkles, Mail, Phone, FlaskConical, Building2, Eye, EyeOff, RefreshCw, FilePlus, CheckCircle2, Terminal } from 'lucide-react';
import { storeCompressedUpload } from '../utils/storeUploadFile.js';
import UploadedFilePreview from '../components/UploadedFilePreview.jsx';
import { showRegistrationAutomationError } from '../utils/registrationAutomationErrors.js';
import ImporterEprPreparedReview from '../components/importerEpr/ImporterEprPreparedReview.jsx';
import OperatingStatesMultiSelect from '../components/OperatingStatesMultiSelect.jsx';
import {
  plasticConsumed3cHasData,
} from '../../shared/plasticConsumed3c.js';
import {
  fetchComputedPlasticConsumed3c,
  shouldHydratePlasticConsumed,
} from '../utils/registrationPlasticConsumed.js';
import {
  validateSection4AgainstPlasticConsumed,
  formatSection4PartAIssue,
} from '../utils/registrationPartBSection4.js';
import { getImporterReportingFinancialYears } from '../../shared/financialYearScope.js';

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
  ctoNumber: '',
  ctoValidity: '',
  dateOfCommencement: '',
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

export default function NewApplicationPage() {
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
  const [registrationBlocker, setRegistrationBlocker] = useState('');
  const [uploadingPdfField, setUploadingPdfField] = useState('');
  const [plasticConsumedSource, setPlasticConsumedSource] = useState('');

  const lockedInputClass = registrationComplete
    ? `${inputClass} bg-slate-50 text-slate-700 cursor-not-allowed`
    : inputClass;
  const lockedSelectClass = registrationComplete
    ? `${selectClass} bg-slate-50 text-slate-700 cursor-not-allowed`
    : selectClass;

  const applySavedRegistration = useCallback(async (saved) => {
    if (!saved?.cepr_id) return;

    const form = saved.formData || {};
    const general = form.generalInfo && typeof form.generalInfo === 'object' ? form.generalInfo : form;
    const auto = form.autoData && typeof form.autoData === 'object' ? form.autoData : null;
    const loginCreds = resolveRegistrationLoginCredentials({
      email: saved.email || form.email || general.email,
      mobile: saved.mobile || form.mobile || general.mobile,
      password: saved.password || general.password,
    });

    setRegistrationComplete(true);
    setSavedCeprId(saved.cepr_id);

    if (auto) {
      setAutoData({ ...EMPTY_AUTO, ...auto });
    }

    if (general && (general.typeOfBusiness || general.typeOfCompany || general.registeredAddressLine1)) {
      setGeneralInfo((prev) => ({
        ...prev,
        ...general,
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
            autoData: form.autoData || auto,
            generalInfo: form.generalInfo || general || {
              password: loginCreds.password,
              confirmPassword: loginCreds.password,
            },
          }),
      });
    }
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
    if ((showEmailOtp || showMobileOtp) && otpTimer > 0) {
      interval = setInterval(() => setOtpTimer((prev) => prev - 1), 1000);
    } else if (otpTimer === 0) {
      setIsResendActive(true);
      if (interval) clearInterval(interval);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [showEmailOtp, showMobileOtp, otpTimer]);

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
    if (window.pwp?.scraper?.onLog) {
      return window.pwp.scraper.onLog(() => {});
    }
  }, []);

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
            setSavedRegistration(saved);
          } else if (res && res.success === false) {
            showToast('Could not load registration from SQLite: ' + (res.error || 'unknown error'), 'error');
          }
        }

        const { docData } = await fetchRegistrationDocData();
        const ceprId = saved?.cepr_id || saved?.epr_id || saved?.ceprId;

        if (saved && ceprId) {
          await applySavedRegistration({ ...saved, cepr_id: ceprId });
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
      } catch (err) {
        console.error('[registration:get] failed', err);
        showToast('Could not load saved registration: ' + err.message, 'error');
        const { docData } = await fetchRegistrationDocData();
        await applyRegistrationData(docData);
      } finally {
        setLoadingSavedRegistration(false);
      }
    };
    load();
  }, [applyRegistrationData, applySavedRegistration, showToast]);

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
        .then((res) => {
          if (!res?.success) console.error('[registration:save] failed', res);
        })
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

  const persistRegistrationForm = useCallback(async (nextGeneral, nextAuto) => {
    if (!window.pwp?.registration?.save) return;
    const updatedFormData = {
      ...(savedRegistration?.formData || {}),
      email,
      mobile,
      autoData: nextAuto ?? autoData,
      generalInfo: nextGeneral ?? generalInfo,
    };
    await window.pwp.registration.save({
      ...(savedRegistration || {}),
      email,
      mobile,
      form_data_json: JSON.stringify(updatedFormData),
      details_of_products_produced_marketed: (nextAuto ?? autoData).detailsOfProductsPath,
      representative_picture_of_plastic_packaging: (nextAuto ?? autoData).representativePicturePath,
      plastic_consumed_json: JSON.stringify((nextGeneral ?? generalInfo).plasticConsumed || {}),
      importer_3a_status: (nextGeneral ?? generalInfo).importer3aStatus,
    }).catch(console.error);
  }, [savedRegistration, email, mobile, autoData, generalInfo]);

  const handlePartAPdfUpload = useCallback(async (field, file) => {
    setUploadingPdfField(field);
    try {
      const docBase = field === 'detailsOfProductsPath'
        ? 'operations_details'
        : field === 'representativePicturePath'
          ? 'plastic_packaging_picture'
          : 'document';
      const nameCheck = validateCpcbPortalFileName(file?.name || '', docBase);
      if (!nameCheck.valid) {
        showToast(
          `"${file.name}" jaisa naam CPCB portal reject karta hai. App "${nameCheck.suggestedName}" ke naam se save karegi.`,
          'warning',
          { duration: 12000 }
        );
      }
      const stored = await storeCompressedUpload(file, {
        destSubdir: 'processed_registration_docs',
        fileName: nameCheck.suggestedName,
      });
      if (!stored.success || !stored.filePath) {
        showToast(stored.message || 'Could not save PDF.', 'error');
        return;
      }
      const nextAuto = { ...autoData, [field]: stored.filePath };
      setAutoData(nextAuto);
      await persistRegistrationForm(generalInfo, nextAuto);
      showToast('PDF uploaded.', 'success');
    } finally {
      setUploadingPdfField('');
    }
  }, [autoData, generalInfo, persistRegistrationForm, showToast]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let docs = [];
      if (window.pwp?.documents?.getAll) {
        docs = await window.pwp.documents.getAll();
      }
      if (cancelled) return;
      setFileNameIssues(collectRegistrationUploadFileIssues({ docs, autoData, generalInfo }));
    })();
    return () => {
      cancelled = true;
    };
  }, [autoData, generalInfo]);

  const handlePlasticConsumedChange = useCallback((nextPlasticConsumed) => {
    setGeneralInfo((prev) => ({ ...prev, plasticConsumed: nextPlasticConsumed }));
  }, []);

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

  const handleDocExtracted = useCallback(async (data) => {
    await applyRegistrationData(data);
  }, [applyRegistrationData]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    // if (registrationComplete) return;

    if (!docReady) {
      showToast(`Please upload required documents: ${missingDocs.join(', ')}`, 'error');
      return;
    }

    let docs = [];
    if (window.pwp?.documents?.getAll) {
      docs = await window.pwp.documents.getAll();
    }
    const uploadNameIssues = collectRegistrationUploadFileIssues({ docs, autoData, generalInfo });
    if (uploadNameIssues.length) {
      setFileNameIssues(uploadNameIssues);
      showToast(formatCpcbFileNameIssue(uploadNameIssues[0]), 'error', { duration: 14000 });
      if (uploadNameIssues.length > 1) {
        showToast(
          `${uploadNameIssues.length} files ke naam CPCB portal ke rules ke against hain. Pehle rename karke dubara upload karein.`,
          'warning',
          { duration: 12000 }
        );
      }
      return;
    }
    if (!autoData.gstin || !autoData.authPan || !autoData.authName || !autoData.authDob) {
      showToast('Registration data incomplete.', 'error');
      return;
    }
    if (!email || !mobile) {
      showToast('Email and Mobile Number are required.', 'error');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      showToast('Please enter a valid email address.', 'error');
      return;
    }

    const mobileRegex = /^[0-9]{10}$/;
    if (!mobileRegex.test(mobile)) {
      showToast('Please enter a valid 10-digit mobile number.', 'error');
      return;
    }

    if (!generalInfo.typeOfBusiness || !generalInfo.typeOfCompany) {
      showToast('Type of Business and Type of Company are required.', 'error');
      return;
    }

    if (!generalInfo.registeredAddressLine1?.trim()) {
      showToast('Registered Address Line 1 is required.', 'error');
      return;
    }
    if (!generalInfo.stateUt || !generalInfo.district?.trim()) {
      showToast('State/UT and District are required.', 'error');
      return;
    }
    if (!generalInfo.authDesignation?.trim()) {
      showToast('Authorised Person Designation is required.', 'error');
      return;
    }
    if (!generalInfo.password || generalInfo.password.length < 8) {
      showToast('Password must be at least 8 characters.', 'error');
      return;
    }
    if (generalInfo.password !== generalInfo.confirmPassword) {
      showToast('Password and Confirm Password do not match.', 'error');
      return;
    }

    if (autoData.authDob) {
      const dobDate = new Date(autoData.authDob);
      const today = new Date();
      let age = today.getFullYear() - dobDate.getFullYear();
      const m = today.getMonth() - dobDate.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < dobDate.getDate())) age--;
      if (age < 18) {
        showToast('Authorised Person age must be at least 18 years.', 'error');
        return;
      }
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
      cin: generalInfo.cin,
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
      plasticConsumed: generalInfo.plasticConsumed,
      complianceStatus: generalInfo.complianceStatus,
      thicknessOfPlastic: generalInfo.thicknessOfPlastic,
    };

    setLoading(true);
    setLoadingMsg('Starting automation process...');
    clearPortalToasts();

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
        setShowEmailOtp(true);
        setOtpTimer(120);
        setIsResendActive(false);
      } else {
        const errMsg = res.error || 'Unexpected step received.';
        setRegistrationBlocker(errMsg);
        showRegistrationAutomationError(showToast, setAutomationLogs, errMsg);
      }
    } catch (err) {
      setRegistrationBlocker(err.message);
      showRegistrationAutomationError(showToast, setAutomationLogs, err.message);
    } finally {
      setLoading(false);
    }
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
    try {
      const res = await window.pwp.scraper.submitEmailOtp({ otp: emailOtp.trim(), mobile });
      if (res.success && res.step === 'WAITING_MOBILE_OTP') {
        setShowEmailOtp(false);
        setEmailOtp('');
        setShowMobileOtp(true);
        setOtpTimer(120);
        setIsResendActive(false);
        showToast(`Email verified! Mobile OTP sent to ${mobile}.`, 'success');
      } else {
        const errText = res.error || 'Unknown error';
        showToast(errText, 'error', { duration: 10000 });
        setAutomationLogs((prev) => [...prev, { type: 'error', message: errText }]);
      }
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    } finally {
      setOtpSubmitting(false);
    }
  };

  const handleResendMobileOtp = async () => {
    try {
      setLoading(true);
      setLoadingMsg('Resending Mobile OTP...');
      const res = await window.pwp.scraper.resendMobileOtp();
      if (res.success) {
        showToast('OTP Resent to Mobile', 'success');
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

  const handleVerifyMobileOtp = async () => {
    if (!mobileOtp?.trim()) {
      showToast('Please enter Mobile OTP', 'error');
      return;
    }
    setOtpSubmitting(true);
    setLoadingMsg('Verifying mobile OTP on CPCB portal...');
    try {
      const res = await window.pwp.scraper.submitMobileOtp({ mobile, otp: mobileOtp.trim() });

      if (res.success && res.step === 'WAITING_CAPTCHA') {
        setRegistrationBlocker('');
        setShowMobileOtp(false);
        setMobileOtp('');
        setOtpTimer(0);
        setIsResendActive(false);
        setCaptchaImage(res.captchaImage || '');
        setCaptchaText('');
        setCaptchaError('');
        setShowCaptchaModal(true);
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
        setShowMobileOtp(false);
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
        } else if (res.step === 'REGISTRATION_COMPLETE') {
          showToast(
            `Registration complete! CEPR ID: ${res.ceprId || 'saved'} — screenshot stored in database.`,
            'success',
            { duration: 12000 }
          );
        } else if (res.step === 'SUPPORTING_DOC_COMPLETE') {
          showToast(
            'Registration complete! User Verification, General Information & PAN upload done on CPCB portal.',
            'success',
            { duration: 10000 }
          );
        } else if (res.step === 'SUPPORTING_DOC_UPLOADED') {
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
        }
      } else {
        const errText = res.error || 'Unknown error';
        setRegistrationBlocker(errText);
        showRegistrationAutomationError(showToast, setAutomationLogs, errText);
      }
    } catch (err) {
      setRegistrationBlocker(err.message);
      showRegistrationAutomationError(showToast, setAutomationLogs, err.message);
    } finally {
      setOtpSubmitting(false);
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
  };

  const handleNewApplication = async () => {
    if (!savedCeprId) {
      showToast('CEPR ID not found — complete registration first.', 'error');
      return;
    }

    const zeroCats = { cat1: '0', cat2: '0', cat3: '0', cat4: '0' };
    const emptyPc = Object.fromEntries(reportingFys.map((fy) => [fy, { ...zeroCats }]));
    const plasticConsumed = plasticConsumed3cHasData(generalInfo.plasticConsumed)
      ? generalInfo.plasticConsumed
      : emptyPc;

    if (!autoData.detailsOfProductsPath) {
      showToast('Upload Section 3a PDF — Details (Type & Quantity) of products produced/marketed.', 'error');
      return;
    }
    if (!autoData.representativePicturePath) {
      showToast('Upload Section 3b PDF — Representative picture of Plastic Packaging.', 'error');
      return;
    }
    const derivedState =
      generalInfo.stateUt ||
      stateFromGstin(autoData.unitGst || generalInfo.unitGst) ||
      stateFromGstin(autoData.gstin);
    const operatingStates = (generalInfo.operatingStates || []).length
      ? generalInfo.operatingStates
      : (derivedState ? [derivedState] : []);

    if (!operatingStates.length) {
      showToast('Select the State/UT — it could not be detected from the GST documents.', 'error');
      return;
    }

    const section4Issues = validateSection4AgainstPlasticConsumed(
      generalInfo.partBSection4 || [],
      plasticConsumed,
      reportingFys.length ? reportingFys : getImporterReportingFinancialYears(),
    );
    if (section4Issues.length) {
      showToast(formatSection4PartAIssue(section4Issues[0]), 'error', { duration: 14000 });
      if (section4Issues.length > 1) {
        showToast(
          `${section4Issues.length} Section 4 rows Part A 3c se ±40% ke andar nahi hain. Part B me values fix karein.`,
          'warning',
          { duration: 12000 },
        );
      }
      return;
    }

    const applicationDefaults = {
      ...generalInfo,
      yearOfCommencement: '2026',
      complianceStatus: generalInfo.complianceStatus || generalInfo.complianceStatus || 'Yes',
      thicknessOfPlastic: generalInfo.thicknessOfPlastic || generalInfo.thicknessOfPlastic || '50',
      hasProductionFacility: generalInfo.hasProductionFacility || 'Not Applicable',
      capitalInvested: generalInfo.capitalInvested || generalInfo.capitalInvested || '0',
      operatingStates,
      plasticConsumed,
    };

    setGeneralInfo(applicationDefaults);
    showToast('Starting New Application — 3a/3b PDFs and 3c values will be submitted to CPCB.', 'success');

    const saveLogs = [];
    if (window.pwp?.registration?.save) {
      try {
        const savePayload = {
          email,
          mobile,
          applicant_type: applicationDefaults.applicantType || 'PIBO',
          sub_applicant_type: applicationDefaults.subApplicantType || 'Importer',
          form_data_json: JSON.stringify({
            email,
            mobile,
            generalInfo: applicationDefaults,
            autoData,
          }),
        };
        if (savedCeprId) savePayload.cepr_id = savedCeprId;
        const saveRes = await window.pwp.registration.save(savePayload);
        console.log('[registration:save]', saveRes);
        if (saveRes?.success) {
          saveLogs.push({ type: 'success', message: `SQLite save OK — id=${saveRes.id}, CEPR=${savedCeprId}` });
        } else {
          saveLogs.push({ type: 'error', message: `SQLite save failed: ${saveRes?.error || 'unknown error'}` });
          showToast('SQLite save failed: ' + (saveRes?.error || 'unknown error'), 'error');
        }
      } catch (err) {
        console.error('Failed to save data before automation', err);
        saveLogs.push({ type: 'error', message: 'SQLite save error: ' + err.message });
      }
    } else {
      saveLogs.push({ type: 'error', message: 'registration.save API is not available in preload' });
    }

    setAutomationLogs(saveLogs);
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
    if (
      res.success &&
      (res.step === 'APPLICATION_ONBOARDING_AND_SCRAPE_COMPLETE' ||
        res.step === 'APPLICATION_ONBOARDING_COMPLETE')
    ) {
      const scrapeOk = res.scrape?.success !== false;
      if (res.step === 'APPLICATION_ONBOARDING_AND_SCRAPE_COMPLETE' && scrapeOk) {
        showToast(
          'Registration pipeline complete! Application started and portal data synced to the app.',
          'success',
          { duration: 15000 },
        );
      } else if (res.step === 'APPLICATION_ONBOARDING_AND_SCRAPE_COMPLETE' && !scrapeOk) {
        showToast(
          `Application started, but portal sync failed: ${res.scrape?.error || 'Unknown error'}. You can retry from Dashboard.`,
          'error',
          { duration: 15000 },
        );
      } else {
        showToast(
          `Application started! ${res.applicantType || 'PIBO'} — ${res.subApplicantType || 'Importer'} selected on CPCB portal. Browser is open.`,
          'success',
          { duration: 15000 },
        );
      }
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
          const onboard = await window.pwp.scraper.runApplicationOnboardingAfterLogin({ autoScrape: true });
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
    try {
      const res = await window.pwp.scraper.submitRegistrationCaptcha({ captcha: text });

      if (res.success && res.step === 'REGISTRATION_COMPLETE') {
        setShowCaptchaModal(false);
        setCaptchaText('');
        setCaptchaImage('');
        setCaptchaSubmitting(false);
        setLoadingMsg('');
        const ceprId = res.ceprId || savedCeprId;
        await saveRegistrationSnapshot(ceprId, res.screenshotPath);
        showToast(
          `Registration complete! CEPR ID: ${ceprId || 'saved'}. Starting login for portal sync...`,
          'success',
          { duration: 15000 }
        );
        await beginLoginFlow(ceprId);
        return;
      }

      if (res.captchaImage) {
        setCaptchaImage(res.captchaImage);
      }
      setCaptchaText('');
      setCaptchaError(res.error || 'Invalid captcha. Please try again.');
    } catch (err) {
      setCaptchaError(err.message);
    } finally {
      setCaptchaSubmitting(false);
      setLoadingMsg('');
    }
  };

  const formatTimer = (time) =>
    `${Math.floor(time / 60).toString().padStart(2, '0')}:${(time % 60).toString().padStart(2, '0')}`;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 relative pb-32">
      <Toast toast={toast} onClose={hideToast} />
      <CpcbPortalToastFeed items={portalToasts} />

      <h2 className="text-lg font-semibold text-slate-800 mb-1">PIBO & Importer Registration</h2>
      <p className="text-sm text-slate-500 mb-4">
        {registrationComplete
          ? 'CPCB account is registered. Fill Part A, Part B and Part C, then start a new application.'
          : 'First create the CPCB account. After registration, Part A, Part B and Part C will appear for the new application.'}
      </p>

      <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className={`rounded-xl border px-4 py-3 ${registrationComplete ? 'border-green-200 bg-green-50' : 'border-green-300 bg-green-50 ring-1 ring-green-200'}`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-green-700">Step 1</p>
          <p className="text-sm font-semibold text-slate-800 mt-0.5">CPCB Account Registration</p>
          <p className="text-xs text-slate-500 mt-1">
            {registrationComplete ? 'Completed — CEPR ID saved' : 'Upload docs, contact details & password'}
          </p>
        </div>
        <div className={`rounded-xl border px-4 py-3 ${registrationComplete ? 'border-blue-300 bg-blue-50 ring-1 ring-blue-200' : 'border-slate-200 bg-slate-50 opacity-70'}`}>
          <p className={`text-[11px] font-semibold uppercase tracking-wide ${registrationComplete ? 'text-blue-700' : 'text-slate-400'}`}>Step 2</p>
          <p className="text-sm font-semibold text-slate-800 mt-0.5">New Application (Part A, B, C)</p>
          <p className="text-xs text-slate-500 mt-1">
            {registrationComplete ? 'Fill application details below' : 'Unlocks after account registration'}
          </p>
        </div>
      </div>

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
              Fill <strong>Part A, Part B and Part C</strong> below. Login and portal sync will start automatically after registration captcha — enter login captcha &amp; OTP when prompted.
            </p>
          </div>
        </div>
      )}





      <div className="mb-6">
        <AutoFilledPreview data={autoData} isDummy={false} />
      </div>

      {registrationBlocker ? (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <p className="font-semibold">CPCB registration blocked</p>
          <p className="mt-1">{registrationBlocker}</p>
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-8">
        <div>
          <h3 className="text-md font-medium text-slate-800 mb-1 flex items-center gap-2">
            <Building2 size={16} className="text-green-600" />
            General Information
            <span className="text-xs font-normal text-slate-400">(CPCB account registration)</span>
          </h3>

          <p className="text-xs text-slate-500 mb-4">
            Company Details — blank fields from CPCB portal. Fill manually if documents are not uploaded.
          </p>

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
            
            {generalInfo.typeOfCompany && (
              <div className="md:col-span-2 bg-slate-50 p-3 rounded-lg border">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {['Micro', 'Small', 'Medium'].includes(generalInfo.typeOfCompany) 
                    ? 'Upload MSME Certificate (PDF) *' 
                    : 'Upload Declaration of Large Entity (PDF) *'}
                </label>
                <input
                  type="file"
                  accept=".pdf"
                  onChange={async (e) => {
                    const file = e.target.files[0];
                    if (file) {
                      const nameCheck = validateCpcbPortalFileName(file.name, 'supporting_category_doc');
                      if (!nameCheck.valid) {
                        showToast(
                          `"${file.name}" jaisa naam CPCB portal reject karta hai. App "${nameCheck.suggestedName}" ke naam se save karegi.`,
                          'warning',
                          { duration: 12000 }
                        );
                      }
                      const stored = await storeCompressedUpload(file, {
                        destSubdir: 'processed_registration_docs',
                        fileName: nameCheck.suggestedName,
                      });
                      if (!stored.success || !stored.filePath) {
                        showToast(stored.message || 'Could not save document.', 'error');
                        return;
                      }
                      setAutoData(prev => ({ ...prev, typeOfCompanyDoc: stored.filePath }));
                    }
                  }}
                  className={inputClass}
                />
                {autoData.typeOfCompanyDoc && (
                  <UploadedFilePreview filePath={autoData.typeOfCompanyDoc} />
                )}
                {String(generalInfo.typeOfCompany || '').toLowerCase() === 'large' && (
                  <p className="text-xs text-slate-500 mt-2">
                    Need a draft? Open <button type="button" className="text-emerald-700 font-medium underline underline-offset-2" onClick={() => document.getElementById('part-c-letters')?.scrollIntoView({ behavior: 'smooth' })}>Ready Letters in Part C</button>, download the Word file, seal &amp; sign, then upload the PDF here.
                  </p>
                )}
              </div>
            )}
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
                        if (file) {
                          const nameCheck = validateCpcbPortalFileName(file.name, 'unit_gst');
                          if (!nameCheck.valid) {
                            showToast(
                              `"${file.name}" jaisa naam CPCB portal reject karta hai. App "${nameCheck.suggestedName}" ke naam se save karegi.`,
                              'warning',
                              { duration: 12000 }
                            );
                          }
                          const stored = await storeCompressedUpload(file, {
                            destSubdir: 'processed_registration_docs',
                            fileName: nameCheck.suggestedName,
                          });
                          if (!stored.success || !stored.filePath) {
                            showToast(stored.message || 'Could not save Unit GST document.', 'error');
                            return;
                          }
                          setAutoData(prev => ({ ...prev, unitGstDoc: stored.filePath }));
                        }
                      }}
                      className={inputClass}
                      required
                    />
                  </div>
                )}
              </>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Company CIN Number</label>
              <input
                name="cin"
                value={generalInfo.cin}
                onChange={handleGeneralChange}
                type="text"
                placeholder="Enter CIN (Pvt/Public Ltd only)"
                className={`${inputClass} uppercase`}
              />
            </div>
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
          </div>

          {registrationComplete && (
          <>
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 mt-8">
            <p className="font-semibold text-blue-800">New Application Form</p>
            <p className="text-sm text-blue-700 mt-1">
              Fill Part A, Part B and Part C, then click New Application to continue on the CPCB portal.
            </p>
          </div>
          <div className="space-y-6 mt-8 border-t pt-8">
            <div>
              <h3 className="text-lg font-bold text-slate-800 border-b pb-2 mb-4">Part A: General Information</h3>
              <div className="bg-white border rounded-xl shadow-sm p-6 space-y-6">
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
                  
                  <ImporterEprPreparedReview
                    detailsOfProductsPath={autoData.detailsOfProductsPath || ''}
                    representativePicturePath={autoData.representativePicturePath || ''}
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

        <RegistrationPartB generalInfo={generalInfo} setGeneralInfo={setGeneralInfo} gstin={autoData.gstin} />

        <RegistrationPartC
          generalInfo={generalInfo}
          setGeneralInfo={setGeneralInfo}
          autoData={autoData}
          setAutoData={setAutoData}
          email={email}
          mobile={mobile}
          showToast={showToast}
        />
          </>
          )}

        <div className="mt-8">
          <p className="text-xs text-slate-500 mt-6 mb-4">
            Authorized Person Details &amp; Set Password
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            <div />
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
        </div>

        <div>
          <h3 className="text-md font-medium text-slate-800 mb-1 flex items-center gap-2">
            <Mail size={16} className="text-green-600" />
            Contact Details
            <span className="text-xs font-normal text-slate-400">(CPCB account — user verification)</span>
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


        <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          
          

          <button
            type="button"
            onClick={handleNewApplication}
            disabled={loading || loginCaptchaSubmitting || loginOtpSubmitting}
            className="inline-flex items-center gap-2 px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-sm disabled:opacity-50"
          >
            {(loading || loginCaptchaSubmitting || loginOtpSubmitting) ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <FilePlus size={16} />
            )}
            New Application
          </button>
        </div>
      </form>

      {loading && !showEmailOtp && !showMobileOtp && !showCaptchaModal && !showLoginCaptchaModal && !showLoginOtpModal && (
        <div className="fixed inset-0 z-[90] bg-white/85 flex flex-col items-center justify-center">
          <Loader2 size={40} className="animate-spin text-green-600 mb-4" />
          <p className="text-slate-800 font-semibold">Please wait</p>
          <p className="text-sm text-slate-500 mt-1">Your request is being processed</p>
          <p className="text-xs text-slate-400 mt-2">CPCB portal messages appear live in the chat at the bottom-right</p>
        </div>
      )}

      {showEmailOtp && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-lg font-semibold text-slate-800">Email OTP</h3>
              <button
                type="button"
                disabled={otpSubmitting}
                onClick={() => setShowEmailOtp(false)}
                className="text-slate-400 hover:text-slate-600 disabled:opacity-50"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6">
              <p className="text-sm text-slate-600 mb-4">Enter OTP sent to {email}</p>
              <input
                type="text"
                value={emailOtp}
                onChange={(e) => setEmailOtp(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !otpSubmitting && handleVerifyEmailOtp()}
                placeholder="Enter Email OTP"
                disabled={otpSubmitting}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none disabled:opacity-60"
                autoFocus
              />
              <div className="mt-4 flex items-center justify-between text-sm">
                {!isResendActive ? (
                  <span className="text-slate-500">
                    Resend OTP in <span className="font-medium">{formatTimer(otpTimer)}</span>
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={otpSubmitting}
                    onClick={handleResendEmailOtp}
                    className="text-green-600 font-medium underline disabled:opacity-50"
                  >
                    Resend OTP
                  </button>
                )}
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t flex justify-end">
              <button
                type="button"
                onClick={handleVerifyEmailOtp}
                disabled={otpSubmitting || !emailOtp.trim()}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {otpSubmitting && <Loader2 size={14} className="animate-spin" />}
                Verify
              </button>
            </div>
          </div>
        </div>
      )}

      {showMobileOtp && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-lg font-semibold text-slate-800">Mobile OTP</h3>
              <button
                type="button"
                disabled={otpSubmitting}
                onClick={() => setShowMobileOtp(false)}
                className="text-slate-400 hover:text-slate-600 disabled:opacity-50"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6">
              <p className="text-sm text-slate-600 mb-4">
                OTP sent to <strong>{mobile}</strong>. Enter the SMS code below.
              </p>
              <input
                type="text"
                value={mobileOtp}
                onChange={(e) => setMobileOtp(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !otpSubmitting && handleVerifyMobileOtp()}
                placeholder="Enter Mobile OTP"
                disabled={otpSubmitting}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none disabled:opacity-60"
                autoFocus
              />
              <div className="mt-4 flex items-center justify-between text-sm">
                {!isResendActive ? (
                  <span className="text-slate-500">
                    Resend OTP in <span className="font-medium">{formatTimer(otpTimer)}</span>
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={otpSubmitting}
                    onClick={handleResendMobileOtp}
                    className="text-green-600 font-medium underline disabled:opacity-50"
                  >
                    Resend OTP
                  </button>
                )}
              </div>
              {otpSubmitting && (
                <div className="mt-4 rounded-lg border border-green-200 bg-green-50 px-3 py-2">
                  <p className="text-xs font-medium text-green-800 flex items-center gap-2">
                    <Loader2 size={12} className="animate-spin shrink-0" />
                    Please wait
                  </p>
                </div>
              )}
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t flex justify-end">
              <button
                type="button"
                onClick={handleVerifyMobileOtp}
                disabled={otpSubmitting || !mobileOtp.trim()}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {otpSubmitting && <Loader2 size={14} className="animate-spin" />}
                Verify & Finish
              </button>
            </div>
          </div>
        </div>
      )}

      {showCaptchaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Enter Captcha</h3>
                <p className="text-xs text-slate-500 mt-0.5">Type the characters shown below to complete registration</p>
              </div>
              <button
                type="button"
                onClick={() => !captchaSubmitting && setShowCaptchaModal(false)}
                disabled={captchaSubmitting}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 disabled:opacity-50"
              >
                <X size={18} />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="flex items-center gap-3">
                {captchaImage ? (
                  <img
                    src={captchaImage}
                    alt="Captcha"
                    className="h-12 border border-slate-200 rounded bg-slate-50"
                  />
                ) : (
                  <div className="h-12 w-32 border border-dashed border-slate-300 rounded bg-slate-50 flex items-center justify-center text-xs text-slate-400">
                    No image
                  </div>
                )}
                <button
                  type="button"
                  onClick={handleRefreshCaptcha}
                  disabled={captchaRefreshing || captchaSubmitting}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50"
                >
                  {captchaRefreshing ? (
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
                  value={captchaText}
                  onChange={(e) => {
                    setCaptchaText(e.target.value.slice(0, 6));
                    if (captchaError) setCaptchaError('');
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && handleSubmitCaptcha()}
                  placeholder="Enter captcha"
                  maxLength={6}
                  disabled={captchaSubmitting}
                  className={`${inputClass} uppercase tracking-widest ${captchaError ? 'border-red-400 focus:ring-red-500 focus:border-red-500' : ''}`}
                  autoFocus
                />
                {captchaError && (
                  <p className="text-xs text-red-600 mt-1.5">{captchaError}</p>
                )}
              </div>
              {captchaSubmitting && (
                <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2">
                  <p className="text-xs font-medium text-green-800 flex items-center gap-2">
                    <Loader2 size={12} className="animate-spin shrink-0" />
                    Please wait
                  </p>
                </div>
              )}
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t flex justify-end">
              <button
                type="button"
                onClick={handleSubmitCaptcha}
                disabled={captchaSubmitting || !captchaText.trim()}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {captchaSubmitting && <Loader2 size={14} className="animate-spin" />}
                Submit & Complete
              </button>
            </div>
          </div>
        </div>
      )}

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

      {false && !showAutomationLogsModal && automationLogs.length > 0 && (
        <button
          type="button"
          onClick={() => setShowAutomationLogsModal(true)}
          className="fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-slate-800 rounded-lg shadow-lg hover:bg-slate-700"
        >
          <Terminal size={16} />
          Show logs
          {(loading || loginCaptchaSubmitting || loginOtpSubmitting) && (
            <Loader2 size={14} className="animate-spin" />
          )}
        </button>
      )}

      {false && showAutomationLogsModal && (
        <div className="fixed bottom-6 right-6 z-40 w-[min(420px,calc(100vw-2rem))] max-h-[50vh] bg-white rounded-xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b flex justify-between items-center bg-slate-50">
            <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
              <Terminal size={16} className="text-blue-600" />
              Automation logs
            </h3>
            <button
              type="button"
              onClick={() => setShowAutomationLogsModal(false)}
              className="text-slate-400 hover:text-slate-600 p-1"
            >
              <X size={18} />
            </button>
          </div>
          <div className="p-3 bg-slate-900 flex-1 overflow-y-auto font-mono text-xs leading-relaxed text-slate-300 min-h-[140px]">
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
          <div className="px-4 py-2 bg-slate-50 border-t text-xs text-slate-500 flex items-center gap-2">
            {(loading || loginCaptchaSubmitting || loginOtpSubmitting) ? (
              <><Loader2 size={12} className="animate-spin text-blue-600" /> Running in background — form stays usable.</>
            ) : (
              <><CheckCircle2 size={12} className="text-green-600" /> Finished or waiting for captcha/OTP.</>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
