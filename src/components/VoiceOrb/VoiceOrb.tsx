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

  // Vibrant space colors that flow beautifully
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uVolume: { value: 0 },
      uColor1: { value: new THREE.Color('#1a4a7a') },  // Rich blue
      uColor2: { value: new THREE.Color('#6b3fa0') },  // Vibrant purple
      uColor3: { value: new THREE.Color('#2aa5a0') },  // Bright teal
      uColor4: { value: new THREE.Color('#e05080') },  // Warm pink accent
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
