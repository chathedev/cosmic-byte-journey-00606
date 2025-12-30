import { Canvas } from '@react-three/fiber';
import { Float } from '@react-three/drei';
import { VoiceOrb } from './VoiceOrb';
import { Suspense, useRef, useEffect, useState } from 'react';

interface OrbSceneProps {
  stream: MediaStream | null;
  isActive: boolean;
  size?: number;
}

export function OrbScene({ stream, isActive, size = 120 }: OrbSceneProps) {
  const [volume, setVolume] = useState(0);
  const [frequency, setFrequency] = useState(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const smoothedVolumeRef = useRef(0);

  useEffect(() => {
    if (!stream || !isActive) {
      setVolume(0);
      setFrequency(0);
      return;
    }

    const setupAudio = async () => {
      try {
        const audioContext = new AudioContext();
        audioContextRef.current = audioContext;

        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.9;
        analyserRef.current = analyser;

        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const frequencyArray = new Uint8Array(analyser.frequencyBinCount);

        const analyze = () => {
          if (!analyserRef.current) return;

          analyserRef.current.getByteTimeDomainData(dataArray);
          analyserRef.current.getByteFrequencyData(frequencyArray);

          // Calculate RMS volume
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            const amplitude = (dataArray[i] - 128) / 128;
            sum += amplitude * amplitude;
          }
          const rms = Math.sqrt(sum / dataArray.length);
          
          // Extra smooth volume changes
          smoothedVolumeRef.current += (rms - smoothedVolumeRef.current) * 0.05;
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

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [stream, isActive]);

  return (
    <div style={{ width: size, height: size }} className="relative">
      <Canvas
        camera={{ position: [0, 0, 4], fov: 50 }}
        dpr={[1, 2]}
        className="w-full h-full"
        style={{ background: 'transparent' }}
      >
        <Suspense fallback={null}>
          <ambientLight intensity={0.4} />
          <pointLight position={[5, 5, 5]} intensity={0.5} color="#0099ff" />
          <pointLight position={[-5, -5, -5]} intensity={0.3} color="#0066cc" />
          
          <Float
            speed={0.5}
            rotationIntensity={0.1}
            floatIntensity={0.15}
            floatingRange={[-0.03, 0.03]}
          >
            <VoiceOrb
              volume={volume}
              frequency={frequency}
              isSpeaking={isActive && volume > 0.01}
            />
          </Float>
        </Suspense>
      </Canvas>
    </div>
  );
}
