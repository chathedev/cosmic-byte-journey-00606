import { useEffect, useRef, useState } from 'react';

interface MinimalAudioRingProps {
  stream?: MediaStream | null;
  isActive?: boolean;
  size?: number;
}

export const MinimalAudioRing = ({ stream, isActive = true, size = 120 }: MinimalAudioRingProps) => {
  const [scale, setScale] = useState(1);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number>(0);
  const smoothedRef = useRef(0);

  useEffect(() => {
    if (!stream || !isActive) {
      setScale(1);
      return;
    }

    const setup = async () => {
      try {
        audioContextRef.current = new AudioContext();
        analyserRef.current = audioContextRef.current.createAnalyser();
        analyserRef.current.fftSize = 128;
        analyserRef.current.smoothingTimeConstant = 0.85;
        
        const source = audioContextRef.current.createMediaStreamSource(stream);
        source.connect(analyserRef.current);
        
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        
        const animate = () => {
          if (!analyserRef.current) return;
          
          analyserRef.current.getByteFrequencyData(dataArray);
          
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const amplitude = sum / dataArray.length / 255;
          
          // Smooth interpolation
          smoothedRef.current += (amplitude - smoothedRef.current) * 0.15;
          
          // Scale from 1 to 1.15
          setScale(1 + smoothedRef.current * 0.15);
          
          animationRef.current = requestAnimationFrame(animate);
        };
        
        animate();
      } catch (e) {
        console.error('Audio setup failed:', e);
      }
    };

    setup();

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (audioContextRef.current?.state !== 'closed') {
        audioContextRef.current?.close();
      }
    };
  }, [stream, isActive]);

  return (
    <div 
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      {/* Outer glow */}
      <div
        className="absolute rounded-full bg-primary/10 transition-transform duration-150 ease-out"
        style={{
          width: size * 0.9,
          height: size * 0.9,
          transform: `scale(${scale * 1.1})`,
        }}
      />
      
      {/* Main ring */}
      <div
        className="absolute rounded-full border-2 border-primary/60 transition-transform duration-150 ease-out"
        style={{
          width: size * 0.7,
          height: size * 0.7,
          transform: `scale(${scale})`,
        }}
      />
      
      {/* Inner dot */}
      <div
        className="rounded-full bg-primary/80"
        style={{
          width: size * 0.15,
          height: size * 0.15,
        }}
      />
    </div>
  );
};

export default MinimalAudioRing;
