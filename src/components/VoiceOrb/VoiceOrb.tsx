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
  const targetPosition = useRef(new THREE.Vector3(0, 0, 0));
  const currentPosition = useRef(new THREE.Vector3(0, 0, 0));
  const targetScale = useRef(1);
  const currentScale = useRef(1);
  const randomDirectionRef = useRef(new THREE.Vector3(0, 0, 0));
  const lastSpeakingRef = useRef(false);
  const smoothedVolumeRef = useRef(0);

  // Using 3 colors from our theme: primary blue, accent blue, and white
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uVolume: { value: 0 },
      uFrequency: { value: 0 },
      uColor1: { value: new THREE.Color('#0066cc') },  // Deep primary blue
      uColor2: { value: new THREE.Color('#0099ff') },  // Bright accent blue
      uColor3: { value: new THREE.Color('#e0f2ff') },  // Light blue/white
    }),
    []
  );

  // Generate new random direction when speaking starts
  useEffect(() => {
    if (isSpeaking && !lastSpeakingRef.current) {
      const theta = Math.random() * Math.PI * 2;
      const phi = (Math.random() - 0.5) * Math.PI * 0.3;
      randomDirectionRef.current.set(
        Math.cos(theta) * Math.cos(phi),
        Math.sin(phi),
        Math.sin(theta) * Math.cos(phi)
      );
    }
    lastSpeakingRef.current = isSpeaking;
  }, [isSpeaking]);

  useFrame((state, delta) => {
    if (!meshRef.current) return;

    // Very slow time progression
    uniforms.uTime.value = state.clock.elapsedTime * 0.3;
    
    // Extra smooth volume - very slow response for calm feel
    smoothedVolumeRef.current += (volume - smoothedVolumeRef.current) * 0.008;
    uniforms.uVolume.value = smoothedVolumeRef.current;
    uniforms.uFrequency.value += (frequency - uniforms.uFrequency.value) * 0.008;

    // Calculate target position - minimal movements
    if (isSpeaking && volume > 0.02) {
      const radius = 0.15 + smoothedVolumeRef.current * 0.25;
      targetPosition.current.x = randomDirectionRef.current.x * radius;
      targetPosition.current.y = randomDirectionRef.current.y * radius * 0.3;
      targetPosition.current.z = randomDirectionRef.current.z * 0.08;
      targetScale.current = 1 + smoothedVolumeRef.current * 0.15;
    } else {
      // Very gentle idle floating
      targetPosition.current.x = Math.sin(state.clock.elapsedTime * 0.06) * 0.02;
      targetPosition.current.y = Math.cos(state.clock.elapsedTime * 0.05) * 0.02;
      targetPosition.current.z = 0;
      targetScale.current = 1;
    }

    // Super slow position interpolation
    currentPosition.current.lerp(targetPosition.current, 0.006);
    meshRef.current.position.copy(currentPosition.current);

    // Super slow scale interpolation
    currentScale.current += (targetScale.current - currentScale.current) * 0.008;
    meshRef.current.scale.setScalar(currentScale.current);

    // Minimal rotation
    meshRef.current.rotation.x += delta * 0.008;
    meshRef.current.rotation.y += delta * 0.012;
  });

  return (
    <mesh ref={meshRef}>
      <icosahedronGeometry args={[1.2, 48]} />
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
