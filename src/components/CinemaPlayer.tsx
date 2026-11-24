import React, { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import { useAuth } from '../context/AuthContext';
import { StreamSourceType } from '../types';
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
  Shield
} from 'lucide-react';

interface CinemaPlayerProps {
  onOpenSettings: () => void;
}

export const CinemaPlayer: React.FC<CinemaPlayerProps> = ({ onOpenSettings }) => {
  const { settings, logout, isHost, isSuperAdmin } = useAuth();
  
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);

  const [sourceType, setSourceType] = useState<StreamSourceType>('hls');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [ambientGlow, setAmbientGlow] = useState(settings.ambientGlow);
  const [hlsError, setHlsError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(true);
  const [hlsStats, setHlsStats] = useState<{ resolution: string; buffer: number } | null>(null);

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
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
    } else {
      videoRef.current.pause();
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

  return (
    <div className="min-h-screen bg-[#070709] text-zinc-100 flex flex-col justify-between selection:bg-amber-500/20">
      {/* Top Header / Cinema Control Strip */}
      <header className="border-b border-zinc-900 bg-zinc-950/70 backdrop-blur-md px-4 sm:px-6 py-3 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          {/* Stream Identity */}
          <div className="flex items-center space-x-3">
            <span className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-medium bg-red-950/50 text-red-400 border border-red-800/60">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span>LIVE</span>
            </span>

            {/* Host Badge if Host */}
            {isHost && (
              <span
                className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold border ${
                  isSuperAdmin
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-sm shadow-amber-500/20'
                    : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                }`}
              >
                <Shield className="w-3 h-3" />
                <span>{isSuperAdmin ? 'OWNER ADMIN' : 'HOST'}</span>
              </span>
            )}

            <div>
              <h1 className="text-sm font-semibold tracking-wide text-zinc-100 line-clamp-1">
                {settings.title}
              </h1>
              <p className="text-[11px] font-mono text-zinc-500 hidden sm:block">
                Source: <span className="text-zinc-300 font-semibold">{sourceType === 'hls' ? 'HLS Direct Feed' : 'Backup Embed'}</span>
                {hlsStats?.resolution && sourceType === 'hls' && ` • ${hlsStats.resolution}`}
              </p>
            </div>
          </div>

          {/* Action Bar */}
          <div className="flex items-center space-x-2">
            {/* Feed Switcher Button */}
            <button
              onClick={() => {
                setSourceType(sourceType === 'hls' ? 'embed' : 'hls');
              }}
              title="Switch between Direct HLS Feed and Backup Embed"
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 transition-colors"
            >
              <Layers className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Feed:</span>
              <span className="font-mono text-amber-400 uppercase">{sourceType}</span>
            </button>

            {/* Discord Link */}
            {settings.discordUrl && (
              <a
                href={settings.discordUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#5865F2]/10 hover:bg-[#5865F2]/20 text-[#7983f5] border border-[#5865F2]/30 transition-colors"
              >
                <span>Discord</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}

            {/* Ambient Glow Toggle */}
            <button
              onClick={() => setAmbientGlow(!ambientGlow)}
              title="Toggle Ambient Theater Glow"
              className={`p-2 rounded-lg text-xs border transition-colors ${
                ambientGlow
                  ? 'bg-amber-500/10 border-amber-500/40 text-amber-300'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Sparkles className="w-4 h-4" />
            </button>

            {/* HOST ONLY: Settings Drawer Button */}
            {isHost && (
              <button
                onClick={onOpenSettings}
                title="Host Stream Settings"
                className="p-2 rounded-lg text-xs bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 transition-colors"
              >
                <Sliders className="w-4 h-4" />
              </button>
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
        </div>
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

          {/* Video Element for HLS */}
          {sourceType === 'hls' ? (
            <>
              <video
                ref={videoRef}
                className="w-full h-full object-contain cursor-pointer"
                playsInline
                onClick={togglePlay}
              />

              {/* Connecting State */}
              {isConnecting && !hlsError && (
                <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center z-20">
                  <RotateCw className="w-8 h-8 text-amber-400 animate-spin mb-3" />
                  <p className="text-sm font-medium text-zinc-200">Connecting to Live Stream...</p>
                  <p className="text-xs text-zinc-500 font-mono mt-1 max-w-md truncate">
                    {settings.hlsUrl}
                  </p>
                </div>
              )}

              {/* HLS Stream Offline / Error Fallback Screen */}
              {hlsError && (
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
              {isMuted && isPlaying && (
                <button
                  onClick={toggleMute}
                  className="absolute top-4 right-4 z-30 px-3 py-1.5 bg-zinc-900/90 hover:bg-zinc-800 text-amber-400 border border-amber-500/30 rounded-lg text-xs font-medium backdrop-blur-md flex items-center space-x-1.5 shadow-lg transition-all animate-bounce"
                >
                  <VolumeX className="w-4 h-4" />
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
                    <Radio className="w-3 h-3 text-red-500 mr-1.5" />
                    LIVE BROADCAST
                  </span>
                </div>

                <div className="flex items-center space-x-2">
                  <span className="text-[11px] font-mono text-zinc-500 hidden md:block">
                    Press <kbd className="px-1 py-0.5 bg-zinc-800 rounded text-zinc-400">F</kbd> for Fullscreen
                  </span>
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
              <iframe
                src={settings.embedUrl}
                title="Backup Livestream Embed"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                className="w-full h-full border-0"
              />
            </div>
          )}
        </div>

        {/* Bottom Helper Bar */}
        <div className="mt-4 w-full flex flex-wrap items-center justify-between text-xs text-zinc-500 px-1 gap-2">
          <div className="flex items-center space-x-3">
            <span className="font-mono text-[11px]">
              Active: <span className="text-zinc-300">{sourceType.toUpperCase()}</span>
            </span>
            <span className="hidden sm:inline">•</span>
            <span className="hidden sm:inline text-zinc-500">
              Chatting in Discord • Fullscreen enabled
            </span>
            {sourceType === 'embed' && (
              <a
                href={
                  settings.embedUrl.includes('/embed/')
                    ? settings.embedUrl.replace('/embed/', '/watch?v=').split('?')[0]
                    : settings.embedUrl
                }
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-mono text-zinc-400 hover:text-amber-300 bg-zinc-900 border border-zinc-800 hover:border-amber-500/40 transition-colors"
                title="If YouTube asks to sign in or blocks the embed, click here to watch directly"
              >
                <span>Pop-out Stream</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>

          <div className="flex items-center space-x-3 mt-2 sm:mt-0 font-mono text-[11px]">
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
