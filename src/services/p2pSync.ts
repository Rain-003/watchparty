import { useEffect, useRef, useState, useCallback } from 'react';
import Peer, { DataConnection, MediaConnection } from 'peerjs';
import { StreamSourceType, SyncMessage } from '../types';

interface UseP2PSyncOptions {
  isHost: boolean;
  roomId?: string;
  onReceiveMessage?: (msg: SyncMessage) => void;
  getLatestState?: () => {
    embedUrl: string;
    hlsUrl: string;
    title: string;
    sourceType: StreamSourceType;
    isPlaying: boolean;
    currentTime: number;
  };
}

export interface UseP2PSyncReturn {
  connectedPeersCount: number;
  syncStatus: 'connected' | 'connecting' | 'disconnected';
  broadcast: (msg: Omit<SyncMessage, 'timestamp'>) => void;
  // WebRTC Screen Relay
  isScreenSharing: boolean;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  startScreenShare: () => Promise<boolean>;
  stopScreenShare: () => void;
}

const DEFAULT_ROOM_ID = 'rain-screening-room';

const resolveRoomId = (customRoom?: string): string => {
  if (customRoom && customRoom !== DEFAULT_ROOM_ID) return customRoom;
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const queryRoom = params.get('room');
    if (queryRoom) return queryRoom;
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    return isLocal ? 'rain-room-local' : 'rain-room-live';
  }
  return 'rain-room-live';
};

