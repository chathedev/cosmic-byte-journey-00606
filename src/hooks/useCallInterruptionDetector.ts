import { useEffect, useRef, useState, useCallback } from "react";

interface UseCallInterruptionDetectorProps {
  enabled: boolean; // Only active for in-person mode
  isRecording: boolean;
  isPaused: boolean;
  stream: MediaStream | null;
  onInterrupted: () => void; // Called when a call is detected
}

/**
 * Detects phone call interruptions during recording.
 * On mobile, incoming calls cause:
 * 1. Page visibility to change to 'hidden'
 * 2. Audio tracks to become muted or end
 * 3. AudioContext state to change to 'interrupted' (iOS)
 * 
 * When detected, triggers onInterrupted callback to pause recording.
 * When the user returns, a resume dialog should be shown.
 */
export function useCallInterruptionDetector({
  enabled,
  isRecording,
  isPaused,
  stream,
  onInterrupted,
}: UseCallInterruptionDetectorProps) {
  const [wasInterrupted, setWasInterrupted] = useState(false);
  const [showResumeDialog, setShowResumeDialog] = useState(false);
  const interruptedAtRef = useRef<number | null>(null);
  const onInterruptedRef = useRef(onInterrupted);
  onInterruptedRef.current = onInterrupted;

  // Track if we were recording when interruption happened
  const wasRecordingRef = useRef(false);

  useEffect(() => {
    if (!enabled || !isRecording || isPaused) return;
    wasRecordingRef.current = true;
  }, [enabled, isRecording, isPaused]);

  // Monitor audio track mute events (most reliable for call detection)
  useEffect(() => {
    if (!enabled || !isRecording || isPaused || !stream) return;

    const tracks = stream.getAudioTracks();
    
    const handleMute = () => {
      console.log('📞 Audio track muted - possible incoming call');
      interruptedAtRef.current = Date.now();
      setWasInterrupted(true);
      onInterruptedRef.current();
    };

    tracks.forEach(track => {
      track.addEventListener('mute', handleMute);
    });

    return () => {
      tracks.forEach(track => {
        track.removeEventListener('mute', handleMute);
      });
    };
  }, [enabled, isRecording, isPaused, stream]);

  // Monitor page visibility - when page comes back after interruption, show resume dialog
  useEffect(() => {
    if (!enabled || !isRecording) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && !isPaused) {
        // Page went to background - might be a call
        console.log('📞 Page hidden during recording - possible call interruption');
        interruptedAtRef.current = Date.now();
      } else if (document.visibilityState === 'visible' && interruptedAtRef.current) {
        const elapsed = Date.now() - interruptedAtRef.current;
        // If gone for more than 3 seconds, likely a call/interruption
        if (elapsed > 3000 && wasRecordingRef.current) {
          console.log(`📞 Returned after ${Math.round(elapsed / 1000)}s - showing resume dialog`);
          setWasInterrupted(true);
          // Auto-pause if not already paused
          if (!isPaused) {
            onInterruptedRef.current();
          }
          setShowResumeDialog(true);
        }
        interruptedAtRef.current = null;
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [enabled, isRecording, isPaused]);

  const dismissResumeDialog = useCallback(() => {
    setShowResumeDialog(false);
    setWasInterrupted(false);
  }, []);

  return {
    wasInterrupted,
    showResumeDialog,
    dismissResumeDialog,
  };
}
