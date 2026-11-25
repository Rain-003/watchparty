import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Lock, Eye, EyeOff, Film, ArrowRight, ShieldCheck, Loader2, Mail, KeyRound, ArrowLeft } from 'lucide-react';

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
  const [otpEmail, setOtpEmail] = useState('');
  const [devOtpNotice, setDevOtpNotice] = useState<string | null>(null);

  const triggerError = (msg = 'Invalid passcode. Please check with your host.') => {
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

      // Triggered Owner 2FA OTP flow
      if (res.requiresOtp) {
        setOtpStep(true);
        setOtpEmail(res.email || 'wrainmacalindong@gmail.com');
        setDevOtpNotice(res.devOtp || null);
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
        triggerError(res.error || 'Invalid verification code. Please try again.');
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
    setDevOtpNotice(null);
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 bg-[#08080a] bg-cinema-grid overflow-hidden">
      {/* Subtle theater ambient backdrop */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[350px] bg-amber-500/[0.04] blur-[120px] rounded-full pointer-events-none" />

      <div className={`relative w-full max-w-[420px] ${shake ? 'animate-shake' : ''}`}>
        {/* Screening Card */}
        <div className="border border-zinc-800/80 bg-zinc-950/80 backdrop-blur-xl rounded-xl sm:rounded-2xl p-5 sm:p-7 shadow-2xl shadow-black/80">
          
          {/* Header */}
          <div className="flex items-center justify-between border-b border-zinc-900 pb-4 sm:pb-5 mb-5 sm:mb-6 gap-2">
            <div className="flex items-center space-x-2.5 sm:space-x-3 min-w-0 flex-1">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-amber-400 shrink-0">
                {otpStep ? <Mail className="w-4 h-4 text-amber-400" /> : <Film className="w-4 h-4" />}
              </div>
              <div className="min-w-0">
                <h1 className="text-xs sm:text-sm font-semibold tracking-wide text-zinc-100 uppercase truncate max-w-[140px] xs:max-w-[190px] sm:max-w-none">
                  {otpStep ? '2FA Security Gate' : settings.title}
                </h1>
                <p className="text-[10px] sm:text-[11px] font-mono text-zinc-500 uppercase tracking-wider truncate">
                  {otpStep ? 'Owner Verification' : 'Private Screening Room'}
                </p>
              </div>
            </div>

            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-zinc-900 text-zinc-400 border border-zinc-800 shrink-0">
              <span className={`w-1.5 h-1.5 rounded-full mr-1.5 animate-pulse ${otpStep ? 'bg-amber-400' : 'bg-emerald-500'}`} />
              <span className="hidden xs:inline">{otpStep ? '2FA ' : 'PORTAL '}</span>{otpStep ? 'ACTIVE' : 'READY'}
            </span>
          </div>

          {/* Form Content: Step 1 (Passcode) vs Step 2 (Owner OTP) */}
          {!otpStep ? (
            <form onSubmit={handlePasscodeSubmit} className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label 
                    htmlFor="passcode-input"
                    className="text-xs font-medium text-zinc-300 tracking-wide"
                  >
                    Passcode
                  </label>
                  <span className="text-[11px] font-mono text-zinc-500">
                    Viewer or Host Access
                  </span>
                </div>

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
                    placeholder="Enter passcode to enter..."
                    className={`w-full pl-10 pr-10 py-3 bg-zinc-900/90 border rounded-xl text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none transition-all duration-200 ${
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
                    {errorMessage || 'Invalid passcode. Please check with your host.'}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 px-4 bg-zinc-100 hover:bg-white text-zinc-950 font-medium text-sm rounded-xl transition-all duration-150 flex items-center justify-center space-x-2 group active:scale-[0.99] shadow-lg shadow-white/5 disabled:opacity-70 disabled:cursor-not-allowed"
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
            /* STEP 2: 2FA EMAIL OTP VERIFICATION */
            <form onSubmit={handleOtpSubmit} className="space-y-4 animate-fade-in">
              <div className="p-3 bg-amber-950/20 border border-amber-800/40 rounded-xl space-y-1">
                <span className="text-[11px] font-semibold text-amber-300 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Owner 2FA Verification
                </span>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  A single-use 6-digit OTP code has been dispatched to:
                </p>
                <div className="font-mono text-xs text-amber-200 bg-zinc-900/80 px-2 py-1 rounded border border-zinc-800 truncate">
                  {otpEmail}
                </div>
              </div>

              {devOtpNotice && (
                <div className="p-2.5 bg-zinc-900 border border-amber-500/40 rounded-lg text-left">
                  <span className="block text-[10px] font-mono text-amber-400 uppercase tracking-wider font-semibold">
                    💡 Test Mode Notice:
                  </span>
                  <p className="text-[11px] text-zinc-300 mt-0.5">
                    Email dispatch active. Generated code: <strong className="font-mono text-amber-300 tracking-wider text-xs bg-zinc-950 px-1.5 py-0.5 rounded border border-zinc-800">{devOtpNotice}</strong>
                  </p>
                </div>
              )}

              <div>
                <label 
                  htmlFor="otp-input"
                  className="block text-xs font-medium text-zinc-300 tracking-wide mb-1.5"
                >
                  Enter 6-Digit Verification Code
                </label>

                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-500 group-focus-within:text-amber-400 transition-colors">
                    <KeyRound className="w-4 h-4" />
                  </div>
                  <input
                    id="otp-input"
                    type="text"
                    maxLength={6}
                    value={otpCode}
                    disabled={isSubmitting}
                    onChange={(e) => {
                      setOtpCode(e.target.value.replace(/\D/g, ''));
                      if (error) setError(false);
                    }}
                    autoFocus
                    placeholder="• • • • • •"
                    className={`w-full pl-10 pr-4 py-3 bg-zinc-900/90 border rounded-xl text-center text-lg font-mono tracking-[0.4em] text-amber-300 placeholder-zinc-700 focus:outline-none transition-all duration-200 ${
                      error
                        ? 'border-red-500/80 ring-1 ring-red-500/30'
                        : 'border-zinc-800 focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/20'
                    }`}
                  />
                </div>

                {error && (
                  <p className="mt-2 text-xs text-red-400 flex items-center gap-1.5 font-medium">
                    <span className="w-1 h-1 rounded-full bg-red-400 inline-block" />
                    {errorMessage || 'Invalid verification code.'}
                  </p>
                )}
              </div>

              <div className="space-y-2 pt-1">
                <button
                  type="submit"
                  disabled={isSubmitting || otpCode.length < 6}
                  className="w-full py-3 px-4 bg-amber-400 hover:bg-amber-300 text-zinc-950 font-semibold text-sm rounded-xl transition-all duration-150 flex items-center justify-center space-x-2 group active:scale-[0.99] shadow-lg shadow-amber-500/10 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-zinc-950" />
                      <span>Authorizing Owner...</span>
                    </>
                  ) : (
                    <>
                      <span>Verify & Enter Command Center</span>
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleBackToPasscode}
                  className="w-full py-2 text-xs text-zinc-400 hover:text-zinc-200 transition-colors flex items-center justify-center gap-1"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Back to Passcode Entry
                </button>
              </div>
            </form>
          )}

          {/* Footer note */}
          <div className="mt-6 pt-4 border-t border-zinc-900/80 flex items-center justify-between text-[11px] text-zinc-500 font-mono">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              HMAC SHA-256 + 2FA
            </span>
            <span className="text-zinc-600">
              Anti-Breach Protected
            </span>
          </div>
        </div>

        {/* Ambient bottom caption */}
        <p className="text-center text-[11px] text-zinc-600 mt-4 tracking-wider uppercase font-mono">
          Direct Video Pipeline • Zero Distraction
        </p>
      </div>
    </div>
  );
};