export function useP2PSync({
  isHost,
  roomId = DEFAULT_ROOM_ID,
  onReceiveMessage,
  getLatestState,
}: UseP2PSyncOptions): UseP2PSyncReturn {
  const [syncStatus, setSyncStatus] = useState<'connected' | 'connecting' | 'disconnected'>('connecting');
  const [connectedPeersCount, setConnectedPeersCount] = useState<number>(0);

  // Screen relay state
  const [isScreenSharing, setIsScreenSharing] = useState<boolean>(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const localStreamRef = useRef<MediaStream | null>(null);
  const mediaCallsRef = useRef<Map<string, MediaConnection>>(new Map());
  const activeViewerCallRef = useRef<MediaConnection | null>(null);

  const peerRef = useRef<Peer | null>(null);
  const connectionsRef = useRef<Map<string, DataConnection>>(new Map());
  const hostConnRef = useRef<DataConnection | null>(null);
  const reconnectTimerRef = useRef<any>(null);

  const onReceiveRef = useRef(onReceiveMessage);
  onReceiveRef.current = onReceiveMessage;

  const getLatestStateRef = useRef(getLatestState);
  getLatestStateRef.current = getLatestState;

  // Broadcast to all connected peers (Host -> Viewers)
  const broadcast = useCallback((msg: Omit<SyncMessage, 'timestamp'>) => {
    if (!isHost) return;
    const fullMsg: SyncMessage = {
      ...msg,
      timestamp: Date.now(),
    };

    connectionsRef.current.forEach((conn) => {
      if (conn.open) {
        try {
          conn.send(fullMsg);
        } catch (e) {
          console.warn('[P2P] Failed to send message to peer', conn.peer, e);
        }
      }
    });
  }, [isHost]);

  // Stop screen relay
  const stopScreenShare = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    setLocalStream(null);
    setIsScreenSharing(false);

    // Close all peer media calls
    mediaCallsRef.current.forEach((call) => {
      try {
        call.close();
      } catch (e) {}
    });
    mediaCallsRef.current.clear();

    // Revert room state to embed or HLS
    const state = getLatestStateRef.current?.();
    const fallbackSource: StreamSourceType = state?.embedUrl ? 'embed' : 'hls';
    broadcast({
      type: 'CHANGE_STREAM',
      sourceType: fallbackSource,
      title: state?.title || 'Screening Room',
    });
  }, [broadcast]);

  // Start screen relay (Host captures tab or screen with audio)
  const startScreenShare = useCallback(async (): Promise<boolean> => {
    if (!isHost) return false;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getDisplayMedia) {
      alert('Screen sharing is not supported by your browser.');
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: 'always',
          frameRate: { ideal: 30, max: 60 },
        } as MediaTrackConstraints,
        audio: true, // Captures tab audio (Chrome/Edge/Firefox)
      });

      setLocalStream(stream);
      localStreamRef.current = stream;
      setIsScreenSharing(true);

      // Call all active viewer connections
      connectionsRef.current.forEach((conn) => {
        if (peerRef.current && conn.open) {
          try {
            const call = peerRef.current.call(conn.peer, stream);
            mediaCallsRef.current.set(conn.peer, call);
            call.on('close', () => mediaCallsRef.current.delete(conn.peer));
            call.on('error', () => mediaCallsRef.current.delete(conn.peer));
          } catch (err) {
            console.warn('[P2P] Failed to call peer with stream:', conn.peer, err);
          }
        }
      });

      // Notify viewers to switch player to WebRTC relay
      broadcast({
        type: 'CHANGE_STREAM',
        sourceType: 'webrtc',
        title: 'Host Tab Broadcast (Zero View Leak)',
      });

      // Handle user ending share via browser standard stop banner
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          stopScreenShare();
        };
      }

      return true;
    } catch (err) {
      console.info('[P2P] Screen sharing cancelled or denied:', err);
      return false;
    }
  }, [isHost, broadcast, stopScreenShare]);

  useEffect(() => {
    const effectiveRoom = resolveRoomId(roomId);
    const hostPeerId = `watchparty-${effectiveRoom}-host`;
    let isMounted = true;

    // Clean up cleanly on window close/refresh to release peer ID instantly
    const handleBeforeUnload = () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
        localStreamRef.current = null;
      }
      if (peerRef.current) {
        peerRef.current.destroy();
        peerRef.current = null;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    if (isHost) {
      // HOST MODE: Initialize host peer
      const initHost = () => {
        if (!isMounted) return;
        if (peerRef.current) {
          peerRef.current.destroy();
          peerRef.current = null;
        }

        const peer = new Peer(hostPeerId, {
          debug: 1,
          config: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:global.stun.twilio.com:3478' },
            ],
          },
        });
        peerRef.current = peer;

        peer.on('open', () => {
          if (!isMounted) return;
          setSyncStatus('connected');
        });

        peer.on('connection', (conn) => {
          conn.on('open', () => {
            if (!isMounted) return;
            connectionsRef.current.set(conn.peer, conn);
            setConnectedPeersCount(connectionsRef.current.size);

            // Instantly send current playback and stream state to new viewer
            if (getLatestStateRef.current) {
              const state = getLatestStateRef.current();
              conn.send({
                type: 'STATE_SYNC',
                embedUrl: state.embedUrl,
                hlsUrl: state.hlsUrl,
                title: state.title,
                sourceType: localStreamRef.current ? 'webrtc' : state.sourceType,
                isPlaying: state.isPlaying,
                currentTime: state.currentTime,
                timestamp: Date.now(),
              } as SyncMessage);
            }

            // If screen sharing is currently active, immediately call the newly joined peer!
            if (localStreamRef.current) {
              setTimeout(() => {
                if (!isMounted || !peerRef.current || !localStreamRef.current) return;
                try {
                  const call = peerRef.current.call(conn.peer, localStreamRef.current);
                  mediaCallsRef.current.set(conn.peer, call);
                  call.on('close', () => mediaCallsRef.current.delete(conn.peer));
                  call.on('error', () => mediaCallsRef.current.delete(conn.peer));
                } catch (e) {
                  console.warn('[P2P] Failed to call newly connected viewer with stream:', e);
                }
              }, 400);
            }
          });

          conn.on('close', () => {
            connectionsRef.current.delete(conn.peer);
            mediaCallsRef.current.delete(conn.peer);
            if (isMounted) setConnectedPeersCount(connectionsRef.current.size);
          });

          conn.on('error', () => {
            connectionsRef.current.delete(conn.peer);
            mediaCallsRef.current.delete(conn.peer);
            if (isMounted) setConnectedPeersCount(connectionsRef.current.size);
          });
        });

        peer.on('error', (err) => {
          if (!isMounted) return;
          console.warn('[P2P Host Error]', err.type, err.message);
          if (err.type === 'unavailable-id') {
            // ID occupied by an old socket; wait 2.5s and re-init
            if (peerRef.current) {
              peerRef.current.destroy();
              peerRef.current = null;
            }
            setTimeout(() => {
              if (isMounted) initHost();
            }, 2500);
          }
        });
      };

      initHost();

    } else {
      // VIEWER MODE: Connect to host
      const viewerPeerId = `watchparty-${effectiveRoom}-v-${Math.random().toString(36).substring(2, 8)}`;
      const peer = new Peer(viewerPeerId, {
        debug: 1,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' },
          ],
        },
      });
      peerRef.current = peer;

      // Listen for incoming screen broadcast stream from Host
      peer.on('call', (call) => {
        if (!isMounted) return;
        // Answer call with no outgoing stream (1-way receive only)
        call.answer();
        activeViewerCallRef.current = call;

        call.on('stream', (incomingStream) => {
          if (!isMounted) return;
          setRemoteStream(incomingStream);
        });

        call.on('close', () => {
          if (!isMounted) return;
          setRemoteStream(null);
          activeViewerCallRef.current = null;
        });

        call.on('error', (err) => {
          console.warn('[P2P Viewer Call Error]', err);
          if (!isMounted) return;
          setRemoteStream(null);
          activeViewerCallRef.current = null;
        });
      });

      const connectToHost = () => {
        if (!peer || peer.destroyed || !isMounted) return;
        setSyncStatus('connecting');

        const conn = peer.connect(hostPeerId, {
          reliable: true,
        });
        hostConnRef.current = conn;

        conn.on('open', () => {
          if (!isMounted) return;
          setSyncStatus('connected');
          setConnectedPeersCount(1);
          if (reconnectTimerRef.current) {
            clearInterval(reconnectTimerRef.current);
            reconnectTimerRef.current = null;
          }
        });

        conn.on('data', (data) => {
          if (!isMounted) return;
          if (onReceiveRef.current) {
            onReceiveRef.current(data as SyncMessage);
          }
        });

        conn.on('close', () => {
          if (!isMounted) return;
          setSyncStatus('disconnected');
          setConnectedPeersCount(0);
          setRemoteStream(null);
          hostConnRef.current = null;
          scheduleReconnect();
        });

        conn.on('error', () => {
          if (!isMounted) return;
          setSyncStatus('disconnected');
          setConnectedPeersCount(0);
          setRemoteStream(null);
          hostConnRef.current = null;
          scheduleReconnect();
        });
      };

      const scheduleReconnect = () => {
        if (!reconnectTimerRef.current && isMounted) {
          reconnectTimerRef.current = setInterval(() => {
            if (!hostConnRef.current || !hostConnRef.current.open) {
              connectToHost();
            }
          }, 3500);
        }
      };

      peer.on('open', () => {
        if (!isMounted) return;
        connectToHost();
      });

      peer.on('error', (err) => {
        if (!isMounted) return;
        console.warn('[P2P Viewer Error]', err.type, err.message);
        if (err.type === 'peer-unavailable') {
          // Host not registered on signaling server yet; keep polling
          setSyncStatus('connecting');
          scheduleReconnect();
        }
      });
    }

    return () => {
      isMounted = false;
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (reconnectTimerRef.current) {
        clearInterval(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
        localStreamRef.current = null;
      }
      mediaCallsRef.current.forEach((call) => call.close());
      mediaCallsRef.current.clear();
      if (activeViewerCallRef.current) {
        activeViewerCallRef.current.close();
        activeViewerCallRef.current = null;
      }
      connectionsRef.current.forEach((conn) => conn.close());
      connectionsRef.current.clear();
      if (hostConnRef.current) {
        hostConnRef.current.close();
        hostConnRef.current = null;
      }
      if (peerRef.current) {
        peerRef.current.destroy();
        peerRef.current = null;
      }
    };
  }, [isHost, roomId]);

  return {
    connectedPeersCount,
    syncStatus,
    broadcast,
    isScreenSharing,
    localStream,
    remoteStream,
    startScreenShare,
    stopScreenShare,
  };
}
