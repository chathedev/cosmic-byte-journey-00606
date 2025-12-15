import { useCallback, useEffect, useMemo, useRef } from "react";

interface VoiceMemosWaveformProps {
  stream: MediaStream | null;
  isActive: boolean;
  isPaused?: boolean;
}

const HISTORY_POINTS = 160;

function getHslVar(name: string) {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return raw ? `hsl(${raw})` : "hsl(0 0% 50%)";
}

export const VoiceMemosWaveform = ({ stream, isActive, isPaused = false }: VoiceMemosWaveformProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const animationRef = useRef<number | null>(null);
  const phaseRef = useRef(0);

  const historyRef = useRef<number[]>(Array(HISTORY_POINTS).fill(0.06));
  const smoothedRef = useRef(0.06);

  const colors = useMemo(() => {
    // Read semantic tokens from CSS variables (HSL values)
    return {
      primary: () => getHslVar("--primary"),
      mutedFg: () => getHslVar("--muted-foreground"),
      border: () => getHslVar("--border"),
    };
  }, []);

  const cleanup = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    analyserRef.current = null;
  }, []);

  useEffect(() => {
    if (!containerRef.current || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const resize = () => {
      const rect = containerRef.current!.getBoundingClientRect();
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(containerRef.current);

    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!isActive) {
      // Softly settle to a calm baseline
      smoothedRef.current = 0.06;
      historyRef.current = Array(HISTORY_POINTS).fill(0.06);
      return;
    }

    // Always animate (even when paused) to keep that "infinite flow" feel
    const start = async () => {
      try {
        if (stream && !isPaused) {
          const ctx = new AudioContext();
          audioContextRef.current = ctx;

          // iOS/Safari can start suspended if not tied to a gesture
          if (ctx.state === "suspended") {
            try {
              await ctx.resume();
            } catch {
              // If resume fails now, try once on next user gesture
              const resumeOnce = () => ctx.resume().catch(() => undefined);
              window.addEventListener("pointerdown", resumeOnce, { once: true });
              window.addEventListener("touchstart", resumeOnce, { once: true });
            }
          }

          const analyser = ctx.createAnalyser();
          analyser.fftSize = 1024;
          analyser.smoothingTimeConstant = 0.9;
          analyserRef.current = analyser;

          const source = ctx.createMediaStreamSource(stream);
          sourceRef.current = source;
          source.connect(analyser);
        }

        const draw = () => {
          const canvas = canvasRef.current;
          const container = containerRef.current;
          if (!canvas || !container) return;

          const ctx2d = canvas.getContext("2d");
          if (!ctx2d) return;

          phaseRef.current += 0.02;

          // Compute a calm, low-reactive amplitude signal
          let rms = 0;
          if (analyserRef.current && stream && !isPaused) {
            const analyser = analyserRef.current;
            const data = new Uint8Array(analyser.fftSize);
            analyser.getByteTimeDomainData(data);

            let sum = 0;
            for (let i = 0; i < data.length; i++) {
              const v = (data[i] - 128) / 128;
              sum += v * v;
            }
            rms = Math.sqrt(sum / data.length);
          }

          // Always keep motion; voice gently nudges it (less reactive, more chill)
          const flowing = 0.055 + (Math.sin(phaseRef.current) * 0.01 + Math.sin(phaseRef.current * 0.7) * 0.008);
          const voiceNudge = Math.min(0.16, Math.pow(rms, 0.7) * 0.28);
          const target = flowing + voiceNudge;

          const smoothing = isPaused ? 0.03 : 0.06;
          smoothedRef.current = smoothedRef.current + (target - smoothedRef.current) * smoothing;

          historyRef.current.push(smoothedRef.current);
          if (historyRef.current.length > HISTORY_POINTS) historyRef.current.shift();

          const dpr = Math.max(1, window.devicePixelRatio || 1);
          const w = canvas.width;
          const h = canvas.height;

          ctx2d.clearRect(0, 0, w, h);

          const centerY = h / 2;
          const barGap = w / HISTORY_POINTS;

          // Baseline
          ctx2d.save();
          ctx2d.globalAlpha = 0.22;
          ctx2d.strokeStyle = colors.border();
          ctx2d.lineWidth = 1 * dpr;
          ctx2d.beginPath();
          ctx2d.moveTo(0, centerY);
          ctx2d.lineTo(w, centerY);
          ctx2d.stroke();
          ctx2d.restore();

          // Waveform bars
          ctx2d.save();
          ctx2d.lineCap = "round";
          ctx2d.strokeStyle = colors.primary();
          ctx2d.globalAlpha = isPaused ? 0.55 : 0.75;
          ctx2d.shadowColor = colors.primary();
          ctx2d.shadowBlur = 10 * dpr;
          ctx2d.lineWidth = 2.2 * dpr;

          for (let i = 0; i < historyRef.current.length; i++) {
            const x = i * barGap + barGap / 2;

            // subtle depth: slightly stronger near the "playhead" (right side)
            const t = i / (HISTORY_POINTS - 1);
            const headBoost = 0.85 + t * 0.25;

            const amp = historyRef.current[i] * headBoost;
            const barHalf = Math.max(1.5, amp * (h * 0.46));

            ctx2d.beginPath();
            ctx2d.moveTo(x, centerY - barHalf);
            ctx2d.lineTo(x, centerY + barHalf);
            ctx2d.stroke();
          }

          ctx2d.restore();

          // Subtle overlay hint when paused
          if (isPaused) {
            ctx2d.save();
            ctx2d.globalAlpha = 0.14;
            ctx2d.fillStyle = colors.mutedFg();
            ctx2d.font = `${12 * dpr}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`;
            ctx2d.textAlign = "center";
            ctx2d.fillText("PAUSAD", w / 2, h - 10 * dpr);
            ctx2d.restore();
          }

          animationRef.current = requestAnimationFrame(draw);
        };

        draw();
      } catch (e) {
        console.error("VoiceMemosWaveform init failed:", e);
      }
    };

    start();
    return cleanup;
  }, [stream, isActive, isPaused, cleanup, colors]);

  return (
    <div ref={containerRef} className="w-full h-24 md:h-28">
      <canvas ref={canvasRef} className="w-full h-full" aria-label="Audio waveform" />
    </div>
  );
};
