// Audio Player Card - Allows users to listen to their meeting recordings
// Uses the audio backup download path to stream audio

import { useState, useRef, useEffect } from "react";
import { Play, Pause, Volume2, VolumeX, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { type AudioBackup } from "@/lib/asrService";
import { supabase } from "@/integrations/supabase/client";

interface AudioPlayerCardProps {
  meetingId: string;
  audioBackup: AudioBackup;
  className?: string;
  variant?: 'compact' | 'full';
}

const BACKEND_API_URL = 'https://api.tivly.se';

// Get auth token with fallback to Supabase session
async function getAuthToken(): Promise<string | null> {
  // Check localStorage first (api.tivly.se auth)
  const localToken = localStorage.getItem('authToken');
  if (localToken && localToken.trim().length > 0) {
    return localToken;
  }

  // Fall back to Supabase session
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || null;
  } catch {
    return null;
  }
}

// Some browsers are picky about MIME types on Blob URLs.
// E.g. "audio/x-m4a" often needs to be presented as "audio/mp4" for playback.
function normalizeAudioMimeType(mime?: string | null): string | null {
  if (!mime) return null;

  const m = mime.toLowerCase().trim();

  // M4A (AAC in MP4 container)
  if (m.includes('audio/x-m4a') || m.includes('audio/m4a')) return 'audio/mp4';

  // Common aliases
  if (m.includes('audio/x-wav')) return 'audio/wav';

  return mime;
}

export function AudioPlayerCard({
  meetingId,
  audioBackup,
  className = '',
  variant = 'compact'
}: AudioPlayerCardProps) {
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

  // Prevent double-click races (play() promise pending -> pause() called -> Chrome warns)
  const playRequestRef = useRef<Promise<void> | null>(null);

  // Fetch audio as a blob (so we can attach auth headers) and use it for playback.
  // Note: HTMLAudioElement cannot send custom headers, so we must create an object URL.
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    const downloadPath = audioBackup.downloadPath;

    console.log('[AudioPlayer] Init:', { meetingId, downloadPath, audioBackup });

    if (!downloadPath) {
      console.log('[AudioPlayer] No downloadPath available');
      setError('Ingen ljudfil tillgänglig');
      return;
    }

    // Build full URL
    const fullUrl = downloadPath.startsWith('http')
      ? downloadPath
      : `${BACKEND_API_URL}${downloadPath.startsWith('/') ? '' : '/'}${downloadPath}`;

    console.log('[AudioPlayer] Fetching audio from:', fullUrl);

    const fetchAudio = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const token = await getAuthToken();
        console.log('[AudioPlayer] Auth token available:', !!token);

        const headers: HeadersInit = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const response = await fetch(fullUrl, { headers });
        console.log('[AudioPlayer] Response:', { status: response.status, ok: response.ok });

        if (!response.ok) {
          throw new Error(`Kunde inte ladda ljud: ${response.status}`);
        }

        const contentType = response.headers.get('Content-Type') || '';
        console.log('[AudioPlayer] Content-Type:', contentType);

        if (contentType.includes('application/json')) {
          // Some backends return JSON error payloads with 200s in edge cases (auth, etc.)
          const data: any = await response.json().catch(() => ({}));
          console.log('[AudioPlayer] JSON response (error):', data);
          const raw = data?.error || data?.message || data;
          const msg = typeof raw === 'string' ? raw : (raw?.message || 'Kunde inte ladda ljudfilen');
          throw new Error(msg);
        }

        const blob = await response.blob();
        console.log('[AudioPlayer] Blob received:', { size: blob.size, type: blob.type });

        if (blob.size === 0) {
          throw new Error('Tom ljudfil mottagen');
        }

        const rawMime = audioBackup.mimeType || contentType || blob.type;
        const normalizedMime = normalizeAudioMimeType(rawMime) || rawMime || blob.type;
        const canPlay = normalizedMime ? document.createElement('audio').canPlayType(normalizedMime) : '';
        console.log('[AudioPlayer] MIME normalize:', { rawMime, normalizedMime, canPlay });

        const playableBlob =
          normalizedMime && normalizedMime !== blob.type ? new Blob([blob], { type: normalizedMime }) : blob;

        // Revoke previous object URL (if any)
        if (objectUrlRef.current) {
          URL.revokeObjectURL(objectUrlRef.current);
        }

        const url = URL.createObjectURL(playableBlob);
        objectUrlRef.current = url;
        setAudioMimeType(normalizedMime || blob.type || null);
        setAudioUrl(url);
        console.log('[AudioPlayer] Audio URL created successfully');
      } catch (err: any) {
        console.error('[AudioPlayer] Error:', err);
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

  // Make sure the element re-loads when a new blob URL (or MIME) is set.
  // (But avoid calling load() while a play() request is in-flight.)
  useEffect(() => {
    if (!audioUrl) return;

    const t = window.setTimeout(() => {
      // If user already clicked play, don't interrupt it.
      if (playRequestRef.current) return;

      const el = audioRef.current;
      if (!el) return;
      // Only reload while paused to avoid aborting playback.
      if (!el.paused) return;

      try {
        el.load();
      } catch {
        // ignore
      }
    }, 50);

    return () => window.clearTimeout(t);
  }, [audioUrl, audioMimeType]);

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
    if (!el || !audioUrl) return;

    setError(null);

    // If a play() is in-flight, ignore clicks to avoid play/pause race warnings.
    if (playRequestRef.current) return;

    // Use the element's real state (more reliable than React state during async play())
    if (!el.paused) {
      el.pause();
      return;
    }

    try {
      setIsStartingPlayback(true);

      // Ensure we have latest source parsed
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

      // Chrome logs this when a play() is interrupted (often by rapid user clicks).
      if (!msg.toLowerCase().includes('interrupted by a call to pause')) {
        setError(msg);
      }
    } finally {
      playRequestRef.current = null;
      setIsStartingPlayback(false);
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

        <div className="flex items-center gap-2">
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          ) : (
            <>
              <Button
                variant="ghost"
                size="icon"
                onClick={togglePlay}
                disabled={!audioUrl || isStartingPlayback}
                className="h-8 w-8 rounded-full"
              >
                {isStartingPlayback ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : isPlaying ? (
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
              disabled={!audioUrl || isStartingPlayback}
              className="h-12 w-12 rounded-full"
            >
              {isStartingPlayback ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : isPlaying ? (
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
