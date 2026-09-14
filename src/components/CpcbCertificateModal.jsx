import { useEffect, useRef, useState } from 'react';
import {
  Award,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  X,
  Eye,
  EyeOff,
  Globe,
  RefreshCw,
  AlertCircle,
  KeyRound,
  ArrowRight,
  RotateCcw
} from 'lucide-react';

export default function CpcbCertificateModal({ isOpen, onClose }) {
  // phase: 'checking' | 'credentials' | 'captcha' | 'otp' | 'ready' | 'error'
  const [phase, setPhase] = useState('checking');
  const [busy, setBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  // Credentials
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);

  // Captcha State
  const [captchaImage, setCaptchaImage] = useState('');
  const [captchaText, setCaptchaText] = useState('');
  const [captchaRefreshing, setCaptchaRefreshing] = useState(false);

  // OTP State
  const [otpText, setOtpText] = useState('');
  const [otpTimer, setOtpTimer] = useState(600);
  const [resendingOtp, setResendingOtp] = useState(false);

  // Errors & Logs
  const [formError, setFormError] = useState('');
  const [logs, setLogs] = useState([
    { t: Date.now(), level: 'info', text: 'Initializing CPCB portal connection…' }
  ]);
  const logsEndRef = useRef(null);

  const addLog = (text, level = 'info') => {
    setLogs((prev) => [...prev, { t: Date.now(), level, text }]);
  };

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  useEffect(() => {
    if (!window.pwp?.scraper?.onLog) return undefined;
    return window.pwp.scraper.onLog((payload) => {
      if (payload?.text) addLog(payload.text, payload.level || 'info');
    });
  }, []);

  // OTP countdown timer
  useEffect(() => {
    if (phase !== 'otp' || otpTimer <= 0) return;
    const interval = setInterval(() => {
      setOtpTimer((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [phase, otpTimer]);

  // Check existing session & load stored credentials on modal open
  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;

    // Load saved registration credentials from database
    if (window.pwp?.registration?.get) {
      window.pwp.registration.get().then((res) => {
        if (!cancelled && res?.success && res?.data) {
          const reg = res.data;
          const savedId = reg.cepr_id || reg.general_info?.cepr_id || reg.general_info?.email || '';
          const savedPw = reg.password || reg.general_info?.password || '';
          if (savedId) setUserId((prev) => prev || savedId);
          if (savedPw) setPassword((prev) => prev || savedPw);
        }
      }).catch(() => {});
    }

    const checkSession = async () => {
      setPhase('checking');
      setFormError('');
      try {
        if (!window.pwp?.scraper?.checkCpcbSession) {
          if (!cancelled) {
            setPhase('credentials');
            addLog('CPCB automation ready. Please enter credentials.', 'info');
          }
          return;
        }

        const res = await window.pwp.scraper.checkCpcbSession({ type: 'dashboard' });
        if (cancelled) return;

        if (res?.loggedIn) {
          setPhase('ready');
          addLog('Active CPCB portal session found. You are already logged in!', 'success');
          addLog('Ready for certificate download / retrieval steps.', 'info');
        } else {
          setPhase('credentials');
          addLog('Not logged in. Enter CEPR User ID & Password to continue.', 'info');
        }
      } catch (err) {
        if (!cancelled) {
          setPhase('credentials');
          addLog(`Session check: ${err?.message || 'Login required.'}`, 'info');
        }
      }
    };

    checkSession();

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  // Step 1: Start Login Flow (Fills credentials on portal and fetches Captcha image)
  const handleStartLogin = async (e) => {
    e?.preventDefault?.();
    setFormError('');

    const id = userId.trim();
    if (!id || !password) {
      setFormError('CEPR User ID and Password are required.');
      return;
    }

    if (!window.pwp?.scraper?.startLoginFlow) {
      setFormError('Electron runtime required to launch CPCB automation.');
      addLog('startLoginFlow API not available.', 'error');
      return;
    }

    setBusy(true);
    setStatusMessage('Connecting to CPCB portal and loading Captcha…');
    addLog(`Opening CPCB portal for ${id}…`, 'info');

    try {
      const res = await window.pwp.scraper.startLoginFlow({
        ceprId: id,
        password,
      });

      if (res?.success && res?.step === 'WAITING_LOGIN_CAPTCHA') {
        setCaptchaImage(res.captchaImage || '');
        setCaptchaText('');
        setPhase('captcha');
        addLog('Login form filled. Please enter the Captcha code shown below.', 'success');
      } else if (res?.success && (res?.authenticated || res?.step === 'APPLICATION_ONBOARDING_COMPLETE')) {
        setPhase('ready');
        addLog('Already authenticated on CPCB portal!', 'success');
        addLog('Ready for certificate retrieval.', 'info');
      } else {
        const errMsg = res?.error || 'Could not start CPCB login flow.';
        setFormError(errMsg);
        addLog(errMsg, 'error');
      }
    } catch (err) {
      const errMsg = 'Login start error: ' + (err?.message || err);
      setFormError(errMsg);
      addLog(errMsg, 'error');
    } finally {
      setBusy(false);
      setStatusMessage('');
    }
  };

  // Refresh Captcha
  const handleRefreshCaptcha = async () => {
    setCaptchaRefreshing(true);
    setFormError('');
    addLog('Refreshing Captcha image…', 'info');
    try {
      const res = await window.pwp.scraper.refreshLoginCaptcha();
      if (res?.success && res?.captchaImage) {
        setCaptchaImage(res.captchaImage);
        setCaptchaText('');
        addLog('New Captcha loaded from portal.', 'success');
      } else {
        const errMsg = res?.error || 'Could not refresh captcha';
        setFormError(errMsg);
        addLog(errMsg, 'error');
      }
    } catch (err) {
      setFormError(err.message);
      addLog('Captcha refresh error: ' + err.message, 'error');
    } finally {
      setCaptchaRefreshing(false);
    }
  };

  // Step 2: Submit Captcha to request OTP
  const handleSubmitCaptcha = async (e) => {
    e?.preventDefault?.();
    const text = captchaText.trim();
    if (!text) {
      setFormError('Please enter the Captcha code');
      return;
    }

    setBusy(true);
    setFormError('');
    setStatusMessage('Submitting Captcha and requesting OTP…');
    addLog(`Submitting Captcha "${text}"…`, 'info');

    try {
      const res = await window.pwp.scraper.submitLoginCaptcha({
        captcha: text,
        ceprId: userId.trim(),
        password,
      });

      if (res?.success && res?.step === 'WAITING_LOGIN_OTP') {
        setPhase('otp');
        setOtpText('');
        setOtpTimer(600);
        addLog('OTP sent to registered Mobile / Email! Enter 6-digit OTP to complete login.', 'success');
      } else {
        if (res?.captchaImage) {
          setCaptchaImage(res.captchaImage);
        }
        setCaptchaText('');
        const errMsg = res?.error || 'Invalid Captcha. Please enter the new Captcha code.';
        setFormError(errMsg);
        addLog(errMsg, 'error');
      }
    } catch (err) {
      const errMsg = 'Captcha submit error: ' + (err?.message || err);
      setFormError(errMsg);
      addLog(errMsg, 'error');
    } finally {
      setBusy(false);
      setStatusMessage('');
    }
  };

  // Resend Login OTP
  const handleResendOtp = async () => {
    setResendingOtp(true);
    setFormError('');
    addLog('Requesting resend OTP from CPCB portal…', 'info');
    try {
      const res = await window.pwp.scraper.resendLoginOtp();
      if (res?.success) {
        setOtpTimer(600);
        addLog('New OTP sent successfully!', 'success');
      } else {
        const errMsg = res?.error || 'Could not resend OTP';
        setFormError(errMsg);
        addLog(errMsg, 'error');
      }
    } catch (err) {
      setFormError(err.message);
      addLog('Resend OTP error: ' + err.message, 'error');
    } finally {
      setResendingOtp(false);
    }
  };

  // Step 3: Submit OTP and Complete Login
  const handleSubmitOtp = async (e) => {
    e?.preventDefault?.();
    const otp = otpText.trim().replace(/\D/g, '');
    if (otp.length !== 6) {
      setFormError('Please enter a valid 6-digit OTP code');
      return;
    }

    setBusy(true);
    setFormError('');
    setStatusMessage('Verifying OTP on CPCB portal…');
    addLog(`Verifying OTP (${otp}) on CPCB portal…`, 'info');

    try {
      const res = await window.pwp.scraper.submitLoginOtp({
        otp,
        runOnboarding: false,
        autoScrape: false,
      });

      if (res?.success && (res?.authenticated || res?.step === 'LOGIN_OTP_VERIFIED')) {
        setPhase('ready');
        addLog('OTP verified successfully! CPCB Portal is logged in and ready.', 'success');
        addLog('Authenticated dashboard reached. Awaiting certificate instructions.', 'success');
      } else {
        const errMsg = res?.error || 'Login OTP verification failed. Check OTP and try again.';
        setFormError(errMsg);
        addLog(errMsg, 'error');
      }
    } catch (err) {
      const errMsg = 'OTP verify error: ' + (err?.message || err);
      setFormError(errMsg);
      addLog(errMsg, 'error');
    } finally {
      setBusy(false);
      setStatusMessage('');
    }
  };

  const formatTimer = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-emerald-50/80 via-teal-50/40 to-white">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-600 text-white rounded-xl shadow-md shadow-emerald-600/20 flex items-center justify-center">
              <Award size={22} className="stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900">Get EPR Certificate</h2>
                <span className="px-2 py-0.5 text-[11px] font-semibold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                  CPCB Portal
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Authenticate on CPCB portal with Captcha & OTP to fetch certificates
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Progress Steps Header */}
          <div className="flex items-center justify-between px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs">
            <div className={`flex items-center gap-1.5 font-medium ${phase === 'credentials' ? 'text-emerald-700 font-bold' : phase !== 'checking' ? 'text-slate-700' : 'text-slate-400'}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] ${phase === 'credentials' ? 'bg-emerald-600 text-white font-bold' : phase === 'captcha' || phase === 'otp' || phase === 'ready' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                1
              </span>
              <span>Credentials</span>
            </div>
            <ArrowRight size={14} className="text-slate-300" />
            <div className={`flex items-center gap-1.5 font-medium ${phase === 'captcha' ? 'text-emerald-700 font-bold' : phase === 'otp' || phase === 'ready' ? 'text-slate-700' : 'text-slate-400'}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] ${phase === 'captcha' ? 'bg-emerald-600 text-white font-bold' : phase === 'otp' || phase === 'ready' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                2
              </span>
              <span>Captcha</span>
            </div>
            <ArrowRight size={14} className="text-slate-300" />
            <div className={`flex items-center gap-1.5 font-medium ${phase === 'otp' ? 'text-emerald-700 font-bold' : phase === 'ready' ? 'text-slate-700' : 'text-slate-400'}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] ${phase === 'otp' ? 'bg-emerald-600 text-white font-bold' : phase === 'ready' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                3
              </span>
              <span>Verify OTP</span>
            </div>
            <ArrowRight size={14} className="text-slate-300" />
            <div className={`flex items-center gap-1.5 font-medium ${phase === 'ready' ? 'text-emerald-700 font-bold' : 'text-slate-400'}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] ${phase === 'ready' ? 'bg-emerald-600 text-white font-bold' : 'bg-slate-200 text-slate-600'}`}>
                ✓
              </span>
              <span>Logged In</span>
            </div>
          </div>

          {/* Phase 0: Checking Session */}
          {phase === 'checking' && (
            <div className="flex items-center gap-3 p-4 rounded-xl bg-slate-50 border border-slate-200 text-slate-600">
              <Loader2 size={20} className="animate-spin text-emerald-600 flex-shrink-0" />
              <div className="text-sm">
                <p className="font-semibold text-slate-800">Checking CPCB Login Session</p>
                <p className="text-xs text-slate-500">Detecting active session or saved credentials…</p>
              </div>
            </div>
          )}

          {/* Phase 1: Enter Credentials */}
          {phase === 'credentials' && (
            <form onSubmit={handleStartLogin} className="space-y-4 bg-slate-50/60 p-4 rounded-xl border border-slate-200">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    CEPR User ID / Email *
                  </label>
                  <input
                    type="text"
                    value={userId}
                    onChange={(e) => setUserId(e.target.value)}
                    placeholder="e.g. S202608-00002806"
                    disabled={busy}
                    className="w-full text-sm px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition disabled:bg-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    CPCB Portal Password *
                  </label>
                  <div className="relative">
                    <input
                      type={showPw ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter portal password"
                      disabled={busy}
                      className="w-full text-sm px-3 py-2 pr-9 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition disabled:bg-slate-100"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(!showPw)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
              </div>

              {formError && (
                <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 p-2.5 rounded-lg border border-red-200">
                  <AlertCircle size={15} className="flex-shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="flex items-center justify-between pt-1">
                <p className="text-[11px] text-slate-400">
                  Auto-fills credentials on portal and loads Captcha.
                </p>
                <button
                  type="submit"
                  disabled={busy}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors"
                >
                  {busy ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>{statusMessage || 'Connecting…'}</span>
                    </>
                  ) : (
                    <>
                      <span>Next: Get Captcha</span>
                      <ArrowRight size={14} />
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* Phase 2: Captcha Verification */}
          {phase === 'captcha' && (
            <form onSubmit={handleSubmitCaptcha} className="space-y-4 bg-emerald-50/40 p-5 rounded-xl border border-emerald-200">
              <div className="flex items-center justify-between pb-2 border-b border-emerald-100">
                <div className="flex items-center gap-2 text-emerald-900 font-bold text-sm">
                  <KeyRound size={16} className="text-emerald-600" />
                  <span>Enter CPCB Portal Captcha</span>
                </div>
                <button
                  type="button"
                  onClick={() => setPhase('credentials')}
                  className="text-xs text-slate-500 hover:text-slate-800 underline"
                >
                  Change Credentials
                </button>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-4">
                {/* Captcha Image */}
                <div className="flex items-center gap-2 bg-white p-2 rounded-xl border border-slate-200 shadow-sm">
                  {captchaImage ? (
                    <img
                      src={captchaImage}
                      alt="CPCB Captcha"
                      className="h-11 w-auto object-contain rounded select-none border border-slate-100"
                    />
                  ) : (
                    <div className="h-11 w-36 bg-slate-100 flex items-center justify-center text-xs text-slate-400">
                      No Captcha image
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={handleRefreshCaptcha}
                    disabled={captchaRefreshing || busy}
                    className="p-2 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition"
                    title="Refresh Captcha"
                  >
                    <RefreshCw size={16} className={captchaRefreshing ? 'animate-spin text-emerald-600' : ''} />
                  </button>
                </div>

                {/* Captcha Input */}
                <div className="flex-1 w-full">
                  <input
                    type="text"
                    value={captchaText}
                    onChange={(e) => setCaptchaText(e.target.value)}
                    placeholder="Enter characters from image"
                    autoFocus
                    disabled={busy}
                    className="w-full text-base font-mono uppercase tracking-wider px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition"
                  />
                </div>
              </div>

              {formError && (
                <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 p-2.5 rounded-lg border border-red-200">
                  <AlertCircle size={15} className="flex-shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="flex items-center justify-between pt-1">
                <p className="text-[11px] text-slate-500">
                  Captcha is case-sensitive and refreshes on each attempt.
                </p>
                <button
                  type="submit"
                  disabled={busy || !captchaText.trim()}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors"
                >
                  {busy ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>{statusMessage || 'Requesting OTP…'}</span>
                    </>
                  ) : (
                    <>
                      <span>Get OTP</span>
                      <ArrowRight size={14} />
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* Phase 3: OTP Verification */}
          {phase === 'otp' && (
            <form onSubmit={handleSubmitOtp} className="space-y-4 bg-teal-50/50 p-5 rounded-xl border border-teal-200">
              <div className="flex items-center justify-between pb-2 border-b border-teal-100">
                <div className="flex items-center gap-2 text-teal-900 font-bold text-sm">
                  <ShieldCheck size={18} className="text-teal-600" />
                  <span>Enter 6-Digit OTP</span>
                </div>
                <span className="text-xs font-mono font-semibold text-teal-700 bg-teal-100 px-2 py-0.5 rounded">
                  Time left: {formatTimer(otpTimer)}
                </span>
              </div>

              <div className="space-y-2">
                <p className="text-xs text-slate-600">
                  CPCB has sent an OTP to the authorized Mobile Number / Email ID.
                </p>
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    maxLength={6}
                    value={otpText}
                    onChange={(e) => setOtpText(e.target.value.replace(/\D/g, ''))}
                    placeholder="Enter 6-digit OTP"
                    autoFocus
                    disabled={busy}
                    className="w-full text-center tracking-[0.3em] font-mono text-lg font-bold px-4 py-2.5 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none transition"
                  />
                </div>
              </div>

              {formError && (
                <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 p-2.5 rounded-lg border border-red-200">
                  <AlertCircle size={15} className="flex-shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={resendingOtp || busy || otpTimer > 540}
                  className="inline-flex items-center gap-1.5 text-xs text-teal-700 hover:text-teal-900 disabled:text-slate-400 font-medium"
                >
                  <RotateCcw size={13} className={resendingOtp ? 'animate-spin' : ''} />
                  <span>Resend OTP</span>
                </button>
                <button
                  type="submit"
                  disabled={busy || otpText.length !== 6}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors"
                >
                  {busy ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>{statusMessage || 'Verifying…'}</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={14} />
                      <span>Verify OTP & Login</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* Phase 4: Success / Logged In State */}
          {phase === 'ready' && (
            <div className="p-5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 space-y-3 animate-in fade-in">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 bg-emerald-600 text-white rounded-lg">
                    <CheckCircle2 size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-emerald-900">CPCB Portal Login Successful</h3>
                    <p className="text-xs text-emerald-700 mt-0.5">
                      Session verified and active on the CPCB Portal.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setPhase('credentials')}
                  className="inline-flex items-center gap-1 text-xs text-emerald-700 hover:text-emerald-900 font-medium bg-emerald-100/70 hover:bg-emerald-200/70 px-2.5 py-1.5 rounded-lg transition"
                >
                  <RefreshCw size={12} />
                  Re-login
                </button>
              </div>

              <div className="bg-white/80 border border-emerald-200/80 rounded-lg p-3 text-xs space-y-1.5">
                <div className="flex items-center justify-between text-slate-600">
                  <span className="font-medium">User ID:</span>
                  <span className="font-mono font-bold text-slate-800">{userId || 'Active Session'}</span>
                </div>
                <div className="flex items-center justify-between text-slate-600">
                  <span className="font-medium">Portal Status:</span>
                  <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Authenticated & Ready
                  </span>
                </div>
              </div>

              <p className="text-xs text-emerald-800 font-medium bg-emerald-100/50 p-2.5 rounded-lg">
                🎯 <strong>Ready for Certificate Steps:</strong> Portal login complete ho chuka hai. Ab aap certificate download/fetch karne ke next steps bata sakte hain.
              </p>
            </div>
          )}

          {/* Activity Logs Console */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700">Automation & Session Logs</span>
              <span className="text-[10px] text-slate-400">Real-time status</span>
            </div>
            <div className="bg-slate-900 rounded-xl p-3.5 text-xs font-mono text-slate-200 max-h-36 overflow-y-auto space-y-1 border border-slate-800 shadow-inner">
              {logs.map((log, idx) => (
                <div
                  key={idx}
                  className={`flex items-start gap-2 leading-relaxed ${
                    log.level === 'error'
                      ? 'text-red-400 font-semibold'
                      : log.level === 'success'
                      ? 'text-emerald-400 font-medium'
                      : log.level === 'warn'
                      ? 'text-amber-400'
                      : 'text-slate-300'
                  }`}
                >
                  <span className="text-slate-500 text-[10px] select-none shrink-0 mt-0.5">
                    {new Date(log.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                  <span className="break-all">{log.text}</span>
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                phase === 'ready'
                  ? 'bg-emerald-500 animate-pulse'
                  : busy
                  ? 'bg-amber-500 animate-spin'
                  : 'bg-slate-400'
              }`}
            />
            <span className="text-xs font-medium text-slate-600">
              {phase === 'ready'
                ? 'CPCB Login Active (Ready for Certificate Steps)'
                : phase === 'captcha'
                ? 'Awaiting Captcha Input'
                : phase === 'otp'
                ? 'Awaiting OTP Verification'
                : busy
                ? 'Processing…'
                : 'Awaiting Credentials'}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold rounded-lg shadow-sm transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
