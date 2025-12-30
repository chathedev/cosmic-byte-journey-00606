import { Canvas } from '@react-three/fiber';
import { Float } from '@react-three/drei';
import { VoiceOrb } from './VoiceOrb';
import { Suspense, useRef, useEffect, useState, useCallback } from 'react';

interface OrbSceneProps {
  stream: MediaStream | null;
  isActive: boolean;
  size?: number;
}

export function OrbScene({ stream, isActive, size = 200 }: OrbSceneProps) {
  const [volume, setVolume] = useState(0);
  const [frequency, setFrequency] = useState(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const smoothedVolumeRef = useRef(0);

  const cleanup = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (sourceRef.current) {
      try {
        sourceRef.current.disconnect();
      } catch {}
      sourceRef.current = null;
    }
    if (analyserRef.current) {
      try {
        analyserRef.current.disconnect();
      } catch {}
      analyserRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        audioContextRef.current.close();
      } catch {}
      audioContextRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!stream || !isActive) {
      cleanup();
      // Gentle breathing animation when inactive
      let idleFrame: number;
      const idleAnimate = () => {
        const t = Date.now() * 0.001;
        const breathe = (Math.sin(t * 0.8) + 1) * 0.04;
        setVolume(breathe);
        idleFrame = requestAnimationFrame(idleAnimate);
      };
      idleAnimate();
      return () => cancelAnimationFrame(idleFrame);
    }

    const setupAudio = async () => {
      try {
        const audioContext = new AudioContext();
        audioContextRef.current = audioContext;

        if (audioContext.state === 'suspended') {
          await audioContext.resume();
        }

        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 128; // Smaller for faster response
        analyser.smoothingTimeConstant = 0.6; // Less smoothing = faster response
        analyserRef.current = analyser;

        const source = audioContext.createMediaStreamSource(stream);
        sourceRef.current = source;
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const frequencyArray = new Uint8Array(analyser.frequencyBinCount);

        const analyze = () => {
          if (!analyserRef.current || !isActive) return;

          analyserRef.current.getByteTimeDomainData(dataArray);
          analyserRef.current.getByteFrequencyData(frequencyArray);

          // Calculate RMS volume with HIGH sensitivity
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            const amplitude = (dataArray[i] - 128) / 128;
            sum += amplitude * amplitude;
          }
          const rms = Math.sqrt(sum / dataArray.length);
          
          // Much more sensitive - amplify small sounds
          const amplifiedVolume = Math.pow(rms, 0.6) * 4; // Power curve makes quiet sounds visible
          const targetVolume = Math.max(0.03, Math.min(1, amplifiedVolume));
          
          // Faster response
          smoothedVolumeRef.current += (targetVolume - smoothedVolumeRef.current) * 0.3;
          setVolume(smoothedVolumeRef.current);

          // Get dominant frequency
          let maxFreqIndex = 0;
          let maxFreqValue = 0;
          for (let i = 0; i < frequencyArray.length; i++) {
            if (frequencyArray[i] > maxFreqValue) {
              maxFreqValue = frequencyArray[i];
              maxFreqIndex = i;
            }
          }
          setFrequency(maxFreqIndex / frequencyArray.length);

          animationFrameRef.current = requestAnimationFrame(analyze);
        };

        analyze();
      } catch (error) {
        console.error('Error setting up audio analysis:', error);
      }
    };

    setupAudio();

    return cleanup;
  }, [stream, isActive, cleanup]);

  return (
    <div style={{ width: size, height: size }} className="relative">
      <Canvas
        camera={{ position: [0, 0, 3.5], fov: 45 }}
        dpr={[1, 2]}
        className="w-full h-full"
        style={{ background: 'transparent' }}
        gl={{ alpha: true, antialias: true }}
      >
        <Suspense fallback={null}>
          <ambientLight intensity={0.5} />
          <pointLight position={[3, 3, 3]} intensity={0.6} color="#0099ff" />
          <pointLight position={[-3, -3, -3]} intensity={0.4} color="#0066cc" />
          <pointLight position={[0, 3, 0]} intensity={0.3} color="#ffffff" />
          
          <Float
            speed={0.6}
            rotationIntensity={0.12}
            floatIntensity={0.15}
            floatingRange={[-0.03, 0.03]}
          >
            <VoiceOrb
              volume={volume}
              frequency={frequency}
              isSpeaking={isActive && volume > 0.02}
            />
          </Float>
        </Suspense>
      </Canvas>
    </div>
  );
}
