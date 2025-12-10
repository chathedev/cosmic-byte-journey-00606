import { useState, useEffect, useRef, useCallback } from 'react';

interface VoiceReactiveRingProps {
  size?: number;
  stream?: MediaStream | null;
  isActive?: boolean;
}

export const VoiceReactiveRing = ({ 
  size = 160, 
  stream = null,
  isActive = true 
}: VoiceReactiveRingProps) => {
  const [volumeScale, setVolumeScale] = useState(1);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const dataArrayRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const smoothedVolumeRef = useRef(0);

  const cleanup = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (analyserRef.current) {
      analyserRef.current.disconnect();
      analyserRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    // Only stop local stream if we created it (no external stream)
    if (localStreamRef.current && !stream) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
  }, [stream]);

  const analyzeVolume = useCallback(() => {
    if (!analyserRef.current || !dataArrayRef.current || !isActive) {
      setVolumeScale(1);
      return;
    }

    const dataArray = dataArrayRef.current;
    const analyser = analyserRef.current;
    analyser.getByteFrequencyData(dataArray);
    
    // Calculate average volume from frequency data
    let sum = 0;
    const length = dataArray.length;
    for (let i = 0; i < length; i++) {
      sum += dataArray[i];
    }
    const average = sum / length;
    
    // Normalize to 0-1 range (typical voice is 30-150)
    const normalized = Math.min(average / 100, 1);
    
    // Smooth the volume changes for fluid animation
    const smoothingFactor = 0.15;
    smoothedVolumeRef.current = smoothedVolumeRef.current * (1 - smoothingFactor) + normalized * smoothingFactor;
    
    // Scale between 1.0 and 1.35 based on volume
    const scale = 1 + smoothedVolumeRef.current * 0.35;
    setVolumeScale(scale);
    
    animationFrameRef.current = requestAnimationFrame(analyzeVolume);
  }, [isActive]);

  const initializeAudio = useCallback(async () => {
    try {
      let audioStream: MediaStream;
      
      if (stream) {
        // Use external stream
        audioStream = stream;
      } else {
        // Request microphone permission
        audioStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          }
        });
        localStreamRef.current = audioStream;
      }
      
      setHasPermission(true);

      // Create audio context and analyser
      audioContextRef.current = new AudioContext();
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      analyserRef.current.smoothingTimeConstant = 0.8;
      
      // Create buffer for frequency data
      const bufferLength = analyserRef.current.frequencyBinCount;
      dataArrayRef.current = new Uint8Array(bufferLength);
      
      // Connect stream to analyser
      sourceRef.current = audioContextRef.current.createMediaStreamSource(audioStream);
      sourceRef.current.connect(analyserRef.current);
      
      // Start analyzing
      analyzeVolume();
      
    } catch (error) {
      console.error('Microphone access denied or error:', error);
      setHasPermission(false);
      // Start idle animation as fallback
      startIdleAnimation();
    }
  }, [stream, analyzeVolume]);

  const startIdleAnimation = useCallback(() => {
    let phase = 0;
    const animate = () => {
      phase += 0.02;
      // Subtle breathing effect
      const scale = 1 + Math.sin(phase) * 0.08;
      setVolumeScale(scale);
      animationFrameRef.current = requestAnimationFrame(animate);
    };
    animate();
  }, []);

  useEffect(() => {
    if (isActive) {
      initializeAudio();
    } else {
      cleanup();
      setVolumeScale(1);
    }

    return cleanup;
  }, [isActive, stream, initializeAudio, cleanup]);

  // Handle stream changes
  useEffect(() => {
    if (stream && isActive && audioContextRef.current) {
      // Reconnect with new stream
      if (sourceRef.current) {
        sourceRef.current.disconnect();
      }
      sourceRef.current = audioContextRef.current.createMediaStreamSource(stream);
      sourceRef.current.connect(analyserRef.current!);
    }
  }, [stream, isActive]);

  const ringSize = size;
  const baseRingWidth = Math.max(3, size / 50);
  
  return (
    <div 
      className="relative flex items-center justify-center"
      style={{ width: ringSize, height: ringSize }}
    >
      {/* Outer glow effect */}
      <div
        className="absolute inset-0 rounded-full opacity-40"
        style={{
          background: 'radial-gradient(circle, rgba(160, 103, 255, 0.4) 0%, rgba(74, 108, 247, 0.2) 50%, transparent 70%)',
          filter: 'blur(20px)',
          transform: `scale(${volumeScale * 1.2})`,
          transition: 'transform 0.1s ease-out',
        }}
      />
      
      {/* Reactive outer ring */}
      <div
        className="absolute rounded-full"
        style={{
          width: ringSize,
          height: ringSize,
          background: 'linear-gradient(135deg, #4A6CF7 0%, #A067FF 100%)',
          opacity: 0.3,
          transform: `scale(${volumeScale})`,
          transition: 'transform 0.08s ease-out',
          filter: 'blur(8px)',
        }}
      />
      
      {/* Secondary reactive ring */}
      <div
        className="absolute rounded-full"
        style={{
          width: ringSize * 0.92,
          height: ringSize * 0.92,
          background: 'linear-gradient(135deg, #A067FF 0%, #4A6CF7 100%)',
          opacity: 0.2,
          transform: `scale(${1 + (volumeScale - 1) * 0.7})`,
          transition: 'transform 0.12s ease-out',
        }}
      />
      
      {/* Base ring */}
      <div
        className="absolute rounded-full"
        style={{
          width: ringSize * 0.85,
          height: ringSize * 0.85,
          background: 'transparent',
          border: `${baseRingWidth}px solid transparent`,
          borderRadius: '50%',
          backgroundImage: 'linear-gradient(#000, #000), linear-gradient(135deg, #4A6CF7 0%, #A067FF 50%, #4A6CF7 100%)',
          backgroundOrigin: 'border-box',
          backgroundClip: 'padding-box, border-box',
        }}
      />
      
      {/* Inner dark circle */}
      <div
        className="absolute rounded-full bg-background/95"
        style={{
          width: ringSize * 0.75,
          height: ringSize * 0.75,
          boxShadow: 'inset 0 2px 20px rgba(0, 0, 0, 0.3)',
        }}
      />
      
      {/* Center glow */}
      <div
        className="absolute rounded-full"
        style={{
          width: ringSize * 0.3,
          height: ringSize * 0.3,
          background: `radial-gradient(circle, rgba(160, 103, 255, ${0.2 + (volumeScale - 1) * 0.5}) 0%, transparent 70%)`,
          transition: 'background 0.1s ease-out',
        }}
      />
    </div>
  );
};

export default VoiceReactiveRing;
