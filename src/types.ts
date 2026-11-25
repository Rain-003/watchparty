export type StreamSourceType = 'hls' | 'embed' | 'webrtc';

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

export type SyncActionType = 'STATE_SYNC' | 'PLAY' | 'PAUSE' | 'SEEK' | 'CHANGE_STREAM';

export interface SyncMessage {
  type: SyncActionType;
  embedUrl?: string;
  hlsUrl?: string;
  title?: string;
  sourceType?: StreamSourceType;
  currentTime?: number;
  isPlaying?: boolean;
  timestamp: number;
}
