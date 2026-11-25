import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Lock, Eye, EyeOff, Film, ArrowRight, Loader2, KeyRound, ArrowLeft } from 'lucide-react';

export const PasscodeGate: React.FC = () => {
  const { login, verifyOtp, settings } = useAuth();
  const [passcode, setPasscode] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [shake, setShake] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 2FA OTP State
  const [otpStep, setOtpStep] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpNotice, setOtpNotice] = useState<string | null>(null);

  const triggerError = (msg = 'Invalid passcode.') => {
    setError(true);
    setErrorMessage(msg);
    setShake(true);
    setTimeout(() => setShake(false), 500);
  };

  const handlePasscodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passcode.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setError(false);

    try {
      const res = await login(passcode);
      if (res.requiresOtp) {
        setOtpStep(true);
        if (res.deliveryNotice) {
          setOtpNotice(res.deliveryNotice);
        }
        return;
      }
      if (!res.success) {
        triggerError('Invalid passcode. Access denied.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setError(false);

    try {
      const res = await verifyOtp(otpCode);
      if (!res.success) {
        triggerError(res.error || 'Invalid code. Try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBackToPasscode = () => {
    setOtpStep(false);
    setOtpCode('');
    setError(false);
    setErrorMessage('');
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 bg-[#08080a] bg-cinema-grid overflow-hidden">
      {/* Subtle theater ambient backdrop */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[350px] bg-amber-500/[0.04] blur-[120px] rounded-full pointer-events-none" />

      <div className={`relative w-full max-w-[380px] ${shake ? 'animate-shake' : ''}`}>
        {/* Screening Card */}
        <div className="border border-zinc-800/80 bg-zinc-950/90 backdrop-blur-xl rounded-2xl p-6 sm:p-7 shadow-2xl shadow-black/80">
          
          {/* Header */}
          <div className="flex items-center space-x-3 pb-5 mb-5 border-b border-zinc-900">
            <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-amber-400 shrink-0">
              {otpStep ? <KeyRound className="w-5 h-5" /> : <Film className="w-5 h-5" />}
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-semibold tracking-wide text-zinc-100 uppercase truncate">
                {otpStep ? 'Security Verification' : settings.title}
              </h1>
              <p className="text-[11px] text-zinc-500 truncate">
                {otpStep ? 'Owner 2FA Gate' : 'Private Screening'}
              </p>
            </div>
          </div>

          {/* Form Content: Step 1 (Passcode) vs Step 2 (Owner OTP) */}
          {!otpStep ? (
            <form onSubmit={handlePasscodeSubmit} className="space-y-4">
              <div>
                <label 
                  htmlFor="passcode-input"
                  className="block text-xs font-medium text-zinc-300 mb-1.5"
                >
                  Passcode
                </label>

                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-500 group-focus-within:text-amber-400 transition-colors">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    id="passcode-input"
                    type={showPass ? 'text' : 'password'}
                    value={passcode}
                    disabled={isSubmitting}
                    onChange={(e) => {
                      setPasscode(e.target.value);
                      if (error) setError(false);
                    }}
                    autoFocus
                    placeholder="Enter passcode..."
                    className={`w-full pl-10 pr-10 py-2.5 bg-zinc-900/90 border rounded-xl text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none transition-all duration-200 ${
                      error
                        ? 'border-red-500/80 ring-1 ring-red-500/30'
                        : 'border-zinc-800 focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/20'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-zinc-500 hover:text-zinc-300 transition-colors"
                    tabIndex={-1}
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {error && (
                  <p className="mt-2 text-xs text-red-400 flex items-center gap-1.5 font-medium">
                    <span className="w-1 h-1 rounded-full bg-red-400 inline-block" />
                    {errorMessage}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-2.5 px-4 bg-zinc-100 hover:bg-white text-zinc-950 font-medium text-sm rounded-xl transition-all duration-150 flex items-center justify-center space-x-2 group active:scale-[0.99] shadow-lg shadow-white/5 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-zinc-900" />
                    <span>Verifying...</span>
                  </>
                ) : (
                  <>
                    <span>Enter Watchparty</span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                  </>
                )}
              </button>
            </form>
          ) : (
            /* STEP 2: 2FA VERIFICATION CODE ENTRY */
            <form onSubmit={handleOtpSubmit} className="space-y-4 animate-fade-in">
              {otpNotice && (
                <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-200/90 text-xs leading-relaxed">
                  {otpNotice}
                </div>
              )}

              <div>
                <label 
                  htmlFor="otp-input"
                  className="block text-xs font-medium text-zinc-300 mb-1.5"
                >
                  Enter Verification Code (or Master Key)
                </label>

                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-500 group-focus-within:text-amber-400 transition-colors">
                    <KeyRound className="w-4 h-4" />
                  </div>
                  <input
                    id="otp-input"
                    type="text"
                    value={otpCode}
                    disabled={isSubmitting}
                    onChange={(e) => {
                      setOtpCode(e.target.value);
                      if (error) setError(false);
                    }}
                    autoFocus
                    placeholder="6-digit code or Master Key..."
                    className={`w-full pl-10 pr-4 py-2.5 bg-zinc-900/90 border rounded-xl text-center text-sm font-mono tracking-[0.1em] text-amber-300 placeholder-zinc-700 focus:outline-none transition-all duration-200 ${
                      error
                        ? 'border-red-500/80 ring-1 ring-red-500/30'
                        : 'border-zinc-800 focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/20'
                    }`}
                  />
                </div>

                {error && (
                  <p className="mt-2 text-xs text-red-400 flex items-center gap-1.5 font-medium">
                    <span className="w-1 h-1 rounded-full bg-red-400 inline-block" />
                    {errorMessage}
                  </p>
                )}
              </div>

              <div className="space-y-2 pt-1">
                <button
                  type="submit"
                  disabled={isSubmitting || !otpCode.trim()}
                  className="w-full py-2.5 px-4 bg-amber-400 hover:bg-amber-300 text-zinc-950 font-semibold text-sm rounded-xl transition-all duration-150 flex items-center justify-center space-x-2 group active:scale-[0.99] shadow-lg shadow-amber-500/10 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-zinc-950" />
                      <span>Authorizing...</span>
                    </>
                  ) : (
                    <>
                      <span>Verify & Enter</span>
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleBackToPasscode}
                  className="w-full py-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors flex items-center justify-center gap-1"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Back
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
