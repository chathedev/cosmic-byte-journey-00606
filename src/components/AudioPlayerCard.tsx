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

  // Build the audio URL with auth token
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
    
    // For authenticated requests, we need to fetch the blob first
    const fetchAudio = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const headers: HeadersInit = {};
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
        
        const response = await fetch(fullUrl, { headers });
        
        if (!response.ok) {
          throw new Error(`Kunde inte ladda ljud: ${response.status}`);
        }
        
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
      } catch (err: any) {
        setError(err?.message || 'Kunde inte ladda ljudfilen');
      } finally {
        setIsLoading(false);
      }
    };

    fetchAudio();

    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
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
  const togglePlay = () => {
    if (!audioRef.current) return;
    
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
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

  // Calculate progress percentage
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

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
      <div className={cn("flex items-center gap-2", className)}>
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
