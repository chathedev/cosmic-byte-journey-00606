import { useEffect, useRef } from "react";
import AudioMotionAnalyzer from "audiomotion-analyzer";

interface MinimalAudioAnalyzerProps {
  stream: MediaStream | null;
  isActive: boolean;
  size?: number;
}

// Helper to get computed CSS color value
const getCssColor = (varName: string, alpha: number = 1): string => {
  if (typeof window === 'undefined') return '#3b82f6';
  
  const root = document.documentElement;
  const hslValue = getComputedStyle(root).getPropertyValue(varName).trim();
  
  if (!hslValue) return '#3b82f6';
  
  // hslValue is like "221.2 83.2% 53.3%" - space-separated
  const parts = hslValue.split(' ');
  if (parts.length >= 3) {
    const h = parts[0];
    const s = parts[1];
    const l = parts[2];
    return alpha < 1 ? `hsla(${h}, ${s}, ${l}, ${alpha})` : `hsl(${h}, ${s}, ${l})`;
  }
  
  return '#3b82f6';
};

export const MinimalAudioAnalyzer = ({ stream, isActive, size = 200 }: MinimalAudioAnalyzerProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const audioMotionRef = useRef<AudioMotionAnalyzer | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Get actual color values from CSS variables
    const primaryColor = getCssColor('--primary');
    const primaryColor70 = getCssColor('--primary', 0.7);
    const primaryColor40 = getCssColor('--primary', 0.4);

    // Initialize analyzer
    const audioMotion = new AudioMotionAnalyzer(containerRef.current, {
      height: size,
      width: size,
      mode: 3, // Discrete frequencies mode
      barSpace: 0.2,
      showScaleX: false,
      showScaleY: false,
      showBgColor: false,
      overlay: true,
      reflexRatio: 0.3,
      reflexAlpha: 0.2,
      reflexBright: 1,
      smoothing: 0.7,
      gradient: "classic",
      minFreq: 30,
      maxFreq: 12000,
      showPeaks: false,
      lumiBars: true,
      roundBars: true,
      radial: true,
      spinSpeed: 1,
    });

    // Custom minimal gradient with computed colors
    try {
      audioMotion.registerGradient("minimal", {
        colorStops: [
          { color: primaryColor, pos: 0 },
          { color: primaryColor70, pos: 0.5 },
          { color: primaryColor40, pos: 1 },
        ],
      });
      audioMotion.gradient = "minimal";
    } catch (e) {
      // Fallback to built-in gradient if custom fails
      console.warn("Failed to register custom gradient, using classic:", e);
      audioMotion.gradient = "classic";
    }

    audioMotionRef.current = audioMotion;

    return () => {
      if (sourceRef.current) {
        try {
          audioMotion.disconnectInput(sourceRef.current);
        } catch { /* ignore */ }
        sourceRef.current = null;
      }
      audioMotion.destroy();
      audioMotionRef.current = null;
    };
  }, [size]);

  useEffect(() => {
    const audioMotion = audioMotionRef.current;
    if (!audioMotion || !stream || !isActive) {
      // Disconnect if not active
      if (audioMotion && sourceRef.current) {
        try {
          audioMotion.disconnectInput(sourceRef.current);
        } catch { /* ignore */ }
        sourceRef.current = null;
      }
      return;
    }

    try {
      // Create media stream source using audioMotion's audio context
      const source = audioMotion.audioCtx.createMediaStreamSource(stream);
      sourceRef.current = source;

      // Connect to analyzer
      audioMotion.connectInput(source);

      // Mute output to prevent feedback
      audioMotion.volume = 0;
    } catch (error) {
      console.error("Error connecting stream to analyzer:", error);
    }

    return () => {
      if (sourceRef.current && audioMotion) {
        try {
          audioMotion.disconnectInput(sourceRef.current);
        } catch { /* ignore */ }
        sourceRef.current = null;
      }
    };
  }, [stream, isActive]);

  return (
    <div className="relative flex items-center justify-center">
      {/* Subtle glow behind */}
      <div 
        className="absolute rounded-full bg-primary/10 blur-2xl pointer-events-none"
        style={{ width: size * 1.2, height: size * 1.2 }}
      />
      
      {/* Analyzer container */}
      <div 
        ref={containerRef} 
        className="rounded-full overflow-hidden relative z-10"
        style={{ width: size, height: size }}
      />
      
      {/* Center dot indicator */}
      <div 
        className={`absolute z-20 rounded-full transition-all duration-300 ${
          isActive ? 'bg-primary shadow-lg shadow-primary/30' : 'bg-muted-foreground/40'
        }`}
        style={{ width: 12, height: 12 }}
      />
    </div>
  );
};
