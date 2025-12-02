import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

interface AudioVisualizationBarsProps {
  stream: MediaStream | null;
  isActive: boolean;
}

export const AudioVisualizationBars = ({ stream, isActive }: AudioVisualizationBarsProps) => {
  const [bars, setBars] = useState<number[]>(Array(5).fill(0.15));
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (!stream || !isActive) {
      setBars(Array(5).fill(0.15));
      return;
    }

    try {
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 32;
      analyser.smoothingTimeConstant = 0.8;
      analyserRef.current = analyser;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const updateBars = () => {
        if (!analyserRef.current) return;
        
        analyserRef.current.getByteFrequencyData(dataArray);
        
        // Sample 5 frequency bands with smoothing
        const newBars = [];
        const bands = [2, 4, 6, 8, 10];
        for (let i = 0; i < 5; i++) {
          const value = dataArray[bands[i]] / 255;
          // Smooth curve with minimum height
          newBars.push(Math.max(0.15, Math.pow(value, 0.7) * 0.85 + 0.15));
        }
        
        setBars(newBars);
        animationRef.current = requestAnimationFrame(updateBars);
      };

      updateBars();

      return () => {
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current);
        }
        if (audioContextRef.current) {
          audioContextRef.current.close();
        }
      };
    } catch (error) {
      console.error("Error setting up audio visualization:", error);
    }
  }, [stream, isActive]);

  return (
    <div className="flex items-center justify-center gap-1 h-16">
      {bars.map((height, index) => (
        <motion.div
          key={index}
          className="w-1 rounded-full bg-primary"
          initial={{ height: "15%" }}
          animate={{ 
            height: `${height * 100}%`,
            opacity: isActive ? 0.4 + height * 0.6 : 0.2,
          }}
          transition={{
            type: "spring",
            stiffness: 300,
            damping: 20,
            mass: 0.5,
          }}
        />
      ))}
    </div>
  );
};
