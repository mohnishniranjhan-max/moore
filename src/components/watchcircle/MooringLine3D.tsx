import { useMemo, useState, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { BuoyState, MooringSegmentData } from './watchCircleTypes';

interface MooringLine3DProps {
  catenaryPoints: THREE.Vector3[];
  buoyState: BuoyState;
  segments?: MooringSegmentData[];
  selectedSegmentIndex?: number | null;
  onSelectSegment?: (index: number | null) => void;
  liveMotionRef?: React.MutableRefObject<{
    position: THREE.Vector3;
    rotation: THREE.Euler;
    keelPosition: THREE.Vector3;
  }>;
}

// In-place dynamic buffer vertex updater for Three.js TubeGeometry
// Zero GPU buffer allocations, zero garbage collection pauses
function updateTubeVertices(
  geometry: THREE.BufferGeometry,
  curve: THREE.Curve<THREE.Vector3>,
  tubularSegments: number,
  radius: number,
  radialSegments: number
) {
  const frames = curve.computeFrenetFrames(tubularSegments, false);
  const positionAttr = geometry.attributes.position as THREE.BufferAttribute;
  if (!positionAttr) return;
  const posArray = positionAttr.array as Float32Array;
  let idx = 0;

  for (let i = 0; i <= tubularSegments; i++) {
    const u = i / tubularSegments;
    const p = curve.getPointAt(u);
    const N = frames.normals[i];
    const B = frames.binormals[i];

    for (let j = 0; j <= radialSegments; j++) {
      const v = (j / radialSegments) * Math.PI * 2;
      const sin = Math.sin(v);
      const cos = -Math.cos(v);
      const normalX = cos * N.x + sin * B.x;
      const normalY = cos * N.y + sin * B.y;
      const normalZ = cos * N.z + sin * B.z;

      posArray[idx++] = p.x + radius * normalX;
      posArray[idx++] = p.y + radius * normalY;
      posArray[idx++] = p.z + radius * normalZ;
    }
  }

  positionAttr.needsUpdate = true;
  geometry.computeVertexNormals();
}

export function MooringLine3D({
  catenaryPoints,
  buoyState,
  segments,
  selectedSegmentIndex = null,
  onSelectSegment,
  liveMotionRef,
}: MooringLine3DProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Group and mesh references for silky-smooth 60 FPS live kinematics
  const upperRiserRef = useRef<THREE.Group>(null!);
  const trawlFloatRef = useRef<THREE.Group>(null!);
  const nylonRopeMeshRef = useRef<THREE.Mesh>(null!);
  const polyRopeMeshRef = useRef<THREE.Mesh>(null!);

  // Horizontal offset direction for the buoyant trawl float (primarily +X for clear profile bend visibility)
  const floatOffset = useMemo(() => new THREE.Vector3(1.35, 0, 0.15), []);

  // Nominal initial fairlead coordinate
  const initialKeelPos = useMemo(() => {
    return new THREE.Vector3(buoyState.excursionX / 30, -1.69, buoyState.excursionZ / 30);
  }, [buoyState.excursionX, buoyState.excursionZ]);

  // Initial curve for Nylon Rope U-Bend
  const initialNylonCurve = useMemo(() => {
    const pCtd = initialKeelPos.clone().add(new THREE.Vector3(0, -5.10, 0));
    const pFloat = initialKeelPos.clone().add(new THREE.Vector3(floatOffset.x, -4.61, floatOffset.z));
    const pDip = new THREE.Vector3(
      (pCtd.x + pFloat.x) * 0.5,
      Math.min(pCtd.y, pFloat.y) - 0.90,
      (pCtd.z + pFloat.z) * 0.5
    );
    const pDown = pCtd.clone().add(new THREE.Vector3(0, -0.42, 0));
    const pUp = pFloat.clone().add(new THREE.Vector3(0, -0.42, 0));
    return new THREE.CatmullRomCurve3([pCtd, pDown, pDip, pUp, pFloat], false, 'catmullrom', 0.5);
  }, [initialKeelPos, floatOffset]);

  // Initial curve for Deep Polypropylene Rope
  const initialPolyCurve = useMemo(() => {
    const pFloat = initialKeelPos.clone().add(new THREE.Vector3(floatOffset.x, -4.61, floatOffset.z));
    const pGlassTop = new THREE.Vector3(0, -14.60, 0);
    const pMid = new THREE.Vector3(
      pFloat.x * 0.40,
      (pFloat.y + pGlassTop.y) * 0.5,
      pFloat.z * 0.40
    );
    return new THREE.CatmullRomCurve3([pFloat, pMid, pGlassTop], false, 'catmullrom', 0.5);
  }, [initialKeelPos, floatOffset]);

  // Master curve for segment markers
  const masterCurve = useMemo(() => {
    if (!catenaryPoints || catenaryPoints.length < 2) return null;
    return new THREE.CatmullRomCurve3(catenaryPoints, false, 'catmullrom', 0.5);
  }, [catenaryPoints]);

  // Segment highlight states
  const isSeg0Active = selectedSegmentIndex === 0;
  const isSeg1Active = selectedSegmentIndex === 1;
  const isSeg2Active = selectedSegmentIndex === 2;

  const isSeg0Hovered = hoveredIndex === 0;
  const isSeg1Hovered = hoveredIndex === 1;
  const isSeg2Hovered = hoveredIndex === 2;

  // ══════════════════════════════════════════════════════════════════
  // LIVE FRAME KINEMATICS: 100% Locked Buoy Connection & Dynamic Flex
  // ══════════════════════════════════════════════════════════════════
  useFrame((state) => {
    if (!liveMotionRef?.current) return;
    const liveKeel = liveMotionRef.current.keelPosition;
    const liveRot = liveMotionRef.current.rotation;

    // 1. Position Upper Riser Group directly at live buoy keel pad eye (ZERO GAP!)
    if (upperRiserRef.current) {
      upperRiserRef.current.position.set(liveKeel.x, liveKeel.y, liveKeel.z);
      // Subtle pendulum wave response as the cable hangs vertically under submerged weight
      upperRiserRef.current.rotation.x = liveRot.x * 0.16;
      upperRiserRef.current.rotation.z = liveRot.z * 0.16;
    }

    // 2. Compute CTD base in world space (relative to Upper Riser)
    const ctdOffsetLocal = new THREE.Vector3(0, -5.10, 0);
    ctdOffsetLocal.applyEuler(upperRiserRef.current.rotation);
    const liveCtdBase = liveKeel.clone().add(ctdOffsetLocal);

    // 3. Compute live position of Trawl Float base
    // Float cluster provides +1800N net positive upward buoyancy
    // Floats in gentle harmonic response with wave motion
    const t = state.clock.elapsedTime;
    const floatHeave = (liveKeel.y - (-1.69)) * 0.22 + Math.sin(t * 1.35) * 0.04;
    const liveFloatBase = new THREE.Vector3(
      liveKeel.x * 0.35 + floatOffset.x,
      -6.30 + floatHeave,
      liveKeel.z * 0.35 + floatOffset.z
    );

    if (trawlFloatRef.current) {
      trawlFloatRef.current.position.set(liveFloatBase.x, liveFloatBase.y, liveFloatBase.z);
    }

    // 4. Update Compliant Nylon Rope S-Loop: Distinct U-Bend Dip below CTD
    // Loop dips ~0.90m below the lowest connection point, creating the unmistakable U-bend
    const liveDipY = Math.min(liveCtdBase.y, liveFloatBase.y) - 0.90;
    const liveDip = new THREE.Vector3(
      (liveCtdBase.x + liveFloatBase.x) * 0.5,
      liveDipY,
      (liveCtdBase.z + liveFloatBase.z) * 0.5
    );
    const pDown = liveCtdBase.clone().add(new THREE.Vector3(0, -0.42, 0));
    const pUp = liveFloatBase.clone().add(new THREE.Vector3(0, -0.42, 0));

    const liveNylonCurve = new THREE.CatmullRomCurve3(
      [liveCtdBase, pDown, liveDip, pUp, liveFloatBase],
      false,
      'catmullrom',
      0.5
    );

    if (nylonRopeMeshRef.current?.geometry) {
      updateTubeVertices(
        nylonRopeMeshRef.current.geometry,
        liveNylonCurve,
        32,
        isSeg1Active ? 0.048 : 0.038,
        8
      );
    }

    // 5. Update Deep Polypropylene Rope: from liveFloatBase down to top of glass spheres (0, -14.60, 0)
    const glassSpheresTop = new THREE.Vector3(0, -14.60, 0);
    const polyMid = new THREE.Vector3(
      liveFloatBase.x * 0.40,
      (liveFloatBase.y + glassSpheresTop.y) * 0.5,
      liveFloatBase.z * 0.40
    );
    const livePolyCurve = new THREE.CatmullRomCurve3(
      [liveFloatBase, polyMid, glassSpheresTop],
      false,
      'catmullrom',
      0.5
    );

    if (polyRopeMeshRef.current?.geometry) {
      updateTubeVertices(
        polyRopeMeshRef.current.geometry,
        livePolyCurve,
        32,
        isSeg1Active ? 0.046 : 0.036,
        8
      );
    }
  });

  return (
    <group>
      {/* ══════════════════════════════════════════════════════════════════
          SEGMENT 1 GROUP (Components 1-4):
          - Upper Chain locked through buoy keel pad eye
          - Inline ADCP instrument cage frame
          - 500m Inductive Cable with 9x Clamped CT Sensors
          - CTD Sensor at inductive cable base
          ══════════════════════════════════════════════════════════════════ */}
      <group
        ref={upperRiserRef}
        onClick={(e) => {
          e.stopPropagation();
          onSelectSegment?.(isSeg0Active ? null : 0);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHoveredIndex(0);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          setHoveredIndex(null);
          document.body.style.cursor = 'auto';
        }}
      >
        {/* ── 1. UPPER MOORING CHAIN & TOP FAIRLEAD ATTACHMENT (At local [0, 0, 0]) ── */}
        <group position={[0, 0, 0]}>
          {/* Top Heavy Marine Steel Bow Shackle interlocking through Buoy Keel Pad Eye */}
          <mesh position={[0, -0.02, 0]} castShadow>
            <torusGeometry args={[0.075, 0.022, 12, 24]} />
            <meshStandardMaterial
              color={isSeg0Active ? '#38bdf8' : '#cbd5e1'}
              metalness={0.95}
              roughness={0.15}
              emissive={isSeg0Active ? '#0284c7' : '#000000'}
              emissiveIntensity={isSeg0Active ? 0.6 : 0}
            />
          </mesh>
          {/* High-Strength Mooring Swivel Bearing Housing */}
          <mesh position={[0, -0.09, 0]} castShadow>
            <cylinderGeometry args={[0.055, 0.055, 0.12, 16]} />
            <meshStandardMaterial color="#334155" metalness={0.92} roughness={0.25} />
          </mesh>
          {/* Galvanized Cable / Chain Thimble Loop */}
          <mesh position={[0, -0.17, 0]} castShadow>
            <torusGeometry args={[0.065, 0.020, 8, 16]} />
            <meshStandardMaterial color="#94a3b8" metalness={0.95} roughness={0.2} />
          </mesh>

          {/* 10 Interlocking Stud-Link Chain Links connecting Keel to ADCP */}
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => {
            const y = -0.23 - i * 0.052;
            const isTurned = i % 2 === 1;
            return (
              <group key={`upper-chain-link-${i}`} position={[0, y, 0]}>
                <mesh rotation={[0, isTurned ? Math.PI / 2 : 0, 0]} castShadow>
                  <torusGeometry args={[0.048, 0.016, 8, 16]} />
                  <meshStandardMaterial
                    color={isSeg0Active ? '#38bdf8' : isSeg0Hovered ? '#67e8f9' : '#64748b'}
                    metalness={0.92}
                    roughness={0.25}
                    emissive={isSeg0Active ? '#0284c7' : '#000000'}
                    emissiveIntensity={isSeg0Active ? 0.5 : 0}
                  />
                </mesh>
                {/* Central Cross Stud Bar */}
                <mesh rotation={[Math.PI / 2, isTurned ? 0 : Math.PI / 2, 0]}>
                  <cylinderGeometry args={[0.010, 0.010, 0.064, 8]} />
                  <meshStandardMaterial color="#475569" metalness={0.92} roughness={0.3} />
                </mesh>
              </group>
            );
          })}
        </group>

        {/* ── 2. INLINE ADCP INSTRUMENT CAGE FRAME (Centered at Y = -1.05m) ── */}
        <group position={[0, -1.05, 0]}>
          {/* Top Bow Shackle connecting Upper Chain to ADCP */}
          <mesh position={[0, 0.32, 0]} castShadow>
            <torusGeometry args={[0.048, 0.015, 8, 16]} />
            <meshStandardMaterial color="#cbd5e1" metalness={0.95} roughness={0.2} />
          </mesh>
          {/* Top Swivel Eye Ring */}
          <mesh position={[0, 0.26, 0]}>
            <torusGeometry args={[0.045, 0.014, 8, 16]} />
            <meshStandardMaterial color="#cbd5e1" metalness={0.95} />
          </mesh>
          {/* Upper Tension Bridle Struts converging to top swivel (3 struts at 120°) */}
          {[0, 2.094, 4.188].map((angle, i) => (
            <mesh
              key={`adcp-top-strut-${i}`}
              position={[Math.sin(angle) * 0.06, 0.19, Math.cos(angle) * 0.06]}
              rotation={[0.32 * Math.cos(angle), 0, -0.32 * Math.sin(angle)]}
            >
              <cylinderGeometry args={[0.012, 0.012, 0.15, 6]} />
              <meshStandardMaterial color="#e2e8f0" metalness={0.95} roughness={0.15} />
            </mesh>
          ))}

          {/* Main Cylindrical Protective Cage Rings */}
          <mesh position={[0, 0.11, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.13, 0.014, 8, 24]} />
            <meshStandardMaterial color="#e2e8f0" metalness={0.95} roughness={0.18} />
          </mesh>
          <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.13, 0.012, 8, 24]} />
            <meshStandardMaterial color="#e2e8f0" metalness={0.95} roughness={0.18} />
          </mesh>
          <mesh position={[0, -0.11, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.13, 0.014, 8, 24]} />
            <meshStandardMaterial color="#e2e8f0" metalness={0.95} roughness={0.18} />
          </mesh>

          {/* 4 Vertical Tubular Cage Guard Bars */}
          {[0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2].map((angle, i) => (
            <mesh
              key={`adcp-cage-bar-${i}`}
              position={[Math.sin(angle) * 0.13, 0, Math.cos(angle) * 0.13]}
              castShadow
            >
              <cylinderGeometry args={[0.012, 0.012, 0.26, 8]} />
              <meshStandardMaterial color="#e2e8f0" metalness={0.95} roughness={0.18} />
            </mesh>
          ))}

          {/* Internal ADCP Sensor Canister */}
          <mesh position={[0, 0, 0]} castShadow>
            <cylinderGeometry args={[0.085, 0.085, 0.22, 20]} />
            <meshStandardMaterial color="#0f172a" metalness={0.85} roughness={0.25} />
          </mesh>
          {/* Downward Acoustic Transducer Head with 4 Transducer Faces */}
          <mesh position={[0, -0.11, 0]}>
            <cylinderGeometry args={[0.09, 0.075, 0.05, 16]} />
            <meshStandardMaterial color="#0284c7" emissive="#0284c7" emissiveIntensity={0.35} metalness={0.7} roughness={0.25} />
          </mesh>

          {/* Lower Tension Bridle Struts converging to bottom swivel */}
          {[0, 2.094, 4.188].map((angle, i) => (
            <mesh
              key={`adcp-bot-strut-${i}`}
              position={[Math.sin(angle) * 0.06, -0.19, Math.cos(angle) * 0.06]}
              rotation={[-0.32 * Math.cos(angle), 0, 0.32 * Math.sin(angle)]}
            >
              <cylinderGeometry args={[0.012, 0.012, 0.15, 6]} />
              <meshStandardMaterial color="#e2e8f0" metalness={0.95} roughness={0.15} />
            </mesh>
          ))}
          {/* Bottom Swivel Eye Ring & Bow Shackle */}
          <mesh position={[0, -0.26, 0]}>
            <torusGeometry args={[0.045, 0.014, 8, 16]} />
            <meshStandardMaterial color="#cbd5e1" metalness={0.95} />
          </mesh>
          <mesh position={[0, -0.32, 0]} castShadow>
            <torusGeometry args={[0.048, 0.015, 8, 16]} />
            <meshStandardMaterial color="#cbd5e1" metalness={0.95} roughness={0.2} />
          </mesh>
        </group>

        {/* ── 3. 500m ARMORED INDUCTIVE WIRE ROPE CABLE (From Y = -1.38m to Y = -4.65m) ── */}
        <mesh position={[0, -3.015, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[isSeg0Active ? 0.032 : 0.024, isSeg0Active ? 0.032 : 0.024, 3.27, 16]} />
          <meshStandardMaterial
            color={isSeg0Active ? '#38bdf8' : isSeg0Hovered ? '#67e8f9' : '#94a3b8'}
            metalness={0.88}
            roughness={0.22}
            emissive={isSeg0Active ? '#22d3ee' : '#000000'}
            emissiveIntensity={isSeg0Active ? 0.6 : 0}
          />
        </mesh>

        {/* ── 9 CLAMPED CT SENSORS ALONG 500m INDUCTIVE CABLE ── */}
        {[-1.65, -1.98, -2.31, -2.64, -2.97, -3.30, -3.63, -3.96, -4.29].map((sensorY, idx) => (
          <group key={`ct-sensor-${idx}`} position={[0.052, sensorY, 0]}>
            {/* White Titanium MicroCAT Pressure Housing */}
            <mesh castShadow>
              <cylinderGeometry args={[0.032, 0.032, 0.22, 12]} />
              <meshStandardMaterial color="#f8fafc" metalness={0.8} roughness={0.2} />
            </mesh>
            {/* Black Conductivity Cell Guard Tube */}
            <mesh position={[0, -0.13, 0]}>
              <cylinderGeometry args={[0.020, 0.020, 0.06, 8]} />
              <meshStandardMaterial color="#090d16" roughness={0.8} />
            </mesh>
            {/* Clamped Cable Mounting Collar Bracket */}
            <mesh position={[-0.045, 0.02, 0]}>
              <boxGeometry args={[0.045, 0.06, 0.045]} />
              <meshStandardMaterial color="#64748b" metalness={0.9} roughness={0.2} />
            </mesh>
            {/* Inductive Telemetry Status LED (Bright Cyan Indicator) */}
            <mesh position={[0.032, 0.06, 0]}>
              <sphereGeometry args={[0.012, 8, 8]} />
              <meshBasicMaterial color="#22d3ee" />
            </mesh>
          </group>
        ))}

        {/* ── 4. CTD SENSOR (At Base of Inductive Cable, Centered at Y = -4.75m) ── */}
        <group position={[0.055, -4.75, 0]}>
          {/* Sea-Bird SBE 37-IM CTD Primary Titanium Housing */}
          <mesh castShadow>
            <cylinderGeometry args={[0.042, 0.042, 0.32, 14]} />
            <meshStandardMaterial color="#f1f5f9" metalness={0.85} roughness={0.2} />
          </mesh>
          {/* Lower Conductivity & Temperature Flow Cell */}
          <mesh position={[0, -0.18, 0]}>
            <cylinderGeometry args={[0.026, 0.026, 0.08, 10]} />
            <meshStandardMaterial color="#0f172a" roughness={0.7} />
          </mesh>
          {/* Dual Stainless Steel Cable Mounting Clamp Straps */}
          <mesh position={[-0.055, 0.08, 0]}>
            <boxGeometry args={[0.05, 0.04, 0.05]} />
            <meshStandardMaterial color="#cbd5e1" metalness={0.9} roughness={0.25} />
          </mesh>
          <mesh position={[-0.055, -0.08, 0]}>
            <boxGeometry args={[0.05, 0.04, 0.05]} />
            <meshStandardMaterial color="#cbd5e1" metalness={0.9} roughness={0.25} />
          </mesh>
          {/* Status Telemetry Indicator LED */}
          <mesh position={[0.044, 0.10, 0]}>
            <sphereGeometry args={[0.014, 8, 8]} />
            <meshBasicMaterial color="#38bdf8" />
          </mesh>
        </group>

        {/* Cable Termination Hardware Link (Spelter Socket & Dual Bow Shackles to Nylon Rope) */}
        <group position={[0, -5.02, 0]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.045, 0.045, 0.12, 12]} />
            <meshStandardMaterial color="#cbd5e1" metalness={0.92} roughness={0.2} />
          </mesh>
          <mesh position={[0, -0.08, 0]} castShadow>
            <torusGeometry args={[0.058, 0.018, 8, 16]} />
            <meshStandardMaterial color="#94a3b8" metalness={0.95} roughness={0.2} />
          </mesh>
        </group>

        {/* Segment 1 Glowing Indicator at Midpoint */}
        {isSeg0Active && (
          <group position={[0, -2.8, 0]}>
            <mesh>
              <sphereGeometry args={[0.32, 16, 16]} />
              <meshBasicMaterial color="#38bdf8" wireframe transparent opacity={0.6} />
            </mesh>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.36, 0.44, 28]} />
              <meshBasicMaterial color="#22d3ee" side={THREE.DoubleSide} />
            </mesh>
          </group>
        )}
      </group>

      {/* ══════════════════════════════════════════════════════════════════
          SEGMENT 2 GROUP (Components 5-7):
          - Compliant Nylon Rope S-Loop U-Bend
          - Trawl Float in Net (Buoyancy Cluster Pulling UP at Apex)
          - Deep Polypropylene Rope
          ══════════════════════════════════════════════════════════════════ */}
      <group
        onClick={(e) => {
          e.stopPropagation();
          onSelectSegment?.(isSeg1Active ? null : 1);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHoveredIndex(1);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          setHoveredIndex(null);
          document.body.style.cursor = 'auto';
        }}
      >
        {/* ── 5. COMPLIANT NYLON ROPE S-LOOP (Dynamic U-Bend Flexing with Waves) ── */}
        <mesh ref={nylonRopeMeshRef} castShadow receiveShadow>
          <tubeGeometry args={[initialNylonCurve, 32, isSeg1Active ? 0.048 : 0.038, 8, false]} />
          <meshStandardMaterial
            color={isSeg1Active ? '#38bdf8' : isSeg1Hovered ? '#67e8f9' : '#0ea5e9'}
            roughness={0.55}
            metalness={0.15}
            emissive={isSeg1Active ? '#06b6d4' : '#000000'}
            emissiveIntensity={isSeg1Active ? 0.6 : 0}
          />
        </mesh>

        {/* ── 6. TRAWL FLOAT IN NET (SUBSURFACE BUOYANCY CLUSTER PULLING UPWARD AT APEX) ── */}
        <group ref={trawlFloatRef} position={[initialKeelPos.x + floatOffset.x, -6.30, initialKeelPos.z + floatOffset.z]}>
          {/* Bottom Gathered Net Thimble Eye with Galvanized Marine Bow Shackle */}
          <group position={[0, 0, 0]}>
            <mesh position={[0, 0.04, 0]} castShadow>
              <cylinderGeometry args={[0.035, 0.035, 0.08, 12]} />
              <meshStandardMaterial color="#cbd5e1" metalness={0.92} roughness={0.2} />
            </mesh>
            <mesh position={[0, -0.04, 0]} castShadow>
              <torusGeometry args={[0.055, 0.018, 8, 16]} />
              <meshStandardMaterial color="#94a3b8" metalness={0.95} roughness={0.2} />
            </mesh>
          </group>

          {/* Vertical Stack of 5 Cylindrical Trawl Floats Extending UPWARD in Vibrant Coral Red */}
          {[0.24, 0.48, 0.72, 0.96, 1.20].map((yOff, fIdx) => (
            <group key={`trawl-float-${fIdx}`} position={[0, yOff, 0]}>
              {/* Cylindrical Buoyancy Float Body */}
              <mesh castShadow>
                <cylinderGeometry args={[0.16, 0.16, 0.19, 20]} />
                <meshStandardMaterial
                  color="#f43f5e"
                  roughness={0.30}
                  metalness={0.15}
                  emissive="#be185d"
                  emissiveIntensity={0.28}
                />
              </mesh>
              {/* Top and Bottom Rounded Caps */}
              <mesh position={[0, 0.095, 0]} castShadow>
                <sphereGeometry args={[0.16, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
                <meshStandardMaterial color="#f43f5e" roughness={0.30} metalness={0.15} />
              </mesh>
              <mesh position={[0, -0.095, 0]} rotation={[Math.PI, 0, 0]} castShadow>
                <sphereGeometry args={[0.16, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
                <meshStandardMaterial color="#f43f5e" roughness={0.30} metalness={0.15} />
              </mesh>
              {/* Equatorial Seam Ring */}
              <mesh rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[0.164, 0.015, 6, 20]} />
                <meshStandardMaterial color="#e11d48" roughness={0.35} />
              </mesh>
            </group>
          ))}

          {/* Outer Diamond Net Mesh Bag Enclosing all 5 Floats */}
          <mesh position={[0, 0.72, 0]}>
            <cylinderGeometry args={[0.185, 0.185, 1.25, 16, 16, true]} />
            <meshStandardMaterial
              color="#db2777"
              wireframe
              transparent
              opacity={0.65}
              roughness={0.6}
            />
          </mesh>

          {/* 4 Vertical Structural Net Rib Ropes */}
          {[0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2].map((ang, i) => (
            <mesh key={`net-rib-${i}`} position={[Math.sin(ang) * 0.185, 0.72, Math.cos(ang) * 0.185]}>
              <cylinderGeometry args={[0.010, 0.010, 1.26, 6]} />
              <meshStandardMaterial color="#9d174d" roughness={0.7} />
            </mesh>
          ))}

          {/* Top Gathered Net Thimble Eye with Galvanized Marine Bow Shackle */}
          <group position={[0, 1.44, 0]}>
            <mesh position={[0, -0.04, 0]} castShadow>
              <cylinderGeometry args={[0.035, 0.035, 0.08, 12]} />
              <meshStandardMaterial color="#cbd5e1" metalness={0.92} roughness={0.2} />
            </mesh>
            <mesh position={[0, 0.04, 0]} castShadow>
              <torusGeometry args={[0.055, 0.018, 8, 16]} />
              <meshStandardMaterial color="#94a3b8" metalness={0.95} roughness={0.2} />
            </mesh>
          </group>
        </group>

        {/* ── 7. DEEP POLYPROPYLENE ROPE (From Float Base Down to Glass Spheres) ── */}
        <mesh ref={polyRopeMeshRef} castShadow receiveShadow>
          <tubeGeometry args={[initialPolyCurve, 32, isSeg1Active ? 0.046 : 0.036, 8, false]} />
          <meshStandardMaterial
            color={isSeg1Active ? '#38bdf8' : isSeg1Hovered ? '#67e8f9' : '#0284c7'}
            roughness={0.50}
            metalness={0.18}
            emissive={isSeg1Active ? '#0891b2' : '#000000'}
            emissiveIntensity={isSeg1Active ? 0.6 : 0}
          />
        </mesh>

        {/* Segment 2 Glowing Indicator at Midpoint */}
        {isSeg1Active && masterCurve && (
          <group position={masterCurve.getPointAt(0.42).toArray()}>
            <mesh>
              <sphereGeometry args={[0.32, 16, 16]} />
              <meshBasicMaterial color="#38bdf8" wireframe transparent opacity={0.6} />
            </mesh>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.36, 0.44, 28]} />
              <meshBasicMaterial color="#22d3ee" side={THREE.DoubleSide} />
            </mesh>
          </group>
        )}
      </group>

      {/* ══════════════════════════════════════════════════════════════════
          SEGMENT 3 GROUP (Components 8-11):
          - Vertical cluster of 3 yellow glass spheres in hardhats
          - Dual acoustic release transponder in purple housing
          - Heavy ground chain
          - 2,000 kg Segmented dead weight bottom weight
          ══════════════════════════════════════════════════════════════════ */}
      <group
        onClick={(e) => {
          e.stopPropagation();
          onSelectSegment?.(isSeg2Active ? null : 2);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHoveredIndex(2);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          setHoveredIndex(null);
          document.body.style.cursor = 'auto';
        }}
      >
        {/* Chain section running through glass spheres */}
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
          const y = -14.45 - i * 0.14;
          const isTurned = i % 2 === 1;
          return (
            <group key={`glass-chain-link-${i}`} position={[0, y, 0]}>
              <mesh rotation={[0, isTurned ? Math.PI / 2 : 0, 0]} castShadow>
                <torusGeometry args={[0.045, 0.015, 8, 16]} />
                <meshStandardMaterial color="#cbd5e1" metalness={0.92} roughness={0.2} />
              </mesh>
            </group>
          );
        })}

        {/* ── 8. EXACT VERTICAL STACK OF 3 YELLOW GLASS SPHERES ── */}
        {[-14.60, -15.00, -15.40].map((sphereY, idx) => (
          <group key={`glass-sphere-${idx}`} position={[0, sphereY, 0]}>
            {/* Yellow Spherical Glass Float in Protective Hardhat Casing */}
            <mesh castShadow>
              <sphereGeometry args={[0.20, 24, 24]} />
              <meshStandardMaterial
                color="#facc15"
                roughness={0.30}
                metalness={0.22}
                emissive="#ca8a04"
                emissiveIntensity={isSeg2Active ? 0.45 : 0.28}
              />
            </mesh>
            {/* Equatorial Ribbed Protective Hardhat Rim */}
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.205, 0.024, 8, 24]} />
              <meshStandardMaterial color="#eab308" roughness={0.38} />
            </mesh>
          </group>
        ))}

        {/* ── 9. INLINE DUAL ACOUSTIC RELEASE TRANSPONDER (Centered at Y = -16.15m) ── */}
        <group position={[0, -16.15, 0]}>
          {/* Top Shackle Connection Ring to Glass Spheres */}
          <mesh position={[0, 0.48, 0]}>
            <torusGeometry args={[0.055, 0.016, 8, 16]} />
            <meshStandardMaterial color="#cbd5e1" metalness={0.95} />
          </mesh>
          {/* Top Acoustic Communication Transducer Head */}
          <mesh position={[0, 0.40, 0]} castShadow>
            <cylinderGeometry args={[0.09, 0.075, 0.12, 16]} />
            <meshStandardMaterial color="#0284c7" emissive="#0284c7" emissiveIntensity={0.35} metalness={0.7} roughness={0.25} />
          </mesh>

          {/* Acoustic Release High-Pressure Cylindrical Canister Body in Deep Purple */}
          <mesh castShadow>
            <cylinderGeometry args={[0.085, 0.085, 0.72, 20]} />
            <meshStandardMaterial
              color="#7c3aed"
              metalness={0.55}
              roughness={0.25}
              emissive="#6d28d9"
              emissiveIntensity={isSeg2Active ? 0.45 : 0.22}
            />
          </mesh>
          {/* Lateral Clamp Straps & Sacrificial Zinc Anodes */}
          {[-0.22, 0.22].map((yOff, i) => (
            <mesh key={`anode-${i}`} position={[0, yOff, 0]}>
              <cylinderGeometry args={[0.092, 0.092, 0.045, 16]} />
              <meshStandardMaterial color="#94a3b8" metalness={0.85} roughness={0.3} />
            </mesh>
          ))}

          {/* Bottom Titanium Release Drop Hook Mechanism */}
          <mesh position={[0, -0.40, 0]} castShadow>
            <torusGeometry args={[0.075, 0.022, 10, 20]} />
            <meshStandardMaterial color="#94a3b8" metalness={0.95} roughness={0.15} />
          </mesh>
          {/* Release Drop Link Ring Holding Ground Chain */}
          <mesh position={[0, -0.49, 0]} rotation={[0, Math.PI / 2, 0]} castShadow>
            <torusGeometry args={[0.065, 0.020, 8, 16]} />
            <meshStandardMaterial color="#cbd5e1" metalness={0.95} roughness={0.15} />
          </mesh>
        </group>

        {/* ── 10. HEAVY GROUND CHAIN LEADING TO BOTTOM WEIGHT (Y = -16.65m to -17.15m) ── */}
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => {
          const y = -16.65 - i * 0.050;
          const isTurned = i % 2 === 1;
          return (
            <group key={`ground-chain-link-${i}`} position={[0, y, 0]}>
              <mesh rotation={[0, isTurned ? Math.PI / 2 : 0, 0]} castShadow>
                <torusGeometry args={[0.052, 0.018, 8, 16]} />
                <meshStandardMaterial
                  color={isSeg2Active ? '#38bdf8' : isSeg2Hovered ? '#67e8f9' : '#475569'}
                  metalness={0.92}
                  roughness={0.28}
                  emissive={isSeg2Active ? '#475569' : '#000000'}
                  emissiveIntensity={isSeg2Active ? 0.4 : 0}
                />
              </mesh>
              {/* Central Cross Stud Bar */}
              <mesh rotation={[Math.PI / 2, isTurned ? 0 : Math.PI / 2, 0]}>
                <cylinderGeometry args={[0.011, 0.011, 0.070, 8]} />
                <meshStandardMaterial color="#334155" metalness={0.92} roughness={0.3} />
              </mesh>
            </group>
          );
        })}

        {/* ── 11. COMPONENT 11: SEGMENTED DEAD WEIGHT BOTTOM WEIGHT (On Seabed at Y = -18.0m) ── */}
        <group position={[0, -18.0, 0]}>
          {/* 6 Heavy Segmented Stacked Circular Plates of Cast Iron / Marine Steel */}
          {[0.07, 0.20, 0.33, 0.46, 0.59, 0.72].map((py, pidx) => (
            <mesh key={`sinker-plate-${pidx}`} position={[0, py, 0]} castShadow receiveShadow>
              <cylinderGeometry args={[0.75, 0.75, 0.115, 36]} />
              <meshStandardMaterial
                color={isSeg2Active ? '#3b4252' : '#2b3340'}
                metalness={0.86}
                roughness={0.58}
                emissive={isSeg2Active ? '#1e293b' : '#000000'}
                emissiveIntensity={isSeg2Active ? 0.3 : 0}
              />
            </mesh>
          ))}

          {/* 3 Heavy Circumferential Clamping Steel Bands Binding Stacked Disks */}
          {[0.20, 0.40, 0.60].map((by, bidx) => (
            <mesh key={`sinker-band-${bidx}`} position={[0, by, 0]} castShadow>
              <cylinderGeometry args={[0.768, 0.768, 0.055, 36]} />
              <meshStandardMaterial color="#1e293b" metalness={0.92} roughness={0.25} />
            </mesh>
          ))}

          {/* Top Heavy Steel Retention Flange Plate */}
          <mesh position={[0, 0.79, 0]} castShadow>
            <cylinderGeometry args={[0.78, 0.78, 0.035, 36]} />
            <meshStandardMaterial color="#334155" metalness={0.92} roughness={0.25} />
          </mesh>

          {/* 4 Radial Top Lifting Pad Eyes around perimeter */}
          {[0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2].map((ang, idx) => (
            <group
              key={`corner-lug-${idx}`}
              position={[Math.sin(ang) * 0.58, 0.82, Math.cos(ang) * 0.58]}
              rotation={[0, -ang, 0]}
            >
              <mesh castShadow>
                <torusGeometry args={[0.075, 0.024, 8, 16]} />
                <meshStandardMaterial color="#334155" metalness={0.92} roughness={0.2} />
              </mesh>
            </group>
          ))}

          {/* Central Heavy Forged Pad Eye (Connecting Ground Chain at Y = seabedY + 0.85 = -17.15m) */}
          <group position={[0, 0.85, 0]}>
            <mesh castShadow>
              <cylinderGeometry args={[0.14, 0.14, 0.12, 16]} />
              <meshStandardMaterial color="#334155" metalness={0.92} roughness={0.25} />
            </mesh>
            {/* Pad Eye Ring */}
            <mesh position={[0, 0.14, 0]} castShadow>
              <torusGeometry args={[0.18, 0.05, 12, 24]} />
              <meshStandardMaterial color="#475569" metalness={0.95} roughness={0.2} />
            </mesh>
            {/* Heavy Safety Bow Shackle with Safety Pin connecting Ground Chain */}
            <mesh position={[0, 0.32, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
              <torusGeometry args={[0.14, 0.04, 12, 24]} />
              <meshStandardMaterial color="#94a3b8" metalness={0.95} roughness={0.2} />
            </mesh>
          </group>
        </group>

        {/* Segment 3 Glowing Indicator at Midpoint */}
        {isSeg2Active && masterCurve && (
          <group position={masterCurve.getPointAt(0.92).toArray()}>
            <mesh>
              <sphereGeometry args={[0.32, 16, 16]} />
              <meshBasicMaterial color="#38bdf8" wireframe transparent opacity={0.6} />
            </mesh>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.36, 0.44, 28]} />
              <meshBasicMaterial color="#22d3ee" side={THREE.DoubleSide} />
            </mesh>
          </group>
        )}
      </group>
    </group>
  );
}
