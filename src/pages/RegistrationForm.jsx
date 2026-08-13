import React, { useState, useEffect } from 'react';
import { usePageHeader } from '../context/PageHeaderContext.jsx';
import { useNavigate } from 'react-router-dom';
import { useToast, Toast } from '../components/Toast.jsx';
import { Loader2, X } from 'lucide-react';

export default function RegistrationForm() {
  const { setPageHeader } = usePageHeader();
  const navigate = useNavigate();
  const { toast, showToast, hideToast } = useToast();

  const [formData, setFormData] = useState({
    gstin: '',
    dateOfEstablishment: '',
    companyName: '',
    authPan: '',
    authName: '',
    authDob: '',
    email: '',
    mobile: ''
  });

  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  
  // OTP Dialog States
  const [showEmailOtp, setShowEmailOtp] = useState(false);
  const [emailOtp, setEmailOtp] = useState('');
  const [showMobileOtp, setShowMobileOtp] = useState(false);
  const [mobileOtp, setMobileOtp] = useState('');
  const [otpTimer, setOtpTimer] = useState(120);
  const [isResendActive, setIsResendActive] = useState(false);

  useEffect(() => {
    setPageHeader({
      title: 'Registration Form',
      subtitle: 'Complete your registration details',
      onBack: () => navigate(-1)
    });
    return () => setPageHeader(null);
  }, [setPageHeader, navigate]);

  useEffect(() => {
    let interval = null;
    if ((showEmailOtp || showMobileOtp) && otpTimer > 0) {
      interval = setInterval(() => {
        setOtpTimer((prev) => prev - 1);
      }, 1000);
    } else if (otpTimer === 0) {
      setIsResendActive(true);
      if (interval) clearInterval(interval);
    }
    return () => {
      if (interval) clearInterval(interval);
    }
  }, [showEmailOtp, showMobileOtp, otpTimer]);

  useEffect(() => {
    // Listen to scraper logs
    if (window.pwp?.scraper?.onLog) {
      const cleanup = window.pwp.scraper.onLog((msg) => {
        setLoadingMsg(msg);
      });
      return cleanup;
    }
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.gstin || !formData.email || !formData.mobile) {
      showToast('Please fill all required fields.', 'error');
      return;
    }
    
    if (formData.authDob) {
      const dobDate = new Date(formData.authDob);
      const today = new Date();
      let age = today.getFullYear() - dobDate.getFullYear();
      const m = today.getMonth() - dobDate.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < dobDate.getDate())) {
        age--;
      }
      if (age < 18) {
        showToast('Authorised Person age must be at least 18 years.', 'error');
        return;
      }
    }

    setLoading(true);
    setLoadingMsg('Starting automation process...');
    
    try {
      const res = await window.pwp.scraper.startRegistrationFlow(formData);
      if (res.success) {
        if (res.step === 'WAITING_EMAIL_OTP') {
          setShowEmailOtp(true);
          setOtpTimer(120);
          setIsResendActive(false);
        } else {
          showToast('Unexpected step received.', 'error');
        }
      } else {
        showToast('Registration failed: ' + res.error, 'error');
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
    if (!emailOtp) return;
    setLoading(true);
    setShowEmailOtp(false);
    setLoadingMsg('Verifying Email OTP...');
    try {
      const res = await window.pwp.scraper.submitEmailOtp(emailOtp);
      if (res.success && res.step === 'WAITING_MOBILE_OTP') {
        setShowMobileOtp(true);
        setOtpTimer(120);
        setIsResendActive(false);
      } else {
        showToast('Email OTP Verification failed: ' + res.error, 'error');
        // Let them try again
        setShowEmailOtp(true);
      }
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
      setShowEmailOtp(true);
    } finally {
      setLoading(false);
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
    if (!mobileOtp) return;
    setLoading(true);
    setShowMobileOtp(false);
    setLoadingMsg('Verifying Mobile OTP and Finalizing...');
    try {
      const res = await window.pwp.scraper.submitMobileOtp({
        mobile: formData.mobile,
        otp: mobileOtp
      });
      
      if (res.success && res.step === 'COMPLETED') {
        // Save to backend database since flow completed
        const dbRes = await window.pwp.registration.save({
          applicant_type: 'PWP',
          sub_applicant_type: 'Cement Co-processing'
        });
        
        if (dbRes.success) {
          showToast('Registration completed and saved successfully!', 'success');
          setTimeout(() => {
            navigate('/doc-processor');
          }, 2000);
        } else {
          showToast('Completed but failed to save in DB.', 'error');
        }
      } else {
        showToast('Mobile OTP Verification failed: ' + res.error, 'error');
        setShowMobileOtp(true);
      }
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
      setShowMobileOtp(true);
    } finally {
      setLoading(false);
    }
  };

  const formatTimer = (time) => {
    return Math.floor(time / 60).toString().padStart(2, '0') + ':' + (time % 60).toString().padStart(2, '0');
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 relative">
      <Toast toast={toast} onClose={hideToast} />
      
      <h2 className="text-lg font-semibold text-slate-800 mb-6">PWP & Cement Co-processing Registration</h2>
      
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Company GST Number *</label>
            <input 
              name="gstin"
              value={formData.gstin}
              onChange={handleChange}
              type="text" 
              placeholder="Enter Company GST Number"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-shadow uppercase"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Date Of Establishment *</label>
            <input 
              name="dateOfEstablishment"
              value={formData.dateOfEstablishment}
              onChange={handleChange}
              type="date" 
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-shadow"
              required
            />
          </div>
          
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1">Company Name *</label>
            <input 
              name="companyName"
              value={formData.companyName}
              onChange={handleChange}
              type="text" 
              placeholder="Enter Company Name"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-shadow uppercase"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Authorize Person PAN *</label>
            <input 
              name="authPan"
              value={formData.authPan}
              onChange={handleChange}
              type="text" 
              placeholder="Enter PAN Number"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-shadow uppercase"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Authorised Person Name *</label>
            <input 
              name="authName"
              value={formData.authName}
              onChange={handleChange}
              type="text" 
              placeholder="Enter Name"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-shadow uppercase"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Date of Birth *</label>
            <input 
              name="authDob"
              value={formData.authDob}
              onChange={handleChange}
              type="date" 
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-shadow"
              required
            />
          </div>
          
          <div className="md:col-span-2 pt-4 border-t border-slate-100">
            <h3 className="text-md font-medium text-slate-800 mb-4">Contact Details</h3>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email Address *</label>
            <input 
              name="email"
              value={formData.email}
              onChange={handleChange}
              type="email" 
              placeholder="Enter Email Address"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-shadow"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Mobile Number *</label>
            <input 
              name="mobile"
              value={formData.mobile}
              onChange={handleChange}
              type="tel" 
              placeholder="Enter Mobile Number"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-shadow"
              required
            />
          </div>
          
        </div>

        <div className="pt-6 border-t border-slate-100 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 px-6 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors shadow-sm disabled:opacity-50"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : null}
            Start Registration
          </button>
        </div>
      </form>
      
      {loading && (
        <div className="absolute inset-0 bg-white/80 z-10 flex flex-col items-center justify-center rounded-xl">
           <Loader2 size={32} className="animate-spin text-green-600 mb-4" />
           <p className="text-slate-700 font-medium">{loadingMsg}</p>
        </div>
      )}

      {showEmailOtp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-lg font-semibold text-slate-800">Email OTP</h3>
              <button onClick={() => setShowEmailOtp(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <div className="p-6">
              <p className="text-sm text-slate-600 mb-4">Please enter the OTP sent to {formData.email}</p>
              <input 
                type="text" 
                value={emailOtp}
                onChange={e => setEmailOtp(e.target.value)}
                placeholder="Enter Email OTP"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
              />
              <div className="mt-4 flex items-center justify-between text-sm">
                {!isResendActive ? (
                  <span className="text-slate-500">Resend OTP in <span className="font-medium text-slate-700">{formatTimer(otpTimer)}</span></span>
                ) : (
                  <button onClick={handleResendEmailOtp} className="text-green-600 font-medium hover:text-green-700 underline underline-offset-2">
                    Resend OTP
                  </button>
                )}
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button
                onClick={handleVerifyEmailOtp}
                className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
              >
                Verify
              </button>
            </div>
          </div>
        </div>
      )}

      {showMobileOtp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-lg font-semibold text-slate-800">Mobile OTP</h3>
              <button onClick={() => setShowMobileOtp(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <div className="p-6">
              <p className="text-sm text-slate-600 mb-4">Please enter the OTP sent to {formData.mobile}</p>
              <input 
                type="text" 
                value={mobileOtp}
                onChange={e => setMobileOtp(e.target.value)}
                placeholder="Enter Mobile OTP"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
              />
              <div className="mt-4 flex items-center justify-between text-sm">
                {!isResendActive ? (
                  <span className="text-slate-500">Resend OTP in <span className="font-medium text-slate-700">{formatTimer(otpTimer)}</span></span>
                ) : (
                  <button onClick={handleResendMobileOtp} className="text-green-600 font-medium hover:text-green-700 underline underline-offset-2">
                    Resend OTP
                  </button>
                )}
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button
                onClick={handleVerifyMobileOtp}
                className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
              >
                Verify & Finish
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
