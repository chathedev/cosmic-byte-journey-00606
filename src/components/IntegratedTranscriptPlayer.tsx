// IntegratedTranscriptPlayer - Minimal audio player with reliable seeking

import { useState, useRef, useEffect, useCallback } from "react";
import { Play, Pause, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { type AudioBackup } from "@/lib/asrService";
import { supabase } from "@/integrations/supabase/client";

interface IntegratedTranscriptPlayerProps {
  meetingId: string;
  audioBackup: AudioBackup;
  fallbackDuration?: number;
  onTimeUpdate?: (currentTime: number) => void;
  onPlayStateChange?: (isPlaying: boolean) => void;
  onSeek?: (time: number) => void;
  seekTo?: number;
  className?: string;
}

const BACKEND_API_URL = 'https://api.tivly.se';

async function getAuthToken(): Promise<string | null> {
  const localToken = localStorage.getItem('authToken');
  if (localToken && localToken.trim().length > 0) return localToken;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || null;
  } catch { return null; }
}

function normalizeAudioMimeType(mime?: string | null): string | null {
  if (!mime) return null;
  const m = mime.toLowerCase().trim();
  if (m.includes('audio/x-m4a') || m.includes('audio/m4a')) return 'audio/mp4';
  if (m.includes('audio/x-wav')) return 'audio/wav';
  return mime;
}

