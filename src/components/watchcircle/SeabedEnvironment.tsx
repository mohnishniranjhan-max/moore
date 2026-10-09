import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface SeabedEnvironmentProps {
  waterDepth: number; // e.g. 3338 meters
  seabedY?: number;   // Visual depth coordinate e.g. -18
}

export function SeabedEnvironment({ waterDepth, seabedY = -18 }: SeabedEnvironmentProps) {
  const transponderLightRef = useRef<THREE.PointLight>(null!);

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

  // Procedural bathymetric terrain mounds scattered across the seabed
  const seabedMounds = useMemo(() => {
    const mounds = [];
    const count = 16;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + (i * 0.4);
      const dist = 6 + (i * 2.8) % 35;
      const x = Math.sin(angle) * dist;
      const z = Math.cos(angle) * dist;
      const radius = 1.2 + (i % 4) * 0.8;
      const height = 0.35 + (i % 3) * 0.3;
      mounds.push({ x, z, radius, height, id: i });
    }
    return mounds;
  }, []);

  // Flash seabed transponder locator beacon
  useFrame((state) => {
    if (transponderLightRef.current) {
      const flash = Math.sin(state.clock.elapsedTime * 4.0) > 0.7 ? 3.5 : 0.2;
      transponderLightRef.current.intensity = flash;
    }
  });

  return (
    <group>
      {/* ══════════════════════════════════════════════════════════════════
          1. DEDICATED SUBSEA ROV / SURVEY FLOODLIGHTS
          - Illuminates the seabed, bathymetric grid, anchor sinker & chain
          - Guarantees crystal-clear visibility at all depths & camera angles
          ══════════════════════════════════════════════════════════════════ */}
      <group position={[0, seabedY, 0]}>
        {/* Main Overhead High-Intensity Subsea Survey Spotlight */}
        <spotLight
          position={[0, 14, 0]}
          target-position={[0, 0, 0]}
          color="#e0f2fe"
          intensity={12.0}
          distance={65}
          angle={0.95}
          penumbra={0.7}
          castShadow
        />

        {/* Ambient Oceanic Seafloor Floodlight (Wide Blue Fill) */}
        <pointLight
          position={[0, 6, 0]}
          color="#38bdf8"
          intensity={6.5}
          distance={50}
          decay={1.4}
        />

        {/* Perimeter Survey Fill Lights */}
        <pointLight position={[10, 4, 10]} color="#0284c7" intensity={4.0} distance={35} decay={1.6} />
        <pointLight position={[-10, 4, -10]} color="#0284c7" intensity={4.0} distance={35} decay={1.6} />
        <pointLight position={[-10, 4, 10]} color="#0369a1" intensity={3.5} distance={35} decay={1.6} />
        <pointLight position={[10, 4, -10]} color="#0369a1" intensity={3.5} distance={35} decay={1.6} />
      </group>

      {/* ══════════════════════════════════════════════════════════════════
          2. VISIBLE BATHYMETRIC SEABED TERRAIN & GLOWING SONAR MESH
          - Clearly defined abyssal sediment floor (Rich Slate Sediment)
          - Luminous cyan/blue bathymetry grid lines mapping the seabed
          ══════════════════════════════════════════════════════════════════ */}
      {/* Seabed Floor Mesh with Ambient Oceanic Sediment Sheen */}
      <mesh position={[0, seabedY - 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[1200, 1200, 48, 48]} />
        <meshStandardMaterial
          color="#1e293b"
          emissive="#0a2540"
          emissiveIntensity={0.35}
          roughness={0.78}
          metalness={0.22}
        />
      </mesh>

      {/* Primary Vibrant Bathymetric Seafloor Grid Lines (Clearly visible in 3D) */}
      <gridHelper
        position={[0, seabedY + 0.02, 0]}
        args={[500, 50, '#00f0ff', '#0284c7']}
      />

      {/* Secondary Fine Sonar Grid for Immediate Anchor Survey Vicinity */}
      <gridHelper
        position={[0, seabedY + 0.03, 0]}
        args={[60, 20, '#38bdf8', '#0369a1']}
      />

      {/* Bathymetric Survey Datum Rings Centered on Anchor Sinker */}
      <group position={[0, seabedY + 0.04, 0]}>
        {/* Inner 3m Precision Anchor Datum Ring */}
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[2.85, 3.15, 36]} />
          <meshBasicMaterial color="#00e5ff" side={THREE.DoubleSide} />
        </mesh>
        {/* 10m Ground Chain Lay Zone Ring */}
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[9.85, 10.15, 48]} />
          <meshBasicMaterial color="#0284c7" transparent opacity={0.75} side={THREE.DoubleSide} />
        </mesh>
        {/* 25m Safe Mooring Footprint Perimeter Ring */}
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[24.8, 25.2, 64]} />
          <meshBasicMaterial color="#0369a1" transparent opacity={0.5} side={THREE.DoubleSide} />
        </mesh>
      </group>

      {/* Bathymetric Rocky Outcrops & Sediment Mounds around the Anchor */}
      {seabedMounds.map((m) => (
        <mesh key={`mound-${m.id}`} position={[m.x, seabedY + m.height * 0.45, m.z]} castShadow receiveShadow>
          <sphereGeometry args={[m.radius, 12, 8]} />
          <meshStandardMaterial
            color="#334155"
            emissive="#0f2b48"
            emissiveIntensity={0.2}
            roughness={0.88}
            metalness={0.12}
          />
        </mesh>
      ))}

      {/* ══════════════════════════════════════════════════════════════════
          3. AUTHENTIC NIOT CYLINDRICAL SINKER CLUMP ANCHOR & GROUND CHAIN
          - Heavy 2,000 kg Cast-Iron Sinker Weight resting on seafloor
          - Top Pad Eye & Bow Shackle connecting seamlessly to mooring chain
          - Flashing deep-sea acoustic transponder beacon
          ══════════════════════════════════════════════════════════════════ */}
      <group position={[0, seabedY, 0]}>
        {/* Massive Cylindrical Cast-Iron / Ballast Sinker Block */}
        <mesh position={[0, 0.40, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.85, 0.88, 0.80, 32]} />
          <meshStandardMaterial
            color="#78350f"
            emissive="#451a03"
            emissiveIntensity={0.25}
            roughness={0.72}
            metalness={0.65}
          />
        </mesh>

        {/* Top Chamfer Flange Collar */}
        <mesh position={[0, 0.80, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.78, 0.85, 0.08, 32]} />
          <meshStandardMaterial
            color="#5c3a21"
            roughness={0.68}
            metalness={0.6}
          />
        </mesh>

        {/* Heavy Forged Anchor Pad Eye & Safety Bow Shackle (Connection point at Y = seabedY + 0.85) */}
        <group position={[0, 0.85, 0]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.12, 0.12, 0.10, 16]} />
            <meshStandardMaterial color="#475569" metalness={0.92} roughness={0.25} />
          </mesh>
          <mesh position={[0, 0.12, 0]} castShadow>
            <torusGeometry args={[0.16, 0.045, 12, 24]} />
            <meshStandardMaterial color="#cbd5e1" metalness={0.95} roughness={0.2} />
          </mesh>
        </group>

        {/* Subsea Acoustic Transponder Strobe Beacon (Pulsing Cyan Locator) */}
        <group position={[0.75, 0.84, 0]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.06, 0.06, 0.22, 12]} />
            <meshStandardMaterial color="#facc15" metalness={0.5} roughness={0.3} />
          </mesh>
          <mesh position={[0, 0.12, 0]}>
            <sphereGeometry args={[0.045, 12, 12]} />
            <meshStandardMaterial color="#38bdf8" emissive="#38bdf8" emissiveIntensity={0.9} />
          </mesh>
          <pointLight
            ref={transponderLightRef}
            color="#38bdf8"
            distance={18}
            decay={2}
            intensity={2.0}
          />
        </group>

        {/* Heavy Stud-Link Ground Chain Coils resting on seafloor around sinker */}
        <group position={[0.60, 0.06, 0.45]} rotation={[0, 0.45, 0]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.65, 0.065, 8, 24]} />
            <meshStandardMaterial color="#94a3b8" metalness={0.92} roughness={0.25} />
          </mesh>
        </group>
        <group position={[-0.45, 0.06, 0.55]} rotation={[0, -0.6, 0]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.50, 0.055, 8, 24]} />
            <meshStandardMaterial color="#94a3b8" metalness={0.92} roughness={0.25} />
          </mesh>
        </group>
      </group>

      {/* ══════════════════════════════════════════════════════════════════
          4. VERTICAL DEPTH SCALE RULER WITH SEABED DATUM CALLOUT
          - Positioned at X = -12 for clean visibility in camera view
          - Clearly marks depth increments down to the seabed floor
          ══════════════════════════════════════════════════════════════════ */}
      <group position={[-12, 0, 0]}>
        {/* Vertical Backbone Pole */}
        <mesh position={[0, seabedY / 2, 0]}>
          <cylinderGeometry args={[0.05, 0.05, Math.abs(seabedY), 8]} />
          <meshStandardMaterial color="#0891b2" emissive="#0891b2" emissiveIntensity={0.4} />
        </mesh>

        {/* Depth Ticks and Indicators */}
        {depthTicks.map(({ depthVal, y, isMajor }) => (
          <group key={depthVal} position={[0, y, 0]}>
            {/* Horizontal Tick Bar */}
            <mesh position={[isMajor ? 0.6 : 0.35, 0, 0]}>
              <boxGeometry args={[isMajor ? 1.2 : 0.7, 0.06, 0.06]} />
              <meshStandardMaterial
                color={isMajor ? '#00f0ff' : '#0891b2'}
                emissive={isMajor ? '#00e5ff' : '#0891b2'}
                emissiveIntensity={isMajor ? 0.8 : 0.4}
              />
            </mesh>
            {/* Tick Node Marker */}
            <mesh position={[isMajor ? 1.25 : 0.75, 0, 0]}>
              <sphereGeometry args={[isMajor ? 0.14 : 0.08, 12, 12]} />
              <meshStandardMaterial
                color={isMajor ? '#38bdf8' : '#0891b2'}
                emissive={isMajor ? '#38bdf8' : '#0891b2'}
                emissiveIntensity={0.9}
              />
            </mesh>
          </group>
        ))}

        {/* Seabed Datum Callout Indicator Plate */}
        <group position={[1.8, seabedY + 0.3, 0]}>
          <mesh>
            <boxGeometry args={[2.8, 0.4, 0.08]} />
            <meshStandardMaterial color="#0284c7" emissive="#0284c7" emissiveIntensity={0.6} />
          </mesh>
          <mesh position={[0, 0, 0.05]}>
            <boxGeometry args={[2.6, 0.28, 0.02]} />
            <meshBasicMaterial color="#00e5ff" />
          </mesh>
        </group>
      </group>
    </group>
  );
}
