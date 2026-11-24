import { StreamSettings } from '../types';

// Unique room identifier for this deployment
// Can be customized via VITE_ROOM_ID in Vercel
const ROOM_ID = import.meta.env.VITE_ROOM_ID || 'rain_watchparty_prod';
const KV_ENDPOINT = `https://kvdb.io/A2w58YkG1yvKxU5MhXFk9R/${ROOM_ID}`;

/**
 * Pushes the host's updated settings to the cloud room so all viewers receive it.
 */
export async function pushStreamToCloud(settings: StreamSettings): Promise<boolean> {
  try {
    // Only broadcast viewer-safe fields (never broadcast the host/master passcodes)
    const publicPayload = {
      title: settings.title,
      hlsUrl: settings.hlsUrl,
      embedUrl: settings.embedUrl,
      discordUrl: settings.discordUrl,
      autoPlay: settings.autoPlay,
      ambientGlow: settings.ambientGlow,
      updatedAt: Date.now(),
    };

    const res = await fetch(KV_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(publicPayload),
    });

    return res.ok;
  } catch (err) {
    console.warn('Could not sync stream to cloud:', err);
    return false;
  }
}

/**
 * Fetches the active stream configured by the host from the cloud room.
 */
export async function fetchStreamFromCloud(): Promise<Partial<StreamSettings> | null> {
  try {
    const res = await fetch(`${KV_ENDPOINT}?t=${Date.now()}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      cache: 'no-store',
    });

    if (res.ok) {
      const data = await res.json();
      return data;
    }
  } catch (err) {
    console.warn('Could not fetch stream from cloud:', err);
  }
  return null;
}
