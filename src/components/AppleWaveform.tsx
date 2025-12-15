import { useEffect, useRef, useState, useCallback } from "react";
import { motion } from "framer-motion";

interface AppleWaveformProps {
  stream: MediaStream | null;
  isActive: boolean;
  isPaused?: boolean;
}

const BAR_COUNT = 40;
const MIN_HEIGHT = 3;
const MAX_HEIGHT = 48;

export const AppleWaveform = ({ stream, isActive, isPaused = false }: AppleWaveformProps) => {
  const [bars, setBars] = useState<number[]>(Array(BAR_COUNT).fill(MIN_HEIGHT));
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const smoothedBarsRef = useRef<number[]>(Array(BAR_COUNT).fill(MIN_HEIGHT));

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
    if (!stream || !isActive || isPaused) {
      // Smoothly animate bars to minimum when inactive
      const animateToMin = () => {
        let allMin = true;
        smoothedBarsRef.current = smoothedBarsRef.current.map(bar => {
          const newBar = bar * 0.9;
          if (newBar > MIN_HEIGHT + 0.5) allMin = false;
          return Math.max(MIN_HEIGHT, newBar);
        });
        setBars([...smoothedBarsRef.current]);
        if (!allMin && !isActive) {
          animationRef.current = requestAnimationFrame(animateToMin);
        }
      };
      animateToMin();
      return;
    }

    try {
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.75;
      analyserRef.current = analyser;

      const source = audioContext.createMediaStreamSource(stream);
      sourceRef.current = source;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const updateBars = () => {
        if (!analyserRef.current || isPaused) return;
        
        analyserRef.current.getByteFrequencyData(dataArray);
        
        // Create smooth waveform bars from frequency data
        const newBars: number[] = [];
        const binSize = Math.floor(dataArray.length / BAR_COUNT);
        
        for (let i = 0; i < BAR_COUNT; i++) {
          // Get average of frequency bins for this bar
          let sum = 0;
          for (let j = 0; j < binSize; j++) {
            sum += dataArray[i * binSize + j];
          }
          const avg = sum / binSize;
          
          // Normalize and apply smoothing curve (Apple-like response)
          const normalized = avg / 255;
          const curved = Math.pow(normalized, 0.7);
          const targetHeight = MIN_HEIGHT + curved * (MAX_HEIGHT - MIN_HEIGHT);
          
          // Smooth transition with faster attack, slower release (like Apple Voice Memos)
          const currentHeight = smoothedBarsRef.current[i];
          const smoothingFactor = targetHeight > currentHeight ? 0.4 : 0.15;
          const smoothedHeight = currentHeight + (targetHeight - currentHeight) * smoothingFactor;
          
          newBars.push(smoothedHeight);
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
    <div className="flex items-center justify-center gap-[2px] h-16 px-4 w-full max-w-xs mx-auto">
      {bars.map((height, index) => {
        // Create a wave effect - bars in center are taller
        const centerIndex = BAR_COUNT / 2;
        const distanceFromCenter = Math.abs(index - centerIndex) / centerIndex;
        const centerBoost = 1 - distanceFromCenter * 0.3;
        const adjustedHeight = height * centerBoost;
        
        return (
          <motion.div
            key={index}
            className="rounded-full bg-primary"
            style={{
              width: 3,
              minHeight: MIN_HEIGHT,
            }}
            animate={{
              height: adjustedHeight,
              opacity: isActive && !isPaused ? 0.6 + (adjustedHeight / MAX_HEIGHT) * 0.4 : 0.3,
            }}
            transition={{
              type: "spring",
              stiffness: 400,
              damping: 25,
              mass: 0.3,
            }}
          />
        );
      })}
    </div>
  );
};
