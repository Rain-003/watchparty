export type StreamSourceType = 'hls' | 'embed' | 'webrtc';

export type UserRole = 'viewer' | 'host';

export interface HostGrant {
  id: string;
  code: string;
  createdAt: number;
  claimed: boolean;
  claimedAt?: number;
  revoked?: boolean;
}

export interface StreamSettings {
  title: string;
  viewerPasscode: string;
  hostPasscode: string;
  hlsUrl: string;
  embedUrl: string;
  discordUrl: string;
  autoPlay: boolean;
  ambientGlow: boolean;
  scheduledTime?: string | null;
  scheduledTitle?: string | null;
  scheduledUrl?: string | null;
  announceToDiscord?: boolean;
  customAnnouncement?: string | null;
}

export type SyncActionType = 'STATE_SYNC' | 'PLAY' | 'PAUSE' | 'SEEK' | 'CHANGE_STREAM' | 'TIME_SYNC';

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
