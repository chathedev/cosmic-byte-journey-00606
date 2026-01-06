import { useRef, useEffect, useCallback, useState } from 'react';

interface VoiceAuroraProps {
  stream: MediaStream | null;
  isActive: boolean;
  size?: number;
}

export function VoiceAurora({ stream, isActive, size = 280 }: VoiceAuroraProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const [volume, setVolume] = useState(0);
  const smoothVolumeRef = useRef(0);
  const timeRef = useRef(0);

  const cleanup = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
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
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    if (isActive && stream) {
      try {
        audioContextRef.current = new AudioContext();
        analyserRef.current = audioContextRef.current.createAnalyser();
        analyserRef.current.fftSize = 256;
        sourceRef.current = audioContextRef.current.createMediaStreamSource(stream);
        sourceRef.current.connect(analyserRef.current);
      } catch (error) {
        console.error('Audio setup failed:', error);
      }
    }

    const draw = () => {
      timeRef.current += 0.008;
      const time = timeRef.current;

      // Get volume from audio
      let currentVolume = 0;
      if (analyserRef.current) {
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(dataArray);
        const sum = dataArray.reduce((a, b) => a + b, 0);
        currentVolume = sum / dataArray.length / 255;
      }

      // Smooth volume
      smoothVolumeRef.current += (currentVolume - smoothVolumeRef.current) * 0.15;
      const vol = smoothVolumeRef.current;

      // Clear canvas
      ctx.clearRect(0, 0, size, size);

      const centerX = size / 2;
      const centerY = size / 2;
      const baseRadius = size * 0.35;

      // Draw flowing aurora layers
      const layers = [
        { color: 'rgba(124, 58, 237, 0.6)', offset: 0, speed: 1 },      // Purple
        { color: 'rgba(14, 165, 233, 0.5)', offset: 2.1, speed: 0.8 },  // Sky blue
        { color: 'rgba(16, 185, 129, 0.4)', offset: 4.2, speed: 1.2 },  // Emerald
      ];

      layers.forEach((layer, layerIndex) => {
        ctx.beginPath();
        
        const points = 120;
        for (let i = 0; i <= points; i++) {
          const angle = (i / points) * Math.PI * 2;
          
          // Multiple wave frequencies for organic movement
          const wave1 = Math.sin(angle * 3 + time * layer.speed + layer.offset) * (15 + vol * 25);
          const wave2 = Math.sin(angle * 5 - time * 0.7 + layer.offset) * (8 + vol * 15);
          const wave3 = Math.cos(angle * 2 + time * 1.3) * (5 + vol * 10);
          
          const radiusOffset = wave1 + wave2 + wave3;
          const radius = baseRadius + radiusOffset * (0.6 + vol * 0.4);
          
          const x = centerX + Math.cos(angle) * radius;
          const y = centerY + Math.sin(angle) * radius;
          
          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        
        ctx.closePath();
        
        // Create radial gradient for each layer
        const gradient = ctx.createRadialGradient(
          centerX, centerY, baseRadius * 0.3,
          centerX, centerY, baseRadius * 1.4
        );
        gradient.addColorStop(0, layer.color.replace('0.6', '0.8').replace('0.5', '0.7').replace('0.4', '0.6'));
        gradient.addColorStop(0.5, layer.color);
        gradient.addColorStop(1, 'transparent');
        
        ctx.fillStyle = gradient;
        ctx.fill();
      });

      // Inner glow core
      const coreGradient = ctx.createRadialGradient(
        centerX, centerY, 0,
        centerX, centerY, baseRadius * 0.6
      );
      coreGradient.addColorStop(0, `rgba(255, 255, 255, ${0.3 + vol * 0.4})`);
      coreGradient.addColorStop(0.4, `rgba(167, 139, 250, ${0.2 + vol * 0.3})`);
      coreGradient.addColorStop(1, 'transparent');
      
      ctx.beginPath();
      ctx.arc(centerX, centerY, baseRadius * 0.6, 0, Math.PI * 2);
      ctx.fillStyle = coreGradient;
      ctx.fill();

      animationRef.current = requestAnimationFrame(draw);
    };

    draw();

    return cleanup;
  }, [stream, isActive, size, cleanup]);

  return (
    <div 
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <canvas
        ref={canvasRef}
        style={{ width: size, height: size }}
        className="rounded-full"
      />
    </div>
  );
}
