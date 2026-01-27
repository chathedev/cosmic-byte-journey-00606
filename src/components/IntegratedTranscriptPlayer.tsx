// IntegratedTranscriptPlayer - Audio player integrated into the transcript section
// Shows audio controls above/within the transcript with synced playback

import { useState, useRef, useEffect } from "react";
import { Play, Pause, Volume2, VolumeX, RotateCcw, SkipBack, SkipForward, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { type AudioBackup } from "@/lib/asrService";
import { supabase } from "@/integrations/supabase/client";

interface IntegratedTranscriptPlayerProps {
  meetingId: string;
  audioBackup: AudioBackup;
  onTimeUpdate?: (currentTime: number) => void;
  onPlayStateChange?: (isPlaying: boolean) => void;
  seekTo?: number;
  className?: string;
}

const BACKEND_API_URL = 'https://api.tivly.se';

async function getAuthToken(): Promise<string | null> {
  const localToken = localStorage.getItem('authToken');
  if (localToken && localToken.trim().length > 0) {
    return localToken;
  }
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || null;
  } catch {
    return null;
  }
}

function normalizeAudioMimeType(mime?: string | null): string | null {
  if (!mime) return null;
  const m = mime.toLowerCase().trim();
  if (m.includes('audio/x-m4a') || m.includes('audio/m4a')) return 'audio/mp4';
  if (m.includes('audio/x-wav')) return 'audio/wav';
  return mime;
}

