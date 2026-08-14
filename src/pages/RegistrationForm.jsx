import React, { useState, useEffect, useCallback } from 'react';
import { usePageHeader } from '../context/PageHeaderContext.jsx';
import { useNavigate } from 'react-router-dom';
import { useToast, Toast } from '../components/Toast.jsx';
import RegistrationDocUpload from '../components/RegistrationDocUpload.jsx';
import {
  AUTO_FILLED_FIELDS,
} from '../utils/registrationDataMapper.js';
import {
  resolveRegistrationData,
  isRegistrationReadyWithFallback,
  REGISTRATION_DUMMY_DATA,
  REGISTRATION_LOGIN_DUMMY,
  resolveRegistrationLoginCredentials,
} from '../utils/registrationDummyData.js';
import {
  TYPE_OF_BUSINESS_OPTIONS,
  TYPE_OF_COMPANY_OPTIONS,
  INDIAN_STATES,
  GENERAL_INFO_EMPTY,
  buildGeneralInfoFromDocData,
} from '../utils/registrationGeneralInfo.js';
import { Loader2, X, Sparkles, Mail, Phone, FlaskConical, Building2, Eye, EyeOff, RefreshCw, FilePlus, CheckCircle2 } from 'lucide-react';

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
};

function AutoFilledPreview({ data, isDummy }) {
  const filled = AUTO_FILLED_FIELDS.filter((f) => String(data[f.key] || '').trim());
  if (!filled.length) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-6 text-center">
        <Sparkles size={20} className="mx-auto text-slate-300 mb-2" />
        <p className="text-sm text-slate-500">Upload documents above — or test dummy data will be used</p>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border p-4 space-y-3 ${isDummy ? 'border-amber-200 bg-amber-50/40' : 'border-green-100 bg-green-50/30'}`}>
      <div className="flex items-center gap-2 flex-wrap">
        {isDummy ? (
          <FlaskConical size={16} className="text-amber-600" />
        ) : (
          <Sparkles size={16} className="text-green-600" />
        )}
        <h3 className="text-sm font-semibold text-slate-800">
          {isDummy ? 'Test dummy data (automation)' : 'Auto-filled from documents'}
        </h3>
        {isDummy && (
          <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
            Dummy fallback
          </span>
        )}
        <span className={`text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full ${isDummy ? 'text-amber-700 bg-amber-100' : 'text-green-700 bg-green-100'}`}>
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

export default function RegistrationForm() {
  const { setPageHeader } = usePageHeader();
  const navigate = useNavigate();
  const { toast, showToast, hideToast } = useToast();

  const [autoData, setAutoData] = useState(REGISTRATION_DUMMY_DATA);
  const [usingDummy, setUsingDummy] = useState(true);
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [generalInfo, setGeneralInfo] = useState({ ...GENERAL_INFO_EMPTY });
  const [docReady, setDocReady] = useState(true);
  const [missingDocs, setMissingDocs] = useState([]);

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

  const lockedInputClass = registrationComplete
    ? `${inputClass} bg-slate-50 text-slate-700 cursor-not-allowed`
    : inputClass;
  const lockedSelectClass = registrationComplete
    ? `${selectClass} bg-slate-50 text-slate-700 cursor-not-allowed`
    : selectClass;

  const applySavedRegistration = useCallback(async (saved) => {
    if (!saved?.cepr_id) return;

    const form = saved.formData || {};
    const loginCreds = resolveRegistrationLoginCredentials({
      email: saved.email || form.email,
      mobile: saved.mobile || form.mobile,
      password: saved.password || form.generalInfo?.password,
    });

    setRegistrationComplete(true);
    setSavedCeprId(saved.cepr_id);
    setUsingDummy(false);

    if (form.autoData) {
      setAutoData({ ...EMPTY_AUTO, ...form.autoData });
    }

    if (form.generalInfo) {
      setGeneralInfo((prev) => ({
        ...prev,
        ...form.generalInfo,
        password: loginCreds.password,
        confirmPassword: loginCreds.password,
      }));
    } else {
      const { data: dummyData } = resolveRegistrationData(REGISTRATION_DUMMY_DATA);
      const fromDocs = buildGeneralInfoFromDocData(dummyData);
      setGeneralInfo((prev) => ({
        ...prev,
        ...fromDocs,
        typeOfBusiness: fromDocs.typeOfBusiness || dummyData.typeOfBusiness || prev.typeOfBusiness,
        typeOfCompany: fromDocs.typeOfCompany || dummyData.typeOfCompany || prev.typeOfCompany,
        registeredAddressLine1: fromDocs.registeredAddressLine1 || dummyData.registeredAddressLine1 || prev.registeredAddressLine1,
        district: fromDocs.district || dummyData.district || prev.district,
        cin: fromDocs.cin || dummyData.cin || prev.cin,
        stateUt: fromDocs.stateUt || dummyData.stateUt || prev.stateUt,
        authDesignation: dummyData.authDesignation || prev.authDesignation,
        password: loginCreds.password,
        confirmPassword: loginCreds.password,
      }));
      if (!form.autoData) {
        setAutoData({ ...EMPTY_AUTO, ...dummyData });
      }
    }

    setEmail(loginCreds.email);
    setMobile(loginCreds.mobile);

    const needsPersist =
      !saved.email ||
      !saved.mobile ||
      !saved.password ||
      !saved.form_data_json;

    if (needsPersist && window.pwp?.registration?.save) {
      const { data: dummyData } = resolveRegistrationData(REGISTRATION_DUMMY_DATA);
      const fromDocs = buildGeneralInfoFromDocData(dummyData);
      await window.pwp.registration.save({
        applicant_type: saved.applicant_type || 'PWP',
        sub_applicant_type: saved.sub_applicant_type || 'Cement Co-processing',
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
            autoData: form.autoData || dummyData,
            generalInfo: form.generalInfo || {
              ...fromDocs,
              typeOfBusiness: dummyData.typeOfBusiness,
              typeOfCompany: dummyData.typeOfCompany,
              registeredAddressLine1: dummyData.registeredAddressLine1,
              district: dummyData.district,
              stateUt: dummyData.stateUt,
              cin: dummyData.cin,
              authDesignation: dummyData.authDesignation,
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
      return window.pwp.scraper.onLog((msg) => setLoadingMsg(msg));
    }
  }, []);

  const applyRegistrationData = useCallback(async (docData = {}) => {
    const { data, isDummy } = resolveRegistrationData(docData);
    setAutoData({ ...EMPTY_AUTO, ...data });
    setUsingDummy(isDummy);

    const fromDocs = buildGeneralInfoFromDocData(data);
    setGeneralInfo((prev) => ({
      ...prev,
      ...Object.fromEntries(
        Object.entries(fromDocs).filter(([, v]) => String(v || '').trim())
      ),
      typeOfBusiness: fromDocs.typeOfBusiness || data.typeOfBusiness || prev.typeOfBusiness,
      typeOfCompany: fromDocs.typeOfCompany || data.typeOfCompany || prev.typeOfCompany,
      registeredAddressLine1: fromDocs.registeredAddressLine1 || prev.registeredAddressLine1,
      district: fromDocs.district || prev.district,
      cin: fromDocs.cin || prev.cin,
      stateUt: fromDocs.stateUt || prev.stateUt,
      authDesignation: data.authDesignation || prev.authDesignation,
    }));

    let docs = [];
    if (window.pwp?.documents?.getAll) {
      docs = await window.pwp.documents.getAll();
    }
    const { ready, isDummy: readyDummy, missing } = isRegistrationReadyWithFallback(docs, docData);
    setDocReady(ready);
    setMissingDocs(missing);
    setUsingDummy(isDummy || readyDummy);
  }, []);

  const [savedRegistration, setSavedRegistration] = useState(null);

  useEffect(() => {
    const load = async () => {
      setLoadingSavedRegistration(true);
      try {
        if (window.pwp?.registration?.get) {
          const res = await window.pwp.registration.get();
          if (res.success && res.data?.cepr_id) {
            setSavedRegistration(res.data);
            if (!res.data.formData) {
              await applyRegistrationData(REGISTRATION_DUMMY_DATA);
            }
            await applySavedRegistration(res.data);
            return;
          }
        }
        await applyRegistrationData(REGISTRATION_DUMMY_DATA);
      } finally {
        setLoadingSavedRegistration(false);
      }
    };
    load();
  }, [applyRegistrationData, applySavedRegistration]);

  useEffect(() => {
    if (registrationComplete || loadingSavedRegistration || !window.pwp?.registration?.save) return undefined;

    const timer = setTimeout(() => {
      const creds = {
        email: email.trim() || undefined,
        mobile: mobile.trim() || undefined,
        password: generalInfo.password?.trim() || undefined,
        confirm_password: generalInfo.confirmPassword?.trim() || undefined,
      };
      if (creds.email || creds.mobile || creds.password) {
        window.pwp.registration.save(creds);
      }
    }, 700);

    return () => clearTimeout(timer);
  }, [email, mobile, generalInfo.password, generalInfo.confirmPassword, registrationComplete, loadingSavedRegistration]);

  const handleGeneralChange = (e) => {
    const { name, value } = e.target;
    setGeneralInfo((prev) => ({ ...prev, [name]: value }));
  };

  const handleDocExtracted = useCallback(async (data) => {
    await applyRegistrationData(data);
  }, [applyRegistrationData]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (registrationComplete) return;

    if (!docReady) {
      showToast(`Please upload required documents: ${missingDocs.join(', ')}`, 'error');
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
    };

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
        setShowEmailOtp(true);
        setOtpTimer(120);
        setIsResendActive(false);
      } else {
        showToast(res.error || 'Unexpected step received.', 'error');
      }
    } catch (err) {
      showToast('System error: ' + err.message, 'error');
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
        showToast('Email OTP failed: ' + (res.error || 'Unknown error'), 'error');
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
        setShowMobileOtp(false);
        setMobileOtp('');
        setOtpTimer(0);
        setIsResendActive(false);

        if (res.step !== 'REGISTRATION_COMPLETE') {
          await window.pwp.registration.save({
            applicant_type: 'PWP',
            sub_applicant_type: 'Cement Co-processing',
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
        showToast('Mobile OTP failed: ' + (res.error || 'Unknown error'), 'error');
      }
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
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
      applicant_type: 'PWP',
      sub_applicant_type: 'Cement Co-processing',
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
      } else {
        showToast(loginRes.error || 'Could not start login flow', 'error');
      }
    } catch (err) {
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
      setLoginCaptchaError(res.error || 'Invalid captcha. Please try again.');
    } catch (err) {
      setLoginCaptchaError(err.message);
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

      if (res.success && res.step === 'APPLICATION_ONBOARDING_COMPLETE') {
        setShowLoginOtpModal(false);
        setLoginOtp('');
        showToast(
          `Application started! ${res.applicantType || 'PWP'} — ${res.subApplicantType || 'Cement Co-processing'} selected on CPCB portal. Browser is open.`,
          'success',
          { duration: 15000 }
        );
        return;
      }

      if (res.success && res.step === 'LOGIN_COMPLETE') {
        setShowLoginOtpModal(false);
        setLoginOtp('');
        showToast(
          `Login complete! Browser is open${savedCeprId ? ` for CEPR ID ${savedCeprId}` : ''} — continue on portal.`,
          'success',
          { duration: 15000 }
        );
        return;
      }

      setLoginOtpError(res.error || 'Login OTP verification failed');
    } catch (err) {
      setLoginOtpError(err.message);
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
        await saveRegistrationSnapshot(res.ceprId, res.screenshotPath);
        showToast(
          `Registration complete! CEPR ID: ${res.ceprId || 'saved'}${res.screenshotPath ? ' — screenshot saved' : ''}. Click New Application to login.`,
          'success',
          { duration: 15000 }
        );
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
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 relative">
      <Toast toast={toast} onClose={hideToast} />

      <h2 className="text-lg font-semibold text-slate-800 mb-1">PWP & Cement Co-processing Registration</h2>
      <p className="text-sm text-slate-500 mb-6">
        {registrationComplete
          ? 'Registration is complete. Review saved details below and start a new application when ready.'
          : 'Upload documents for auto-fill, then complete General Information & contact details.'}
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
              Email, mobile and password are saved below. Click <strong>New Application</strong> to login with captcha &amp; OTP.
            </p>
          </div>
        </div>
      )}

      {usingDummy && !registrationComplete && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex items-start gap-2">
          <FlaskConical size={16} className="mt-0.5 flex-shrink-0 text-amber-600" />
          <span>
            <strong>Test mode:</strong> Using dummy registration data (GST {REGISTRATION_DUMMY_DATA.gstin}).
            Upload documents anytime to replace with real extracted data.
          </span>
        </div>
      )}

      {!registrationComplete && (
        <div className="mb-6 pb-6 border-b border-slate-100">
          <RegistrationDocUpload onExtracted={handleDocExtracted} showToast={showToast} />
        </div>
      )}

      <div className="mb-6">
        <AutoFilledPreview data={autoData} isDummy={usingDummy} />
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        <div>
          <h3 className="text-md font-medium text-slate-800 mb-1 flex items-center gap-2">
            <Building2 size={16} className="text-green-600" />
            General Information
            <span className="text-xs font-normal text-slate-400">(Step 2 — CPCB portal fields)</span>
          </h3>

          <p className="text-xs text-slate-500 mb-4">
            Company Details — blank fields from CPCB portal. Auto-filled where possible from documents.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Type of Business *</label>
              <select
                name="typeOfBusiness"
                value={generalInfo.typeOfBusiness}
                onChange={handleGeneralChange}
                className={lockedSelectClass}
                disabled={registrationComplete}
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
                disabled={registrationComplete}
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
                disabled={registrationComplete}
                readOnly={registrationComplete}
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
                disabled={registrationComplete}
                readOnly={registrationComplete}
              />
            </div>
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
                disabled={registrationComplete}
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
                value={generalInfo.district}
                onChange={handleGeneralChange}
                type="text"
                placeholder="Enter district"
                className={lockedInputClass}
                disabled={registrationComplete}
                readOnly={registrationComplete}
                required
              />
            </div>
          </div>

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
                disabled={registrationComplete}
                readOnly={registrationComplete}
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
                  readOnly={registrationComplete}
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
                  readOnly={registrationComplete}
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
                disabled={registrationComplete}
                readOnly={registrationComplete}
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
                disabled={registrationComplete}
                readOnly={registrationComplete}
                required
              />
            </div>
          </div>
        </div>

        {!docReady && missingDocs.length > 0 && !usingDummy && !registrationComplete && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Missing documents: {missingDocs.map((d) => d.replace('_', ' ')).join(', ')}
          </div>
        )}

        <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            disabled={loading && !registrationComplete}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50"
          >
            {registrationComplete ? 'Back' : 'Cancel'}
          </button>
          {registrationComplete ? (
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
          ) : (
            <button
              type="submit"
              disabled={loading || !docReady}
              className="inline-flex items-center gap-2 px-6 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 shadow-sm disabled:opacity-50"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Phone size={16} />}
              Start Registration
            </button>
          )}
        </div>
      </form>

      {loading && !showEmailOtp && !showMobileOtp && !showCaptchaModal && !showLoginCaptchaModal && !showLoginOtpModal && (
        <div className="absolute inset-0 bg-white/80 z-10 flex flex-col items-center justify-center rounded-xl">
          <Loader2 size={32} className="animate-spin text-green-600 mb-4" />
          <p className="text-slate-700 font-medium">{loadingMsg}</p>
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
              {otpSubmitting && loadingMsg && (
                <div className="mt-4 rounded-lg border border-green-200 bg-green-50 px-3 py-2">
                  <p className="text-xs font-medium text-green-800 flex items-center gap-2">
                    <Loader2 size={12} className="animate-spin shrink-0" />
                    Automation in progress
                  </p>
                  <p className="text-xs text-green-700 mt-1 break-words">{loadingMsg}</p>
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
              {captchaSubmitting && loadingMsg && (
                <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2">
                  <p className="text-xs font-medium text-green-800 flex items-center gap-2">
                    <Loader2 size={12} className="animate-spin shrink-0" />
                    Automation in progress
                  </p>
                  <p className="text-xs text-green-700 mt-1 break-words">{loadingMsg}</p>
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
              {loginCaptchaSubmitting && loadingMsg && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
                  <p className="text-xs font-medium text-blue-800 flex items-center gap-2">
                    <Loader2 size={12} className="animate-spin shrink-0" />
                    Automation in progress
                  </p>
                  <p className="text-xs text-blue-700 mt-1 break-words">{loadingMsg}</p>
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
              {loginOtpSubmitting && loadingMsg && (
                <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
                  <p className="text-xs font-medium text-blue-800 flex items-center gap-2">
                    <Loader2 size={12} className="animate-spin shrink-0" />
                    Automation in progress
                  </p>
                  <p className="text-xs text-blue-700 mt-1 break-words">{loadingMsg}</p>
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
    </div>
  );
}
