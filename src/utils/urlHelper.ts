/**
 * Converts any standard YouTube, YouTube Live, or Twitch URL into an embed-ready URL.
 */
export function formatEmbedUrl(url: string): string {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();

  // Already an embed URL?
  if (trimmed.includes('youtube.com/embed/') || trimmed.includes('youtube-nocookie.com/embed/')) {
    if (!trimmed.includes('autoplay=')) {
      const sep = trimmed.includes('?') ? '&' : '?';
      return `${trimmed}${sep}autoplay=1&mute=0`;
    }
    return trimmed;
  }

  // 1. YouTube standard: youtube.com/watch?v=VIDEO_ID
  const watchMatch = trimmed.match(/(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/);
  if (watchMatch && watchMatch[1]) {
    return `https://www.youtube-nocookie.com/embed/${watchMatch[1]}?autoplay=1&mute=0`;
  }

  // 2. YouTube short: youtu.be/VIDEO_ID
  const shortMatch = trimmed.match(/(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (shortMatch && shortMatch[1]) {
    return `https://www.youtube-nocookie.com/embed/${shortMatch[1]}?autoplay=1&mute=0`;
  }

  // 3. YouTube Live: youtube.com/live/VIDEO_ID
  const liveMatch = trimmed.match(/(?:youtube\.com\/live\/)([a-zA-Z0-9_-]{11})/);
  if (liveMatch && liveMatch[1]) {
    return `https://www.youtube-nocookie.com/embed/${liveMatch[1]}?autoplay=1&mute=0`;
  }

  // 4. Twitch stream: twitch.tv/CHANNEL_NAME
  const twitchMatch = trimmed.match(/(?:twitch\.tv\/)([a-zA-Z0-9_]{3,25})/);
  if (twitchMatch && twitchMatch[1]) {
    const channel = twitchMatch[1];
    // Includes parent domain parameter for localhost and vercel
    return `https://player.twitch.tv/?channel=${channel}&parent=${window.location.hostname || 'localhost'}&autoplay=true&muted=false`;
  }

  // Return original if no pattern matched
  return trimmed;
}
