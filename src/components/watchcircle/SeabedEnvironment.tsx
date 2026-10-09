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
      {/* ── Seabed Floor ── */}
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

      {/* ── 2,000 kg (2-Tonne) Heavy Cylindrical Sinker Clump Anchor (Matching NIOT Reference Model) ── */}
      <group position={[0, seabedY, 0]}>
        {/* Massive Cylindrical Cast-Iron / Ballast Sinker Block */}
        <mesh position={[0, 0.40, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.85, 0.88, 0.80, 32]} />
          <meshStandardMaterial
            color="#5c3a21"
            roughness={0.75}
            metalness={0.65}
          />
        </mesh>

        {/* Top Chamfer Flange Collar */}
        <mesh position={[0, 0.80, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.78, 0.85, 0.08, 32]} />
          <meshStandardMaterial
            color="#451a03"
            roughness={0.7}
            metalness={0.6}
          />
        </mesh>

        {/* Heavy Forged Anchor Pad Eye & Safety Bow Shackle (Connection point at Y = seabedY + 0.85) */}
        <group position={[0, 0.85, 0]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.12, 0.12, 0.10, 16]} />
            <meshStandardMaterial color="#334155" metalness={0.92} roughness={0.3} />
          </mesh>
          <mesh position={[0, 0.12, 0]} castShadow>
            <torusGeometry args={[0.16, 0.045, 12, 24]} />
            <meshStandardMaterial color="#475569" metalness={0.95} roughness={0.2} />
          </mesh>
        </group>

        {/* Heavy Stud-Link Ground Chain Coils resting on seafloor around sinker */}
        <group position={[0.55, 0.06, 0.4]} rotation={[0, 0.4, 0]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.55, 0.05, 8, 24]} />
            <meshStandardMaterial color="#334155" metalness={0.9} roughness={0.3} />
          </mesh>
        </group>

        {/* Sinker Position Marker Datum Ring */}
        <mesh position={[0, 0.88, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.28, 0.36, 24]} />
          <meshBasicMaterial color="#38bdf8" />
        </mesh>
      </group>

      {/* ── Vertical Depth Scale Ruler ── */}
      <group position={[-16, 0, 0]}>
        {/* Vertical Backbone Pole */}
        <mesh position={[0, seabedY / 2, 0]}>
          <cylinderGeometry args={[0.04, 0.04, Math.abs(seabedY), 8]} />
          <meshBasicMaterial color="#0e7490" transparent opacity={0.6} />
        </mesh>

        {/* Depth Ticks and Indicators */}
        {depthTicks.map(({ depthVal, y, isMajor }) => (
          <group key={depthVal} position={[0, y, 0]}>
            {/* Horizontal Tick Bar */}
            <mesh position={[isMajor ? 0.45 : 0.25, 0, 0]}>
              <boxGeometry args={[isMajor ? 0.9 : 0.5, 0.04, 0.04]} />
              <meshBasicMaterial color={isMajor ? '#22d3ee' : '#0891b2'} />
            </mesh>
            {/* Tick Node Marker */}
            <mesh position={[isMajor ? 0.95 : 0.55, 0, 0]}>
              <sphereGeometry args={[isMajor ? 0.1 : 0.06, 8, 8]} />
              <meshBasicMaterial color={isMajor ? '#38bdf8' : '#0891b2'} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}
