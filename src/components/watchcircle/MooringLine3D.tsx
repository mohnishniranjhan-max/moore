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

  // Build individual curves for each segment
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
  // Clamped along Segment 0 at 50m, 100m, 200m depth
  const ctdSensorPositions = useMemo(() => {
    if (segmentCurves && segmentCurves[0]?.curve) {
      const c = segmentCurves[0].curve;
      return [
        { pt: c.getPointAt(0.38), depthLabel: '50m SBE-37IM' },
        { pt: c.getPointAt(0.65), depthLabel: '100m SBE-37IM' },
        { pt: c.getPointAt(0.92), depthLabel: '200m SBE-37IM' },
      ];
    }
    return [];
  }, [segmentCurves]);

  // 3. TRIO OF 3 BRIGHT YELLOW SUBSURFACE BUOYANCY FLOATS (Matching Reference Image)
  // Tightly clustered vertically in a row along the buoyant S-loop apex on Segment 1
  const buoyancyClusterPositions = useMemo(() => {
    if (segmentCurves && segmentCurves[1]?.curve) {
      const c = segmentCurves[1].curve;
      // 3 clustered Benthos spheres tightly stacked at the buoyant S-loop apex
      return [
        c.getPointAt(0.46),
        c.getPointAt(0.50),
        c.getPointAt(0.54),
      ];
    }
    if (fallbackCurve) {
      return [
        fallbackCurve.getPointAt(0.45),
        fallbackCurve.getPointAt(0.50),
        fallbackCurve.getPointAt(0.55),
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

          // Segment-specific styling matching real NIOT OMNI mooring materials
          let segColor = '#334155'; // Seg 0: Jacketed torque-balanced wire rope (Dark Slate)
          let radius = 0.038;
          let metalness = 0.85;
          let roughness = 0.3;

          if (idx === 1) {
            // Seg 1: Compliant 8-strand nylon rope (Oceanic Navy Blue / Braided Rope)
            segColor = '#0284c7';
            radius = 0.046;
            metalness = 0.2;
            roughness = 0.65;
          } else if (idx === 2) {
            // Seg 2: Stud-link heavy cast steel ground chain (Metallic Gunmetal)
            segColor = '#64748b';
            radius = 0.065;
            metalness = 0.92;
            roughness = 0.25;
          }

          if (isSelected) {
            segColor = '#38bdf8'; // Selection highlight
          } else if (isHovered) {
            segColor = '#67e8f9';
          }

          return (
            <group key={data.id}>
              {/* Mooring Segment Cable Tube Mesh */}
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
                <tubeGeometry args={[curve, 44, isSelected ? radius * 1.35 : radius, 8, false]} />
                <meshStandardMaterial
                  color={segColor}
                  emissive={isSelected ? '#22d3ee' : isHovered ? '#0891b2' : statusBaseColor}
                  emissiveIntensity={isSelected ? 0.75 : isHovered ? 0.45 : 0.15}
                  roughness={roughness}
                  metalness={metalness}
                />
              </mesh>

              {/* Selection Halo / Glowing Indicator at Segment Midpoint */}
              {isSelected && (
                <group position={[midPoint.x, midPoint.y, midPoint.z]}>
                  <mesh>
                    <sphereGeometry args={[0.38, 16, 16]} />
                    <meshBasicMaterial color="#38bdf8" wireframe transparent opacity={0.7} />
                  </mesh>
                  <mesh rotation={[Math.PI / 2, 0, 0]}>
                    <ringGeometry args={[0.42, 0.52, 24]} />
                    <meshBasicMaterial color="#22d3ee" side={THREE.DoubleSide} />
                  </mesh>
                  <mesh>
                    <sphereGeometry args={[0.12, 12, 12]} />
                    <meshBasicMaterial color="#38bdf8" />
                  </mesh>
                </group>
              )}

              {/* Heavy Forged Shackle & Connecting Swivel Link at Segment Junction */}
              <group position={[item.endPoint.x, item.endPoint.y, item.endPoint.z]}>
                <mesh castShadow>
                  <cylinderGeometry args={[0.075, 0.075, 0.22, 12]} />
                  <meshStandardMaterial color="#475569" metalness={0.92} roughness={0.25} />
                </mesh>
                <mesh position={[0, -0.06, 0]}>
                  <torusGeometry args={[0.10, 0.03, 8, 16]} />
                  <meshStandardMaterial color="#334155" metalness={0.95} roughness={0.2} />
                </mesh>
              </group>
            </group>
          );
        })}

        {/* ══════════════════════════════════════════════════════════════════
            1. INLINE ADCP INSTRUMENT CAGE FRAME (FROM REFERENCE IMAGE)
            - Heavy stainless-steel tubular protective frame holding ADCP
            - Upper & lower tension bridles taking the mooring load
            ══════════════════════════════════════════════════════════════════ */}
        {adcpCageData && (
          <group position={[adcpCageData.pos.x, adcpCageData.pos.y, adcpCageData.pos.z]} quaternion={adcpCageData.quat}>
            {/* Upper Tension Bridle Struts converging to top swivel */}
            {[0, 2.094, 4.188].map((angle, i) => (
              <mesh
                key={`top-strut-${i}`}
                position={[Math.sin(angle) * 0.06, 0.21, Math.cos(angle) * 0.06]}
                rotation={[0.35 * Math.cos(angle), 0, -0.35 * Math.sin(angle)]}
              >
                <cylinderGeometry args={[0.012, 0.012, 0.16, 6]} />
                <meshStandardMaterial color="#cbd5e1" metalness={0.95} roughness={0.2} />
              </mesh>
            ))}
            {/* Top Swivel Eye Ring */}
            <mesh position={[0, 0.28, 0]}>
              <torusGeometry args={[0.045, 0.014, 8, 16]} />
              <meshStandardMaterial color="#94a3b8" metalness={0.95} />
            </mesh>

            {/* Main Cylindrical Protective Cage Rings */}
            <mesh position={[0, 0.12, 0]}>
              <torusGeometry args={[0.12, 0.014, 8, 24]} />
              <meshStandardMaterial color="#cbd5e1" metalness={0.95} roughness={0.2} />
            </mesh>
            <mesh position={[0, 0, 0]}>
              <torusGeometry args={[0.12, 0.012, 8, 24]} />
              <meshStandardMaterial color="#cbd5e1" metalness={0.95} roughness={0.2} />
            </mesh>
            <mesh position={[0, -0.12, 0]}>
              <torusGeometry args={[0.12, 0.014, 8, 24]} />
              <meshStandardMaterial color="#cbd5e1" metalness={0.95} roughness={0.2} />
            </mesh>

            {/* 4 Vertical Tubular Cage Guard Bars */}
            {[0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2].map((angle, i) => (
              <mesh
                key={`cage-bar-${i}`}
                position={[Math.sin(angle) * 0.12, 0, Math.cos(angle) * 0.12]}
                castShadow
              >
                <cylinderGeometry args={[0.012, 0.012, 0.26, 8]} />
                <meshStandardMaterial color="#cbd5e1" metalness={0.95} roughness={0.2} />
              </mesh>
            ))}

            {/* Internal ADCP Sensor Canister */}
            <mesh position={[0, 0, 0]} castShadow>
              <cylinderGeometry args={[0.08, 0.08, 0.22, 16]} />
              <meshStandardMaterial color="#0f172a" metalness={0.8} roughness={0.25} />
            </mesh>
            {/* Downward Acoustic Transducer Head with 4 Transducer Faces */}
            <mesh position={[0, -0.11, 0]}>
              <cylinderGeometry args={[0.085, 0.075, 0.05, 16]} />
              <meshStandardMaterial color="#0284c7" metalness={0.7} roughness={0.25} />
            </mesh>

            {/* Lower Tension Bridle Struts converging to bottom swivel */}
            {[0, 2.094, 4.188].map((angle, i) => (
              <mesh
                key={`bot-strut-${i}`}
                position={[Math.sin(angle) * 0.06, -0.21, Math.cos(angle) * 0.06]}
                rotation={[-0.35 * Math.cos(angle), 0, 0.35 * Math.sin(angle)]}
              >
                <cylinderGeometry args={[0.012, 0.012, 0.16, 6]} />
                <meshStandardMaterial color="#cbd5e1" metalness={0.95} roughness={0.2} />
              </mesh>
            ))}
            {/* Bottom Swivel Eye Ring */}
            <mesh position={[0, -0.28, 0]}>
              <torusGeometry args={[0.045, 0.014, 8, 16]} />
              <meshStandardMaterial color="#94a3b8" metalness={0.95} />
            </mesh>
          </group>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            2. SEA-BIRD SBE 37-IM MICROCAT INDUCTIVE CTD SENSORS
            - Clamped to the Upper Inductive Wire Rope (Segment 0)
            - Measures high-accuracy temperature and salinity in real-time
            ══════════════════════════════════════════════════════════════════ */}
        {ctdSensorPositions.map((item, idx) => (
          <group
            key={`ctd-${idx}`}
            position={[item.pt.x + 0.08, item.pt.y, item.pt.z]}
            rotation={[0, 0, -0.1]}
          >
            {/* White Titanium MicroCAT Pressure Housing */}
            <mesh castShadow>
              <cylinderGeometry args={[0.042, 0.042, 0.32, 12]} />
              <meshStandardMaterial color="#f8fafc" metalness={0.75} roughness={0.25} />
            </mesh>
            {/* Black Conductivity Cell Guard */}
            <mesh position={[0, -0.18, 0]}>
              <cylinderGeometry args={[0.028, 0.028, 0.08, 8]} />
              <meshStandardMaterial color="#090d16" roughness={0.8} />
            </mesh>
            {/* Clamped Cable Mounting Bracket */}
            <mesh position={[-0.08, 0.04, 0]}>
              <boxGeometry args={[0.06, 0.08, 0.06]} />
              <meshStandardMaterial color="#475569" metalness={0.9} roughness={0.2} />
            </mesh>
            {/* Inductive Telemetry Status LED (Cyan Indicator) */}
            <mesh position={[0.042, 0.10, 0]}>
              <sphereGeometry args={[0.015, 8, 8]} />
              <meshBasicMaterial color="#22d3ee" />
            </mesh>
          </group>
        ))}

        {/* ══════════════════════════════════════════════════════════════════
            3. TRIO OF 3 BRIGHT YELLOW BUOYANCY FLOATS (FROM REFERENCE IMAGE)
            - Clustered vertically in a row on the buoyant S-loop apex
            - Polyethylene yellow protective "hard-hat" shells with flange
            - Creates the authentic inverse-catenary S-curve belly
            ══════════════════════════════════════════════════════════════════ */}
        {buoyancyClusterPositions.map((pos, idx) => (
          <group key={`buoyancy-sphere-${idx}`} position={[pos.x, pos.y, pos.z]}>
            {/* Benthos Polyethylene Hard-Hat Outer Shell (High-Visibility Yellow) */}
            <mesh castShadow>
              <sphereGeometry args={[0.26, 20, 20]} />
              <meshStandardMaterial
                color="#eab308"
                roughness={0.35}
                metalness={0.15}
                emissive="#ca8a04"
                emissiveIntensity={0.22}
              />
            </mesh>
            {/* Equatorial Ribbed Flange Collar */}
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.265, 0.035, 8, 24]} />
              <meshStandardMaterial color="#f59e0b" roughness={0.4} />
            </mesh>
            {/* Stainless Steel Attachment Chain Link & Clamp to Mooring Cable */}
            <mesh position={[0, 0.28, 0]}>
              <cylinderGeometry args={[0.018, 0.018, 0.16, 6]} />
              <meshStandardMaterial color="#94a3b8" metalness={0.9} roughness={0.2} />
            </mesh>
          </group>
        ))}

        {/* ══════════════════════════════════════════════════════════════════
            4. INLINE EDGETECH 8242XS DUAL ACOUSTIC RELEASE TRANSPONDER
            - Located inline above the ground chain
            - High-pressure yellow canister with transducer and release hook
            ══════════════════════════════════════════════════════════════════ */}
        {acousticReleaseData && (
          <group position={[acousticReleaseData.pos.x, acousticReleaseData.pos.y, acousticReleaseData.pos.z]} quaternion={acousticReleaseData.quat}>
            {/* Yellow High-Pressure Cylindrical Body */}
            <mesh castShadow>
              <cylinderGeometry args={[0.09, 0.09, 0.75, 16]} />
              <meshStandardMaterial
                color="#eab308"
                metalness={0.4}
                roughness={0.3}
                emissive="#ca8a04"
                emissiveIntensity={0.18}
              />
            </mesh>
            {/* Top Acoustic Transducer Head */}
            <mesh position={[0, 0.42, 0]} castShadow>
              <cylinderGeometry args={[0.095, 0.08, 0.12, 16]} />
              <meshStandardMaterial color="#0284c7" metalness={0.7} roughness={0.25} />
            </mesh>
            {/* Bottom Titanium Release Hook & Drop Link Mechanism */}
            <mesh position={[0, -0.42, 0]} castShadow>
              <torusGeometry args={[0.08, 0.024, 8, 16]} />
              <meshStandardMaterial color="#64748b" metalness={0.95} roughness={0.15} />
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
        <tubeGeometry args={[fallbackCurve, 64, 0.045, 8, false]} />
        <meshStandardMaterial
          color={statusBaseColor}
          emissive={statusBaseColor}
          emissiveIntensity={0.25}
          roughness={0.4}
          metalness={0.7}
        />
      </mesh>
    </group>
  );
}
