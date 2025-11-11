import { useEffect, useRef } from "react";

interface VoiceVisualizationProps {
  isRecording: boolean;
  audioStream: MediaStream | null;
}

export const VoiceVisualization = ({ isRecording, audioStream }: VoiceVisualizationProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const analyserRef = useRef<AnalyserNode | null>(null);
  const colorsRef = useRef<{ primary: string; accent: string; background: string }>({
    primary: '',
    accent: '',
    background: ''
  });

  useEffect(() => {
    if (!canvasRef.current || !audioStream || !isRecording) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Get computed CSS colors
    const styles = getComputedStyle(document.documentElement);
    const primaryHsl = styles.getPropertyValue('--primary').trim();
    const accentHsl = styles.getPropertyValue('--accent').trim();
    const backgroundHsl = styles.getPropertyValue('--background').trim();

    const toComma = (h: string) => h.replace(/\s+/g, ', ');

    colorsRef.current = {
      primary: `hsl(${toComma(primaryHsl)})`,
      accent: `hsl(${toComma(accentHsl)})`,
      background: `hsl(${toComma(backgroundHsl)})`
    };

    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(audioStream);
    
    analyser.fftSize = 256;
    source.connect(analyser);
    analyserRef.current = analyser;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    let rotation = 0;
    let pulsePhase = 0;

    const draw = () => {
      if (!ctx || !analyserRef.current) return;

      animationRef.current = requestAnimationFrame(draw);
      analyserRef.current.getByteFrequencyData(dataArray);

      const width = canvas.width;
      const height = canvas.height;

      // Smooth background with subtle gradient
      const bgGradient = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, width / 2);
      bgGradient.addColorStop(0, colorsRef.current.background);
      const darkerBg = colorsRef.current.background.replace('hsl', 'hsla').replace(')', ', 0.95)');
      bgGradient.addColorStop(1, darkerBg);
      ctx.fillStyle = bgGradient;
      ctx.fillRect(0, 0, width, height);

      // Calculate average volume with smoothing
      const average = dataArray.reduce((a, b) => a + b) / bufferLength;
      const normalizedVolume = average / 255;

      // Slower, more voice-reactive rotation and pulsing
      rotation += 0.001 + normalizedVolume * 0.008;
      pulsePhase += 0.015 + normalizedVolume * 0.02;
      const pulseEffect = Math.sin(pulsePhase) * (0.15 * normalizedVolume) + 1;

      const centerX = width / 2;
      const centerY = height / 2;
      const baseRadius = 70;
      const maxRadius = 140;
      const radius = (baseRadius + (maxRadius - baseRadius) * normalizedVolume) * pulseEffect;

      // Enhanced glow effect with multiple layers
      for (let glow = 0; glow < 4; glow++) {
        const glowRadius = radius + glow * 25;
        const glowOpacity = (1 - glow * 0.2) * normalizedVolume * 0.3;
        
        const glowGradient = ctx.createRadialGradient(
          centerX, centerY, radius * 0.5,
          centerX, centerY, glowRadius
        );
        
        const glowColor = colorsRef.current.primary.replace('hsl', 'hsla').replace(')', `, ${glowOpacity})`);
        glowGradient.addColorStop(0, glowColor);
        glowGradient.addColorStop(1, 'hsla(0, 0%, 0%, 0)');
        
        ctx.fillStyle = glowGradient;
        ctx.beginPath();
        ctx.arc(centerX, centerY, glowRadius, 0, Math.PI * 2);
        ctx.fill();
      }

      // Main sphere with enhanced 3D layers
      for (let layer = 0; layer < 5; layer++) {
        const layerRadius = radius - layer * 15;
        const opacity = (1 - layer * 0.15) * (0.7 + normalizedVolume * 0.3);

        const gradient = ctx.createRadialGradient(
          centerX - layerRadius * 0.2,
          centerY - layerRadius * 0.2,
          0,
          centerX,
          centerY,
          layerRadius
        );

        const primaryRgba = colorsRef.current.primary.replace('hsl', 'hsla').replace(')', `, ${opacity})`);
        const accentRgba = colorsRef.current.accent.replace('hsl', 'hsla').replace(')', `, ${opacity * 0.8})`);
        const primaryTransparent = colorsRef.current.primary.replace('hsl', 'hsla').replace(')', ', 0)');
        
        gradient.addColorStop(0, primaryRgba);
        gradient.addColorStop(0.4, accentRgba);
        gradient.addColorStop(0.7, primaryRgba);
        gradient.addColorStop(1, primaryTransparent);

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(centerX, centerY, layerRadius, 0, Math.PI * 2);
        ctx.fill();
      }

      // Enhanced orbital particles with trails
      const particles = 16;
      for (let i = 0; i < particles; i++) {
        const angle = (i / particles) * Math.PI * 2 + rotation;
        const orbitRadius = radius + 35 + Math.sin(rotation + i) * 10;
        const px = centerX + Math.cos(angle) * orbitRadius;
        const py = centerY + Math.sin(angle) * orbitRadius;
        const size = 3 + normalizedVolume * 10;

        // Particle glow
        const particleGradient = ctx.createRadialGradient(px, py, 0, px, py, size * 2);
        const accentRgba = colorsRef.current.accent.replace('hsl', 'hsla').replace(')', ', 0.8)');
        const accentTransparent = colorsRef.current.accent.replace('hsl', 'hsla').replace(')', ', 0)');
        particleGradient.addColorStop(0, accentRgba);
        particleGradient.addColorStop(0.5, accentRgba);
        particleGradient.addColorStop(1, accentTransparent);
        
        ctx.fillStyle = particleGradient;
        ctx.beginPath();
        ctx.arc(px, py, size * 2, 0, Math.PI * 2);
        ctx.fill();

        // Inner particle core
        ctx.fillStyle = colorsRef.current.accent;
        ctx.beginPath();
        ctx.arc(px, py, size, 0, Math.PI * 2);
        ctx.fill();
      }

      // Smooth frequency waves with multiple rings
      const rings = 2;
      for (let ring = 0; ring < rings; ring++) {
        const bars = 48;
        const barMaxHeight = 40 - ring * 10;
        const ringOffset = ring * 35;

        for (let i = 0; i < bars; i++) {
          const angle = (i / bars) * Math.PI * 2 + rotation * (1 + ring * 0.5);
          const dataIndex = Math.floor((i / bars) * bufferLength);
          const barHeight = (dataArray[dataIndex] / 255) * barMaxHeight;

          const innerRadius = radius + 25 + ringOffset;
          const outerRadius = innerRadius + barHeight;

          const x1 = centerX + Math.cos(angle) * innerRadius;
          const y1 = centerY + Math.sin(angle) * innerRadius;
          const x2 = centerX + Math.cos(angle) * outerRadius;
          const y2 = centerY + Math.sin(angle) * outerRadius;

          const barOpacity = 0.6 - ring * 0.2;
          const primaryRgba = colorsRef.current.primary.replace('hsl', 'hsla').replace(')', `, ${barOpacity})`);
          
          // Bar with gradient
          const barGradient = ctx.createLinearGradient(x1, y1, x2, y2);
          barGradient.addColorStop(0, primaryRgba);
          const accentRgba = colorsRef.current.accent.replace('hsl', 'hsla').replace(')', `, ${barOpacity})`);
          barGradient.addColorStop(1, accentRgba);
          
          ctx.strokeStyle = barGradient;
          ctx.lineWidth = 2.5;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        }
      }

      // Inner glow accent
      const innerGlow = ctx.createRadialGradient(
        centerX, centerY, 0,
        centerX, centerY, radius * 0.4
      );
      const innerGlowColor = colorsRef.current.accent.replace('hsl', 'hsla').replace(')', `, ${normalizedVolume * 0.5})`);
      innerGlow.addColorStop(0, innerGlowColor);
      innerGlow.addColorStop(1, 'hsla(0, 0%, 0%, 0)');
      ctx.fillStyle = innerGlow;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius * 0.4, 0, Math.PI * 2);
      ctx.fill();
    };

    draw();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (audioContext.state !== "closed") {
        audioContext.close();
      }
    };
  }, [isRecording, audioStream]);

  return (
    <div className="flex items-center justify-center">
      <canvas
        ref={canvasRef}
        width={400}
        height={400}
        className="rounded-lg"
      />
    </div>
  );
};
