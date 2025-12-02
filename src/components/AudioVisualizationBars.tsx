import { useEffect, useRef, useState } from "react";

interface AudioVisualizationBarsProps {
  stream: MediaStream | null;
  isActive: boolean;
}

export const AudioVisualizationBars = ({ stream, isActive }: AudioVisualizationBarsProps) => {
  const [bars, setBars] = useState<number[]>(Array(12).fill(0.1));
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (!stream || !isActive) {
      setBars(Array(12).fill(0.1));
      return;
    }

    try {
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 64;
      analyserRef.current = analyser;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const updateBars = () => {
        if (!analyserRef.current) return;
        
        analyserRef.current.getByteFrequencyData(dataArray);
        
        // Sample 12 frequency bands
        const newBars = [];
        const step = Math.floor(dataArray.length / 12);
        for (let i = 0; i < 12; i++) {
          const value = dataArray[i * step] / 255;
          // Add some minimum height and smoothing
          newBars.push(Math.max(0.1, value * 0.8 + 0.1));
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
    <div className="flex items-end justify-center gap-1.5 h-24 md:h-32">
      {bars.map((height, index) => (
        <div
          key={index}
          className="w-3 md:w-4 rounded-full bg-primary transition-all duration-75 ease-out"
          style={{
            height: `${height * 100}%`,
            opacity: isActive ? 0.6 + height * 0.4 : 0.3,
          }}
        />
      ))}
    </div>
  );
};
