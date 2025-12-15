import { useEffect, useRef, useCallback } from 'react';

interface VoiceBlobProps {
  stream?: MediaStream | null;
  isActive?: boolean;
  size?: number;
}

export const VoiceBlob = ({ stream, isActive = true, size = 200 }: VoiceBlobProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  
  // Animation state refs (no re-renders needed)
  const smoothedAmplitude = useRef(0);
  const targetAmplitude = useRef(0);
  const colorPhase = useRef(0);
  const blobPoints = useRef<number[]>([]);
  const targetPoints = useRef<number[]>([]);
  const timeRef = useRef(0);

  const NUM_POINTS = 64;
  const BASE_RADIUS = size * 0.35;

  // Initialize blob points
  useEffect(() => {
    blobPoints.current = new Array(NUM_POINTS).fill(0);
    targetPoints.current = new Array(NUM_POINTS).fill(0);
  }, []);

  // Setup audio analyzer
  useEffect(() => {
    if (!stream || !isActive) return;

    const setupAudio = async () => {
      try {
        audioContextRef.current = new AudioContext();
        analyserRef.current = audioContextRef.current.createAnalyser();
        analyserRef.current.fftSize = 256;
        analyserRef.current.smoothingTimeConstant = 0.8;
        
        const source = audioContextRef.current.createMediaStreamSource(stream);
        source.connect(analyserRef.current);
        
        dataArrayRef.current = new Uint8Array(analyserRef.current.frequencyBinCount);
      } catch (e) {
        console.error('Audio setup failed:', e);
      }
    };

    setupAudio();

    return () => {
      if (audioContextRef.current?.state !== 'closed') {
        audioContextRef.current?.close();
      }
    };
  }, [stream, isActive]);

  const getAmplitude = useCallback(() => {
    if (!analyserRef.current || !dataArrayRef.current) return 0;
    
    const dataArray = dataArrayRef.current;
    analyserRef.current.getByteFrequencyData(dataArray);
    
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i];
    }
    return sum / dataArray.length / 255;
  }, []);

  // Main animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const centerX = size / 2;
    const centerY = size / 2;

    const animate = () => {
      timeRef.current += 0.016;
      const t = timeRef.current;

      // Get audio amplitude
      const rawAmplitude = isActive ? getAmplitude() : 0;
      targetAmplitude.current = rawAmplitude;
      
      // Heavy smoothing for fluid motion
      smoothedAmplitude.current += (targetAmplitude.current - smoothedAmplitude.current) * 0.08;
      const amp = smoothedAmplitude.current;

      // Update color phase based on amplitude
      colorPhase.current += 0.005 + amp * 0.02;

      // Generate target blob deformation
      for (let i = 0; i < NUM_POINTS; i++) {
        const angle = (i / NUM_POINTS) * Math.PI * 2;
        
        // Organic noise using multiple sine waves
        const noise1 = Math.sin(angle * 2 + t * 0.8) * 0.15;
        const noise2 = Math.sin(angle * 3 - t * 1.2) * 0.1;
        const noise3 = Math.sin(angle * 5 + t * 0.5) * 0.05;
        
        // Voice-reactive expansion in primary direction
        const voiceDeform = amp * 0.4 * (1 + Math.sin(angle * 2 + t * 2) * 0.5);
        
        targetPoints.current[i] = noise1 + noise2 + noise3 + voiceDeform;
      }

      // Smooth interpolation of blob points
      for (let i = 0; i < NUM_POINTS; i++) {
        blobPoints.current[i] += (targetPoints.current[i] - blobPoints.current[i]) * 0.12;
      }

      // Clear canvas
      ctx.clearRect(0, 0, size, size);

      // Create gradient colors that flow internally
      const gradient = ctx.createRadialGradient(
        centerX + Math.sin(colorPhase.current) * 20 * (1 + amp),
        centerY + Math.cos(colorPhase.current * 0.7) * 20 * (1 + amp),
        0,
        centerX,
        centerY,
        BASE_RADIUS * (1.2 + amp * 0.3)
      );

      // Blue, green, purple flowing colors
      const phase = colorPhase.current;
      const intensity = 0.7 + amp * 0.3;
      
      gradient.addColorStop(0, `hsla(${260 + Math.sin(phase) * 20}, 70%, ${55 + amp * 15}%, ${intensity})`);
      gradient.addColorStop(0.4, `hsla(${200 + Math.sin(phase * 1.3) * 30}, 65%, ${50 + amp * 10}%, ${intensity * 0.9})`);
      gradient.addColorStop(0.7, `hsla(${150 + Math.cos(phase * 0.8) * 20}, 60%, ${45 + amp * 10}%, ${intensity * 0.8})`);
      gradient.addColorStop(1, `hsla(${280 + Math.sin(phase * 0.5) * 15}, 55%, ${40 + amp * 5}%, ${intensity * 0.6})`);

      // Draw glow
      const glowRadius = BASE_RADIUS * (1.3 + amp * 0.4);
      const glowGradient = ctx.createRadialGradient(centerX, centerY, BASE_RADIUS * 0.5, centerX, centerY, glowRadius);
      glowGradient.addColorStop(0, `hsla(240, 60%, 60%, ${0.15 + amp * 0.2})`);
      glowGradient.addColorStop(0.5, `hsla(200, 50%, 50%, ${0.08 + amp * 0.1})`);
      glowGradient.addColorStop(1, 'hsla(200, 50%, 50%, 0)');
      
      ctx.beginPath();
      ctx.arc(centerX, centerY, glowRadius, 0, Math.PI * 2);
      ctx.fillStyle = glowGradient;
      ctx.fill();

      // Draw blob shape using smooth bezier curves
      ctx.beginPath();
      
      for (let i = 0; i <= NUM_POINTS; i++) {
        const idx = i % NUM_POINTS;
        const nextIdx = (i + 1) % NUM_POINTS;
        
        const angle = (idx / NUM_POINTS) * Math.PI * 2;
        const nextAngle = (nextIdx / NUM_POINTS) * Math.PI * 2;
        
        const r = BASE_RADIUS * (1 + blobPoints.current[idx]);
        const nextR = BASE_RADIUS * (1 + blobPoints.current[nextIdx]);
        
        const x = centerX + Math.cos(angle) * r;
        const y = centerY + Math.sin(angle) * r;
        
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          const prevIdx = (i - 1 + NUM_POINTS) % NUM_POINTS;
          const prevAngle = (prevIdx / NUM_POINTS) * Math.PI * 2;
          const prevR = BASE_RADIUS * (1 + blobPoints.current[prevIdx]);
          
          const cp1x = centerX + Math.cos(prevAngle + (angle - prevAngle) * 0.5) * (prevR + r) * 0.5 * 1.05;
          const cp1y = centerY + Math.sin(prevAngle + (angle - prevAngle) * 0.5) * (prevR + r) * 0.5 * 1.05;
          
          ctx.quadraticCurveTo(cp1x, cp1y, x, y);
        }
      }
      
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();

      // Inner highlight
      const innerGradient = ctx.createRadialGradient(
        centerX - BASE_RADIUS * 0.2,
        centerY - BASE_RADIUS * 0.2,
        0,
        centerX,
        centerY,
        BASE_RADIUS * 0.6
      );
      innerGradient.addColorStop(0, `hsla(0, 0%, 100%, ${0.15 + amp * 0.1})`);
      innerGradient.addColorStop(1, 'hsla(0, 0%, 100%, 0)');
      
      ctx.beginPath();
      ctx.arc(centerX, centerY, BASE_RADIUS * 0.6, 0, Math.PI * 2);
      ctx.fillStyle = innerGradient;
      ctx.fill();

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [size, isActive, getAmplitude]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: size, height: size }}
      className="block"
    />
  );
};

export default VoiceBlob;
