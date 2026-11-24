import { useEffect, useRef, useState, useCallback } from 'react';
import Peer, { DataConnection } from 'peerjs';
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

  useEffect(() => {
    const effectiveRoom = resolveRoomId(roomId);
    const hostPeerId = `watchparty-${effectiveRoom}-host`;
    let isMounted = true;

    // Clean up cleanly on window close/refresh to release peer ID instantly
    const handleBeforeUnload = () => {
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
                sourceType: state.sourceType,
                isPlaying: state.isPlaying,
                currentTime: state.currentTime,
                timestamp: Date.now(),
              } as SyncMessage);
            }
          });

          conn.on('close', () => {
            connectionsRef.current.delete(conn.peer);
            if (isMounted) setConnectedPeersCount(connectionsRef.current.size);
          });

          conn.on('error', () => {
            connectionsRef.current.delete(conn.peer);
            if (isMounted) setConnectedPeersCount(connectionsRef.current.size);
          });
        });

        peer.on('error', (err) => {
          if (!isMounted) return;
          console.warn('[P2P Host Error]', err.type, err.message);
          if (err.type === 'unavailable-id') {
            // ID occupied by an old socket; wait 2s and re-init
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
          hostConnRef.current = null;
          scheduleReconnect();
        });

        conn.on('error', () => {
          if (!isMounted) return;
          setSyncStatus('disconnected');
          setConnectedPeersCount(0);
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
  };
}
