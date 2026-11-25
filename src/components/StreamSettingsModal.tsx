import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { X, Check, RefreshCw, Key, Link2, Tv, MessageSquare, Shield, Wand2, Copy, Share2, Clock, CalendarX, Bell } from 'lucide-react';
import { formatEmbedUrl, buildShareableLink } from '../utils/urlHelper';
import { fetchStreamFromCloud } from '../services/cloudSync';

interface StreamSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const StreamSettingsModal: React.FC<StreamSettingsModalProps> = ({ isOpen, onClose }) => {
  const { settings, updateSettings, resetSettings, isSuperAdmin, token } = useAuth();

  const [formData, setFormData] = useState({
    title: settings.title,
    viewerPasscode: settings.viewerPasscode,
    hostPasscode: settings.hostPasscode,
    hlsUrl: settings.hlsUrl,
    embedUrl: settings.embedUrl,
    discordUrl: settings.discordUrl,
    autoPlay: settings.autoPlay,
    ambientGlow: settings.ambientGlow,
    scheduledTime: settings.scheduledTime || '',
    scheduledTitle: settings.scheduledTitle || '',
    scheduledUrl: settings.scheduledUrl || '',
    announceToDiscord: false,
    customAnnouncement: '',
  });

  // Pre-load live passcodes and room details from Supabase when opening modal
  useEffect(() => {
    if (!isOpen) return;

    const loadLiveSettings = async () => {
      const liveData = await fetchStreamFromCloud(token);
      if (liveData) {
        setFormData(prev => ({
          ...prev,
          title: liveData.title || prev.title,
          hlsUrl: liveData.hlsUrl || prev.hlsUrl,
          embedUrl: liveData.embedUrl || prev.embedUrl,
          discordUrl: liveData.discordUrl !== undefined ? (liveData.discordUrl || '') : prev.discordUrl,
          viewerPasscode: (liveData as any).viewerPasscode || prev.viewerPasscode,
          hostPasscode: (liveData as any).hostPasscode || prev.hostPasscode,
          scheduledTime: liveData.scheduledTime || prev.scheduledTime,
          scheduledTitle: liveData.scheduledTitle || prev.scheduledTitle,
          scheduledUrl: liveData.scheduledUrl || prev.scheduledUrl,
        }));
      }
    };

    loadLiveSettings();
  }, [isOpen, token]);

  const [savedNotice, setSavedNotice] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [shareableLink, setShareableLink] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  if (!isOpen) return null;

  const handleClearSchedule = async () => {
    setFormData(prev => ({ ...prev, scheduledTime: '', scheduledTitle: '', scheduledUrl: '' }));
    await updateSettings({ scheduledTime: null, scheduledTitle: null, scheduledUrl: null });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    const formattedData = {
      ...formData,
      embedUrl: formatEmbedUrl(formData.embedUrl),
      scheduledUrl: formData.scheduledUrl ? formatEmbedUrl(formData.scheduledUrl) : null,
      scheduledTime: formData.scheduledTime.trim() || null,
      scheduledTitle: formData.scheduledTitle.trim() || null,
    };
    await updateSettings(formattedData);

    // Generate the shareable viewer link
    const link = buildShareableLink(formattedData.embedUrl);
    setShareableLink(link);

    setIsSaving(false);
    setSavedNotice(true);
  };

  const handleCopyLink = () => {
    if (!shareableLink) return;
    navigator.clipboard.writeText(shareableLink).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  };

  const handleClose = () => {
    setShareableLink(null);
    setSavedNotice(false);
    setLinkCopied(false);
    onClose();
  };

