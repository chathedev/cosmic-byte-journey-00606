// RecordingIndicator - Always-on-screen floating indicator during recording
// Shows recording status, duration, and allows quick actions
// Works on both web and iOS native app

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, Pause, Square, Shield, Clock, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { isNativeApp } from "@/utils/capacitorDetection";

interface RecordingIndicatorProps {
  isRecording: boolean;
  isPaused: boolean;
  durationSec: number;
  isBackupEnabled?: boolean;
  chunksSaved?: number;
  onPause?: () => void;
  onStop?: () => void;
  className?: string;
  compact?: boolean;
}

export function RecordingIndicator({
  isRecording,
  isPaused,
  durationSec,
  isBackupEnabled = true,
  chunksSaved = 0,
  onPause,
  onStop,
  className,
  compact = false,
}: RecordingIndicatorProps) {
  const [pulseVisible, setPulseVisible] = useState(true);
  const isNative = isNativeApp();

  // Pulse animation for active recording
  useEffect(() => {
    if (!isRecording || isPaused) {
      setPulseVisible(false);
      return;
    }

    const interval = setInterval(() => {
      setPulseVisible((prev) => !prev);
    }, 1000);

    return () => clearInterval(interval);
  }, [isRecording, isPaused]);

  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  if (!isRecording) return null;

  // Compact mode - minimal floating pill
  if (compact) {
    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: -10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: -10 }}
          className={cn(
            "fixed z-[9999] flex items-center gap-2 px-3 py-1.5 rounded-full",
            "bg-background/95 backdrop-blur-md border border-border/50 shadow-lg",
            isNative ? "top-safe left-4 mt-2" : "top-4 left-4",
            className
          )}
        >
          {/* Recording dot */}
          <div className="relative">
            <div
              className={cn(
                "w-2.5 h-2.5 rounded-full transition-colors",
                isPaused ? "bg-amber-500" : "bg-red-500"
              )}
            />
            {!isPaused && (
              <motion.div
                animate={{ scale: [1, 1.8, 1], opacity: [1, 0, 1] }}
                transition={{ repeat: Infinity, duration: 1.5 }}
                className="absolute inset-0 w-2.5 h-2.5 rounded-full bg-red-500"
              />
            )}
          </div>

          {/* Duration */}
          <span className="font-mono text-xs font-medium tabular-nums">
            {formatTime(durationSec)}
          </span>

          {/* Status text */}
          <span className="text-xs text-muted-foreground">
            {isPaused ? "Pausad" : "REC"}
          </span>

          {/* Backup indicator */}
          {isBackupEnabled && chunksSaved > 0 && (
            <Shield className="w-3 h-3 text-green-500" />
          )}
        </motion.div>
      </AnimatePresence>
    );
  }

  // Full mode - expanded floating card with controls
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        className={cn(
          "fixed z-[9999] flex flex-col gap-2 p-3 rounded-2xl min-w-[200px]",
          "bg-background/95 backdrop-blur-xl border border-border/50 shadow-2xl",
          isNative ? "bottom-safe right-4 mb-20" : "bottom-24 right-4",
          className
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {/* Animated recording icon */}
            <div className="relative">
              <div
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center transition-colors",
                  isPaused
                    ? "bg-amber-500/15"
                    : "bg-red-500/15"
                )}
              >
                {isPaused ? (
                  <Pause className="w-4 h-4 text-amber-500" />
                ) : (
                  <Mic className="w-4 h-4 text-red-500" />
                )}
              </div>
              {!isPaused && (
                <motion.div
                  animate={{ scale: [1, 1.4, 1], opacity: [0.5, 0, 0.5] }}
                  transition={{ repeat: Infinity, duration: 1.5 }}
                  className="absolute inset-0 rounded-full bg-red-500/20"
                />
              )}
            </div>

            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-lg font-semibold tabular-nums">
                  {formatTime(durationSec)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {isPaused ? "Inspelning pausad" : "Spelar in..."}
              </p>
            </div>
          </div>
        </div>

        {/* Backup status */}
        <div className="flex items-center gap-2 px-1">
          {isBackupEnabled ? (
            <div className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
              <Shield className="w-3.5 h-3.5" />
              <span>Auto-backup aktiv</span>
              {chunksSaved > 0 && (
                <span className="text-muted-foreground">
                  ({chunksSaved} delar sparade)
                </span>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Backup ej tillgänglig</span>
            </div>
          )}
        </div>

        {/* Controls */}
        {(onPause || onStop) && (
          <div className="flex items-center gap-2 mt-1">
            {onPause && (
              <button
                onClick={onPause}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-medium transition-colors",
                  isPaused
                    ? "bg-primary/10 text-primary hover:bg-primary/20"
                    : "bg-muted hover:bg-muted/80"
                )}
              >
                {isPaused ? (
                  <>
                    <Mic className="w-3.5 h-3.5" />
                    Återuppta
                  </>
                ) : (
                  <>
                    <Pause className="w-3.5 h-3.5" />
                    Pausa
                  </>
                )}
              </button>
            )}
            {onStop && (
              <button
                onClick={onStop}
                className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <Square className="w-3.5 h-3.5" />
                Avsluta
              </button>
            )}
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
