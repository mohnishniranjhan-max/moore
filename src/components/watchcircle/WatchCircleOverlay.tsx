import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { BuoyState, GPSTrailPoint } from './watchCircleTypes';

interface WatchCircleOverlayProps {
  radiusMeters: number;
  buoyState: BuoyState;
  gpsTrail: GPSTrailPoint[];
  showBoundary: boolean;
  showTrail: boolean;
  showExcursionVector: boolean;
}

export function WatchCircleOverlay({
  radiusMeters,
  buoyState,
  gpsTrail,
  showBoundary = true,
  showTrail = true,
  showExcursionVector = true,
}: WatchCircleOverlayProps) {
  const pulseRingRef = useRef<THREE.Mesh>(null!);

  // Conversion: 1 3D scene unit = 30 meters
  const M_TO_3D = 1 / 30;
  const radius3D = radiusMeters * M_TO_3D;

  const buoyPos3D = useMemo(() => {
    return new THREE.Vector3(
      buoyState.excursionX * M_TO_3D,
      0.08,
      buoyState.excursionZ * M_TO_3D
    );
  }, [buoyState.excursionX, buoyState.excursionZ, M_TO_3D]);

  // Color based on watch circle status
  const statusColor = useMemo(() => {
    if (buoyState.status === 'BREACH') return '#ef4444'; // Red
    if (buoyState.status === 'WARNING') return '#f59e0b'; // Amber
    return '#22d3ee'; // Cyan
  }, [buoyState.status]);

  // Excursion vector cylinder transform
  const excursionTransform = useMemo(() => {
    const origin = new THREE.Vector3(0, 0.06, 0);
    const target = buoyPos3D;
    const distance = origin.distanceTo(target);
    if (distance < 0.1) return null;

    const midPoint = new THREE.Vector3().addVectors(origin, target).multiplyScalar(0.5);
    const direction = new THREE.Vector3().subVectors(target, origin).normalize();
    const orientation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);

    return { midPoint, distance, orientation };
  }, [buoyPos3D]);

  // Native Three.js buffer line for GPS trail
  const trailLine = useMemo(() => {
    if (!gpsTrail || gpsTrail.length < 2) return null;
    const positions = new Float32Array(gpsTrail.length * 3);
    for (let i = 0; i < gpsTrail.length; i++) {
      positions[i * 3] = gpsTrail[i].x * M_TO_3D;
      positions[i * 3 + 1] = 0.05;
      positions[i * 3 + 2] = gpsTrail[i].z * M_TO_3D;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.LineBasicMaterial({
      color: '#06b6d4',
      transparent: true,
      opacity: 0.75,
    });
    return new THREE.Line(geo, mat);
  }, [gpsTrail, M_TO_3D]);

  // Pulse animation for warning/breach state
  useFrame((state) => {
    if (pulseRingRef.current) {
      const speed = buoyState.status === 'BREACH' ? 4.0 : 1.5;
      const opacity = 0.35 + Math.sin(state.clock.elapsedTime * speed) * 0.25;
      (pulseRingRef.current.material as THREE.MeshBasicMaterial).opacity = Math.max(0.1, opacity);
    }
  });

  return (
    <group position={[0, 0.02, 0]}>
      {/* ── 1. WATCH CIRCLE BOUNDARY (Surface Ring & Disc) ── */}
      {showBoundary && (
        <group>
          {/* Semi-transparent filled circular watch zone */}
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[radius3D, 64]} />
            <meshBasicMaterial
              color={statusColor}
              transparent
              opacity={0.06}
              depthWrite={false}
              side={THREE.DoubleSide}
            />
          </mesh>

          {/* Solid Perimeter Border Line Ring */}
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[radius3D - 0.06, radius3D + 0.06, 64]} />
            <meshBasicMaterial
              color={statusColor}
              transparent
              opacity={0.85}
              side={THREE.DoubleSide}
            />
          </mesh>

          {/* Pulsing Warning Outer Halo Ring */}
          <mesh ref={pulseRingRef} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[radius3D + 0.08, radius3D + 0.35, 64]} />
            <meshBasicMaterial
              color={statusColor}
              transparent
              opacity={0.3}
              side={THREE.DoubleSide}
            />
          </mesh>

          {/* 4 Cardinal Compass Tick Marks on Circle */}
          {[0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2].map((angle, idx) => (
            <group
              key={idx}
              position={[Math.sin(angle) * radius3D, 0.04, Math.cos(angle) * radius3D]}
              rotation={[0, angle, 0]}
            >
              <mesh>
                <boxGeometry args={[0.08, 0.02, 0.8]} />
                <meshBasicMaterial color={statusColor} />
              </mesh>
            </group>
          ))}
        </group>
      )}

      {/* ── 2. NOMINAL POSITION MARKER (Center Crosshair Datum) ── */}
      <group position={[0, 0.04, 0]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.3, 0.45, 24]} />
          <meshBasicMaterial color="#38bdf8" />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.12, 16]} />
          <meshBasicMaterial color="#38bdf8" />
        </mesh>
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[1.6, 0.02, 0.04]} />
          <meshBasicMaterial color="#38bdf8" />
        </mesh>
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[0.04, 0.02, 1.6]} />
          <meshBasicMaterial color="#38bdf8" />
        </mesh>
      </group>

      {/* ── 3. EXCURSION VECTOR (Nominal -> Current Buoy) ── */}
      {showExcursionVector && excursionTransform && buoyState.excursionDistance > 3 && (
        <group>
          {/* Glowing Vector Cylinder Line */}
          <mesh
            position={excursionTransform.midPoint}
            quaternion={excursionTransform.orientation}
          >
            <cylinderGeometry args={[0.04, 0.04, excursionTransform.distance, 8]} />
            <meshBasicMaterial color={statusColor} />
          </mesh>

          {/* Vector Marker Sphere at Current Buoy Position */}
          <mesh position={[buoyPos3D.x, buoyPos3D.y, buoyPos3D.z]}>
            <sphereGeometry args={[0.18, 12, 12]} />
            <meshBasicMaterial color={statusColor} />
          </mesh>
        </group>
      )}

      {/* ── 4. GPS TRAJECTORY TRACK (Breadcrumb History) ── */}
      {showTrail && trailLine && <primitive object={trailLine} />}
    </group>
  );
}
