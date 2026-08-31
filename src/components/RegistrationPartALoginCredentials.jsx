import { Eye, EyeOff, KeyRound } from 'lucide-react';

export default function RegistrationPartALoginCredentials({
  ceprId = '',
  password = '',
  onPasswordChange,
  showPassword = false,
  onToggleShowPassword,
  onBlur,
  inputClass = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm',
}) {
  return (
    <div className="md:col-span-2 rounded-xl border border-blue-200 bg-blue-50/50 p-4 space-y-4">
      <div>
        <h4 className="text-sm font-semibold text-blue-900 flex items-center gap-2">
          <KeyRound size={15} className="text-blue-700" />
          CPCB Portal Login *
        </h4>
        <p className="text-xs text-blue-800 mt-1">
          CEPR ID and password used to sign in on the CPCB portal when you click Register. Verify before starting automation.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">CEPR ID *</label>
          <input
            value={ceprId}
            type="text"
            readOnly
            placeholder="CEPR ID from registration"
            className={`${inputClass} bg-slate-50 text-slate-700 cursor-not-allowed font-mono`}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Password *</label>
          <div className="relative">
            <input
              value={password}
              onChange={(e) => onPasswordChange?.(e.target.value)}
              onBlur={onBlur}
              type={showPassword ? 'text' : 'password'}
              placeholder="Enter Password"
              className={`${inputClass} pr-10`}
              required
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={onToggleShowPassword}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              tabIndex={-1}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
