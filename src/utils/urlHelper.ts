/**
 * Converts any standard YouTube, YouTube Live, or Twitch URL into an embed-ready URL.
 */
export function formatEmbedUrl(url: string): string {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();

  const addParams = (embedBase: string, videoId: string) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const originParam = origin ? `&origin=${encodeURIComponent(origin)}` : '';
    return `${embedBase}/${videoId}?autoplay=1&mute=0&playsinline=1&enablejsapi=1${originParam}`;
  };

  if (trimmed.includes('youtube.com/embed/') || trimmed.includes('youtube-nocookie.com/embed/')) {
    const cleanUrl = trimmed.replace('youtube-nocookie.com', 'youtube.com');
    if (!cleanUrl.includes('autoplay=')) {
      const sep = cleanUrl.includes('?') ? '&' : '?';
      return `${cleanUrl}${sep}autoplay=1&mute=0&playsinline=1`;
    }
    return cleanUrl;
  }

  const watchMatch = trimmed.match(/(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/);
  if (watchMatch?.[1]) return addParams('https://www.youtube.com/embed', watchMatch[1]);

  const shortMatch = trimmed.match(/(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (shortMatch?.[1]) return addParams('https://www.youtube.com/embed', shortMatch[1]);

  const liveMatch = trimmed.match(/(?:youtube\.com\/live\/)([a-zA-Z0-9_-]{11})/);
  if (liveMatch?.[1]) return addParams('https://www.youtube.com/embed', liveMatch[1]);

  const twitchMatch = trimmed.match(/(?:twitch\.tv\/)([a-zA-Z0-9_]{3,25})/);
  if (twitchMatch?.[1]) {
    const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
    return `https://player.twitch.tv/?channel=${twitchMatch[1]}&parent=${hostname}&autoplay=true&muted=false`;
  }

  return trimmed;
}

/**
 * Extracts the YouTube video ID from any URL format.
 */
export function extractVideoId(url: string): string | null {
  if (!url) return null;
  const patterns = [
    /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
    /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/live\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

/**
 * Builds a shareable viewer watchparty URL with the video encoded in it.
 * e.g. https://watchparty-vert.vercel.app?v=21X5lGlDOfg
 */
export function buildShareableLink(embedUrl: string): string {
  const videoId = extractVideoId(embedUrl);
  const base = typeof window !== 'undefined' ? window.location.origin : '';
  if (videoId) {
    return `${base}?v=${videoId}`;
  }
  // For non-YouTube (Twitch / HLS / other embeds), encode the full URL
  if (embedUrl) {
    return `${base}?stream=${encodeURIComponent(embedUrl)}`;
  }
  return base;
}

/**
 * Reads the stream URL from the current page's URL parameters.
 * Returns null if no stream param found.
 */
export function getStreamFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);

  const videoId = params.get('v');
  if (videoId) {
    const origin = window.location.origin;
    return `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=0&playsinline=1&enablejsapi=1&origin=${encodeURIComponent(origin)}`;
  }

  const stream = params.get('stream');
  if (stream) return decodeURIComponent(stream);

  return null;
}