export function IntegratedTranscriptPlayer({
  meetingId,
  audioBackup,
  onTimeUpdate,
  onPlayStateChange,
  seekTo,
  className,
}: IntegratedTranscriptPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isStartingPlayback, setIsStartingPlayback] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioMimeType, setAudioMimeType] = useState<string | null>(null);
  const [playbackRate, setPlaybackRate] = useState(1);

  const playRequestRef = useRef<Promise<void> | null>(null);
  const timeTickerRef = useRef<number | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const stopTimeTicker = () => {
    if (timeTickerRef.current) {
      window.clearInterval(timeTickerRef.current);
      timeTickerRef.current = null;
    }
  };

  const startTimeTicker = () => {
    if (timeTickerRef.current) return;
    timeTickerRef.current = window.setInterval(() => {
      const el = audioRef.current;
      if (!el || el.paused) return;
      const t = el.currentTime;
      setCurrentTime(t);
      onTimeUpdate?.(t);
    }, 100);
  };

  // Handle external seek requests
  useEffect(() => {
    if (seekTo !== undefined && audioRef.current && isFinite(seekTo)) {
      audioRef.current.currentTime = seekTo;
      setCurrentTime(seekTo);
      onTimeUpdate?.(seekTo);
    }
  }, [seekTo]);

  // Cleanup ticker on unmount
  useEffect(() => {
    return () => {
      stopTimeTicker();
    };
  }, []);

  // Fetch audio
  useEffect(() => {
    const downloadPath = audioBackup.downloadPath;
    if (!downloadPath) {
      setError('Ingen ljudfil tillgänglig');
      return;
    }

    const fullUrl = downloadPath.startsWith('http')
      ? downloadPath
      : `${BACKEND_API_URL}${downloadPath.startsWith('/') ? '' : '/'}${downloadPath}`;

    const fetchAudio = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const token = await getAuthToken();
        const headers: HeadersInit = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const response = await fetch(fullUrl, { headers });
        if (!response.ok) {
          throw new Error(`Kunde inte ladda ljud: ${response.status}`);
        }

        const contentType = response.headers.get('Content-Type') || '';
        if (contentType.includes('application/json')) {
          const data: any = await response.json().catch(() => ({}));
          const raw = data?.error || data?.message || data;
          const msg = typeof raw === 'string' ? raw : (raw?.message || 'Kunde inte ladda ljudfilen');
          throw new Error(msg);
        }

        const blob = await response.blob();
        if (blob.size === 0) {
          throw new Error('Tom ljudfil mottagen');
        }

        const rawMime = audioBackup.mimeType || contentType || blob.type;
        const normalizedMime = normalizeAudioMimeType(rawMime) || rawMime || blob.type;
        const playableBlob =
          normalizedMime && normalizedMime !== blob.type ? new Blob([blob], { type: normalizedMime }) : blob;

        if (objectUrlRef.current) {
          URL.revokeObjectURL(objectUrlRef.current);
        }

        const url = URL.createObjectURL(playableBlob);
        objectUrlRef.current = url;
        setAudioMimeType(normalizedMime || blob.type || null);
        setAudioUrl(url);
      } catch (err: any) {
        const msg = typeof err?.message === 'string' ? err.message : 'Kunde inte ladda ljudfilen';
        setError(msg);
        setAudioUrl(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAudio();

    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [audioBackup.downloadPath, meetingId]);

  // Reload audio element when URL changes
  useEffect(() => {
    if (!audioUrl) return;
    const t = window.setTimeout(() => {
      if (playRequestRef.current) return;
      const el = audioRef.current;
      if (!el || !el.paused) return;
      try {
        el.load();
      } catch {
        // ignore
      }
    }, 50);
    return () => window.clearTimeout(t);
  }, [audioUrl, audioMimeType]);

  const formatTime = (time: number): string => {
    if (!isFinite(time) || isNaN(time)) return '0:00';
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const togglePlay = async () => {
    const el = audioRef.current;
    if (!el || !audioUrl) return;

    setError(null);
    if (playRequestRef.current) return;

    if (!el.paused) {
      el.pause();
      return;
    }

    try {
      setIsStartingPlayback(true);
      if (el.readyState === 0) {
        try { el.load(); } catch { /* ignore */ }
      }

      const p = el.play();
      if (p && typeof (p as any).then === 'function') {
        playRequestRef.current = p as Promise<void>;
        await playRequestRef.current;
      }
    } catch (err: any) {
      const msg = typeof err?.message === 'string' ? err.message : 'Kunde inte starta uppspelning';
      if (!msg.toLowerCase().includes('interrupted by a call to pause')) {
        setError(msg);
      }
    } finally {
      playRequestRef.current = null;
      setIsStartingPlayback(false);
    }
  };

  const handleSeek = (value: number[]) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = value[0];
    setCurrentTime(value[0]);
    onTimeUpdate?.(value[0]);
  };

  const skipBackward = () => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - 10);
  };

  const skipForward = () => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = Math.min(duration, audioRef.current.currentTime + 10);
  };

  const toggleMute = () => {
    if (!audioRef.current) return;
    audioRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const cyclePlaybackRate = () => {
    const rates = [1, 1.25, 1.5, 1.75, 2, 0.75];
    const currentIndex = rates.indexOf(playbackRate);
    const nextRate = rates[(currentIndex + 1) % rates.length];
    setPlaybackRate(nextRate);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextRate;
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      const time = audioRef.current.currentTime;
      setCurrentTime(time);
      onTimeUpdate?.(time);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
      audioRef.current.playbackRate = playbackRate;
    }
  };

  const handlePlay = () => {
    setIsPlaying(true);
    onPlayStateChange?.(true);
    startTimeTicker();
  };

  const handlePause = () => {
    setIsPlaying(false);
    onPlayStateChange?.(false);
    stopTimeTicker();
  };

  const handleEnded = () => {
    setIsPlaying(false);
    onPlayStateChange?.(false);
    stopTimeTicker();
  };

  const handleError = () => {
    setError('Kunde inte spela upp ljudfilen');
    setIsPlaying(false);
    onPlayStateChange?.(false);
    stopTimeTicker();
  };

  if (error && !audioUrl) {
    return (
      <div className={cn("text-sm text-muted-foreground p-4 text-center", className)}>
        {error}
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      {audioUrl && (
        <audio
          key={audioUrl}
          ref={audioRef}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onPlay={handlePlay}
          onPause={handlePause}
          onEnded={handleEnded}
          onError={handleError}
          preload="metadata"
        >
          <source src={audioUrl} type={audioMimeType || undefined} />
        </audio>
      )}

      {/* Progress bar */}
      <div className="px-1">
        <Slider
          value={[currentTime]}
          max={duration || 100}
          step={0.1}
          onValueChange={handleSeek}
          disabled={!audioUrl || duration === 0}
          className="w-full"
        />
      </div>

      {/* Controls row */}
      <div className="flex items-center justify-between gap-2">
        {/* Left side - time */}
        <div className="flex items-center gap-1 min-w-0">
          <span className="text-xs text-muted-foreground tabular-nums">
            {formatTime(currentTime)}
          </span>
          <span className="text-xs text-muted-foreground">/</span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {formatTime(duration)}
          </span>
        </div>

        {/* Center - playback controls */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={skipBackward}
            disabled={!audioUrl}
            className="h-8 w-8 rounded-full"
            title="Hoppa bakåt 10s"
          >
            <SkipBack className="w-4 h-4" />
          </Button>

          {isLoading ? (
            <div className="h-10 w-10 flex items-center justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Button
              variant={isPlaying ? "secondary" : "default"}
              size="icon"
              onClick={togglePlay}
              disabled={!audioUrl || isStartingPlayback}
              className="h-10 w-10 rounded-full"
            >
              {isStartingPlayback ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : isPlaying ? (
                <Pause className="w-5 h-5" />
              ) : (
                <Play className="w-5 h-5 ml-0.5" />
              )}
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon"
            onClick={skipForward}
            disabled={!audioUrl}
            className="h-8 w-8 rounded-full"
            title="Hoppa framåt 10s"
          >
            <SkipForward className="w-4 h-4" />
          </Button>
        </div>

        {/* Right side - speed & volume */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={cyclePlaybackRate}
            disabled={!audioUrl}
            className="h-7 px-2 text-xs font-mono"
            title="Ändra hastighet"
          >
            {playbackRate}x
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={toggleMute}
            className="h-8 w-8 rounded-full"
            disabled={!audioUrl}
          >
            {isMuted ? (
              <VolumeX className="w-4 h-4" />
            ) : (
              <Volume2 className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>

      {error && (
        <p className="text-xs text-destructive text-center">{error}</p>
      )}
    </div>
  );
}
