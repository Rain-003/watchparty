import React, { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import { useAuth } from '../context/AuthContext';
import { StreamSourceType, SyncMessage } from '../types';
import { getStreamFromUrl } from '../utils/urlHelper';
import { useP2PSync } from '../services/p2pSync';
import { subscribeToRoomRealtime } from '../services/supabaseClient';
import {
  Maximize,
  Minimize,
  Volume2,
  VolumeX,
  Play,
  Pause,
  RotateCw,
  Sliders,
  LogOut,
  ExternalLink,
  Radio,
  Tv,
  Layers,
  Sparkles,
  AlertCircle,
  Shield,
  ShieldAlert,
  Menu,
  X,
  PictureInPicture2,
  ScreenShare,
  ScreenShareOff
} from 'lucide-react';

interface CinemaPlayerProps {
  onOpenSettings: () => void;
  onOpenOwnerAdmin?: () => void;
}

export const CinemaPlayer: React.FC<CinemaPlayerProps> = ({ onOpenSettings, onOpenOwnerAdmin }) => {
  const { settings, updateSettings, logout, isHost, isSuperAdmin } = useAuth();
  
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const isExplicitlyPausedRef = useRef<boolean>(false);
  const hostCurrentTimeRef = useRef<number>(0);
  const viewerCurrentTimeRef = useRef<number>(0);

  const [sourceType, setSourceType] = useState<StreamSourceType>(() => {
    return getStreamFromUrl() ? 'embed' : 'hls';
  });
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [ambientGlow, setAmbientGlow] = useState(settings.ambientGlow);
  const [hlsError, setHlsError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(true);
  const [hlsStats, setHlsStats] = useState<{ resolution: string; buffer: number } | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Incoming sync message handler (For Viewers)
  const handleReceiveSyncMessage = useCallback((msg: SyncMessage) => {
    if (isHost) return;

    if (msg.type === 'STATE_SYNC' || msg.type === 'CHANGE_STREAM') {
      if (msg.sourceType && msg.sourceType !== sourceType) {
        setSourceType(msg.sourceType);
      }
      if (msg.embedUrl && msg.embedUrl !== settings.embedUrl) {
        updateSettings({
          embedUrl: msg.embedUrl,
          title: msg.title || settings.title,
          hlsUrl: msg.hlsUrl || settings.hlsUrl,
        });
      }
      // Sync viewer timestamp to host's position on initial join
      if (typeof msg.currentTime === 'number' && msg.currentTime > 0) {
        const targetTime = msg.currentTime;
        setTimeout(() => {
          if (iframeRef.current?.contentWindow) {
            iframeRef.current.contentWindow.postMessage(
              JSON.stringify({ event: 'command', func: 'seekTo', args: [targetTime, true] }),
              '*'
            );
          }
          if (videoRef.current) {
            videoRef.current.currentTime = targetTime;
          }
        }, 1200);
      }
    } else if (msg.type === 'PLAY') {
      isExplicitlyPausedRef.current = false;
      setIsPlaying(true);
      if ((sourceType === 'hls' || sourceType === 'webrtc') && videoRef.current) {
        videoRef.current.play().catch(() => {
          // If unmuted playback is blocked in background tab, fallback to muted so it keeps playing
          if (!isHost && videoRef.current) {
            videoRef.current.muted = true;
            setIsMuted(true);
            videoRef.current.play().catch(() => {});
          }
        });
      } else if (sourceType === 'embed' && iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage(
          JSON.stringify({ event: 'command', func: 'playVideo', args: [] }),
          '*'
        );
      }
    } else if (msg.type === 'PAUSE') {
      isExplicitlyPausedRef.current = true;
      setIsPlaying(false);
      if ((sourceType === 'hls' || sourceType === 'webrtc') && videoRef.current) {
        videoRef.current.pause();
      } else if (sourceType === 'embed' && iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage(
          JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] }),
          '*'
        );
      }
    } else if (msg.type === 'SEEK') {
      if (typeof msg.currentTime === 'number') {
        if (sourceType === 'hls' && videoRef.current) {
          videoRef.current.currentTime = msg.currentTime;
        } else if (sourceType === 'embed' && iframeRef.current?.contentWindow) {
          iframeRef.current.contentWindow.postMessage(
            JSON.stringify({ event: 'command', func: 'seekTo', args: [msg.currentTime, true] }),
            '*'
          );
        }
      }
    } else if (msg.type === 'TIME_SYNC') {
      if (typeof msg.currentTime === 'number' && msg.currentTime > 0) {
        const hostTime = msg.currentTime;
        if (sourceType === 'embed') {
          const viewerTime = viewerCurrentTimeRef.current;
          // If viewer lagged behind by more than 2.5 seconds (e.g. viewer tabbed out or switched apps):
          if (viewerTime === 0 || Math.abs(viewerTime - hostTime) > 2.5) {
            viewerCurrentTimeRef.current = hostTime;
            iframeRef.current?.contentWindow?.postMessage(
              JSON.stringify({ event: 'command', func: 'seekTo', args: [hostTime, true] }),
              '*'
            );
            iframeRef.current?.contentWindow?.postMessage(
              JSON.stringify({ event: 'command', func: 'playVideo', args: [] }),
              '*'
            );
          }
        } else if (sourceType === 'hls' && videoRef.current) {
          if (Math.abs(videoRef.current.currentTime - hostTime) > 3.5) {
            videoRef.current.currentTime = hostTime;
          }
        }
      }
    }
  }, [isHost, sourceType, settings, updateSettings]);

  // Supabase Realtime Database Sync (Instant WebSockets stream update for all viewers)
  useEffect(() => {
    if (isHost) return;

    const unsubscribe = subscribeToRoomRealtime((newRoom) => {
      if (!newRoom) return;
      if (newRoom.backup_embed_url && newRoom.backup_embed_url !== settings.embedUrl) {
        updateSettings({
          embedUrl: newRoom.backup_embed_url,
          title: newRoom.title || settings.title,
          hlsUrl: newRoom.primary_hls_url || settings.hlsUrl,
        });
      }
    });

    return () => {
      unsubscribe();
    };
  }, [isHost, settings.embedUrl, settings.title, settings.hlsUrl, updateSettings]);

  // Provide state to newly connected viewers
  const getLatestState = useCallback(() => {
    return {
      embedUrl: settings.embedUrl,
      hlsUrl: settings.hlsUrl,
      title: settings.title,
      sourceType,
      isPlaying,
      currentTime: videoRef.current?.currentTime || 0,
    };
  }, [settings, sourceType, isPlaying]);

  // Hook up WebRTC Peer-to-Peer Sync & Screen Relay
  const {
    connectedPeersCount,
    syncStatus,
    broadcast,
    isScreenSharing,
    localStream,
    remoteStream,
    startScreenShare,
    stopScreenShare,
  } = useP2PSync({
    isHost,
    onReceiveMessage: handleReceiveSyncMessage,
    getLatestState,
  });

  // Switch to WebRTC mode when screen broadcast starts
  useEffect(() => {
    if (isScreenSharing && sourceType !== 'webrtc') {
      setSourceType('webrtc');
    }
  }, [isScreenSharing, sourceType]);

  // Viewer auto-switches to WebRTC when host starts screen relay
  useEffect(() => {
    if (!isHost && remoteStream && sourceType !== 'webrtc') {
      setSourceType('webrtc');
    }
  }, [isHost, remoteStream, sourceType]);

  // Attach WebRTC screen broadcast stream to video element
  useEffect(() => {
    if (sourceType === 'webrtc' && videoRef.current) {
      const activeStream = isHost ? localStream : remoteStream;
      if (activeStream) {
        videoRef.current.srcObject = activeStream;
        if (isHost) {
          // Mute local video element to avoid host hearing their own desktop audio echo
          videoRef.current.muted = true;
        } else {
          videoRef.current.muted = isMuted;
          videoRef.current.volume = volume;
        }
        videoRef.current.play().catch((err) => {
          console.warn('[P2P] Video play interrupted or requires user gesture:', err);
          // Background/Unfocused Tab Fallback: Browsers block unmuted autoplay on inactive tabs.
          // Fall back to muted so video decodes & renders in background immediately!
          if (!isHost && videoRef.current) {
            videoRef.current.muted = true;
            setIsMuted(true);
            videoRef.current.play().catch((e) => console.warn('[P2P] Muted autoplay also blocked:', e));
          }
        });
      } else {
        videoRef.current.srcObject = null;
      }
    } else if (sourceType !== 'webrtc' && videoRef.current && videoRef.current.srcObject) {
      videoRef.current.srcObject = null;
    }
  }, [sourceType, isHost, localStream, remoteStream, isMuted, volume]);

  // Auto-resume & keep-alive playback whenever the viewer's tab changes focus or visibility
  useEffect(() => {
    const handleKeepAlive = () => {
      if (!isExplicitlyPausedRef.current) {
        if ((sourceType === 'hls' || sourceType === 'webrtc') && videoRef.current && videoRef.current.paused) {
          videoRef.current.play().catch(() => {});
        } else if (sourceType === 'embed' && iframeRef.current?.contentWindow) {
          iframeRef.current.contentWindow.postMessage(
            JSON.stringify({ event: 'command', func: 'playVideo', args: [] }),
            '*'
          );
        }
      }
    };

    window.addEventListener('focus', handleKeepAlive);
    window.addEventListener('blur', handleKeepAlive);
    document.addEventListener('visibilitychange', handleKeepAlive);
    return () => {
      window.removeEventListener('focus', handleKeepAlive);
      window.removeEventListener('blur', handleKeepAlive);
      document.removeEventListener('visibilitychange', handleKeepAlive);
    };
  }, [sourceType]);

  // Listen for YouTube player state changes from iframe to broadcast (Host)
  useEffect(() => {
    const handleWindowMessage = (event: MessageEvent) => {
      if (typeof event.data !== 'string') return;
      try {
        const payload = JSON.parse(event.data);
        if (payload.event === 'onStateChange') {
          // YouTube: 1 = PLAYING, 2 = PAUSED
          if (payload.info === 1) {
            setIsPlaying(true);
            isExplicitlyPausedRef.current = false;
            if (isHost) {
              broadcast({ type: 'PLAY', currentTime: payload.currentTime });
            }
          } else if (payload.info === 2) {
            // Check if user explicitly paused, or if YouTube auto-paused because window lost focus
            if (!isExplicitlyPausedRef.current) {
              // Window lost focus or user switched apps: counter YouTube's auto-pause!
              setTimeout(() => {
                if (!isExplicitlyPausedRef.current && iframeRef.current?.contentWindow) {
                  iframeRef.current.contentWindow.postMessage(
                    JSON.stringify({ event: 'command', func: 'playVideo', args: [] }),
                    '*'
                  );
                }
              }, 120);
              // Do NOT broadcast pause to viewers when host simply tabs out
              return;
            }

            setIsPlaying(false);
            if (isHost) {
              broadcast({ type: 'PAUSE', currentTime: payload.currentTime });
            }
          }
        } else if (payload.event === 'infoDelivery' && payload.info?.currentTime) {
          const time = Number(payload.info.currentTime);
          if (isHost) {
            hostCurrentTimeRef.current = time;
          } else {
            viewerCurrentTimeRef.current = time;
          }
        }
      } catch (err) {
        // Non-JSON iframe messages ignored
      }
    };

    window.addEventListener('message', handleWindowMessage);
    return () => window.removeEventListener('message', handleWindowMessage);
  }, [isHost, broadcast]);

  // Periodic time synchronization: Host broadcasts current playback timestamp every 3.5s
  useEffect(() => {
    if (!isHost) return;
    const interval = setInterval(() => {
      if (!isPlaying) return;
      let curTime = 0;
      if (sourceType === 'hls' && videoRef.current) {
        curTime = videoRef.current.currentTime;
      } else if (sourceType === 'embed') {
        curTime = hostCurrentTimeRef.current;
      }
      if (curTime > 0) {
        broadcast({
          type: 'TIME_SYNC',
          currentTime: curTime,
        });
      }
    }, 3500);

    return () => clearInterval(interval);
  }, [isHost, isPlaying, sourceType, broadcast]);

  // Web Audio Keep-Alive: Registers tab as active audio producer with the browser
  // Prevents Chrome/Edge from suspending or sleeping background tabs when user switches to Discord/apps
  useEffect(() => {
    let audioCtx: AudioContext | null = null;
    let oscillator: OscillatorNode | null = null;

    const startAudioKeepAlive = () => {
      try {
        if (!audioCtx) {
          const AudioContextClass =
            window.AudioContext ||
            (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          if (AudioContextClass) {
            audioCtx = new AudioContextClass();
            const gain = audioCtx.createGain();
            gain.gain.value = 0.0001; // Inaudible
            oscillator = audioCtx.createOscillator();
            oscillator.frequency.value = 440;
            oscillator.connect(gain);
            gain.connect(audioCtx.destination);
            oscillator.start();
          }
        }
        if (audioCtx && audioCtx.state === 'suspended') {
          audioCtx.resume();
        }
      } catch (err) {}
    };

    const handleGesture = () => {
      startAudioKeepAlive();
      window.removeEventListener('click', handleGesture);
      window.removeEventListener('keydown', handleGesture);
    };

    window.addEventListener('click', handleGesture);
    window.addEventListener('keydown', handleGesture);

    return () => {
      window.removeEventListener('click', handleGesture);
      window.removeEventListener('keydown', handleGesture);
      if (oscillator) {
        try {
          oscillator.stop();
          oscillator.disconnect();
        } catch (e) {}
      }
      if (audioCtx) {
        try {
          audioCtx.close();
        } catch (e) {}
      }
    };
  }, []);

  // Auto-switch to embed view if embedUrl was updated or shared, and broadcast to viewers
  const prevEmbedRef = useRef(settings.embedUrl);
  useEffect(() => {
    if (prevEmbedRef.current !== settings.embedUrl && settings.embedUrl) {
      setSourceType('embed');
      prevEmbedRef.current = settings.embedUrl;
      if (isHost) {
        broadcast({
          type: 'CHANGE_STREAM',
          embedUrl: settings.embedUrl,
          hlsUrl: settings.hlsUrl,
          title: settings.title,
          sourceType: 'embed',
        });
      }
    }
  }, [settings.embedUrl, settings.hlsUrl, settings.title, isHost, broadcast]);

  // Setup HLS Stream
  const initHls = useCallback(() => {
    if (sourceType !== 'hls' || !videoRef.current) return;
    const video = videoRef.current;

    // Clean up previous instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    setHlsError(null);
    setIsConnecting(true);

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 90,
      });
      hlsRef.current = hls;

      hls.loadSource(settings.hlsUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
        setIsConnecting(false);
        const firstLevel = data.levels[0];
        if (firstLevel) {
          setHlsStats({
            resolution: `${firstLevel.width}x${firstLevel.height}`,
            buffer: 0,
          });
        }
        if (settings.autoPlay) {
          video.play().catch(() => {
            // Browsers block unmuted autoplay; fallback to muted
            video.muted = true;
            setIsMuted(true);
            video.play().catch((err) => console.log('Autoplay prevented:', err));
          });
        }
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
        const level = hls.levels[data.level];
        if (level) {
          setHlsStats((prev) => ({
            resolution: `${level.width}x${level.height}`,
            buffer: prev?.buffer || 0,
          }));
        }
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.warn('HLS Network error encountered, attempting recovery...');
              setHlsError('Network connection to stream feed failed.');
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.warn('HLS Media error encountered, recovering media...');
              hls.recoverMediaError();
              break;
            default:
              console.error('Fatal HLS error, destroying instance:', data);
              setHlsError('Stream source offline or unavailable.');
              hls.destroy();
              break;
          }
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native Safari iOS support
      video.src = settings.hlsUrl;
      video.addEventListener('loadedmetadata', () => {
        setIsConnecting(false);
        if (settings.autoPlay) {
          video.play().catch(() => {
            video.muted = true;
            setIsMuted(true);
            video.play();
          });
        }
      });
      video.addEventListener('error', () => {
        setHlsError('Unable to load video feed on this browser.');
      });
    } else {
      setHlsError('HLS playback is not supported on this device/browser.');
    }
  }, [settings.hlsUrl, settings.autoPlay, sourceType]);

  useEffect(() => {
    if (sourceType === 'hls') {
      initHls();
    }
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [initHls, sourceType]);

  // Video event listeners
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleVolumeChange = () => {
      setIsMuted(video.muted);
      setVolume(video.volume);
    };

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('volumechange', handleVolumeChange);

    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('volumechange', handleVolumeChange);
    };
  }, [sourceType]);

  // Fullscreen change listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Keyboard shortcuts (Space, F, M)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'KeyF') {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.code === 'KeyM') {
        e.preventDefault();
        toggleMute();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  const togglePlay = () => {
    // If the video is playing but was muted by browser autoplay, clicking it should unmute sound first!
    if (isMuted && isPlaying && !isHost) {
      toggleMute();
      return;
    }

    if (sourceType === 'hls' || sourceType === 'webrtc') {
      if (!videoRef.current) return;
      if (videoRef.current.paused) {
        isExplicitlyPausedRef.current = false;
        videoRef.current.play();
        if (isHost && sourceType === 'hls') broadcast({ type: 'PLAY', currentTime: videoRef.current.currentTime });
      } else {
        isExplicitlyPausedRef.current = true;
        videoRef.current.pause();
        if (isHost && sourceType === 'hls') broadcast({ type: 'PAUSE', currentTime: videoRef.current.currentTime });
      }
    } else if (sourceType === 'embed') {
      if (iframeRef.current?.contentWindow) {
        if (isPlaying) {
          isExplicitlyPausedRef.current = true;
          iframeRef.current.contentWindow.postMessage(
            JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] }),
            '*'
          );
          setIsPlaying(false);
          if (isHost) broadcast({ type: 'PAUSE' });
        } else {
          isExplicitlyPausedRef.current = false;
          iframeRef.current.contentWindow.postMessage(
            JSON.stringify({ event: 'command', func: 'playVideo', args: [] }),
            '*'
          );
          setIsPlaying(true);
          if (isHost) broadcast({ type: 'PLAY' });
        }
      }
    }
  };

  const handleToggleFeed = () => {
    let nextType: StreamSourceType;
    if (sourceType === 'webrtc') {
      nextType = settings.embedUrl ? 'embed' : 'hls';
    } else {
      nextType = sourceType === 'hls' ? 'embed' : 'hls';
    }
    setSourceType(nextType);
    if (isHost) {
      broadcast({
        type: 'CHANGE_STREAM',
        sourceType: nextType,
        embedUrl: settings.embedUrl,
        hlsUrl: settings.hlsUrl,
        title: settings.title,
      });
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !videoRef.current.muted;
  };

  const handleVolumeSlide = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.volume = val;
      videoRef.current.muted = val === 0;
    }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch((err) => console.error(err));
    } else {
      document.exitFullscreen().catch((err) => console.error(err));
    }
  };

  const handleOpenFloatingPlayer = () => {
    if ((sourceType === 'hls' || sourceType === 'webrtc') && videoRef.current && document.pictureInPictureEnabled) {
      if (document.pictureInPictureElement) {
        document.exitPictureInPicture().catch(() => {});
        return;
      }
      videoRef.current
        .requestPictureInPicture()
        .catch(() => {
          openFloatingPopup();
        });
      return;
    }

    openFloatingPopup();
  };

  const openFloatingPopup = () => {
    const width = 854;
    const height = 480;
    const left = Math.max(0, window.screen.width - width - 30);
    const top = Math.max(0, window.screen.height - height - 80);

    // Open clean video embed player in borderless floating popup window
    const urlToOpen = sourceType === 'embed' ? settings.embedUrl : settings.hlsUrl;

    if (!urlToOpen) return;

    window.open(
      urlToOpen,
      'WatchPartyFloatingPlayer',
      `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=no`
    );
  };

  return (
    <div className="min-h-screen bg-[#070709] text-zinc-100 flex flex-col justify-between selection:bg-amber-500/20">
      {/* Top Header / Cinema Control Strip */}
      <header className="border-b border-zinc-900 bg-zinc-950/80 backdrop-blur-md px-3 sm:px-6 py-2.5 sm:py-3 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
          {/* Stream Identity (Fitted for mobile with smooth truncation) */}
          <div className="flex items-center space-x-2 sm:space-x-3 min-w-0 flex-1 mr-1">
            <span className="flex items-center space-x-1 sm:space-x-1.5 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-mono font-medium bg-red-950/50 text-red-400 border border-red-800/60 shrink-0">
              <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="hidden xs:inline">LIVE</span>
            </span>

            {/* Host Badge if Host */}
            {isHost && (
              <span
                className={`inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[9px] sm:text-[10px] font-mono font-semibold border shrink-0 ${
                  isSuperAdmin
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-sm shadow-amber-500/20'
                    : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                }`}
              >
                <Shield className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                <span>{isSuperAdmin ? 'OWNER' : 'HOST'}</span>
              </span>
            )}

            <div className="min-w-0">
              <h1 className="text-xs sm:text-sm font-semibold tracking-wide text-zinc-100 truncate max-w-[140px] xs:max-w-[220px] sm:max-w-[340px] md:max-w-md">
                {settings.title}
              </h1>
            </div>
          </div>

          {/* DESKTOP Action Bar (Hidden on mobile) */}
          <div className="hidden md:flex items-center space-x-2 shrink-0">
            {/* Real-Time WebRTC Sync Indicator */}
            {isHost ? (
              <div
                title="P2P WebRTC Real-Time Sync Active (Zero Cloud Lag)"
                className="inline-flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="hidden lg:inline">P2P Sync:</span>
                <span>{connectedPeersCount} {connectedPeersCount === 1 ? 'Viewer' : 'Viewers'}</span>
              </div>
            ) : (
              <div
                title={syncStatus === 'connected' ? 'Connected to Host (Real-Time Synced)' : 'Connecting to Host...'}
                className={`inline-flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-mono border ${
                  syncStatus === 'connected'
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    syncStatus === 'connected' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400 animate-ping'
                  }`}
                />
                <span className="hidden lg:inline">Sync:</span>
                <span>{syncStatus === 'connected' ? 'Synced to Host' : 'Connecting...'}</span>
              </div>
            )}

            {/* UNIFIED CINEMA TOOLS CAPSULE (Viewer Experience) */}
            <div className="flex items-center bg-zinc-900/90 border border-zinc-800/90 rounded-xl p-1 gap-1 shadow-inner">
              {/* Ambient Glow Toggle */}
              <button
                onClick={() => setAmbientGlow(!ambientGlow)}
                title="Toggle Ambient Theater Lighting"
                className={`p-1.5 rounded-lg text-xs transition-all ${
                  ambientGlow
                    ? 'bg-amber-500/20 text-amber-300 shadow-sm shadow-amber-500/20'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
                }`}
              >
                <Sparkles className="w-4 h-4" />
              </button>

              {/* Floating Mini-Player (PiP) */}
              <button
                onClick={handleOpenFloatingPlayer}
                title="Float Mini-Player (Picture-in-Picture)"
                className="p-1.5 rounded-lg text-xs text-zinc-400 hover:text-amber-300 hover:bg-zinc-800/60 transition-all"
              >
                <PictureInPicture2 className="w-4 h-4" />
              </button>

              {/* Feed Switcher (Compact Pill) */}
              <button
                onClick={handleToggleFeed}
                title="Click to toggle Feed (HLS / EMBED)"
                className="px-2 py-1 rounded-lg text-[11px] font-mono font-semibold text-zinc-300 hover:text-amber-300 hover:bg-zinc-800/60 transition-colors flex items-center gap-1 border border-zinc-800/80"
              >
                <Layers className="w-3 h-3 text-amber-400" />
                <span>{sourceType.toUpperCase()}</span>
              </button>

              {/* Discord Link */}
              {settings.discordUrl && (
                <a
                  href={settings.discordUrl}
                  target="_blank"
                  rel="noreferrer"
                  title="Open Community Discord Voice & Chat"
                  className="p-1.5 rounded-lg text-xs text-[#7983f5] hover:bg-[#5865F2]/20 transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              )}
            </div>

            {/* HOST & ADMIN ACTION CLUSTER */}
            {isHost && (
              <div className="flex items-center space-x-1.5 pl-1 border-l border-zinc-800/80">
                {/* Screen / Tab Relay Button */}
                <button
                  onClick={async () => {
                    if (isScreenSharing) {
                      stopScreenShare();
                    } else {
                      const started = await startScreenShare();
                      if (started) setSourceType('webrtc');
                    }
                  }}
                  title={
                    isScreenSharing
                      ? 'Stop Tab Broadcast'
                      : 'Relay browser tab/screen directly to viewers (Zero external view count leak)'
                  }
                  className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                    isScreenSharing
                      ? 'bg-red-500/20 hover:bg-red-500/30 text-red-300 border-red-500/40 shadow-sm shadow-red-500/20 animate-pulse'
                      : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                  }`}
                >
                  {isScreenSharing ? (
                    <>
                      <ScreenShareOff className="w-3.5 h-3.5 text-red-400" />
                      <span>Stop Relay</span>
                    </>
                  ) : (
                    <>
                      <ScreenShare className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Relay Tab</span>
                    </>
                  )}
                </button>

                {/* Host Settings */}
                <button
                  onClick={onOpenSettings}
                  title="Host Stream Settings"
                  className="p-2 rounded-xl text-xs bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 transition-colors"
                >
                  <Sliders className="w-4 h-4" />
                </button>

                {/* Owner Command Center */}
                {isSuperAdmin && (
                  <button
                    onClick={onOpenOwnerAdmin}
                    title="Owner Command Center & Breach Mitigation"
                    className="p-2 rounded-xl text-xs bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/50 shadow-sm shadow-amber-500/20 transition-all"
                  >
                    <ShieldAlert className="w-4 h-4 text-amber-400" />
                  </button>
                )}
              </div>
            )}

            {/* Exit / Logout */}
            <button
              onClick={logout}
              title="Exit Watchparty"
              className="p-2 rounded-lg text-xs bg-zinc-900 hover:bg-red-950/40 text-zinc-400 hover:text-red-400 border border-zinc-800 hover:border-red-800/40 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>

          {/* MOBILE Compact Action Bar */}
          <div className="flex md:hidden items-center space-x-1.5 shrink-0">
            {/* Mobile P2P Sync Pill */}
            {isHost ? (
              <div
                title="P2P Viewers Connected"
                className="inline-flex items-center space-x-1 px-2 py-1 rounded-lg text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>{connectedPeersCount}</span>
              </div>
            ) : (
              <div
                title={syncStatus === 'connected' ? 'Synced to Host' : 'Connecting to Host...'}
                className={`inline-flex items-center space-x-1 px-2 py-1 rounded-lg text-[10px] font-mono border ${
                  syncStatus === 'connected'
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    syncStatus === 'connected' ? 'bg-emerald-400' : 'bg-amber-400 animate-ping'
                  }`}
                />
                <span>{syncStatus === 'connected' ? 'Synced' : 'Sync...'}</span>
              </div>
            )}

            {/* Mobile Host Quick Settings */}
            {isHost && (
              <button
                onClick={onOpenSettings}
                title="Host Settings"
                className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/30"
              >
                <Sliders className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Mobile Hamburger Toggle Button */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-label="Toggle Navigation Menu"
              className={`p-1.5 rounded-lg border transition-colors ${
                isMobileMenuOpen
                  ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:text-white'
              }`}
            >
              {isMobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* MOBILE SLIDE-DOWN DRAWER MENU */}
        {isMobileMenuOpen && (
          <div className="md:hidden mt-3 pt-3 border-t border-zinc-800/80 space-y-2.5 animate-in slide-in-from-top-2 duration-150">
            {/* Active Feed Switcher in Mobile Drawer */}
            <div className="flex items-center justify-between p-2 rounded-xl bg-zinc-900/60 border border-zinc-800">
              <div>
                <div className="text-xs font-medium text-zinc-200">Video Feed</div>
                <div className="text-[10px] text-zinc-500">Currently: {sourceType.toUpperCase()}</div>
              </div>
              <button
                onClick={() => {
                  handleToggleFeed();
                  setIsMobileMenuOpen(false);
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center space-x-1.5"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Switch to {sourceType === 'hls' ? 'Embed' : 'HLS'}</span>
              </button>
            </div>

            {/* Theater Ambient Glow Toggle */}
            <div className="flex items-center justify-between p-2 rounded-xl bg-zinc-900/60 border border-zinc-800">
              <div className="flex items-center space-x-2">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-xs text-zinc-200">Ambient Glow</span>
              </div>
              <button
                onClick={() => setAmbientGlow(!ambientGlow)}
                className={`px-3 py-1 rounded-lg text-xs font-mono font-medium border transition-colors ${
                  ambientGlow
                    ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                    : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                }`}
              >
                {ambientGlow ? 'ON' : 'OFF'}
              </button>
            </div>

            {/* Floating Mini-Player in Mobile Drawer */}
            <button
              onClick={() => {
                setIsMobileMenuOpen(false);
                handleOpenFloatingPlayer();
              }}
              className="w-full p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-amber-500/40 text-amber-300 font-semibold text-xs transition-colors flex items-center justify-center space-x-2"
            >
              <PictureInPicture2 className="w-3.5 h-3.5 text-amber-400" />
              <span>Floating Mini-Player (Picture-in-Picture)</span>
            </button>

            {/* Host Screen Relay in Mobile Drawer */}
            {isHost && (
              <div className="flex items-center justify-between p-2 rounded-xl bg-zinc-900/60 border border-zinc-800">
                <div className="flex items-center space-x-2">
                  <ScreenShare className="w-3.5 h-3.5 text-emerald-400" />
                  <div>
                    <div className="text-xs font-medium text-zinc-200">Zero-Leak Relay</div>
                    <div className="text-[10px] text-zinc-500">
                      {isScreenSharing ? 'Active (0 Added Views)' : 'Offline'}
                    </div>
                  </div>
                </div>
                <button
                  onClick={async () => {
                    setIsMobileMenuOpen(false);
                    if (isScreenSharing) {
                      stopScreenShare();
                    } else {
                      const started = await startScreenShare();
                      if (started) setSourceType('webrtc');
                    }
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                    isScreenSharing
                      ? 'bg-red-500/20 text-red-300 border-red-500/40'
                      : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  }`}
                >
                  {isScreenSharing ? 'Stop' : 'Start Relay'}
                </button>
              </div>
            )}

            {/* Host Control Button if Host */}
            {isHost && (
              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  onOpenSettings();
                }}
                className="w-full p-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold text-xs transition-colors flex items-center justify-center space-x-2"
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Open Host Control Room</span>
              </button>
            )}

            {/* Owner Command Center if SuperAdmin */}
            {isSuperAdmin && (
              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  onOpenOwnerAdmin?.();
                }}
                className="w-full p-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/50 text-amber-300 font-semibold text-xs transition-colors flex items-center justify-center space-x-2"
              >
                <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                <span>Owner Command Center</span>
              </button>
            )}

            {/* Discord Link in Mobile Drawer */}
            {settings.discordUrl && (
              <a
                href={settings.discordUrl}
                target="_blank"
                rel="noreferrer"
                className="w-full p-2 rounded-xl bg-[#5865F2]/10 hover:bg-[#5865F2]/20 text-[#7983f5] border border-[#5865F2]/30 text-xs font-medium transition-colors flex items-center justify-center space-x-2"
              >
                <span>Join Discord Voice / Chat</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}

            {/* Floating Screen in Mobile Drawer */}
            <button
              onClick={() => {
                setIsMobileMenuOpen(false);
                handleOpenFloatingPlayer();
              }}
              className="w-full p-2 rounded-xl bg-zinc-900/60 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 text-xs font-medium transition-colors flex items-center justify-center space-x-2"
            >
              <PictureInPicture2 className="w-3.5 h-3.5 text-amber-400" />
              <span>Floating Screen (Pop-out Window)</span>
            </button>

            {/* Exit Room Button */}
            <button
              onClick={logout}
              className="w-full p-2 rounded-xl bg-red-950/20 hover:bg-red-950/40 text-red-400 border border-red-900/40 text-xs font-medium transition-colors flex items-center justify-center space-x-2"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Exit Watchparty</span>
            </button>
          </div>
        )}
      </header>

      {/* Main Theater Floor */}
      <main className="flex-1 flex flex-col items-center justify-center p-2 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
        <div
          ref={containerRef}
          className={`relative w-full aspect-video rounded-xl sm:rounded-2xl overflow-hidden bg-black border border-zinc-900 shadow-2xl flex items-center justify-center group ${
            ambientGlow ? 'ring-1 ring-amber-500/20' : ''
          }`}
        >
          {/* Ambient projection glow behind screen */}
          {ambientGlow && (
            <div className="absolute inset-0 -z-10 bg-gradient-to-tr from-amber-600/10 via-zinc-800/10 to-blue-600/10 blur-3xl scale-110 pointer-events-none opacity-60" />
          )}

          {/* Video Element for HLS or WebRTC Screen Relay */}
          {sourceType === 'hls' || sourceType === 'webrtc' ? (
            <>
              <video
                ref={videoRef}
                className="w-full h-full object-contain cursor-pointer"
                autoPlay
                playsInline
                muted={isHost && sourceType === 'webrtc' ? true : isMuted}
                onClick={togglePlay}
                onDoubleClick={toggleFullscreen}
                onPlay={() => {
                  setIsPlaying(true);
                  if (isHost && videoRef.current && sourceType === 'hls') {
                    broadcast({ type: 'PLAY', currentTime: videoRef.current.currentTime });
                  }
                }}
                onPause={() => {
                  setIsPlaying(false);
                  if (isHost && videoRef.current && sourceType === 'hls') {
                    broadcast({ type: 'PAUSE', currentTime: videoRef.current.currentTime });
                  }
                }}
                onSeeked={() => {
                  if (isHost && videoRef.current && sourceType === 'hls') {
                    broadcast({ type: 'SEEK', currentTime: videoRef.current.currentTime });
                  }
                }}
              />

              {/* WebRTC Live Badge */}
              {sourceType === 'webrtc' && (
                <div className="absolute top-4 left-4 z-20 px-3 py-1.5 rounded-lg bg-emerald-950/80 text-emerald-300 border border-emerald-500/30 text-xs font-mono flex items-center gap-2 backdrop-blur-md shadow-lg">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="font-semibold tracking-wide">PRIVATE SCREEN RELAY</span>
                  <span className="text-[10px] text-emerald-400/80 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                    0 External Views Added
                  </span>
                </div>
              )}

              {/* WebRTC Connecting State (Viewer waiting for host stream) */}
              {sourceType === 'webrtc' && !localStream && !remoteStream && (
                <div className="absolute inset-0 bg-black/85 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center z-20">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-950/60 border border-emerald-800/60 flex items-center justify-center text-emerald-400 mb-4 animate-pulse">
                    <ScreenShare className="w-7 h-7" />
                  </div>
                  <h3 className="text-base font-semibold text-zinc-100 mb-1">
                    Connecting to Host Screen Relay...
                  </h3>
                  <p className="text-xs text-zinc-400 max-w-sm leading-relaxed">
                    Waiting for the host to select their stream tab. Video and audio are sent directly peer-to-peer so external platforms do not log your view.
                  </p>
                </div>
              )}

              {/* Connecting State */}
              {sourceType === 'hls' && isConnecting && !hlsError && (
                <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center z-20">
                  <RotateCw className="w-8 h-8 text-amber-400 animate-spin mb-3" />
                  <p className="text-sm font-medium text-zinc-200">Connecting to Live Stream...</p>
                  <p className="text-xs text-zinc-500 font-mono mt-1 max-w-md truncate">
                    {settings.hlsUrl}
                  </p>
                </div>
              )}

              {/* HLS Stream Offline / Error Fallback Screen */}
              {sourceType === 'hls' && hlsError && (
                <div className="absolute inset-0 bg-zinc-950/95 flex flex-col items-center justify-center p-6 text-center z-20">
                  <div className="w-12 h-12 rounded-full bg-red-950/60 border border-red-800/60 flex items-center justify-center text-red-400 mb-4">
                    <AlertCircle className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-semibold text-zinc-100 mb-1">
                    Direct Stream Offline or Connecting
                  </h3>
                  <p className="text-xs text-zinc-400 max-w-md mb-5 leading-relaxed">
                    The direct RTMP/HLS feed is currently unreachable. Make sure your OBS or streaming server is broadcasting, or switch to the backup embed.
                  </p>

                  <div className="flex flex-wrap items-center justify-center gap-3">
                    <button
                      onClick={initHls}
                      className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium rounded-lg transition-colors flex items-center space-x-1.5"
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                      <span>Retry Feed</span>
                    </button>
                    <button
                      onClick={() => setSourceType('embed')}
                      className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-semibold rounded-lg transition-colors flex items-center space-x-1.5"
                    >
                      <Tv className="w-3.5 h-3.5" />
                      <span>Switch to Backup Embed</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Unmute prompt for browser autoplay policies */}
              {isMuted && isPlaying && !isHost && (
                <button
                  onClick={toggleMute}
                  className="absolute top-4 right-4 z-30 px-3.5 py-2 bg-zinc-950/95 hover:bg-zinc-900 text-amber-400 border border-amber-500/40 rounded-xl text-xs font-semibold backdrop-blur-md flex items-center space-x-2 shadow-xl shadow-black/80 transition-all animate-bounce hover:scale-105 active:scale-95"
                >
                  <VolumeX className="w-4 h-4 text-amber-400" />
                  <span>Click to unmute</span>
                </button>
              )}

              {/* In-Player Custom Controls Bar (Fade in on hover) */}
              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/95 via-black/60 to-transparent p-4 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-between z-20">
                <div className="flex items-center space-x-3">
                  <button
                    onClick={togglePlay}
                    className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                  >
                    {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </button>

                  <div className="flex items-center space-x-2">
                    <button
                      onClick={toggleMute}
                      className="p-2 rounded-lg hover:bg-white/10 text-zinc-300 hover:text-white transition-colors"
                    >
                      {isMuted || volume === 0 ? (
                        <VolumeX className="w-4 h-4" />
                      ) : (
                        <Volume2 className="w-4 h-4" />
                      )}
                    </button>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={isMuted ? 0 : volume}
                      onChange={handleVolumeSlide}
                      className="w-16 sm:w-24 h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-amber-400"
                    />
                  </div>

                  <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono bg-zinc-900/80 text-zinc-400 border border-zinc-800">
                    <Radio className={`w-3 h-3 mr-1.5 ${sourceType === 'webrtc' ? 'text-emerald-400' : 'text-red-500'}`} />
                    {sourceType === 'webrtc' ? 'P2P RELAY (0 VIEWS)' : 'LIVE BROADCAST'}
                  </span>
                </div>

                <div className="flex items-center space-x-2">
                  <span className="text-[11px] font-mono text-zinc-500 hidden md:block">
                    Press <kbd className="px-1 py-0.5 bg-zinc-800 rounded text-zinc-400">F</kbd> for Fullscreen
                  </span>
                  <button
                    onClick={handleOpenFloatingPlayer}
                    title="Floating Mini-Player (Picture-in-Picture)"
                    className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                  >
                    <PictureInPicture2 className="w-4 h-4 text-amber-300" />
                  </button>
                  <button
                    onClick={toggleFullscreen}
                    className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                  >
                    {isFullscreen ? (
                      <Minimize className="w-4 h-4" />
                    ) : (
                      <Maximize className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            </>
          ) : (
            /* Backup YouTube / Twitch / Video Embed */
            <div className="w-full h-full relative">
              {settings.embedUrl ? (
                <iframe
                  ref={iframeRef}
                  key={settings.embedUrl}
                  src={settings.embedUrl}
                  title="Backup Livestream Embed"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  className="w-full h-full border-0"
                  onLoad={() => {
                    try {
                      iframeRef.current?.contentWindow?.postMessage(
                        JSON.stringify({ event: 'listening', id: 'watchparty-player' }),
                        '*'
                      );
                    } catch (e) {}
                  }}
                />
              ) : (
                /* Waiting for host to set stream */
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center p-6">
                  <div className="relative">
                    <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-amber-400">
                      <Radio className="w-7 h-7" />
                    </div>
                    <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 border-2 border-zinc-950 animate-pulse" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-zinc-100 mb-1">
                      Stream Starting Soon
                    </h3>
                    <p className="text-xs text-zinc-500 max-w-xs leading-relaxed">
                      Waiting for the host to load a stream. This screen will update automatically — no need to refresh.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-600">
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                    <span>Real-time P2P sync active...</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bottom Helper Bar */}
        <div className="mt-3 sm:mt-4 w-full flex flex-wrap items-center justify-between text-xs text-zinc-500 px-1 gap-2">
          <div className="flex items-center space-x-2 sm:space-x-3 flex-wrap gap-y-1">
            {/* Floating Mini-Player Button */}
            <button
              type="button"
              onClick={handleOpenFloatingPlayer}
              className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-[11px] font-mono text-zinc-300 hover:text-amber-300 bg-zinc-900 border border-zinc-800 hover:border-amber-500/40 transition-colors"
              title="Pop out into a floating Picture-in-Picture window"
            >
              <PictureInPicture2 className="w-3.5 h-3.5 text-amber-400" />
              <span>Mini Player</span>
            </button>

            {sourceType === 'embed' && (
              <a
                href={
                  settings.embedUrl.includes('/embed/')
                    ? settings.embedUrl.replace('/embed/', '/watch?v=').split('?')[0]
                    : settings.embedUrl
                }
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-mono text-zinc-400 hover:text-amber-300 bg-zinc-900/60 border border-zinc-800 hover:border-amber-500/40 transition-colors"
                title="If YouTube blocks embedding or asks to sign in, watch directly on YouTube"
              >
                <span>YouTube</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>

          <div className="hidden sm:flex items-center space-x-3 font-mono text-[11px]">
            <span>Hotkeys:</span>
            <span className="text-zinc-400"><kbd className="px-1 py-0.5 bg-zinc-900 border border-zinc-800 rounded">Space</kbd> Play</span>
            <span className="text-zinc-400"><kbd className="px-1 py-0.5 bg-zinc-900 border border-zinc-800 rounded">M</kbd> Mute</span>
            <span className="text-zinc-400"><kbd className="px-1 py-0.5 bg-zinc-900 border border-zinc-800 rounded">F</kbd> Full</span>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-3 px-6 border-t border-zinc-900/60 text-center text-[11px] font-mono text-zinc-600">
        Watchparty Pipeline • Designed for low latency & clean playback
      </footer>
    </div>
  );
};
