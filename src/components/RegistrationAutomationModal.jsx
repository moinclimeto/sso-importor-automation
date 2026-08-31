import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Sparkles,
  X,
} from 'lucide-react';

import {
  classifyAutomationLog,
  MAX_AUTOMATION_LOG_ITEMS,
} from '../utils/automationLogFilter.js';

function logTone(message = '', type = 'info') {
  if (type === 'error') return 'error';
  if (type === 'success') return 'success';
  const lower = String(message).toLowerCase();
  if (/^error:|failed|could not|not found|blocked/.test(lower)) return 'error';
  if (/verified|complete|success|accepted|done|sent/.test(lower)) return 'success';
  return 'info';
}

function LogIcon({ tone }) {
  if (tone === 'success') return <CheckCircle2 size={14} className="text-green-500 shrink-0 mt-0.5" />;
  if (tone === 'error') return <AlertCircle size={14} className="text-red-500 shrink-0 mt-0.5" />;
  return <span className="w-3.5 h-3.5 rounded-full border-2 border-slate-300 shrink-0 mt-0.5" />;
}

export default function RegistrationAutomationModal({
  open,
  phase = 'running',
  currentStep = '',
  logs = [],
  loading = false,
  loadingMsg = '',
  onClose,
  title = 'CPCB Registration',
  subtitle = 'Live progress from the automation browser',
  completeMessage = 'CPCB account created successfully. Closing…',
  captchaStepHint = 'Enter the captcha to finish registration',
  submitCaptchaLabel = 'Submit Captcha',
  // Email OTP
  email = '',
  emailOtp = '',
  onEmailOtpChange,
  onVerifyEmailOtp,
  onResendEmailOtp,
  otpTimer = 0,
  isResendActive = false,
  formatTimer,
  otpSubmitting = false,
  otpResending = false,
  // Mobile OTP
  mobile = '',
  mobileOtp = '',
  onMobileOtpChange,
  onVerifyMobileOtp,
  onResendMobileOtp,
  // Captcha
  captchaImage = '',
  captchaText = '',
  onCaptchaTextChange,
  onSubmitCaptcha,
  onRefreshCaptcha,
  captchaError = '',
  captchaSubmitting = false,
  captchaRefreshing = false,
  otpError = '',
  // Login OTP (new application flow)
  loginOtp = '',
  onLoginOtpChange,
  onVerifyLoginOtp,
  onResendLoginOtp,
}) {
  const logsEndRef = useRef(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs, phase, currentStep]);

  if (!open) return null;

  const portalTarget = typeof document !== 'undefined' ? document.body : null;
  if (!portalTarget) return null;

  const phaseLabel = {
    running: 'Automation in progress',
    email_otp: 'Email OTP required',
    mobile_otp: 'Mobile OTP required',
    login_otp: 'Login OTP required',
    captcha: 'Captcha required',
    complete: 'Complete',
    error: 'Automation stopped',
  }[phase] || 'Automation';

  const phaseTone = phase === 'complete'
    ? 'text-green-700 bg-green-50 border-green-200'
    : phase === 'error'
      ? 'text-red-700 bg-red-50 border-red-200'
      : phase === 'running'
        ? 'text-blue-700 bg-blue-50 border-blue-200'
        : 'text-amber-700 bg-amber-50 border-amber-200';

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3 bg-slate-50">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {phase === 'complete' ? (
                <CheckCircle2 size={18} className="text-green-600 shrink-0" />
              ) : phase === 'error' ? (
                <AlertCircle size={18} className="text-red-600 shrink-0" />
              ) : (
                <Sparkles size={18} className="text-green-600 shrink-0" />
              )}
              <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
            </div>
            <p className="text-xs text-slate-500 mt-1">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close automation modal"
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        <div className={`mx-5 mt-4 rounded-lg border px-3 py-2.5 ${phaseTone}`}>
          <p className="text-xs font-semibold uppercase tracking-wide opacity-80">{phaseLabel}</p>
          <p className="text-sm font-medium mt-0.5 break-words">
            {phase === 'complete'
              ? completeMessage
              : phase === 'email_otp'
                ? `Enter the OTP sent to ${email}`
                : phase === 'mobile_otp'
                  ? `Enter the SMS OTP sent to ${mobile}`
                  : phase === 'login_otp'
                    ? 'Enter the 6-digit login OTP from email/SMS'
                    : phase === 'captcha'
                      ? captchaStepHint
                      : currentStep || loadingMsg || 'Starting automation…'}
          </p>
          {loading && phase === 'running' && (
            <p className="text-xs mt-1 flex items-center gap-1.5 opacity-80">
              <Loader2 size={12} className="animate-spin" />
              Working on CPCB portal…
            </p>
          )}
        </div>

        <div className="mx-5 mt-3 mb-3 rounded-lg border border-slate-200 bg-slate-50 overflow-hidden flex flex-col max-h-32">
          <div className="px-3 py-1.5 border-b border-slate-200 bg-white">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Progress</p>
          </div>
          <div className="overflow-y-auto p-2.5 space-y-1.5 min-h-[3rem]">
            {logs.length === 0 ? (
              <p className="text-xs text-slate-400 italic">Waiting for automation to start…</p>
            ) : (
              logs.map((log, index) => {
                const tone = logTone(log.message, log.type);
                return (
                  <div key={`${index}-${log.message}`} className="flex items-start gap-2 text-xs leading-snug">
                    <LogIcon tone={tone} />
                    <span
                      className={
                        tone === 'error'
                          ? 'text-red-700'
                          : tone === 'success'
                            ? 'text-green-700'
                            : 'text-slate-700'
                      }
                    >
                      {log.message}
                    </span>
                  </div>
                );
              })
            )}
            <div ref={logsEndRef} />
          </div>
        </div>

        {phase === 'email_otp' && (
          <div className="px-5 pb-4 space-y-3 border-t border-slate-100 pt-4">
            <input
              type="text"
              value={emailOtp}
              onChange={(e) => onEmailOtpChange?.(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !otpSubmitting && onVerifyEmailOtp?.()}
              placeholder="Enter Email OTP"
              disabled={otpSubmitting}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 outline-none disabled:opacity-60 ${
                otpError ? 'border-red-400 focus:ring-red-500' : 'border-slate-300'
              }`}
              autoFocus
            />
            <div className="flex items-center justify-between gap-3">
              {!isResendActive ? (
                <span className="text-xs text-slate-500">
                  Resend in <span className="font-medium">{formatTimer?.(otpTimer)}</span>
                </span>
              ) : (
                <button
                  type="button"
                  disabled={otpSubmitting}
                  onClick={onResendEmailOtp}
                  className="text-xs text-green-600 font-medium underline disabled:opacity-50"
                >
                  Resend OTP
                </button>
              )}
              <button
                type="button"
                onClick={onVerifyEmailOtp}
                disabled={otpSubmitting || !emailOtp?.trim()}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {otpSubmitting && <Loader2 size={14} className="animate-spin" />}
                Verify Email OTP
              </button>
            </div>
          </div>
        )}

        {phase === 'mobile_otp' && (
          <div className="px-5 pb-4 space-y-3 border-t border-slate-100 pt-4">
            <input
              type="text"
              value={mobileOtp}
              onChange={(e) => onMobileOtpChange?.(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !otpSubmitting && !otpResending && onVerifyMobileOtp?.()}
              placeholder={mobile ? `Enter OTP sent to ${mobile}` : 'Enter OTP sent to mobile number'}
              disabled={otpSubmitting}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 outline-none disabled:opacity-60 ${
                otpError ? 'border-red-400 focus:ring-red-500' : 'border-slate-300'
              }`}
              autoFocus
            />
            {otpResending && (
              <p className="text-xs text-slate-500 flex items-center gap-1.5">
                <Loader2 size={12} className="animate-spin" />
                Resending OTP on CPCB portal…
              </p>
            )}
            <div className="flex items-center justify-between gap-3">
              {!isResendActive ? (
                <span className="text-xs text-slate-500">
                  Resend in <span className="font-medium">{formatTimer?.(otpTimer)}</span>
                </span>
              ) : (
                <button
                  type="button"
                  disabled={otpSubmitting || otpResending}
                  onClick={onResendMobileOtp}
                  className="text-xs text-green-600 font-medium underline disabled:opacity-50"
                >
                  Resend OTP
                </button>
              )}
              <button
                type="button"
                onClick={onVerifyMobileOtp}
                disabled={otpSubmitting || otpResending || !mobileOtp?.trim()}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {otpSubmitting && <Loader2 size={14} className="animate-spin" />}
                Verify Mobile OTP
              </button>
            </div>
          </div>
        )}

        {phase === 'captcha' && (
          <div className="px-5 pb-4 space-y-3 border-t border-slate-100 pt-4">
            <div className="flex items-center gap-3">
              {captchaImage ? (
                <img src={captchaImage} alt="Captcha" className="h-12 border border-slate-200 rounded bg-white" />
              ) : (
                <div className="h-12 w-32 border border-dashed border-slate-300 rounded bg-white flex items-center justify-center text-xs text-slate-400">
                  No image
                </div>
              )}
              <button
                type="button"
                onClick={onRefreshCaptcha}
                disabled={captchaRefreshing || captchaSubmitting}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50"
              >
                {captchaRefreshing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                Refresh
              </button>
            </div>
            <input
              type="text"
              value={captchaText}
              onChange={(e) => onCaptchaTextChange?.(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onSubmitCaptcha?.()}
              placeholder="Enter captcha"
              maxLength={6}
              disabled={captchaSubmitting}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none disabled:opacity-60 uppercase tracking-widest"
              autoFocus
            />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onSubmitCaptcha}
                disabled={captchaSubmitting || !captchaText?.trim()}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {captchaSubmitting && <Loader2 size={14} className="animate-spin" />}
                {submitCaptchaLabel}
              </button>
            </div>
          </div>
        )}

        {phase === 'login_otp' && (
          <div className="px-5 pb-4 space-y-3 border-t border-slate-100 pt-4">
            <input
              type="text"
              inputMode="numeric"
              value={loginOtp}
              onChange={(e) => onLoginOtpChange?.(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={(e) => e.key === 'Enter' && !otpSubmitting && onVerifyLoginOtp?.()}
              placeholder="Enter 6-digit login OTP"
              disabled={otpSubmitting}
              maxLength={6}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 outline-none disabled:opacity-60 tracking-widest ${
                otpError ? 'border-red-400 focus:ring-red-500' : 'border-slate-300'
              }`}
              autoFocus
            />
            <div className="flex items-center justify-between gap-3">
              {!isResendActive ? (
                <span className="text-xs text-slate-500">
                  Resend in <span className="font-medium">{formatTimer?.(otpTimer)}</span>
                </span>
              ) : (
                <button
                  type="button"
                  disabled={otpSubmitting}
                  onClick={onResendLoginOtp}
                  className="text-xs text-green-600 font-medium underline disabled:opacity-50"
                >
                  Resend OTP
                </button>
              )}
              <button
                type="button"
                onClick={onVerifyLoginOtp}
                disabled={otpSubmitting || loginOtp.replace(/\D/g, '').length !== 6}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {otpSubmitting && <Loader2 size={14} className="animate-spin" />}
                Verify Login OTP
              </button>
            </div>
          </div>
        )}

        {phase === 'error' && (
          <div className="px-5 pb-4 border-t border-slate-100 pt-4 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>,
    portalTarget,
  );
}

export function appendAutomationLog(setter, message, type = 'info') {
  const text = String(message || '').trim();
  if (!text) return;
  const classified = classifyAutomationLog(text, type);
  if (!classified.addToList) return;
  setter((prev) => {
    const entry = {
      type: classified.type || logTone(text, type),
      message: classified.message || text,
    };
    if (prev.length && prev[prev.length - 1].message === entry.message) return prev;
    const next = [...prev, entry];
    return next.length > MAX_AUTOMATION_LOG_ITEMS ? next.slice(-MAX_AUTOMATION_LOG_ITEMS) : next;
  });
}

/** Apply backend/UI log text to modal state without noisy step spam. */
export function applyAutomationLogUpdate(setter, message, type = 'info') {
  const text = String(message || '').trim();
  if (!text) return { stepHint: '' };
  const classified = classifyAutomationLog(text, type);
  if (classified.addToList) {
    setter((prev) => {
      const entry = {
        type: classified.type || logTone(text, type),
        message: classified.message || text,
      };
      if (prev.length && prev[prev.length - 1].message === entry.message) return prev;
      const next = [...prev, entry];
      return next.length > MAX_AUTOMATION_LOG_ITEMS ? next.slice(-MAX_AUTOMATION_LOG_ITEMS) : next;
    });
  }
  return { stepHint: classified.stepHint || '' };
}
