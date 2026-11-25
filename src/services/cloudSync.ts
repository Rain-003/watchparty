import { StreamSettings } from '../types';

// Using localStorage for same-device testing +
// a lightweight Vercel Edge Serverless endpoint for cross-device sync
const API_BASE = '/api/room';

/**
 * Pushes the host's stream URL to the serverless API so viewers can fetch it.
 * Requires a cryptographically signed Host token for authorization.
 */
export async function pushStreamToCloud(settings: StreamSettings, token?: string | null): Promise<boolean> {
  try {
    const publicPayload = {
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
    }

    const res = await fetch(API_BASE, {
      method: 'POST',
      headers,
      body: JSON.stringify(publicPayload),
    });

    return res.ok;
  } catch (err) {
    console.warn('Could not push stream to cloud:', err);
    return false;
  }
}

/**
 * Fetches the active stream configured by the host.
 */
export async function fetchStreamFromCloud(): Promise<Partial<StreamSettings> | null> {
  try {
    const res = await fetch(`${API_BASE}?t=${Date.now()}`, {
      method: 'GET',
      cache: 'no-store',
    });

    if (res.ok) {
      const data = await res.json();
      // Only return if there's actually a stream URL set
      if (data && (data.embedUrl || data.hlsUrl)) {
        return data;
      }
    }
  } catch (err) {
    console.warn('Could not fetch stream from cloud:', err);
  }
  return null;
}
