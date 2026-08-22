import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import logo from '../assets/ClimetoTransparentLogo.png';
import { Toast, useToast } from '../components/Toast.jsx';

export default function LoginPage() {
  const { loginWithCredentials, isLoggedIn, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [forceConfirm, setForceConfirm] = useState(null);
  const { toast, showToast, hideToast } = useToast();

  useEffect(() => {
    if (!authLoading && isLoggedIn) navigate('/', { replace: true });
  }, [isLoggedIn, authLoading, navigate]);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const submitLogin = async ({ force = false } = {}) => {
    if (!form.email.trim() || !form.password) {
      showToast('Please enter email and password', 'error');
      return;
    }

    setLoading(true);
    setForceConfirm(null);

    try {
      const result = await loginWithCredentials({
        email: form.email.trim(),
        password: form.password,
        force,
      });

      if (result?.requiresConfirmation) {
        setForceConfirm(
          result.message
          || 'Already logged in elsewhere. Do you want to log out from that device and continue logging in here?',
        );
        return;
      }

      if (result?.success) {
        showToast(result.message || 'Login successful');
        setTimeout(() => navigate('/doc-processor'), 700);
        return;
      }

      showToast(result?.error || 'Invalid email or password', 'error');
    } catch (err) {
      showToast(err.message || 'Login failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    submitLogin();
  };

  const handleForceLogin = () => {
    submitLogin({ force: true });
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-green-900 to-slate-900 flex items-center justify-center">
        <p className="text-white text-sm">Loading session…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-green-900 to-slate-900 flex items-center justify-center p-4">
      <Toast toast={toast} onClose={hideToast} />

      <div className="w-full max-w-md">
        <div className="text-center mb-6 sm:mb-8">
          <img
            src={logo}
            alt="PWP Logo"
            className="mx-auto mb-3 sm:mb-4 h-auto w-44 sm:w-52 md:w-60 lg:w-64 max-w-[min(85vw,16rem)] object-contain"
          />
          <h1 className="text-2xl sm:text-3xl font-bold text-white">PWP</h1>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-xl font-semibold text-slate-800 mb-6">Sign in to your account</h2>

          {forceConfirm ? (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="mb-3">{forceConfirm}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="flex-1 rounded-lg bg-green-600 px-3 py-2 text-white hover:bg-green-700 disabled:opacity-60"
                  onClick={handleForceLogin}
                  disabled={loading}
                >
                  Continue here
                </button>
                <button
                  type="button"
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-slate-700 hover:bg-slate-50"
                  onClick={() => setForceConfirm(null)}
                  disabled={loading}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                placeholder="you@example.com"
                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                autoComplete="email"
                disabled={loading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  name="password"
                  value={form.password}
                  onChange={handleChange}
                  placeholder="••••••••"
                  className="w-full px-4 py-2.5 pr-11 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  autoComplete="current-password"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-medium py-2.5 rounded-lg transition-colors mt-2 disabled:opacity-60"
            >
              <LogIn size={18} />
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
