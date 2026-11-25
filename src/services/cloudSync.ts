import { StreamSettings } from '../types';

const API_BASE = '/api/room';

/**
 * Pushes the host's stream URL and passcodes to the database.
 * Requires a cryptographically signed Host token for authorization.
 */
export async function pushStreamToCloud(settings: StreamSettings, token?: string | null): Promise<boolean> {
  try {
    const payload: Record<string, unknown> = {
      title: settings.title,
      hlsUrl: settings.hlsUrl,
      embedUrl: settings.embedUrl,
      discordUrl: settings.discordUrl,
      autoPlay: settings.autoPlay,
      ambientGlow: settings.ambientGlow,
      updatedAt: Date.now(),
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
      if (settings.viewerPasscode) payload.viewerPasscode = settings.viewerPasscode;
      if (settings.hostPasscode) payload.hostPasscode = settings.hostPasscode;
    }

    const res = await fetch(API_BASE, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    return res.ok;
  } catch (err) {
    console.warn('Could not push stream to cloud:', err);
    return false;
  }
}

/**
 * Fetches the active stream configured by the host.
 * If a valid Host token is provided, also retrieves active passcodes.
 */
export async function fetchStreamFromCloud(token?: string | null): Promise<Partial<StreamSettings> | null> {
  try {
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${API_BASE}?t=${Date.now()}`, {
      method: 'GET',
      headers,
      cache: 'no-store',
    });

    if (res.ok) {
      const data = await res.json();
      if (data && (data.embedUrl || data.hlsUrl || data.title)) {
        return data;
      }
    }
  } catch (err) {
    console.warn('Could not fetch stream from cloud:', err);
  }
  return null;
}
