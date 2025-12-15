import { useEffect, useRef, useState, useCallback } from "react";

interface AppleWaveformProps {
  stream: MediaStream | null;
  isActive: boolean;
  isPaused?: boolean;
}

const BAR_COUNT = 50;
const MIN_HEIGHT = 4;
const MAX_HEIGHT = 40;

export const AppleWaveform = ({ stream, isActive, isPaused = false }: AppleWaveformProps) => {
  const [bars, setBars] = useState<number[]>(Array(BAR_COUNT).fill(MIN_HEIGHT));
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const smoothedBarsRef = useRef<number[]>(Array(BAR_COUNT).fill(MIN_HEIGHT));
  const phaseRef = useRef<number>(0);
  const timeRef = useRef<number>(0);

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
    if (!isActive) {
      // Fade to idle state
      const fadeOut = () => {
        let allMin = true;
        smoothedBarsRef.current = smoothedBarsRef.current.map(bar => {
          const newBar = bar * 0.92;
          if (newBar > MIN_HEIGHT + 0.3) allMin = false;
          return Math.max(MIN_HEIGHT, newBar);
        });
        setBars([...smoothedBarsRef.current]);
        if (!allMin) {
          animationRef.current = requestAnimationFrame(fadeOut);
        }
      };
      fadeOut();
      return;
    }

    if (!stream) {
      // No stream but active - show flowing idle animation
      const idleAnimate = () => {
        timeRef.current += 0.02;
        phaseRef.current += 0.03;
        
        const newBars: number[] = [];
        for (let i = 0; i < BAR_COUNT; i++) {
          // Create flowing wave effect
          const wave1 = Math.sin(phaseRef.current + i * 0.15) * 0.3;
          const wave2 = Math.sin(phaseRef.current * 0.7 + i * 0.1) * 0.2;
          const wave3 = Math.sin(phaseRef.current * 1.3 + i * 0.2) * 0.15;
          const combined = (wave1 + wave2 + wave3 + 0.65) * 0.5;
          
          const targetHeight = MIN_HEIGHT + combined * (MAX_HEIGHT * 0.4 - MIN_HEIGHT);
          const currentHeight = smoothedBarsRef.current[i];
          const smoothedHeight = currentHeight + (targetHeight - currentHeight) * 0.1;
          newBars.push(smoothedHeight);
        }
        
        smoothedBarsRef.current = newBars;
        setBars(newBars);
        animationRef.current = requestAnimationFrame(idleAnimate);
      };
      idleAnimate();
      return cleanup;
    }

    try {
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.7;
      analyserRef.current = analyser;

      const source = audioContext.createMediaStreamSource(stream);
      sourceRef.current = source;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const updateBars = () => {
        if (!analyserRef.current) return;
        
        timeRef.current += 0.016;
        phaseRef.current += 0.025;
        
        analyserRef.current.getByteFrequencyData(dataArray);
        
        // Calculate overall volume level
        let totalVolume = 0;
        for (let i = 0; i < dataArray.length; i++) {
          totalVolume += dataArray[i];
        }
        const avgVolume = totalVolume / dataArray.length / 255;
        
        const newBars: number[] = [];
        const binSize = Math.floor(dataArray.length / BAR_COUNT);
        
        for (let i = 0; i < BAR_COUNT; i++) {
          // Get frequency data for this bar
          let sum = 0;
          for (let j = 0; j < binSize; j++) {
            const idx = Math.min(i * binSize + j, dataArray.length - 1);
            sum += dataArray[idx];
          }
          const freqValue = sum / binSize / 255;
          
          // Create organic flowing base animation (always present)
          const wave1 = Math.sin(phaseRef.current + i * 0.12) * 0.25;
          const wave2 = Math.sin(phaseRef.current * 0.8 + i * 0.08) * 0.15;
          const wave3 = Math.sin(phaseRef.current * 1.4 + i * 0.18) * 0.1;
          const flowingBase = (wave1 + wave2 + wave3 + 0.5) * 0.5;
          
          // Blend between flowing animation and audio reactivity
          const audioInfluence = Math.pow(freqValue, 0.6) * 0.9;
          const baseInfluence = flowingBase * (1 - avgVolume * 0.7);
          const combined = baseInfluence + audioInfluence;
          
          const targetHeight = MIN_HEIGHT + combined * (MAX_HEIGHT - MIN_HEIGHT);
          const currentHeight = smoothedBarsRef.current[i];
          
          // Apple-like smoothing: fast attack, slower release
          const isRising = targetHeight > currentHeight;
          const smoothingFactor = isPaused ? 0.05 : (isRising ? 0.35 : 0.12);
          const smoothedHeight = currentHeight + (targetHeight - currentHeight) * smoothingFactor;
          
          newBars.push(Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, smoothedHeight)));
        }
        
        smoothedBarsRef.current = newBars;
        setBars(newBars);
        animationRef.current = requestAnimationFrame(updateBars);
      };

      updateBars();

      return cleanup;
    } catch (error) {
      console.error("Error setting up audio visualization:", error);
    }
  }, [stream, isActive, isPaused, cleanup]);

  return (
    <div className="flex items-center justify-center gap-[2px] h-14 w-full max-w-xs mx-auto">
      {bars.map((height, index) => {
        // Subtle center weight for visual balance
        const centerIndex = BAR_COUNT / 2;
        const distanceFromCenter = Math.abs(index - centerIndex) / centerIndex;
        const centerBoost = 1 - distanceFromCenter * 0.15;
        const adjustedHeight = height * centerBoost;
        
        return (
          <div
            key={index}
            className="rounded-full bg-primary transition-opacity duration-150"
            style={{
              width: 3,
              height: adjustedHeight,
              opacity: isActive ? 0.5 + (adjustedHeight / MAX_HEIGHT) * 0.5 : 0.25,
              transition: 'height 0.05s ease-out, opacity 0.15s ease-out',
            }}
          />
        );
      })}
    </div>
  );
};
