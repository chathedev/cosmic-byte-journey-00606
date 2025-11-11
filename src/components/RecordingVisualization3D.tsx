import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { MeshDistortMaterial, Environment } from '@react-three/drei';
import * as THREE from 'three';

interface AnimatedOrbProps {
  isActive: boolean;
  isMuted: boolean;
  isPaused: boolean;
}

function AnimatedOrb({ isActive, isMuted, isPaused }: AnimatedOrbProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const innerMeshRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    const time = state.clock.getElapsedTime();
    
    if (meshRef.current && innerMeshRef.current) {
      // Smooth continuous rotation
      meshRef.current.rotation.x = time * 0.15;
      meshRef.current.rotation.y = time * 0.2;
      innerMeshRef.current.rotation.x = -time * 0.1;
      innerMeshRef.current.rotation.y = -time * 0.15;
      
      // Gentle breathing pulse when active
      if (isActive) {
        const pulse = Math.sin(time * 1.5) * 0.08 + 1;
        meshRef.current.scale.setScalar(pulse);
        innerMeshRef.current.scale.setScalar(1.05 * pulse);
      } else {
        // Smooth transition to idle state
        const currentScale = meshRef.current.scale.x;
        const targetScale = 1;
        meshRef.current.scale.setScalar(THREE.MathUtils.lerp(currentScale, targetScale, 0.05));
        innerMeshRef.current.scale.setScalar(THREE.MathUtils.lerp(currentScale, targetScale * 1.05, 0.05));
      }
    }
  });

  const getColor = () => {
    if (isMuted) return '#ef4444';
    if (isPaused) return '#f59e0b';
    if (isActive) return '#3b82f6';
    return '#6366f1';
  };

  const getSecondaryColor = () => {
    if (isMuted) return '#dc2626';
    if (isPaused) return '#d97706';
    if (isActive) return '#2563eb';
    return '#4f46e5';
  };

  return (
    <group>
      {/* Inner core */}
      <mesh ref={innerMeshRef}>
        <sphereGeometry args={[0.8, 64, 64]} />
        <MeshDistortMaterial
          color={getSecondaryColor()}
          distort={isActive ? 0.5 : 0.3}
          speed={isActive ? 4 : 2}
          roughness={0.1}
          metalness={0.9}
          emissive={getSecondaryColor()}
          emissiveIntensity={isActive ? 0.6 : 0.3}
        />
      </mesh>

      {/* Outer layer */}
      <mesh ref={meshRef}>
        <sphereGeometry args={[1, 64, 64]} />
        <MeshDistortMaterial
          color={getColor()}
          distort={isActive ? 0.4 : 0.25}
          speed={isActive ? 3 : 1.5}
          roughness={0.2}
          metalness={0.8}
          transparent
          opacity={0.9}
          emissive={getColor()}
          emissiveIntensity={isActive ? 0.4 : 0.2}
        />
      </mesh>

      {/* Subtle outer glow */}
      <mesh scale={1.15}>
        <sphereGeometry args={[1, 32, 32]} />
        <meshStandardMaterial
          color={getColor()}
          transparent
          opacity={isActive ? 0.15 : 0.08}
          emissive={getColor()}
          emissiveIntensity={isActive ? 0.3 : 0.1}
        />
      </mesh>
    </group>
  );
}

interface RecordingVisualization3DProps {
  isActive: boolean;
  isMuted: boolean;
  isPaused: boolean;
}

export function RecordingVisualization3D({ isActive, isMuted, isPaused }: RecordingVisualization3DProps) {
  return (
    <div className="w-[280px] h-[280px] mx-auto">
      <Canvas
        camera={{ position: [0, 0, 4], fov: 35 }}
        gl={{ 
          antialias: true, 
          alpha: true,
          powerPreference: 'high-performance'
        }}
        dpr={[1, 2]}
      >
        {/* Lighting setup for realistic 3D appearance */}
        <ambientLight intensity={0.4} />
        <pointLight position={[10, 10, 10]} intensity={0.8} />
        <pointLight position={[-10, -5, -10]} intensity={0.4} color="#4f46e5" />
        <spotLight
          position={[5, 5, 5]}
          angle={0.5}
          penumbra={1}
          intensity={0.5}
          castShadow
        />
        
        {/* HDR environment for reflections */}
        <Environment preset="city" />
        
        {/* Main animated orb */}
        <AnimatedOrb isActive={isActive} isMuted={isMuted} isPaused={isPaused} />
      </Canvas>
    </div>
  );
}
