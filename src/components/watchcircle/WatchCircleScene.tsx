import { useRef, useEffect, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { OceanSurface } from './OceanSurface';
import { OceanSkyDome } from './OceanSkyDome';
import { SeabedEnvironment } from './SeabedEnvironment';
import { MooringBuoy3D } from './MooringBuoy3D';
import { MooringLine3D } from './MooringLine3D';
import { WatchCircleOverlay } from './WatchCircleOverlay';
import { UnderwaterEnvironment } from '../localocean/UnderwaterEnvironment';
import { DynamicLighting } from '../localocean/LocalOceanScene';
import type {
  EnvironmentalConditions,
  MooringConfig,
  BuoyState,
  GPSTrailPoint,
  WatchCircleDepthLevel,
  MooringSegmentData,
} from './watchCircleTypes';

interface WatchCircleSceneProps {
  env: EnvironmentalConditions;
  config: MooringConfig;
  buoyState: BuoyState;
  catenaryPoints: THREE.Vector3[];
  segments?: MooringSegmentData[];
  selectedSegmentIndex?: number | null;
  onSelectSegment?: (index: number | null) => void;
  gpsTrail: GPSTrailPoint[];
  showBoundary: boolean;
  showTrail: boolean;
  showExcursionVector: boolean;
  showUnderwater: boolean;
  cameraPreset: 'top' | 'surface' | 'profile' | 'anchor' | null;
  onCameraPresetHandled: () => void;
  currentDepth: WatchCircleDepthLevel;
  onDepthChange?: (depth: WatchCircleDepthLevel) => void;
}

// ── Target camera positions and lookAt targets for each depth level ──
const DEPTH_CAMERA_TARGETS: Record<
  WatchCircleDepthLevel,
  { eye: [number, number, number]; target: [number, number, number] }
> = {
  0: {
    eye: [6, 3.5, 12],
    target: [0, 0.5, 0], // Surface discus buoy and watch circle
  },
  10: {
    eye: [3.5, -0.8, 6],
    target: [0, -1.2, 0], // Upper synthetic rope & fairlead
  },
  50: {
    eye: [4.5, -3.0, 7],
    target: [0, -3.5, 0], // Compliant nylon line & subsurface buoyancy floats
  },
  100: {
    eye: [5.5, -6.0, 8],
    target: [0, -6.5, 0], // Mesopelagic twilight zone
  },
  500: {
    eye: [6.5, -10.5, 9],
    target: [0, -11.0, 0], // Bathypelagic midnight zone & catenary belly
  },
  1000: {
    eye: [6.5, -14.0, 8.5],
    target: [0, -14.5, 0], // Abyssal deep ocean zone
  },
  2500: {
    eye: [5, -16.0, 7],
    target: [0, -17.5, 0], // Seabed ground anchor chain & sinker assembly
  },
};

function WatchCircleCameraManager({
  preset,
  onPresetHandled,
  currentDepth,
  orbitRef,
}: {
  preset: 'top' | 'surface' | 'profile' | 'anchor' | null;
  onPresetHandled: () => void;
  currentDepth: WatchCircleDepthLevel;
  orbitRef: React.RefObject<OrbitControlsImpl>;
}) {
  const targetEye = useRef(new THREE.Vector3(6, 3.5, 12));
  const targetLook = useRef(new THREE.Vector3(0, 0.5, 0));
  const isTransitioning = useRef(false);

  // Depth change triggers smooth camera translation
  useEffect(() => {
    const config = DEPTH_CAMERA_TARGETS[currentDepth] || DEPTH_CAMERA_TARGETS[0];
    targetEye.current.set(...config.eye);
    targetLook.current.set(...config.target);
    isTransitioning.current = true;
  }, [currentDepth]);

  // Preset viewpoint override
  useEffect(() => {
    if (!preset || !orbitRef.current) return;

    if (preset === 'top') {
      targetEye.current.set(0, 32, 0.01);
      targetLook.current.set(0, 0, 0);
    } else if (preset === 'surface') {
      targetEye.current.set(4, 3.5, 10);
      targetLook.current.set(0, 0.5, 0);
    } else if (preset === 'profile') {
      targetEye.current.set(38, -8, 24);
      targetLook.current.set(0, -9, 0);
    } else if (preset === 'anchor') {
      targetEye.current.set(6, -15, 8);
      targetLook.current.set(0, -17.5, 0);
    }

    isTransitioning.current = true;
    onPresetHandled();
  }, [preset, onPresetHandled, orbitRef]);

  useFrame(() => {
    if (!isTransitioning.current || !orbitRef.current) return;

    const controls = orbitRef.current;
    const camera = controls.object as THREE.PerspectiveCamera;

    camera.position.lerp(targetEye.current, 0.07);
    controls.target.lerp(targetLook.current, 0.07);
    controls.update();

    if (
      camera.position.distanceTo(targetEye.current) < 0.08 &&
      controls.target.distanceTo(targetLook.current) < 0.08
    ) {
      isTransitioning.current = false;
    }
  });

  return null;
}

export function WatchCircleScene({
  env,
  config,
  buoyState,
  catenaryPoints,
  segments,
  selectedSegmentIndex = null,
  onSelectSegment,
  gpsTrail,
  showBoundary,
  showTrail,
  showExcursionVector,
  showUnderwater,
  cameraPreset,
  onCameraPresetHandled,
  currentDepth,
}: WatchCircleSceneProps) {
  const orbitRef = useRef<OrbitControlsImpl>(null!);

  return (
    <Canvas
      camera={{ position: [6, 3.5, 12], fov: 42, near: 0.1, far: 3000 }}
      gl={{
        antialias: false,
        alpha: false,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.15,
      }}
      dpr={1}
      style={{ width: '100%', height: '100%', background: '#020817' }}
    >
      {/* ── Seamless 360° Infinite Ocean Sky Dome & Atmospheric Horizon ── */}
      <OceanSkyDome sunDirection={[100, 32, -80]} />

      {/* ── Dynamic Lighting System (Fades with depth scaled by maxDepthY=18) ── */}
      <DynamicLighting maxDepthY={18} />

      {/* ── 3D Scene Objects with Suspense for Assets ── */}
      <Suspense fallback={null}>
        <group>
        {/* Ocean Wave Surface */}
        <OceanSurface
          waveHeight={env.waveHeight}
          wavePeriod={env.wavePeriod}
          showUnderwater={showUnderwater}
        />

        {/* ── Depth-Based Underwater Atmosphere & Floating Plankton Particles ── */}
        <UnderwaterEnvironment
          depth={currentDepth === 2500 ? 1000 : currentDepth}
          visible={showUnderwater}
          maxDepthY={18}
        />

        {/* ── Watch Circle Overlay & GPS Track ── */}
        <WatchCircleOverlay
          radiusMeters={config.watchCircleRadius}
          buoyState={buoyState}
          gpsTrail={gpsTrail}
          showBoundary={showBoundary}
          showTrail={showTrail}
          showExcursionVector={showExcursionVector}
        />

        {/* ── 3D Mooring Buoy with wave heave, pitch & roll ── */}
        <MooringBuoy3D
          buoyState={buoyState}
          buoyId={config.buoyId}
          waveHeight={env.waveHeight}
          wavePeriod={env.wavePeriod}
        />

        {/* ── 3D Multi-Segment Mooring Line with Interactive Inspection ── */}
        <MooringLine3D
          catenaryPoints={catenaryPoints}
          buoyState={buoyState}
          segments={segments}
          selectedSegmentIndex={selectedSegmentIndex}
          onSelectSegment={onSelectSegment}
        />

        {/* ── Seabed Bathymetry, Cast Anchor Sinker & Depth Scale Ruler ── */}
        <SeabedEnvironment waterDepth={config.waterDepth} seabedY={-18} />
      </group>
    </Suspense>

      {/* ── Surface-to-Seabed Camera Transition Manager ── */}
      <WatchCircleCameraManager
        preset={cameraPreset}
        onPresetHandled={onCameraPresetHandled}
        currentDepth={currentDepth}
        orbitRef={orbitRef}
      />

      {/* ── OrbitControls for 360° Orbit, Pan, and Zoom at Any Depth ── */}
      <OrbitControls
        ref={orbitRef}
        enablePan={true}
        enableZoom={true}
        enableRotate={true}
        minDistance={2.5}
        maxDistance={350.0}
        maxPolarAngle={Math.PI / 2 + 0.4}
        dampingFactor={0.06}
        enableDamping
      />
    </Canvas>
  );
}
