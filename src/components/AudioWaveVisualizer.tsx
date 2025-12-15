import { useEffect, useRef, useCallback } from "react";

interface AudioWaveVisualizerProps {
  stream?: MediaStream | null;
  isActive: boolean;
  size?: number;
}

export const AudioWaveVisualizer = ({ stream, isActive, size = 120 }: AudioWaveVisualizerProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const barsRef = useRef<number[]>([]);
  
  const barCount = 40;
  const barWidth = 3;
  const gap = 2;
  const maxBarHeight = size * 0.8;
  
  // Initialize bars
  useEffect(() => {
    barsRef.current = new Array(barCount).fill(0);
  }, []);

  // Setup audio context and analyser
  useEffect(() => {
    if (!stream || !isActive) {
      // Clean up when not active
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
      analyserRef.current = null;
      return;
    }

    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.7; // More smoothing for less reactivity
      
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
    } catch (error) {
      console.error("Error setting up audio context:", error);
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
    };
  }, [stream, isActive]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    const dataArray = dataArrayRef.current;
    
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const centerY = canvas.height / 2;
    const totalWidth = barCount * barWidth + (barCount - 1) * gap;
    const startX = (canvas.width - totalWidth) / 2;
    
    // Get frequency data if available
    let amplitudes: number[] = [];
    if (analyser && dataArray && isActive) {
      analyser.getByteFrequencyData(dataArray as Uint8Array<ArrayBuffer>);
      
      // Map frequency data to bar count
      const step = Math.floor(dataArray.length / barCount);
      for (let i = 0; i < barCount; i++) {
        const idx = i * step;
        // Require more audio - less boost, higher threshold
        const raw = dataArray[idx] / 255;
        const boosted = Math.pow(raw, 0.8) * 0.9; // Less boost, steeper curve
        amplitudes.push(Math.min(boosted, 1));
      }
    } else {
      amplitudes = new Array(barCount).fill(0);
    }
    
    // Smooth the bars with slower response
    for (let i = 0; i < barCount; i++) {
      const target = amplitudes[i];
      const current = barsRef.current[i];
      const k = target > current ? 0.25 : 0.08; // Slower attack and release
      barsRef.current[i] = current + (target - current) * k;
    }
    
    // Get computed primary color
    const computedStyle = getComputedStyle(document.documentElement);
    const primaryHsl = computedStyle.getPropertyValue('--primary').trim();
    
    // Draw bars (mirrored from center)
    for (let i = 0; i < barCount; i++) {
      const x = startX + i * (barWidth + gap);
      const barHeight = Math.max(4, barsRef.current[i] * maxBarHeight);
      const halfHeight = barHeight / 2;
      
      // Main bar color with opacity based on amplitude
      const opacity = 0.4 + barsRef.current[i] * 0.6;
      ctx.fillStyle = `hsla(${primaryHsl}, ${opacity})`;
      
      // Draw rounded bars from center
      ctx.beginPath();
      ctx.roundRect(x, centerY - halfHeight, barWidth, barHeight, barWidth / 2);
      ctx.fill();
    }
    
    animationRef.current = requestAnimationFrame(draw);
  }, [isActive, barCount, barWidth, gap, maxBarHeight]);

  // Start animation loop
  useEffect(() => {
    draw();
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [draw]);

  const canvasWidth = barCount * barWidth + (barCount - 1) * gap + 40;

  return (
    <div className="flex items-center justify-center">
      <canvas
        ref={canvasRef}
        width={canvasWidth}
        height={size}
        className="rounded-lg"
      />
    </div>
  );
};
