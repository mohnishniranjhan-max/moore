import { useMemo, useState } from 'react';
import * as THREE from 'three';
import type { BuoyState, MooringSegmentData } from './watchCircleTypes';

interface MooringLine3DProps {
  catenaryPoints: THREE.Vector3[];
  buoyState: BuoyState;
  segments?: MooringSegmentData[];
  selectedSegmentIndex?: number | null;
  onSelectSegment?: (index: number | null) => void;
}

export function MooringLine3D({
  catenaryPoints,
  buoyState,
  segments,
  selectedSegmentIndex = null,
  onSelectSegment,
}: MooringLine3DProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Fallback single continuous curve
  const fallbackCurve = useMemo(() => {
    if (!catenaryPoints || catenaryPoints.length < 2) return null;
    return new THREE.CatmullRomCurve3(catenaryPoints, false, 'catmullrom', 0.5);
  }, [catenaryPoints]);

  // Determine line tension base color
  const statusBaseColor = useMemo(() => {
    if (buoyState.status === 'BREACH') return '#ef4444'; // Red
    if (buoyState.status === 'WARNING') return '#f59e0b'; // Amber
    return '#06b6d4'; // Cyan
  }, [buoyState.status]);

  // Build individual curves for each segment with 64-point smooth resolution
  const segmentCurves = useMemo(() => {
    if (!segments || segments.length === 0) return null;
    return segments.map((seg) => {
      if (!seg.points3D || seg.points3D.length < 2) return null;
      const curve = new THREE.CatmullRomCurve3(seg.points3D, false, 'catmullrom', 0.5);
      const midPoint = curve.getPointAt(0.5);
      const startPoint = curve.getPointAt(0);
      const endPoint = curve.getPointAt(1);
      return {
        curve,
        midPoint,
        startPoint,
        endPoint,
        data: seg,
      };
    });
  }, [segments]);

  // 1. INLINE ADCP INSTRUMENT CAGE FRAME (Matching Reference Display Model)
  // Suspended on Segment 0 (Upper Wire Riser) at t ≈ 0.16 (approx 25m - 35m depth)
  const adcpCageData = useMemo(() => {
    if (segmentCurves && segmentCurves[0]?.curve) {
      const c = segmentCurves[0].curve;
      const t = 0.16;
      const pos = c.getPointAt(t);
      const tangent = c.getTangentAt(t).normalize();
      const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), tangent);
      return { pos, quat };
    }
    return null;
  }, [segmentCurves]);

  // 2. SEA-BIRD SBE 37-IM MICROCAT INDUCTIVE CTD SENSORS
  // Clamped along Segment 0 with precise normal vector offset to sit cleanly on cable
  const ctdSensors = useMemo(() => {
    if (segmentCurves && segmentCurves[0]?.curve) {
      const c = segmentCurves[0].curve;
      return [0.38, 0.65, 0.90].map((t, i) => {
        const pt = c.getPointAt(t);
        const tan = c.getTangentAt(t).normalize();
        const norm = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
        if (norm.lengthSq() < 0.1) norm.set(1, 0, 0);
        const pos = pt.clone().addScaledVector(norm, 0.065);
        return {
          pos,
          depthLabel: `${[50, 100, 200][i]}m SBE-37IM`,
        };
      });
    }
    return [];
  }, [segmentCurves]);

  // 3. TRIO OF 3 BRIGHT YELLOW SUBSURFACE BUOYANCY FLOATS (Matching Reference Image)
  // Clustered vertically in a row along the buoyant S-loop apex on Segment 1
  const buoyancyClusterPositions = useMemo(() => {
    if (segmentCurves && segmentCurves[1]?.curve) {
      const c = segmentCurves[1].curve;
      return [
        c.getPointAt(0.46),
        c.getPointAt(0.50),
        c.getPointAt(0.54),
      ];
    }
    if (fallbackCurve) {
      return [
        fallbackCurve.getPointAt(0.46),
        fallbackCurve.getPointAt(0.50),
        fallbackCurve.getPointAt(0.54),
      ];
    }
    return [];
  }, [segmentCurves, fallbackCurve]);

  // 4. INLINE EDGETECH 8242XS DUAL ACOUSTIC RELEASE TRANSPONDER
  // Positioned inline on the lower line section right above the ground chain
  const acousticReleaseData = useMemo(() => {
    if (segmentCurves && segmentCurves[2]?.curve) {
      const c = segmentCurves[2].curve;
      const t = 0.12;
      const pos = c.getPointAt(t);
      const tangent = c.getTangentAt(t).normalize();
      const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), tangent);
      return { pos, quat };
    }
    return null;
  }, [segmentCurves]);

  // If segment curves are available, render interactive multi-segment mooring line
  if (segmentCurves && segmentCurves.length > 0) {
    return (
      <group>
        {segmentCurves.map((item, idx) => {
          if (!item) return null;
          const { curve, midPoint, data } = item;
          const isSelected = selectedSegmentIndex === idx;
          const isHovered = hoveredIndex === idx;

          // Crisp, high-clarity scientific styling matching NIOT OMNI materials
          let segColor = '#94a3b8'; // Seg 0: Jacketed torque-balanced wire rope (Clean Slate Stainless Steel)
          let radius = 0.042;
          let metalness = 0.85;
          let roughness = 0.25;
          let emissiveColor = '#38bdf8';
          let emissiveIntensity = 0.22;

          if (idx === 1) {
            // Seg 1: Compliant 8-strand nylon rope (High-Visibility Cyan Braided Marine Rope)
            segColor = '#0ea5e9';
            radius = 0.052;
            metalness = 0.2;
            roughness = 0.45;
            emissiveColor = '#06b6d4';
            emissiveIntensity = 0.38;
          } else if (idx === 2) {
            // Seg 2: Stud-link heavy cast steel ground chain (Polished Forged Metallic Steel)
            segColor = '#cbd5e1';
            radius = 0.068;
            metalness = 0.92;
            roughness = 0.25;
            emissiveColor = '#64748b';
            emissiveIntensity = 0.18;
          }

          if (isSelected) {
            segColor = '#38bdf8';
            emissiveColor = '#22d3ee';
            emissiveIntensity = 0.95;
          } else if (isHovered) {
            segColor = '#67e8f9';
            emissiveColor = '#0891b2';
            emissiveIntensity = 0.65;
          }

          return (
            <group key={data.id}>
              {/* High-Resolution, Silky-Smooth Mooring Cable Tube */}
              <mesh
                castShadow
                receiveShadow
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectSegment?.(isSelected ? null : idx);
                }}
                onPointerOver={(e) => {
                  e.stopPropagation();
                  setHoveredIndex(idx);
                  document.body.style.cursor = 'pointer';
                }}
                onPointerOut={(e) => {
                  e.stopPropagation();
                  setHoveredIndex(null);
                  document.body.style.cursor = 'auto';
                }}
              >
                <tubeGeometry args={[curve, 80, isSelected ? radius * 1.3 : radius, 12, false]} />
                <meshStandardMaterial
                  color={segColor}
                  emissive={emissiveColor}
                  emissiveIntensity={emissiveIntensity}
                  roughness={roughness}
                  metalness={metalness}
                />
              </mesh>

              {/* Selection Halo / Glowing Indicator at Segment Midpoint */}
              {isSelected && (
                <group position={[midPoint.x, midPoint.y, midPoint.z]}>
                  <mesh>
                    <sphereGeometry args={[0.32, 16, 16]} />
                    <meshBasicMaterial color="#38bdf8" wireframe transparent opacity={0.6} />
                  </mesh>
                  <mesh rotation={[Math.PI / 2, 0, 0]}>
                    <ringGeometry args={[0.36, 0.44, 28]} />
                    <meshBasicMaterial color="#22d3ee" side={THREE.DoubleSide} />
                  </mesh>
                  <mesh>
                    <sphereGeometry args={[0.09, 12, 12]} />
                    <meshBasicMaterial color="#38bdf8" />
                  </mesh>
                </group>
              )}

              {/* Clean Forged Connecting Shackle & Swivel (Only at mid junctions 0->1 and 1->2) */}
              {idx < 2 && (
                <group position={[item.endPoint.x, item.endPoint.y, item.endPoint.z]}>
                  <mesh castShadow>
                    <cylinderGeometry args={[0.065, 0.065, 0.16, 14]} />
                    <meshStandardMaterial color="#cbd5e1" metalness={0.92} roughness={0.2} />
                  </mesh>
                  <mesh position={[0, -0.05, 0]}>
                    <torusGeometry args={[0.09, 0.026, 8, 16]} />
                    <meshStandardMaterial color="#94a3b8" metalness={0.95} roughness={0.2} />
                  </mesh>
                </group>
              )}
            </group>
          );
        })}

        {/* ══════════════════════════════════════════════════════════════════
            1. INLINE ADCP INSTRUMENT CAGE FRAME (FROM REFERENCE IMAGE)
            - Heavy stainless-steel tubular protective frame holding ADCP
            - Upper & lower tension bridles taking the mooring load cleanly
            ══════════════════════════════════════════════════════════════════ */}
        {adcpCageData && (
          <group position={[adcpCageData.pos.x, adcpCageData.pos.y, adcpCageData.pos.z]} quaternion={adcpCageData.quat}>
            {/* Upper Tension Bridle Struts converging to top swivel */}
            {[0, 2.094, 4.188].map((angle, i) => (
              <mesh
                key={`top-strut-${i}`}
                position={[Math.sin(angle) * 0.06, 0.20, Math.cos(angle) * 0.06]}
                rotation={[0.32 * Math.cos(angle), 0, -0.32 * Math.sin(angle)]}
              >
                <cylinderGeometry args={[0.012, 0.012, 0.15, 6]} />
                <meshStandardMaterial color="#e2e8f0" metalness={0.95} roughness={0.15} />
              </mesh>
            ))}
            {/* Top Swivel Eye Ring */}
            <mesh position={[0, 0.27, 0]}>
              <torusGeometry args={[0.045, 0.014, 8, 16]} />
              <meshStandardMaterial color="#cbd5e1" metalness={0.95} />
            </mesh>

            {/* Main Cylindrical Protective Cage Rings */}
            <mesh position={[0, 0.11, 0]}>
              <torusGeometry args={[0.12, 0.014, 8, 24]} />
              <meshStandardMaterial color="#e2e8f0" metalness={0.95} roughness={0.18} />
            </mesh>
            <mesh position={[0, 0, 0]}>
              <torusGeometry args={[0.12, 0.012, 8, 24]} />
              <meshStandardMaterial color="#e2e8f0" metalness={0.95} roughness={0.18} />
            </mesh>
            <mesh position={[0, -0.11, 0]}>
              <torusGeometry args={[0.12, 0.014, 8, 24]} />
              <meshStandardMaterial color="#e2e8f0" metalness={0.95} roughness={0.18} />
            </mesh>

            {/* 4 Vertical Tubular Cage Guard Bars */}
            {[0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2].map((angle, i) => (
              <mesh
                key={`cage-bar-${i}`}
                position={[Math.sin(angle) * 0.12, 0, Math.cos(angle) * 0.12]}
                castShadow
              >
                <cylinderGeometry args={[0.012, 0.012, 0.25, 8]} />
                <meshStandardMaterial color="#e2e8f0" metalness={0.95} roughness={0.18} />
              </mesh>
            ))}

            {/* Internal ADCP Sensor Canister */}
            <mesh position={[0, 0, 0]} castShadow>
              <cylinderGeometry args={[0.08, 0.08, 0.21, 16]} />
              <meshStandardMaterial color="#0f172a" metalness={0.85} roughness={0.25} />
            </mesh>
            {/* Downward Acoustic Transducer Head with 4 Transducer Faces */}
            <mesh position={[0, -0.10, 0]}>
              <cylinderGeometry args={[0.085, 0.075, 0.05, 16]} />
              <meshStandardMaterial color="#0284c7" emissive="#0284c7" emissiveIntensity={0.3} metalness={0.7} roughness={0.25} />
            </mesh>

            {/* Lower Tension Bridle Struts converging to bottom swivel */}
            {[0, 2.094, 4.188].map((angle, i) => (
              <mesh
                key={`bot-strut-${i}`}
                position={[Math.sin(angle) * 0.06, -0.20, Math.cos(angle) * 0.06]}
                rotation={[-0.32 * Math.cos(angle), 0, 0.32 * Math.sin(angle)]}
              >
                <cylinderGeometry args={[0.012, 0.012, 0.15, 6]} />
                <meshStandardMaterial color="#e2e8f0" metalness={0.95} roughness={0.15} />
              </mesh>
            ))}
            {/* Bottom Swivel Eye Ring */}
            <mesh position={[0, -0.27, 0]}>
              <torusGeometry args={[0.045, 0.014, 8, 16]} />
              <meshStandardMaterial color="#cbd5e1" metalness={0.95} />
            </mesh>
          </group>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            2. SEA-BIRD SBE 37-IM MICROCAT INDUCTIVE CTD SENSORS
            - Clamped to the Upper Inductive Wire Rope (Segment 0)
            - Accurately positioned right on the cable outer surface
            ══════════════════════════════════════════════════════════════════ */}
        {ctdSensors.map((item, idx) => (
          <group
            key={`ctd-${idx}`}
            position={[item.pos.x, item.pos.y, item.pos.z]}
            rotation={[0, 0, -0.08]}
          >
            {/* White Titanium MicroCAT Pressure Housing */}
            <mesh castShadow>
              <cylinderGeometry args={[0.038, 0.038, 0.28, 12]} />
              <meshStandardMaterial color="#f8fafc" metalness={0.8} roughness={0.2} />
            </mesh>
            {/* Black Conductivity Cell Guard */}
            <mesh position={[0, -0.16, 0]}>
              <cylinderGeometry args={[0.024, 0.024, 0.07, 8]} />
              <meshStandardMaterial color="#090d16" roughness={0.8} />
            </mesh>
            {/* Clamped Cable Mounting Collar */}
            <mesh position={[-0.05, 0.03, 0]}>
              <boxGeometry args={[0.05, 0.07, 0.05]} />
              <meshStandardMaterial color="#64748b" metalness={0.9} roughness={0.2} />
            </mesh>
            {/* Inductive Telemetry Status LED (Bright Cyan Indicator) */}
            <mesh position={[0.038, 0.08, 0]}>
              <sphereGeometry args={[0.014, 8, 8]} />
              <meshBasicMaterial color="#22d3ee" />
            </mesh>
          </group>
        ))}

        {/* ══════════════════════════════════════════════════════════════════
            3. TRIO OF 3 BRIGHT YELLOW BUOYANCY FLOATS (FROM REFERENCE IMAGE)
            - Clustered vertically in a row on the buoyant S-loop apex
            - Polyethylene vibrant yellow protective "hard-hat" shells
            - Creates the authentic inverse-catenary S-curve belly
            ══════════════════════════════════════════════════════════════════ */}
        {buoyancyClusterPositions.map((pos, idx) => (
          <group key={`buoyancy-sphere-${idx}`} position={[pos.x, pos.y, pos.z]}>
            {/* High-Visibility Maritime Yellow Sphere Shell */}
            <mesh castShadow>
              <sphereGeometry args={[0.26, 24, 24]} />
              <meshStandardMaterial
                color="#facc15"
                roughness={0.3}
                metalness={0.15}
                emissive="#ca8a04"
                emissiveIntensity={0.32}
              />
            </mesh>
            {/* Equatorial Ribbed Flange Collar */}
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.265, 0.032, 8, 24]} />
              <meshStandardMaterial color="#f59e0b" roughness={0.4} />
            </mesh>
            {/* Stainless Steel Cable Clamp Collar */}
            <mesh position={[0, 0.28, 0]}>
              <cylinderGeometry args={[0.018, 0.018, 0.15, 8]} />
              <meshStandardMaterial color="#cbd5e1" metalness={0.92} roughness={0.2} />
            </mesh>
          </group>
        ))}

        {/* ══════════════════════════════════════════════════════════════════
            4. INLINE EDGETECH 8242XS DUAL ACOUSTIC RELEASE TRANSPONDER
            - Located inline on the lower line section above the ground chain
            - High-pressure yellow canister with transducer and release hook
            ══════════════════════════════════════════════════════════════════ */}
        {acousticReleaseData && (
          <group position={[acousticReleaseData.pos.x, acousticReleaseData.pos.y, acousticReleaseData.pos.z]} quaternion={acousticReleaseData.quat}>
            {/* Yellow High-Pressure Cylindrical Body */}
            <mesh castShadow>
              <cylinderGeometry args={[0.085, 0.085, 0.70, 16]} />
              <meshStandardMaterial
                color="#facc15"
                metalness={0.45}
                roughness={0.28}
                emissive="#ca8a04"
                emissiveIntensity={0.22}
              />
            </mesh>
            {/* Top Acoustic Transducer Head */}
            <mesh position={[0, 0.39, 0]} castShadow>
              <cylinderGeometry args={[0.09, 0.075, 0.11, 16]} />
              <meshStandardMaterial color="#0284c7" emissive="#0284c7" emissiveIntensity={0.25} metalness={0.7} roughness={0.25} />
            </mesh>
            {/* Bottom Titanium Release Hook & Drop Link Mechanism */}
            <mesh position={[0, -0.39, 0]} castShadow>
              <torusGeometry args={[0.075, 0.022, 8, 16]} />
              <meshStandardMaterial color="#94a3b8" metalness={0.95} roughness={0.15} />
            </mesh>
          </group>
        )}
      </group>
    );
  }

  // Fallback single tube mesh
  if (!fallbackCurve) return null;

  return (
    <group>
      <mesh castShadow receiveShadow>
        <tubeGeometry args={[fallbackCurve, 80, 0.048, 12, false]} />
        <meshStandardMaterial
          color={statusBaseColor}
          emissive={statusBaseColor}
          emissiveIntensity={0.35}
          roughness={0.35}
          metalness={0.75}
        />
      </mesh>
    </group>
  );
}
