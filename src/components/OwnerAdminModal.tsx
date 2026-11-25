import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  ShieldAlert,
  ShieldCheck,
  Lock,
  Mail,
  Key,
  Radio,
  RefreshCw,
  X,
  AlertTriangle,
  CheckCircle2,
  Zap,
} from 'lucide-react';

interface OwnerAdminModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface AdminState {
  ownerEmail: string;
  hostPasscode: string;
  viewerPasscode: string;
  hostEpoch: number;
  lockdown: boolean;
}

export const OwnerAdminModal: React.FC<OwnerAdminModalProps> = ({ isOpen, onClose }) => {
  const { token, updateSettings } = useAuth();
  const [adminState, setAdminState] = useState<AdminState | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Form states
  const [newEmail, setNewEmail] = useState('');
  const [newHostPasscode, setNewHostPasscode] = useState('');
  const [newViewerPasscode, setNewViewerPasscode] = useState('');
  const [isRevoking, setIsRevoking] = useState(false);
  const [isTogglingLock, setIsTogglingLock] = useState(false);

  // Fetch admin status on open
  useEffect(() => {
    if (!isOpen || !token) return;

    const fetchAdminStatus = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/admin', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (res.ok) {
          const data: AdminState = await res.json();
          setAdminState(data);
          setNewEmail(data.ownerEmail);
          setNewHostPasscode(data.hostPasscode);
          setNewViewerPasscode(data.viewerPasscode);
        }
      } catch (err) {
        console.error('Failed to fetch admin status:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchAdminStatus();
  }, [isOpen, token]);

  const showNotice = (text: string, type: 'success' | 'error' = 'success') => {
    setStatusMessage({ text, type });
    setTimeout(() => setStatusMessage(null), 4000);
  };

  // 1. Emergency Host Revocation (Panic Button)
  const handleRevokeHosts = async () => {
    if (!window.confirm('⚠️ EMERGENCY ACTION:\n\nAre you sure you want to revoke all active Host sessions?\nThis will instantly kick all connected hosts and require re-authenticating.')) {
      return;
    }

    setIsRevoking(true);
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: 'revoke_hosts' }),
      });

      if (res.ok) {
        const data = await res.json();
        setAdminState(prev => prev ? { ...prev, hostEpoch: data.hostEpoch } : null);
        showNotice('🚨 All non-owner host sessions have been terminated immediately!');
      } else {
        showNotice('Failed to revoke host sessions.', 'error');
      }
    } catch {
      showNotice('Network error during revocation.', 'error');
    } finally {
      setIsRevoking(false);
    }
  };

  // 2. Toggle Room Lockdown
  const handleToggleLockdown = async () => {
    if (!adminState) return;
    setIsTogglingLock(true);
    const targetState = !adminState.lockdown;

    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: 'toggle_lockdown', lockdown: targetState }),
      });

      if (res.ok) {
        setAdminState(prev => prev ? { ...prev, lockdown: targetState } : null);
        showNotice(targetState ? '🔒 Room is now in EMERGENCY LOCKDOWN.' : '🔓 Emergency lockdown lifted.');
      }
    } catch {
      showNotice('Failed to update lockdown state.', 'error');
    } finally {
      setIsTogglingLock(false);
    }
  };

  // 3. Update Recovery / 2FA Email
  const handleSaveEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim() || !newEmail.includes('@')) {
      showNotice('Please enter a valid email address.', 'error');
      return;
    }

    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: 'update_email', newEmail }),
      });

      if (res.ok) {
        const data = await res.json();
        setAdminState(prev => prev ? { ...prev, ownerEmail: data.ownerEmail } : null);
        showNotice(`✉️ 2FA Recovery email updated to: ${data.ownerEmail}`);
      } else {
        showNotice('Failed to update email.', 'error');
      }
    } catch {
      showNotice('Network error updating email.', 'error');
    }
  };

  // 4. Update Live Passcodes
  const handleSavePasscodes = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: 'update_passcodes',
          hostPasscode: newHostPasscode,
          viewerPasscode: newViewerPasscode,
        }),
      });

      if (res.ok) {
        showNotice('🔑 Passcodes updated dynamically without redeploying!');
      } else {
        showNotice('Failed to update passcodes.', 'error');
      }
    } catch {
      showNotice('Network error updating passcodes.', 'error');
    }
  };

  // 5. Emergency Stream Takeover (Safe Standby)
  const handleTakeoverStream = async () => {
    if (window.confirm('Override active stream and switch to Safe Standby screen?')) {
      await updateSettings({
        title: 'Screening Standby (Owner Override)',
        embedUrl: 'https://www.youtube.com/embed/5qap5aO4i9A?autoplay=1&mute=0',
      });
      showNotice('⚡ Stream broadcast successfully reset to safe standby.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/90 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-xl bg-zinc-950 border border-amber-500/30 rounded-2xl shadow-2xl shadow-black/90 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-zinc-800/80 bg-gradient-to-r from-amber-950/20 via-zinc-950 to-zinc-950">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center space-x-2">
                <h2 className="text-sm sm:text-base font-bold text-zinc-100 tracking-wide">
                  Owner Command Center
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  TOP PRIVILEGE
                </span>
              </div>
              <p className="text-[11px] text-zinc-400">
                Breach mitigation, 2FA credentials & emergency room controls
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status Notification Banner */}
        {statusMessage && (
          <div className={`px-5 py-2.5 text-xs flex items-center gap-2 border-b transition-all ${
            statusMessage.type === 'success'
              ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800/50'
              : 'bg-red-950/40 text-red-300 border-red-800/50'
          }`}>
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
            )}
            <span>{statusMessage.text}</span>
          </div>
        )}

        {/* Scrollable Content */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6">
          {/* Telemetry Stat Bar */}
          <div className="grid grid-cols-3 gap-2.5 sm:gap-3 p-3 bg-zinc-900/60 border border-zinc-800/80 rounded-xl text-center">
            <div>
              <span className="block text-[10px] uppercase font-mono tracking-wider text-zinc-500">Security Epoch</span>
              <span className="text-xs sm:text-sm font-mono font-semibold text-zinc-200">
                Cycle #{adminState?.hostEpoch || 1}
              </span>
            </div>
            <div>
              <span className="block text-[10px] uppercase font-mono tracking-wider text-zinc-500">Room Status</span>
              <span className={`text-xs sm:text-sm font-semibold ${
                adminState?.lockdown ? 'text-red-400' : 'text-emerald-400'
              }`}>
                {adminState?.lockdown ? 'LOCKED DOWN' : 'OPERATIONAL'}
              </span>
            </div>
            <div>
              <span className="block text-[10px] uppercase font-mono tracking-wider text-zinc-500">2FA Protected</span>
              <span className="text-xs sm:text-sm font-semibold text-amber-400 flex items-center justify-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                ACTIVE
              </span>
            </div>
          </div>

          {/* Section 1: Emergency Breach Mitigation (Red Zone) */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-red-400 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />
              Emergency Breach Response
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Panic Button */}
              <button
                type="button"
                onClick={handleRevokeHosts}
                disabled={isRevoking}
                className="p-3.5 bg-red-950/30 hover:bg-red-950/60 border border-red-800/40 hover:border-red-600 rounded-xl text-left transition-all group"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-red-200 group-hover:text-red-100 flex items-center gap-1.5">
                    <Zap className="w-4 h-4 text-red-400" />
                    Revoke All Host Sessions
                  </span>
                  {isRevoking && <RefreshCw className="w-3.5 h-3.5 animate-spin text-red-400" />}
                </div>
                <p className="text-[11px] text-red-400/80 leading-relaxed">
                  Kill Switch: Instantly terminates every active Host session if a host passcode was compromised.
                </p>
              </button>

              {/* Lockdown Mode Toggle */}
              <button
                type="button"
                onClick={handleToggleLockdown}
                disabled={isTogglingLock}
                className={`p-3.5 border rounded-xl text-left transition-all group ${
                  adminState?.lockdown
                    ? 'bg-amber-950/40 border-amber-600/60'
                    : 'bg-zinc-900/60 border-zinc-800 hover:border-zinc-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-xs font-semibold flex items-center gap-1.5 ${
                    adminState?.lockdown ? 'text-amber-300' : 'text-zinc-200'
                  }`}>
                    <Lock className="w-4 h-4" />
                    {adminState?.lockdown ? 'Lift Room Lockdown' : 'Lockdown Room'}
                  </span>
                  {isTogglingLock && <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400" />}
                </div>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  {adminState?.lockdown
                    ? 'Screening room is currently frozen. Click to resume normal broadcasting for viewers.'
                    : 'Emergency freeze: Block all viewers from entering and hide the active stream immediately.'}
                </p>
              </button>
            </div>
          </div>

          {/* Section 2: 2FA Email & Recovery Settings */}
          <div className="space-y-3 pt-2 border-t border-zinc-800/80">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5" />
              Owner 2FA & Recovery Email
            </h3>

            <form onSubmit={handleSaveEmail} className="space-y-2">
              <label className="block text-[11px] text-zinc-400">
                All Owner login attempts will require a single-use 6-digit OTP dispatched to this address:
              </label>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="e.g. wrainmacalindong@gmail.com"
                  className="flex-1 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs font-mono text-zinc-200 focus:outline-none focus:border-amber-500/60"
                />
                <button
                  type="submit"
                  className="px-3.5 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-lg text-xs font-medium transition-colors"
                >
                  Save Email
                </button>
              </div>
              <p className="text-[10px] text-zinc-500">
                You can change this email anytime. The updated email takes effect immediately for the next login.
              </p>
            </form>
          </div>

          {/* Section 3: Live Passcode Rotation */}
          <div className="space-y-3 pt-2 border-t border-zinc-800/80">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-300 flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-zinc-400" />
              Rotate Live Passcodes
            </h3>

            <form onSubmit={handleSavePasscodes} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">
                    Live Host Passcode
                  </label>
                  <input
                    type="text"
                    value={newHostPasscode}
                    onChange={(e) => setNewHostPasscode(e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs font-mono text-amber-300 focus:outline-none focus:border-amber-500/60"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">
                    Live Viewer Passcode
                  </label>
                  <input
                    type="text"
                    value={newViewerPasscode}
                    onChange={(e) => setNewViewerPasscode(e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs font-mono text-zinc-200 focus:outline-none focus:border-amber-500/60"
                  />
                </div>
              </div>

              <div className="flex justify-between items-center">
                <button
                  type="button"
                  onClick={handleTakeoverStream}
                  className="text-[11px] text-zinc-400 hover:text-amber-400 flex items-center gap-1 underline underline-offset-4"
                >
                  <Radio className="w-3 h-3 text-red-400" />
                  Override stream with Safe Standby
                </button>

                <button
                  type="submit"
                  className="px-4 py-2 bg-zinc-100 hover:bg-white text-zinc-950 font-medium text-xs rounded-lg transition-colors shadow-sm"
                >
                  Apply Passcodes
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-zinc-800/80 bg-zinc-900/30 flex items-center justify-between text-[11px] text-zinc-500">
          <span className="flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
            Protected by Owner Master Key & 2FA OTP
          </span>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-200"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
