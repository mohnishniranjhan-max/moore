import { useMemo } from 'react';
import * as THREE from 'three';

interface SeabedEnvironmentProps {
  waterDepth: number; // e.g. 2500 meters
  seabedY?: number;   // Visual depth coordinate e.g. -18
}

export function SeabedEnvironment({ waterDepth, seabedY = -18 }: SeabedEnvironmentProps) {
  // Generate vertical depth tick bars from 0m down to waterDepth
  const depthTicks = useMemo(() => {
    const ticks = [];
    const step = 500;
    const maxDepth = Math.max(1000, Math.ceil(waterDepth / 500) * 500);
    const numTicks = maxDepth / step;

    for (let i = 0; i <= numTicks; i++) {
      const depthVal = i * step;
      const t = depthVal / maxDepth;
      const y = THREE.MathUtils.lerp(0, seabedY, t);
      ticks.push({ depthVal, y, isMajor: depthVal % 1000 === 0 });
    }
    return ticks;
  }, [waterDepth, seabedY]);

  return (
    <group>
      {/* ── Bathymetric Seabed Floor ── */}
      <mesh position={[0, seabedY - 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[800, 800, 32, 32]} />
        <meshStandardMaterial
          color="#061224"
          roughness={0.92}
          metalness={0.08}
        />
      </mesh>

      {/* Bathymetric Seafloor Grid Lines */}
      <gridHelper
        position={[0, seabedY + 0.01, 0]}
        args={[400, 40, '#0e3b5e', '#071f33']}
      />

      {/* ── Seabed Sediment Foundation Mound where Bottom Weight Rests ── */}
      <group position={[0, seabedY, 0]}>
        {/* Subtle seabed sediment compaction depression beneath dead weight */}
        <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <ringGeometry args={[0.0, 1.25, 32]} />
          <meshStandardMaterial color="#040d1a" roughness={0.96} metalness={0.04} />
        </mesh>
        {/* Subtle bathymetric target datum circle */}
        <mesh position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.20, 1.28, 36]} />
          <meshBasicMaterial color="#0e3b5e" transparent opacity={0.5} />
        </mesh>
      </group>

      {/* ── Vertical Depth Scale Ruler ── */}
      <group position={[-16, 0, 0]}>
        {/* Vertical Backbone Pole */}
        <mesh position={[0, seabedY / 2, 0]}>
          <cylinderGeometry args={[0.04, 0.04, Math.abs(seabedY), 8]} />
          <meshBasicMaterial color="#0e7490" transparent opacity={0.6} />
        </mesh>

        {/* Horizontal Depth Tick Marks */}
        {depthTicks.map(({ depthVal, y, isMajor }) => (
          <group key={depthVal} position={[0, y, 0]}>
            <mesh position={[isMajor ? 0.4 : 0.2, 0, 0]}>
              <boxGeometry args={[isMajor ? 0.8 : 0.4, 0.04, 0.04]} />
              <meshBasicMaterial color={isMajor ? '#22d3ee' : '#0e7490'} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

