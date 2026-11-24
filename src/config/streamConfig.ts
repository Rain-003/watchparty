import { StreamSettings } from '../types';

export const STORAGE_KEY_AUTH_ROLE = 'watchparty_auth_role';
export const STORAGE_KEY_SETTINGS = 'watchparty_custom_settings';

export const DEFAULT_SETTINGS: StreamSettings = {
  title: import.meta.env.VITE_STREAM_TITLE || 'Community Watchparty',
  viewerPasscode: import.meta.env.VITE_VIEWER_PASSCODE || 'watchparty',
  hostPasscode: import.meta.env.VITE_HOST_PASSCODE || 'party-host',
  // Default working public test HLS stream
  hlsUrl: import.meta.env.VITE_PRIMARY_HLS_URL || 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
  // Fallback YouTube embed
  embedUrl: import.meta.env.VITE_BACKUP_EMBED_URL || 'https://www.youtube.com/embed/jfKfPfyJRdk?autoplay=1&mute=0',
  discordUrl: import.meta.env.VITE_DISCORD_URL || 'https://discord.com',
  autoPlay: true,
  ambientGlow: true,
};

export function getStoredSettings(): StreamSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SETTINGS);
    if (raw) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    }
  } catch (e) {
    console.warn('Failed to parse stored settings', e);
  }
  return DEFAULT_SETTINGS;
}

export function saveStoredSettings(settings: StreamSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
  } catch (e) {
    console.error('Failed to save settings', e);
  }
}
