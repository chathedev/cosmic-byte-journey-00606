// Audio Player Card - Allows users to listen to their meeting recordings
// Uses the audio backup download path to stream audio

import { useState, useRef, useEffect } from "react";
import { Play, Pause, Volume2, VolumeX, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { type AudioBackup } from "@/lib/asrService";

interface AudioPlayerCardProps {
  meetingId: string;
  audioBackup: AudioBackup;
  className?: string;
  variant?: 'compact' | 'full';
}

const BACKEND_API_URL = 'https://api.tivly.se';

export function AudioPlayerCard({
  meetingId,
  audioBackup,
  className = '',
  variant = 'compact'
}: AudioPlayerCardProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  // Fetch audio as a blob (so we can attach auth headers) and use it for playback.
  // Note: HTMLAudioElement cannot send custom headers, so we must create an object URL.
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('authToken');
    const downloadPath = audioBackup.downloadPath;

    if (!downloadPath) {
      setError('Ingen ljudfil tillgänglig');
      return;
    }

    // Build full URL
    const fullUrl = downloadPath.startsWith('http')
      ? downloadPath
      : `${BACKEND_API_URL}${downloadPath.startsWith('/') ? '' : '/'}${downloadPath}`;

    const fetchAudio = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const headers: HeadersInit = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const response = await fetch(fullUrl, { headers });
        if (!response.ok) {
          throw new Error(`Kunde inte ladda ljud: ${response.status}`);
        }

        const contentType = response.headers.get('Content-Type') || '';
        if (contentType.includes('application/json')) {
          // Some backends return JSON error payloads with 200s in edge cases (auth, etc.)
          const data: any = await response.json().catch(() => ({}));
          const raw = data?.error || data?.message || data;
          const msg = typeof raw === 'string' ? raw : (raw?.message || 'Kunde inte ladda ljudfilen');
          throw new Error(msg);
        }

        const blob = await response.blob();

        // Revoke previous object URL (if any)
        if (objectUrlRef.current) {
          URL.revokeObjectURL(objectUrlRef.current);
        }

        const url = URL.createObjectURL(blob);
        objectUrlRef.current = url;
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
  }, [audioBackup.downloadPath]);

  // Format time as mm:ss
  const formatTime = (time: number): string => {
    if (!isFinite(time) || isNaN(time)) return '0:00';
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // Handle play/pause
  const togglePlay = async () => {
    const el = audioRef.current;
    if (!el) return;

    setError(null);

    try {
      if (isPlaying) {
        el.pause();
        return;
      }

      // Optimistically flip state so the user sees feedback immediately.
      setIsPlaying(true);

      const maybePromise = el.play();
      // In modern browsers, play() returns a Promise that can reject (autoplay policy, decode errors, etc.)
      if (maybePromise && typeof (maybePromise as any).catch === 'function') {
        await (maybePromise as Promise<void>);
      }
    } catch (err: any) {
      const msg = typeof err?.message === 'string' ? err.message : 'Kunde inte starta uppspelning';
      setError(msg);
      setIsPlaying(false);
    }
  };

  // Handle seek
  const handleSeek = (value: number[]) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = value[0];
    setCurrentTime(value[0]);
  };

  // Handle skip backward 10s
  const handleRewind = () => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - 10);
  };

  // Toggle mute
  const toggleMute = () => {
    if (!audioRef.current) return;
    audioRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  // Audio event handlers
  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handlePlay = () => setIsPlaying(true);
  const handlePause = () => setIsPlaying(false);
  const handleEnded = () => setIsPlaying(false);

  const handleError = () => {
    setError('Kunde inte spela upp ljudfilen');
    setIsPlaying(false);
  };

  if (error && !audioUrl) {
    return (
      <div className={cn("text-xs text-muted-foreground", className)}>
        {error}
      </div>
    );
  }

  // Compact variant - inline player
  if (variant === 'compact') {
    return (
      <div className={cn("space-y-2", className)}>
        {audioUrl && (
          <audio
            ref={audioRef}
            src={audioUrl}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onPlay={handlePlay}
            onPause={handlePause}
            onEnded={handleEnded}
            onError={handleError}
            preload="metadata"
          />
        )}

        <div className="flex items-center gap-2">
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          ) : (
            <>
              <Button
                variant="ghost"
                size="icon"
                onClick={togglePlay}
                disabled={!audioUrl}
                className="h-8 w-8 rounded-full"
              >
                {isPlaying ? (
                  <Pause className="w-4 h-4" />
                ) : (
                  <Play className="w-4 h-4 ml-0.5" />
                )}
              </Button>

              <div className="flex-1 flex items-center gap-2 min-w-0">
                <span className="text-xs text-muted-foreground tabular-nums w-10 shrink-0">
                  {formatTime(currentTime)}
                </span>
                <Slider
                  value={[currentTime]}
                  max={duration || 100}
                  step={0.1}
                  onValueChange={handleSeek}
                  disabled={!audioUrl || duration === 0}
                  className="flex-1"
                />
                <span className="text-xs text-muted-foreground tabular-nums w-10 shrink-0">
                  {formatTime(duration)}
                </span>
              </div>

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
            </>
          )}
        </div>

        {error && (
          <p className="text-xs text-destructive">{error}</p>
        )}
      </div>
    );
  }

  // Full variant - card with more controls
  return (
    <div className={cn(
      "rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm p-4",
      className
    )}>
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onPlay={handlePlay}
          onPause={handlePause}
          onEnded={handleEnded}
          onError={handleError}
          preload="metadata"
        />
      )}
      
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Volume2 className="w-6 h-6 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm">Lyssna på inspelningen</p>
          <p className="text-xs text-muted-foreground truncate">
            {audioBackup.originalName || `inspelning-${meetingId.slice(0, 8)}.wav`}
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">Laddar ljud...</span>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Progress bar */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground tabular-nums w-12 text-right">
              {formatTime(currentTime)}
            </span>
            <Slider
              value={[currentTime]}
              max={duration || 100}
              step={0.1}
              onValueChange={handleSeek}
              disabled={!audioUrl || duration === 0}
              className="flex-1"
            />
            <span className="text-xs text-muted-foreground tabular-nums w-12">
              {formatTime(duration)}
            </span>
          </div>
          
          {/* Controls */}
          <div className="flex items-center justify-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRewind}
              disabled={!audioUrl}
              className="h-10 w-10 rounded-full"
            >
              <RotateCcw className="w-4 h-4" />
            </Button>
            
            <Button
              variant="default"
              size="icon"
              onClick={togglePlay}
              disabled={!audioUrl}
              className="h-12 w-12 rounded-full"
            >
              {isPlaying ? (
                <Pause className="w-5 h-5" />
              ) : (
                <Play className="w-5 h-5 ml-0.5" />
              )}
            </Button>
            
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleMute}
              disabled={!audioUrl}
              className="h-10 w-10 rounded-full"
            >
              {isMuted ? (
                <VolumeX className="w-4 h-4" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p className="text-xs text-destructive text-center mt-2">{error}</p>
      )}
    </div>
  );
}
