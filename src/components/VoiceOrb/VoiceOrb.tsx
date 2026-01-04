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

  // Space-like colors: deep blue, purple, teal, warm accent
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uVolume: { value: 0 },
      uColor1: { value: new THREE.Color('#0a1628') },  // Deep space blue
      uColor2: { value: new THREE.Color('#1e3a5f') },  // Ocean blue
      uColor3: { value: new THREE.Color('#4a2c6a') },  // Purple nebula
      uColor4: { value: new THREE.Color('#2d6a6a') },  // Teal accent
    }),
    []
  );

  useFrame((state) => {
    if (!meshRef.current) return;

    // Smooth time progression
    uniforms.uTime.value = state.clock.elapsedTime;
    
    // Natural volume smoothing - faster response when speaking
    const smoothingFactor = isSpeaking ? 0.15 : 0.08;
    smoothedVolumeRef.current += (volume - smoothedVolumeRef.current) * smoothingFactor;
    uniforms.uVolume.value = smoothedVolumeRef.current;
  });

  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[2.2, 2.2, 1, 1]} />
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
