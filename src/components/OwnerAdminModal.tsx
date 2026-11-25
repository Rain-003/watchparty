import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { HostGrant } from '../types';
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
  UserPlus,
  Copy,
  Check,
  Trash2,
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
  hostGrants?: HostGrant[];
  supabaseConnected?: boolean;
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
  const [isGeneratingGrant, setIsGeneratingGrant] = useState(false);
  const [newGrantCode, setNewGrantCode] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

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

  // 6. Generate 1-Time Host Grant Code & Link
  const handleGenerateGrant = async () => {
    setIsGeneratingGrant(true);
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: 'generate_host_grant' }),
      });

      if (res.ok) {
        const data = await res.json();
        setNewGrantCode(data.grant.code);
        setAdminState(prev => {
          if (!prev) return null;
          return {
            ...prev,
            hostGrants: [...(prev.hostGrants || []), data.grant],
          };
        });
        showNotice(`🎟️ 1-Time Host Grant Code created: ${data.grant.code}`);
      } else {
        showNotice('Failed to generate host grant.', 'error');
      }
    } catch {
      showNotice('Network error creating host grant.', 'error');
    } finally {
      setIsGeneratingGrant(false);
    }
  };

  // 7. Revoke an Individual Host Grant / Device
  const handleRevokeGrant = async (grantId: string) => {
    if (!window.confirm('Revoke this host device authorization? They will immediately lose host access.')) {
      return;
    }

    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: 'revoke_host_grant', grantId }),
      });

      if (res.ok) {
        setAdminState(prev => {
          if (!prev) return null;
          return {
            ...prev,
            hostGrants: (prev.hostGrants || []).map(g => g.id === grantId ? { ...g, revoked: true } : g),
          };
        });
        showNotice('🚫 Host device access revoked.');
      } else {
        showNotice('Failed to revoke host grant.', 'error');
      }
    } catch {
      showNotice('Network error revoking host grant.', 'error');
    }
  };

  // Copy grant invite link or code to clipboard
  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(label);
    setTimeout(() => setCopiedCode(null), 2500);
    showNotice(`Copied to clipboard: ${label}`);
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
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 bg-zinc-900/60 border border-zinc-800/80 rounded-xl text-center">
            <div>
              <span className="block text-[10px] uppercase font-mono tracking-wider text-zinc-500">Database</span>
              <span className={`text-xs font-mono font-semibold flex items-center justify-center gap-1 ${
                adminState?.supabaseConnected ? 'text-emerald-400' : 'text-amber-400'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${adminState?.supabaseConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                {adminState?.supabaseConnected ? 'SUPABASE' : 'FALLBACK'}
              </span>
            </div>
            <div>
              <span className="block text-[10px] uppercase font-mono tracking-wider text-zinc-500">Room Status</span>
              <span className={`text-xs font-semibold ${
                adminState?.lockdown ? 'text-red-400' : 'text-emerald-400'
              }`}>
                {adminState?.lockdown ? 'LOCKED DOWN' : 'ACTIVE'}
              </span>
            </div>
            <div>
              <span className="block text-[10px] uppercase font-mono tracking-wider text-zinc-500">Session Epoch</span>
              <span className="text-xs font-mono font-semibold text-zinc-200">
                Cycle #{adminState?.hostEpoch || 1}
              </span>
            </div>
            <div>
              <span className="block text-[10px] uppercase font-mono tracking-wider text-zinc-500">Security</span>
              <span className="text-xs font-semibold text-amber-400 flex items-center justify-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                2FA ARMED
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

          {/* Section: 1-Time Host Device Grants */}
          <div className="space-y-3 pt-3 border-t border-zinc-800/80">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                  <UserPlus className="w-3.5 h-3.5" />
                  1-Time Host Device Grants
                </h3>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Grant a co-host permanent access. When they claim it on their device, they stay authorized forever.
                </p>
              </div>

              <button
                type="button"
                onClick={handleGenerateGrant}
                disabled={isGeneratingGrant}
                className="px-3.5 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-xl text-xs font-medium transition-colors shrink-0 flex items-center gap-1.5 self-start sm:self-auto disabled:opacity-50"
              >
                <UserPlus className="w-3.5 h-3.5" />
                {isGeneratingGrant ? 'Creating...' : '+ Generate 1-Time Link'}
              </button>
            </div>

            {/* If a new grant was just generated, show full share link & code */}
            {newGrantCode && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-2 animate-fade-in">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-amber-200">
                    🎟️ Single-Use Host Invite Link Ready:
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300">
                    Single-Use
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={`${window.location.origin}/?grant=${newGrantCode}`}
                    className="flex-1 px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs font-mono text-amber-300 select-all"
                  />
                  <button
                    type="button"
                    onClick={() => handleCopy(`${window.location.origin}/?grant=${newGrantCode}`, 'Invite Link')}
                    className="px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-zinc-950 font-semibold text-xs rounded-lg flex items-center gap-1 transition-colors"
                  >
                    {copiedCode === 'Invite Link' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedCode === 'Invite Link' ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <p className="text-[10px] text-zinc-400">
                  Send this link to your trusted co-host. Once opened, their device is permanently authorized as a Host!
                </p>
              </div>
            )}

            {/* List of active / past grants */}
            {adminState?.hostGrants && adminState.hostGrants.length > 0 && (
              <div className="space-y-1.5 mt-2 max-h-36 overflow-y-auto pr-1">
                {adminState.hostGrants.map((grant) => (
                  <div
                    key={grant.id}
                    className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs font-mono transition-colors ${
                      grant.revoked
                        ? 'bg-zinc-900/40 border-zinc-900 text-zinc-600 line-through'
                        : grant.claimed
                        ? 'bg-emerald-950/20 border-emerald-900/30 text-emerald-300'
                        : 'bg-zinc-900 border-zinc-800 text-zinc-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{grant.code}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-sans ${
                        grant.revoked
                          ? 'bg-zinc-800 text-zinc-500'
                          : grant.claimed
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-amber-500/20 text-amber-300'
                      }`}>
                        {grant.revoked ? 'Revoked' : grant.claimed ? 'Claimed (Active Device)' : 'Ready to Claim'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {!grant.claimed && !grant.revoked && (
                        <button
                          type="button"
                          onClick={() => handleCopy(`${window.location.origin}/?grant=${grant.code}`, grant.code)}
                          className="text-zinc-400 hover:text-zinc-200 p-1"
                          title="Copy Link"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {!grant.revoked && (
                        <button
                          type="button"
                          onClick={() => handleRevokeGrant(grant.id)}
                          className="text-red-400 hover:text-red-300 p-1 transition-colors"
                          title="Revoke Host Access"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
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
                  placeholder="e.g. admin@yourdomain.com"
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
