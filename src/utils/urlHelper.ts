/**
 * Converts any standard YouTube, YouTube Live, or Twitch URL into an embed-ready URL.
 * Uses standard youtube.com to avoid third-party cookie blocking issues from youtube-nocookie.
 */
export function formatEmbedUrl(url: string): string {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();

  // Helper to add essential parameters for smooth embedding
  const addParams = (embedBase: string, videoId: string) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const originParam = origin ? `&origin=${encodeURIComponent(origin)}` : '';
    return `${embedBase}/${videoId}?autoplay=1&mute=0&playsinline=1&enablejsapi=1${originParam}`;
  };

  // Already an embed URL?
  if (trimmed.includes('youtube.com/embed/') || trimmed.includes('youtube-nocookie.com/embed/')) {
    // Normalise to standard youtube.com
    const cleanUrl = trimmed.replace('youtube-nocookie.com', 'youtube.com');
    if (!cleanUrl.includes('autoplay=')) {
      const sep = cleanUrl.includes('?') ? '&' : '?';
      return `${cleanUrl}${sep}autoplay=1&mute=0&playsinline=1`;
    }
    return cleanUrl;
  }

  // 1. YouTube standard: youtube.com/watch?v=VIDEO_ID
  const watchMatch = trimmed.match(/(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/);
  if (watchMatch && watchMatch[1]) {
    return addParams('https://www.youtube.com/embed', watchMatch[1]);
  }

  // 2. YouTube short: youtu.be/VIDEO_ID
  const shortMatch = trimmed.match(/(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (shortMatch && shortMatch[1]) {
    return addParams('https://www.youtube.com/embed', shortMatch[1]);
  }

  // 3. YouTube Live: youtube.com/live/VIDEO_ID
  const liveMatch = trimmed.match(/(?:youtube\.com\/live\/)([a-zA-Z0-9_-]{11})/);
  if (liveMatch && liveMatch[1]) {
    return addParams('https://www.youtube.com/embed', liveMatch[1]);
  }

  // 4. Twitch stream: twitch.tv/CHANNEL_NAME
  const twitchMatch = trimmed.match(/(?:twitch\.tv\/)([a-zA-Z0-9_]{3,25})/);
  if (twitchMatch && twitchMatch[1]) {
    const channel = twitchMatch[1];
    const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
    return `https://player.twitch.tv/?channel=${channel}&parent=${hostname}&autoplay=true&muted=false`;
  }

  // Return original if no pattern matched
  return trimmed;
}