function formatTime(time: number): string {
  if (!isFinite(time) || isNaN(time) || time < 0) return '0:00';
  const mins = Math.floor(time / 60);
  const secs = Math.floor(time % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function IntegratedTranscriptPlayer({
  meetingId,
  audioBackup,
  fallbackDuration,
  onTimeUpdate,
  onPlayStateChange,
  onSeek,
  seekTo,
  className,
}: IntegratedTranscriptPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isStartingPlayback, setIsStartingPlayback] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(fallbackDuration || 0);
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioMimeType, setAudioMimeType] = useState<string | null>(null);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [dragTime, setDragTime] = useState(0);


  const playRequestRef = useRef<Promise<void> | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const rafRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);
  const onTimeUpdateRef = useRef(onTimeUpdate);
  onTimeUpdateRef.current = onTimeUpdate;

  // Keep ref in sync with state
  useEffect(() => { isDraggingRef.current = isDragging; }, [isDragging]);

  // RAF-based time sync — uses refs to avoid stale closures
  useEffect(() => {
    const tick = () => {
      const el = audioRef.current;
      if (el && !el.paused && !isDraggingRef.current) {
        setCurrentTime(el.currentTime);
        onTimeUpdateRef.current?.(el.currentTime);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  // External seek
  useEffect(() => {
    if (seekTo !== undefined && audioRef.current && isFinite(seekTo)) {
      audioRef.current.currentTime = seekTo;
      setCurrentTime(seekTo);
      onTimeUpdate?.(seekTo);
    }
  }, [seekTo]);

  // Use fallback duration if audio metadata doesn't provide one
  useEffect(() => {
    if (fallbackDuration && fallbackDuration > 0 && duration === 0) {
      setDuration(fallbackDuration);
    }
  }, [fallbackDuration, duration]);


  useEffect(() => {
    const downloadPath = audioBackup.downloadPath;
    if (!downloadPath) { setError('Ingen ljudfil tillgänglig'); return; }

    const fullUrl = downloadPath.startsWith('http')
      ? downloadPath
      : `${BACKEND_API_URL}${downloadPath.startsWith('/') ? '' : '/'}${downloadPath}`;

    let cancelled = false;
    const fetchAudio = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const token = await getAuthToken();
        const headers: HeadersInit = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const response = await fetch(fullUrl, { headers });
        if (!response.ok) throw new Error(`Kunde inte ladda ljud: ${response.status}`);
        const contentType = response.headers.get('Content-Type') || '';
        if (contentType.includes('application/json')) {
          const data: any = await response.json().catch(() => ({}));
          throw new Error(typeof data?.error === 'string' ? data.error : 'Kunde inte ladda ljudfilen');
        }
        const blob = await response.blob();
        if (blob.size === 0) throw new Error('Tom ljudfil mottagen');
        if (cancelled) return;

        const rawMime = audioBackup.mimeType || contentType || blob.type;
        const normalizedMime = normalizeAudioMimeType(rawMime) || rawMime || blob.type;
        const playableBlob = normalizedMime && normalizedMime !== blob.type ? new Blob([blob], { type: normalizedMime }) : blob;

        if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
        const url = URL.createObjectURL(playableBlob);
        objectUrlRef.current = url;
        setAudioMimeType(normalizedMime || blob.type || null);
        setAudioUrl(url);
      } catch (err: any) {
        if (!cancelled) { setError(err?.message || 'Kunde inte ladda ljudfilen'); setAudioUrl(null); }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    fetchAudio();
    return () => { cancelled = true; if (objectUrlRef.current) { URL.revokeObjectURL(objectUrlRef.current); objectUrlRef.current = null; } };
  }, [audioBackup.downloadPath, meetingId]);

  // Load audio element
  useEffect(() => {
    if (!audioUrl) return;
    const t = setTimeout(() => {
      if (playRequestRef.current) return;
      const el = audioRef.current;
      if (el && el.paused) { try { el.load(); } catch {} }
    }, 50);
    return () => clearTimeout(t);
  }, [audioUrl, audioMimeType]);

  // --- Pointer-based seeking on the progress bar ---
  const getTimeFromPointer = useCallback((clientX: number): number => {
    const bar = progressBarRef.current;
    if (!bar || !duration) return 0;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return ratio * duration;
  }, [duration]);

  const commitSeek = useCallback((time: number) => {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = time;
    setCurrentTime(time);
    onTimeUpdate?.(time);
    onSeek?.(time);
  }, [onTimeUpdate, onSeek]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!duration) return;
    e.preventDefault();
    e.stopPropagation();
    const bar = progressBarRef.current;
    if (bar) {
      try { bar.setPointerCapture(e.pointerId); } catch {}
    }
    setIsDragging(true);
    const t = getTimeFromPointer(e.clientX);
    setDragTime(t);
  }, [duration, getTimeFromPointer]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging) return;
    e.preventDefault();
    const t = getTimeFromPointer(e.clientX);
    setDragTime(t);
  }, [isDragging, getTimeFromPointer]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!isDragging) return;
    e.preventDefault();
    const bar = progressBarRef.current;
    if (bar) {
      try { bar.releasePointerCapture(e.pointerId); } catch {}
    }
    setIsDragging(false);
    const t = getTimeFromPointer(e.clientX);
    commitSeek(t);
  }, [isDragging, getTimeFromPointer, commitSeek]);

  const togglePlay = async () => {
    const el = audioRef.current;
    if (!el || !audioUrl) return;
    setError(null);
    if (playRequestRef.current) return;
    if (!el.paused) { el.pause(); return; }
    try {
      setIsStartingPlayback(true);
      if (el.readyState === 0) { try { el.load(); } catch {} }
      const p = el.play();
      if (p) { playRequestRef.current = p; await p; }
    } catch (err: any) {
      if (!err?.message?.toLowerCase().includes('interrupted by a call to pause')) setError(err?.message || 'Uppspelningsfel');
    } finally { playRequestRef.current = null; setIsStartingPlayback(false); }
  };

  const cyclePlaybackRate = () => {
    const rates = [1, 1.25, 1.5, 2];
    const next = rates[(rates.indexOf(playbackRate) + 1) % rates.length];
    setPlaybackRate(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      const d = audioRef.current.duration;
      if (isFinite(d) && d > 0) setDuration(d);
      audioRef.current.playbackRate = playbackRate;
    }
  };

  const handlePlay = () => { setIsPlaying(true); onPlayStateChange?.(true); };
  const handlePause = () => { setIsPlaying(false); onPlayStateChange?.(false); };
  const handleEnded = () => { setIsPlaying(false); onPlayStateChange?.(false); };
  const handleError = () => { setError('Kunde inte spela upp ljudfilen'); setIsPlaying(false); onPlayStateChange?.(false); };

  const displayTime = isDragging ? dragTime : currentTime;
  const progress = duration > 0 ? (displayTime / duration) * 100 : 0;

  if (error && !audioUrl) {
    return <div className={cn("text-sm text-muted-foreground p-3 text-center", className)}>{error}</div>;
  }

  return (
    <div className={cn("flex items-center gap-3 py-2", className)}>
      {audioUrl && (
        <audio
          key={audioUrl}
          ref={audioRef}
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

      {/* Play button */}
      {isLoading ? (
        <div className="h-9 w-9 flex items-center justify-center shrink-0">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Button
          variant="ghost"
          size="icon"
          onClick={togglePlay}
          disabled={!audioUrl || isStartingPlayback}
          className="h-9 w-9 shrink-0 rounded-full"
        >
          {isStartingPlayback ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : isPlaying ? (
            <Pause className="w-4 h-4" />
          ) : (
            <Play className="w-4 h-4 ml-0.5" />
          )}
        </Button>
      )}

      {/* Time */}
      <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap shrink-0 min-w-[3rem]">
        {formatTime(displayTime)}
      </span>

      {/* Progress bar - custom pointer-based seeking */}
      <div
        ref={progressBarRef}
        className="relative flex-1 h-8 flex items-center cursor-pointer touch-none select-none group"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* Track */}
        <div className="absolute inset-x-0 h-1.5 rounded-full bg-muted pointer-events-none">
          {/* Filled */}
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-primary transition-[width] duration-75 pointer-events-none"
            style={{ width: `${Math.min(100, progress)}%` }}
          />
        </div>
        {/* Thumb */}
        {duration > 0 && (
          <div
            className={cn(
              "absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 md:w-3.5 md:h-3.5 rounded-full bg-primary shadow-sm border-2 border-background transition-[left] duration-75 pointer-events-none",
              isDragging && "scale-125"
            )}
            style={{ left: `${Math.min(100, progress)}%` }}
          />
        )}
      </div>

      {/* End time */}
      <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap shrink-0 min-w-[3rem] text-right">
        {duration > 0 ? formatTime(duration) : '--:--'}
      </span>

      {/* Speed */}
      <button
        onClick={cyclePlaybackRate}
        disabled={!audioUrl}
        className="text-xs font-mono text-muted-foreground hover:text-foreground transition-colors shrink-0 px-1"
      >
        {playbackRate}x
      </button>

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