  const handleReset = () => {
    if (window.confirm('Reset all settings to default values?')) {
      resetSettings();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-black/85 backdrop-blur-sm">
      <div className="relative w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-zinc-800/80 bg-zinc-900/40">
          <div className="flex items-center space-x-2.5 min-w-0 flex-1 mr-2">
            <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">
              <Shield className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center space-x-2">
                <h2 className="text-xs sm:text-sm font-semibold text-zinc-100 truncate">Host Control Room</h2>
                {isSuperAdmin && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40 shrink-0">
                    OWNER
                  </span>
                )}
              </div>
              <p className="text-[10px] sm:text-[11px] text-zinc-500 truncate">
                {isSuperAdmin
                  ? 'Master key active • Immune to host lockouts'
                  : 'Only accessible with the Host Passcode'}
              </p>
            </div>
          </div>

          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-3.5 sm:space-y-4 overflow-y-auto">
          {/* Shareable Link Banner after Broadcast */}
          {shareableLink && (
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
                  <Share2 className="w-3.5 h-3.5" />
                  Viewer Sync Link
                </span>
                <span className="text-[10px] text-amber-400/80">Auto-loads this video!</span>
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  readOnly
                  value={shareableLink}
                  onFocus={(e) => e.target.select()}
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                  className="w-full px-2.5 py-1.5 bg-black/60 border border-amber-500/30 rounded-lg text-xs font-mono text-amber-200 select-all focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold text-xs rounded-lg transition-colors flex items-center space-x-1 shrink-0"
                >
                  {linkCopied ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
              <p className="text-[10px] text-zinc-400">
                Share this in your Discord channel. Viewers clicking this link will immediately sync to this video across all browsers!
              </p>
            </div>
          )}
          {/* Party Title */}
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">
              Party / Stream Title
            </label>
            <input
              type="text"
              value={formData.title}
              onFocus={(e) => e.target.select()}
              onClick={(e) => (e.target as HTMLInputElement).select()}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-100 focus:outline-none focus:border-amber-500/60"
            />
          </div>

          {/* Passcodes Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="flex items-center justify-between text-xs font-medium text-zinc-300 mb-1.5">
                <span className="flex items-center gap-1">
                  <Key className="w-3.5 h-3.5 text-zinc-400" />
                  Viewer Passcode
                </span>
              </label>
              <input
                type="text"
                value={formData.viewerPasscode}
                onFocus={(e) => e.target.select()}
                onClick={(e) => (e.target as HTMLInputElement).select()}
                onChange={(e) => setFormData({ ...formData, viewerPasscode: e.target.value })}
                placeholder="e.g. watchparty"
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs font-mono text-zinc-200 focus:outline-none focus:border-amber-500/60"
              />
              <p className="mt-1 text-[10px] text-zinc-500">Give this to guests (No admin controls).</p>
            </div>

            <div>
              <label className="flex items-center justify-between text-xs font-medium text-zinc-300 mb-1.5">
                <span className="flex items-center gap-1">
                  <Shield className="w-3.5 h-3.5 text-amber-400" />
                  Host Passcode
                </span>
              </label>
              <input
                type="text"
                value={formData.hostPasscode}
                onFocus={(e) => e.target.select()}
                onClick={(e) => (e.target as HTMLInputElement).select()}
                onChange={(e) => setFormData({ ...formData, hostPasscode: e.target.value })}
                placeholder="e.g. party-host"
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs font-mono text-amber-300 focus:outline-none focus:border-amber-500/60"
              />
              <p className="mt-1 text-[10px] text-amber-400/80">Secret key for you only.</p>
            </div>
          </div>

          {/* Direct HLS Stream URL */}
          <div>
            <label className="flex items-center justify-between text-xs font-medium text-zinc-300 mb-1.5">
              <span className="flex items-center gap-1.5">
                <Link2 className="w-3.5 h-3.5 text-blue-400" />
                Primary Stream URL (HLS .m3u8)
              </span>
              <span className="text-[10px] font-mono text-zinc-500">iWant / OBS / HLS</span>
            </label>
            <input
              type="url"
              value={formData.hlsUrl}
              onFocus={(e) => e.target.select()}
              onClick={(e) => (e.target as HTMLInputElement).select()}
              onChange={(e) => setFormData({ ...formData, hlsUrl: e.target.value })}
              placeholder="https://your-domain.com/live/stream.m3u8"
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs font-mono text-zinc-200 focus:outline-none focus:border-amber-500/60"
            />
            <p className="mt-1 text-[10px] text-zinc-500">
              Direct HLS playback via hls.js. Must be an accessible .m3u8 link.
            </p>
          </div>

          {/* Fallback Embed URL */}
          <div>
            <label className="flex items-center justify-between text-xs font-medium text-zinc-300 mb-1.5">
              <span className="flex items-center gap-1.5">
                <Tv className="w-3.5 h-3.5 text-red-400" />
                Backup Embed URL
              </span>
              <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
                <Wand2 className="w-3 h-3" />
                Auto-formats YouTube & Twitch links
              </span>
            </label>
            <input
              type="text"
              value={formData.embedUrl}
              onFocus={(e) => e.target.select()}
              onClick={(e) => (e.target as HTMLInputElement).select()}
              onChange={(e) => setFormData({ ...formData, embedUrl: e.target.value })}
              onBlur={() => {
                if (formData.embedUrl) {
                  setFormData((prev) => ({ ...prev, embedUrl: formatEmbedUrl(prev.embedUrl) }));
                }
              }}
              placeholder="Paste regular YouTube (watch?v=...), live link, or Twitch URL"
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs font-mono text-zinc-200 focus:outline-none focus:border-amber-500/60"
            />
            <p className="mt-1 text-[10px] text-zinc-500">
              Paste any raw YouTube link (e.g. <code>youtube.com/watch?v=...</code> or <code>youtu.be/...</code>) — it converts automatically!
            </p>
            <div className="mt-1.5 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[10px] text-amber-300 space-y-0.5">
              <p className="font-semibold">⚠️ YouTube Studio Tips to avoid "Sign in" errors for viewers:</p>
              <ul className="list-disc list-inside text-amber-200/80 space-y-0.5">
                <li>Set Visibility to <strong>Unlisted</strong> (not Private).</li>
                <li>Under Audience, ensure <strong>Age restriction is OFF</strong> (Don't restrict to 18+).</li>
                <li>In Stream settings, ensure <strong>"Allow embedding" is checked</strong>.</li>
              </ul>
            </div>
          </div>

          {/* Scheduled Showtime & Discord Announcement Card */}
          <div className="p-3.5 bg-gradient-to-b from-amber-500/10 to-zinc-900/60 border border-amber-500/30 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-300">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-zinc-100 flex items-center gap-1.5">
                    Schedule Upcoming Showtime
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300">Auto-Plays</span>
                  </h4>
                  <p className="text-[10px] text-zinc-400">Sets a live countdown on the cinema screen for all viewers.</p>
                </div>
              </div>

              {formData.scheduledTime && (
                <button
                  type="button"
                  onClick={handleClearSchedule}
                  className="text-[10px] text-red-400 hover:text-red-300 flex items-center gap-1 p-1 transition-colors"
                  title="Clear Scheduled Stream"
                >
                  <CalendarX className="w-3.5 h-3.5" />
                  <span>Clear</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] text-zinc-300 mb-1">
                  Showtime (HH:MM e.g. 20:30)
                </label>
                <input
                  type="text"
                  value={formData.scheduledTime}
                  onChange={(e) => setFormData({ ...formData, scheduledTime: e.target.value })}
                  placeholder="e.g. 20:30"
                  className="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs font-mono text-amber-300 focus:outline-none focus:border-amber-500/60"
                />
              </div>

              <div>
                <label className="block text-[11px] text-zinc-300 mb-1">
                  Event / Episode Title
                </label>
                <input
                  type="text"
                  value={formData.scheduledTitle}
                  onChange={(e) => setFormData({ ...formData, scheduledTitle: e.target.value })}
                  placeholder="e.g. Episode 5: The Premiere"
                  className="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-amber-500/60"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] text-zinc-300 mb-1">
                Showtime Stream Link (Plays automatically at showtime)
              </label>
              <input
                type="text"
                value={formData.scheduledUrl}
                onChange={(e) => setFormData({ ...formData, scheduledUrl: e.target.value })}
                placeholder="Paste YouTube, Twitch, or HLS stream link"
                className="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs font-mono text-zinc-300 focus:outline-none focus:border-amber-500/60"
              />
            </div>

            {/* Customizable Discord Announcement */}
            <div className="pt-2 border-t border-zinc-800/60 space-y-2">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-xs font-medium text-zinc-200 flex items-center gap-1.5">
                  <Bell className="w-3.5 h-3.5 text-[#7983f5]" />
                  Post Announcement to Community Discord
                </span>
                <input
                  type="checkbox"
                  checked={formData.announceToDiscord}
                  onChange={(e) => setFormData({ ...formData, announceToDiscord: e.target.checked })}
                  className="rounded bg-zinc-900 border-zinc-700 text-[#5865F2] focus:ring-0"
                />
              </label>

              {formData.announceToDiscord && (
                <div className="space-y-1 animate-fade-in">
                  <label className="block text-[10px] text-zinc-400">
                    Custom Announcement Message / Title:
                  </label>
                  <input
                    type="text"
                    value={formData.customAnnouncement}
                    onChange={(e) => setFormData({ ...formData, customAnnouncement: e.target.value })}
                    placeholder="e.g. 🍿 Popcorn ready! Tonight's Screening starts at 8:30 PM!"
                    className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-[#5865F2]"
                  />
                  <p className="text-[10px] text-zinc-500">
                    This message will be sent to your Discord channel when you click Broadcast.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Discord URL */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-300 mb-1.5">
              <MessageSquare className="w-3.5 h-3.5 text-[#5865F2]" />
              Discord Chat Link
            </label>
            <input
              type="url"
              value={formData.discordUrl}
              onFocus={(e) => e.target.select()}
              onClick={(e) => (e.target as HTMLInputElement).select()}
              onChange={(e) => setFormData({ ...formData, discordUrl: e.target.value })}
              placeholder="https://discord.gg/your-channel"
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-amber-500/60"
            />
          </div>

          {/* Toggles */}
          <div className="pt-2 border-t border-zinc-900 space-y-2">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-xs text-zinc-300">Autoplay when entering room</span>
              <input
                type="checkbox"
                checked={formData.autoPlay}
                onChange={(e) => setFormData({ ...formData, autoPlay: e.target.checked })}
                className="rounded bg-zinc-900 border-zinc-700 text-amber-500 focus:ring-0"
              />
            </label>

            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-xs text-zinc-300">Ambient theater glow effect</span>
              <input
                type="checkbox"
                checked={formData.ambientGlow}
                onChange={(e) => setFormData({ ...formData, ambientGlow: e.target.checked })}
                className="rounded bg-zinc-900 border-zinc-700 text-amber-500 focus:ring-0"
              />
            </label>
          </div>

          {/* Modal Footer Actions */}
          <div className="pt-3 sm:pt-4 border-t border-zinc-900 flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={handleReset}
              className="text-[11px] text-zinc-500 hover:text-zinc-300 flex items-center space-x-1"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Reset Defaults</span>
            </button>

            <div className="flex items-center space-x-2 ml-auto">
              <button
                type="button"
                onClick={handleClose}
                className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-3.5 sm:px-4 py-1.5 bg-zinc-100 hover:bg-white text-zinc-950 font-medium text-xs rounded-lg transition-colors flex items-center space-x-1.5 disabled:opacity-50"
              >
                {isSaving ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-zinc-700" />
                    <span>Broadcasting...</span>
                  </>
                ) : savedNotice ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Broadcasted!</span>
                  </>
                ) : (
                  <span>Broadcast to Viewers</span>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
