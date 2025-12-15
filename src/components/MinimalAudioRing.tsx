import { useEffect, useRef } from 'react';

interface MinimalAudioRingProps {
  stream?: MediaStream | null;
  isActive?: boolean;
  size?: number;
}

export const MinimalAudioRing = ({ stream, isActive = true, size = 120 }: MinimalAudioRingProps) => {
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number>(0);

  const ringRef = useRef<HTMLDivElement | null>(null);
  const glowRef = useRef<HTMLDivElement | null>(null);

  // Smoothed amplitude (0..1)
  const levelRef = useRef(0);

  useEffect(() => {
    // Reset visuals when inactive
    if (!stream || !isActive) {
      levelRef.current = 0;
      if (ringRef.current) ringRef.current.style.transform = 'scale(1)';
      if (glowRef.current) {
        glowRef.current.style.transform = 'scale(1)';
        glowRef.current.style.opacity = '0.12';
      }
      return;
    }

    let disposed = false;

    const setup = async () => {
      try {
        const ctx = new AudioContext();
        audioContextRef.current = ctx;

        const analyser = ctx.createAnalyser();
        analyserRef.current = analyser;
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0; // we do our own smoothing

        const source = ctx.createMediaStreamSource(stream);
        source.connect(analyser);

        const timeData = new Uint8Array(analyser.fftSize);

        const animate = () => {
          if (disposed || !analyserRef.current) return;

          // RMS from time-domain samples (more sensitive than frequency average)
          analyserRef.current.getByteTimeDomainData(timeData);
          let sumSq = 0;
          for (let i = 0; i < timeData.length; i++) {
            const v = (timeData[i] - 128) / 128;
            sumSq += v * v;
          }
          const rms = Math.sqrt(sumSq / timeData.length); // ~0..0.4 typical speech

          // Boost and curve so quiet speech still moves
          const boosted = Math.min(1, rms * 4.2);
          const target = Math.pow(boosted, 0.6);

          // Fast attack, slower release (reactive but still smooth)
          const current = levelRef.current;
          const k = target > current ? 0.35 : 0.12;
          levelRef.current = current + (target - current) * k;

          const level = levelRef.current;
          const scale = 1 + level * 0.22;

          if (ringRef.current) ringRef.current.style.transform = `scale(${scale})`;
          if (glowRef.current) {
            glowRef.current.style.transform = `scale(${scale * 1.12})`;
            glowRef.current.style.opacity = String(0.10 + level * 0.35);
          }

          animationRef.current = requestAnimationFrame(animate);
        };

        animate();
      } catch (e) {
        console.error('Audio setup failed:', e);
      }
    };

    setup();

    return () => {
      disposed = true;
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      analyserRef.current = null;
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
      audioContextRef.current = null;
    };
  }, [stream, isActive]);

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      {/* Outer glow */}
      <div
        ref={glowRef}
        className="absolute rounded-full bg-primary/10 blur-xl"
        style={{
          width: size * 0.95,
          height: size * 0.95,
          opacity: 0.12,
          transform: 'scale(1)',
          willChange: 'transform, opacity',
        }}
      />

      {/* Main ring */}
      <div
        ref={ringRef}
        className="absolute rounded-full border-2 border-primary/60"
        style={{
          width: size * 0.72,
          height: size * 0.72,
          transform: 'scale(1)',
          willChange: 'transform',
        }}
      />

      {/* Inner dot */}
      <div
        className="rounded-full bg-primary/80"
        style={{
          width: size * 0.14,
          height: size * 0.14,
        }}
      />
    </div>
  );
};

export default MinimalAudioRing;
