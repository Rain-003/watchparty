export type StreamSourceType = 'hls' | 'embed';

export type UserRole = 'viewer' | 'host';

export interface StreamSettings {
  title: string;
  viewerPasscode: string;
  hostPasscode: string;
  hlsUrl: string;
  embedUrl: string;
  discordUrl: string;
  autoPlay: boolean;
  ambientGlow: boolean;
}
