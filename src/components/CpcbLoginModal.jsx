import { useEffect, useState, useRef } from 'react';
import RegistrationAutomationModal, { appendAutomationLog } from './RegistrationAutomationModal.jsx';

export default function CpcbLoginModal({ isOpen, onClose, onLoginSuccess }) {
  const [phase, setPhase] = useState('credentials'); // 'credentials' | 'running' | 'captcha' | 'login_otp' | 'complete' | 'error'
  const [logs, setLogs] = useState([]);
  const [currentStep, setCurrentStep] = useState('Enter CPCB credentials to sign in');
  const [loadingMsg, setLoadingMsg] = useState('Filling CEPR User ID and Password…');
  const [loading, setLoading] = useState(false);

  // Credentials
  const [ceprId, setCeprId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [credentialsError, setCredentialsError] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');

  // Captcha state
  const [captchaImage, setCaptchaImage] = useState('');
  const [captchaText, setCaptchaText] = useState('');
  const [captchaSubmitting, setCaptchaSubmitting] = useState(false);
  const [captchaRefreshing, setCaptchaRefreshing] = useState(false);
  const [captchaError, setCaptchaError] = useState('');

  // OTP state
  const [loginOtp, setLoginOtp] = useState('');
  const [otpTimer, setOtpTimer] = useState(600);
  const [isResendActive, setIsResendActive] = useState(false);
  const [otpSubmitting, setOtpSubmitting] = useState(false);
  const [otpError, setOtpError] = useState('');

  // Scraper logs listener
  useEffect(() => {
    if (!window.pwp?.scraper?.onLog) return undefined;
    return window.pwp.scraper.onLog((payload) => {
      if (payload?.text) {
        appendAutomationLog(setLogs, payload.text, payload.level || 'info');
      }
    });
  }, []);

  // OTP Timer countdown
  useEffect(() => {
    if (phase !== 'login_otp' || otpTimer <= 0) {
      if (otpTimer <= 0 && phase === 'login_otp') setIsResendActive(true);
      return;
    }
    const timer = setInterval(() => {
      setOtpTimer((prev) => {
        if (prev <= 1) {
          setIsResendActive(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [phase, otpTimer]);

  const formatTimer = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // On open, load saved credentials (if available) and stay on credentials phase
  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;

    setPhase('credentials');
    setLoading(false);
    setCurrentStep('Enter CPCB credentials to sign in');
    setLogs([]);
    setCaptchaText('');
    setLoginOtp('');
    setOtpError('');
    setCaptchaError('');
    setCredentialsError('');

    const loadSavedCredentials = async () => {
      try {
        if (window.pwp?.registration?.get) {
          const regRes = await window.pwp.registration.get();
          if (!cancelled && regRes?.success && regRes?.data) {
            const reg = regRes.data;
            const savedId = reg.cepr_id || reg.general_info?.cepr_id || reg.general_info?.email || '';
            const savedPw = reg.password || reg.general_info?.password || '';
            const savedEmail = reg.general_info?.email || reg.email || '';
            const savedMobile = reg.general_info?.mobile || reg.mobile || '';
            if (savedId) setCeprId(savedId);
            if (savedPw) setPassword(savedPw);
            if (savedEmail) setEmail(savedEmail);
            if (savedMobile) setMobile(savedMobile);
          }
        }
      } catch (err) {
        // ignore load errors
      }
    };

    loadSavedCredentials();

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  // Submit Credentials and Start Automation
  const handleStartLogin = async () => {
    const id = ceprId.trim();
    if (!id) {
      setCredentialsError('Please enter CEPR User ID or Email ID');
      return;
    }
    if (!password) {
      setCredentialsError('Please enter Password');
      return;
    }

    setCredentialsError('');
    setPhase('running');
    setLoading(true);
    setLoadingMsg('Filling CEPR User ID and Password…');
    setCurrentStep('Filling CEPR User ID and Password…');
    setLogs([]);
    setCaptchaText('');
    setLoginOtp('');
    setOtpError('');
    setCaptchaError('');

    appendAutomationLog(setLogs, 'Starting CPCB login automation…', 'info');
    appendAutomationLog(setLogs, 'Filling CEPR User ID and Password…', 'info');

    try {
      if (!window.pwp?.scraper?.startLoginFlow) {
        setPhase('error');
        setCurrentStep('Electron scraper API not available');
        appendAutomationLog(setLogs, 'Electron scraper API not available', 'error');
        setLoading(false);
        return;
      }

      const loginRes = await window.pwp.scraper.startLoginFlow({
        ceprId: id,
        password,
        email: email || id,
        mobile,
      });

      if (loginRes?.success && loginRes?.step === 'WAITING_LOGIN_CAPTCHA') {
        setCaptchaImage(loginRes.captchaImage || '');
        setCaptchaText('');
        setPhase('captcha');
        setCurrentStep('Enter captcha to request login OTP');
        appendAutomationLog(setLogs, 'Enter login captcha to continue', 'success');
      } else if (loginRes?.success && (loginRes?.authenticated || loginRes?.step === 'APPLICATION_ONBOARDING_COMPLETE')) {
        setPhase('complete');
        setCurrentStep('CPCB portal session active!');
        appendAutomationLog(setLogs, 'Already authenticated on CPCB portal', 'success');
        window.dispatchEvent(new CustomEvent('cpcb-session-updated', { detail: { loggedIn: true } }));
        onLoginSuccess?.();
        setTimeout(() => onClose?.(), 1500);
      } else {
        setPhase('error');
        const err = loginRes?.error || 'Could not start login flow';
        setCurrentStep(err);
        appendAutomationLog(setLogs, err, 'error');
      }
    } catch (err) {
      setPhase('error');
      const errText = 'Login error: ' + (err?.message || err);
      setCurrentStep(errText);
      appendAutomationLog(setLogs, errText, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Refresh Captcha
  const handleRefreshCaptcha = async () => {
    setCaptchaRefreshing(true);
    setCaptchaError('');
    try {
      const res = await window.pwp.scraper.refreshLoginCaptcha();
      if (res?.success && res?.captchaImage) {
        setCaptchaImage(res.captchaImage);
        setCaptchaText('');
        appendAutomationLog(setLogs, 'Captcha refreshed', 'info');
      } else {
        setCaptchaError(res?.error || 'Could not refresh captcha');
      }
    } catch (err) {
      setCaptchaError(err.message);
    } finally {
      setCaptchaRefreshing(false);
    }
  };

  // Submit Captcha
  const handleSubmitCaptcha = async () => {
    const text = captchaText.trim();
    if (!text) {
      setCaptchaError('Please enter captcha');
      return;
    }

    setCaptchaSubmitting(true);
    setCaptchaError('');
    setLoadingMsg('Submitting login captcha on CPCB portal…');
    try {
      const res = await window.pwp.scraper.submitLoginCaptcha({
        captcha: text,
        ceprId: ceprId.trim(),
        password,
      });

      if (res?.success && res?.step === 'WAITING_LOGIN_OTP') {
        setCaptchaText('');
        setLoginOtp('');
        setOtpError('');
        setOtpTimer(600);
        setIsResendActive(false);
        setPhase('login_otp');
        setCurrentStep('Enter the 6-digit login OTP from email/SMS');
        appendAutomationLog(setLogs, 'OTP sent — enter OTP in the app', 'success');
        appendAutomationLog(setLogs, 'Login OTP sent — enter OTP from email/SMS', 'success');
        return;
      }

      if (res?.captchaImage) {
        setCaptchaImage(res.captchaImage);
      }
      setCaptchaText('');
      const errMsg = res?.error || 'Invalid captcha. Please try again.';
      appendAutomationLog(setLogs, errMsg, 'error');
      setCurrentStep(errMsg);
    } catch (err) {
      setCaptchaError(err.message);
      appendAutomationLog(setLogs, 'Captcha submit error: ' + err.message, 'error');
    } finally {
      setCaptchaSubmitting(false);
      setLoadingMsg('');
    }
  };

  // Resend OTP
  const handleResendLoginOtp = async () => {
    try {
      const res = await window.pwp.scraper.resendLoginOtp();
      if (res?.success) {
        setOtpTimer(600);
        setIsResendActive(false);
        appendAutomationLog(setLogs, 'Login OTP resent on CPCB portal', 'success');
      } else {
        setOtpError(res?.error || 'Could not resend OTP');
      }
    } catch (err) {
      setOtpError(err.message);
    }
  };

  // Submit OTP
  const handleVerifyLoginOtp = async () => {
    const code = loginOtp.replace(/\D/g, '').slice(0, 6);
    if (code.length !== 6) {
      setOtpError('Please enter 6-digit OTP');
      return;
    }

    setOtpSubmitting(true);
    setOtpError('');
    setLoadingMsg('Verifying login OTP on CPCB portal…');
    try {
      const res = await window.pwp.scraper.submitLoginOtp({
        otp: code,
        autoScrape: false,
        runOnboarding: false,
      });

      if (res?.success && (res?.authenticated || res?.step === 'LOGIN_OTP_VERIFIED')) {
        setPhase('complete');
        setCurrentStep('CPCB portal login successful!');
        appendAutomationLog(setLogs, 'Login OTP verified on CPCB portal.', 'success');
        appendAutomationLog(setLogs, 'CPCB portal logged in successfully!', 'success');
        window.dispatchEvent(new CustomEvent('cpcb-session-updated', { detail: { loggedIn: true } }));
        onLoginSuccess?.();
        setTimeout(() => onClose?.(), 1500);
      } else {
        const errMsg = res?.error || 'Login OTP verification failed';
        setOtpError(errMsg);
        appendAutomationLog(setLogs, errMsg, 'error');
      }
    } catch (err) {
      const errMsg = 'OTP verify error: ' + err.message;
      setOtpError(errMsg);
      appendAutomationLog(setLogs, errMsg, 'error');
    } finally {
      setOtpSubmitting(false);
      setLoadingMsg('');
    }
  };

  return (
    <RegistrationAutomationModal
      open={isOpen}
      phase={phase}
      currentStep={currentStep}
      logs={logs}
      loading={loading || captchaSubmitting || otpSubmitting}
      loadingMsg={loadingMsg}
      onClose={onClose}
      title="CPCB Portal Login"
      subtitle="Enter credentials and view live progress"
      completeMessage="CPCB portal logged in successfully!"
      captchaStepHint="Enter captcha to request login OTP"
      submitCaptchaLabel="Get OTP"
      // Credentials Props
      ceprId={ceprId}
      onCeprIdChange={(val) => {
        setCeprId(val);
        if (credentialsError) setCredentialsError('');
      }}
      password={password}
      onPasswordChange={(val) => {
        setPassword(val);
        if (credentialsError) setCredentialsError('');
      }}
      showPassword={showPassword}
      onToggleShowPassword={() => setShowPassword((prev) => !prev)}
      onSubmitCredentials={handleStartLogin}
      credentialsError={credentialsError}
      submitCredentialsLabel="Proceed to Login"
      onRetryCredentials={() => {
        setPhase('credentials');
        setLoading(false);
        setCredentialsError('');
      }}
      // Captcha Props
      captchaImage={captchaImage}
      captchaText={captchaText}
      onCaptchaTextChange={setCaptchaText}
      onSubmitCaptcha={handleSubmitCaptcha}
      onRefreshCaptcha={handleRefreshCaptcha}
      captchaError={captchaError}
      captchaSubmitting={captchaSubmitting}
      captchaRefreshing={captchaRefreshing}
      // OTP Props
      loginOtp={loginOtp}
      onLoginOtpChange={setLoginOtp}
      onVerifyLoginOtp={handleVerifyLoginOtp}
      onResendLoginOtp={handleResendLoginOtp}
      otpTimer={otpTimer}
      isResendActive={isResendActive}
      formatTimer={formatTimer}
      otpSubmitting={otpSubmitting}
      otpError={otpError}
    />
  );
}
