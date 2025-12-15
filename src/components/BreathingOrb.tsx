import { useEffect, useRef, useState, useCallback } from "react";

interface BreathingOrbProps {
  stream: MediaStream | null;
  isActive: boolean;
  isPaused?: boolean;
}

export const BreathingOrb = ({ stream, isActive, isPaused = false }: BreathingOrbProps) => {
  const [scale, setScale] = useState(1);
  const [intensity, setIntensity] = useState(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const smoothedVolumeRef = useRef(0);
  const phaseRef = useRef(0);

  const cleanup = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    analyserRef.current = null;
  }, []);

  useEffect(() => {
    // Gentle breathing animation when paused or no stream
    const breathe = () => {
      phaseRef.current += isPaused ? 0.008 : 0.015;
      const breathScale = 1 + Math.sin(phaseRef.current) * 0.03;
      setScale(breathScale);
      setIntensity(0.1 + Math.sin(phaseRef.current) * 0.05);
      animationRef.current = requestAnimationFrame(breathe);
    };

    if (!isActive || isPaused || !stream) {
      breathe();
      return cleanup;
    }

    try {
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.85;
      analyserRef.current = analyser;

      const source = audioContext.createMediaStreamSource(stream);
      sourceRef.current = source;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const analyze = () => {
        if (!analyserRef.current) return;
        
        phaseRef.current += 0.012;
        analyserRef.current.getByteFrequencyData(dataArray);
        
        // Calculate smooth average volume
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length / 255;
        
        // Very smooth interpolation
        smoothedVolumeRef.current += (avg - smoothedVolumeRef.current) * 0.08;
        
        // Subtle breathing base + gentle voice response
        const breathBase = 1 + Math.sin(phaseRef.current) * 0.02;
        const voiceBoost = smoothedVolumeRef.current * 0.12;
        const targetScale = breathBase + voiceBoost;
        
        setScale(targetScale);
        setIntensity(0.15 + smoothedVolumeRef.current * 0.4);
        
        animationRef.current = requestAnimationFrame(analyze);
      };

      analyze();
      return cleanup;
    } catch (error) {
      console.error("Error setting up audio visualization:", error);
      breathe();
    }
  }, [stream, isActive, isPaused, cleanup]);

  return (
    <div className="relative flex items-center justify-center w-48 h-48">
      {/* Outer soft glow */}
      <div
        className="absolute inset-0 rounded-full bg-primary/10 blur-3xl"
        style={{
          transform: `scale(${scale * 1.3})`,
          opacity: 0.4 + intensity * 0.3,
          transition: 'transform 0.3s ease-out, opacity 0.3s ease-out',
        }}
      />
      
      {/* Middle ring */}
      <div
        className="absolute w-32 h-32 rounded-full border border-primary/20"
        style={{
          transform: `scale(${scale * 1.1})`,
          opacity: 0.3 + intensity * 0.2,
          transition: 'transform 0.25s ease-out, opacity 0.25s ease-out',
        }}
      />
      
      {/* Core orb */}
      <div
        className="relative w-24 h-24 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 backdrop-blur-sm border border-primary/30"
        style={{
          transform: `scale(${scale})`,
          boxShadow: `0 0 ${40 + intensity * 30}px ${10 + intensity * 10}px hsl(var(--primary) / ${0.15 + intensity * 0.15})`,
          transition: 'transform 0.2s ease-out, box-shadow 0.3s ease-out',
        }}
      >
        {/* Inner highlight */}
        <div className="absolute inset-3 rounded-full bg-gradient-to-br from-primary/20 to-transparent" />
      </div>
    </div>
  );
};
