import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { vertexShader, fragmentShader } from '@/shaders/blobShaders';

interface VoiceOrbProps {
  volume: number;
  frequency: number;
  isSpeaking: boolean;
}

export function VoiceOrb({ volume, frequency, isSpeaking }: VoiceOrbProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const smoothedVolumeRef = useRef(0);

  // Vibrant cosmic colors - highly visible and beautiful
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uVolume: { value: 0 },
      uColor1: { value: new THREE.Color('#0f2a4a') },  // Deep ocean blue base
      uColor2: { value: new THREE.Color('#8b5cf6') },  // Vivid purple
      uColor3: { value: new THREE.Color('#06b6d4') },  // Bright cyan
      uColor4: { value: new THREE.Color('#f43f5e') },  // Hot pink accent
    }),
    []
  );

  useFrame((state) => {
    if (!meshRef.current) return;

    // Smooth time progression
    uniforms.uTime.value = state.clock.elapsedTime;
    
    // Natural volume smoothing - faster response when speaking
    const smoothingFactor = isSpeaking ? 0.18 : 0.06;
    smoothedVolumeRef.current += (volume - smoothedVolumeRef.current) * smoothingFactor;
    uniforms.uVolume.value = smoothedVolumeRef.current;
  });

  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[2.4, 2.4, 1, 1]} />
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}
