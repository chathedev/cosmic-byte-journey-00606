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
  const targetScale = useRef(1);
  const currentScale = useRef(1);
  const smoothedVolumeRef = useRef(0);

  // 3 colors from theme
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uVolume: { value: 0 },
      uFrequency: { value: 0 },
      uColor1: { value: new THREE.Color('#0055aa') },
      uColor2: { value: new THREE.Color('#0088ee') },
      uColor3: { value: new THREE.Color('#c0e8ff') },
    }),
    []
  );

  useFrame((state, delta) => {
    if (!meshRef.current) return;

    // Faster time progression
    uniforms.uTime.value = state.clock.elapsedTime * 0.8;
    
    // Faster volume response
    smoothedVolumeRef.current += (volume - smoothedVolumeRef.current) * 0.25;
    uniforms.uVolume.value = smoothedVolumeRef.current;
    uniforms.uFrequency.value += (frequency - uniforms.uFrequency.value) * 0.2;

    // More responsive scale
    targetScale.current = 1 + smoothedVolumeRef.current * 0.5;
    currentScale.current += (targetScale.current - currentScale.current) * 0.15;
    meshRef.current.scale.setScalar(currentScale.current);

    // Faster rotation
    meshRef.current.rotation.x += delta * 0.06;
    meshRef.current.rotation.y += delta * 0.08;
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
