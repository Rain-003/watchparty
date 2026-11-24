import { StreamSettings } from '../types';

// Using localStorage for same-device testing +
// a lightweight public pastebin-style endpoint for cross-device sync
// The host saves the embedUrl to a Vercel KV key via our own API route
const API_BASE = '/api/room';

/**
 * Pushes the host's stream URL to the serverless API so viewers can fetch it.
 */
export async function pushStreamToCloud(settings: StreamSettings): Promise<boolean> {
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

    const res = await fetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
