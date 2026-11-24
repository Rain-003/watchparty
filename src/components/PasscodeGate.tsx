import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Lock, Eye, EyeOff, Film, ArrowRight, ShieldCheck } from 'lucide-react';

export const PasscodeGate: React.FC = () => {
  const { login, settings } = useAuth();
  const [passcode, setPasscode] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!passcode.trim()) return;

    const res = login(passcode);
    if (!res.success) {
      setError(true);
      setShake(true);
      setTimeout(() => setShake(false), 500);
    }
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
                <Film className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h1 className="text-xs sm:text-sm font-semibold tracking-wide text-zinc-100 uppercase truncate max-w-[140px] xs:max-w-[190px] sm:max-w-none">
                  {settings.title}
                </h1>
                <p className="text-[10px] sm:text-[11px] font-mono text-zinc-500 uppercase tracking-wider truncate">
                  Private Screening Room
                </p>
              </div>
            </div>

            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-zinc-900 text-zinc-400 border border-zinc-800 shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse" />
              <span className="hidden xs:inline">PORTAL </span>READY
            </span>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
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
                  Invalid passcode. Please check with your host.
                </p>
              )}
            </div>

            <button
              type="submit"
              className="w-full py-3 px-4 bg-zinc-100 hover:bg-white text-zinc-950 font-medium text-sm rounded-xl transition-all duration-150 flex items-center justify-center space-x-2 group active:scale-[0.99] shadow-lg shadow-white/5"
            >
              <span>Enter Watchparty</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </form>

          {/* Footer note */}
          <div className="mt-6 pt-4 border-t border-zinc-900/80 flex items-center justify-between text-[11px] text-zinc-500 font-mono">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-zinc-600" />
              Role Gated
            </span>
            <span className="text-zinc-600">
              Host / Viewer separation active
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
