import { useRef, useMemo, useEffect } from 'react';
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
  const targetScale = useRef(1);
  const currentScale = useRef(1);
  const smoothedVolumeRef = useRef(0);

  // Using 3 colors from theme: deep blue, bright blue, light highlight
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uVolume: { value: 0 },
      uFrequency: { value: 0 },
      uColor1: { value: new THREE.Color('#0055aa') },  // Deep primary blue
      uColor2: { value: new THREE.Color('#0088ee') },  // Bright accent blue
      uColor3: { value: new THREE.Color('#c0e8ff') },  // Light blue highlight
    }),
    []
  );

  useFrame((state, delta) => {
    if (!meshRef.current) return;

    // Smooth time progression
    uniforms.uTime.value = state.clock.elapsedTime * 0.4;
    
    // Responsive volume smoothing
    smoothedVolumeRef.current += (volume - smoothedVolumeRef.current) * 0.12;
    uniforms.uVolume.value = smoothedVolumeRef.current;
    uniforms.uFrequency.value += (frequency - uniforms.uFrequency.value) * 0.1;

    // Scale based on volume
    targetScale.current = 1 + smoothedVolumeRef.current * 0.4;
    currentScale.current += (targetScale.current - currentScale.current) * 0.08;
    meshRef.current.scale.setScalar(currentScale.current);

    // Gentle continuous rotation
    meshRef.current.rotation.x += delta * 0.03;
    meshRef.current.rotation.y += delta * 0.05;
  });

  return (
    <mesh ref={meshRef}>
      <icosahedronGeometry args={[1, 64]} />
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}
