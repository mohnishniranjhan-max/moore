import { useState, useMemo, useEffect } from 'react';
import { WatchCircleScene } from '../components/watchcircle/WatchCircleScene';
import { WatchCircleHUD } from '../components/watchcircle/WatchCircleHUD';
import {
  calculateMooringPhysics,
  PRESET_SCENARIOS,
  type EnvironmentalConditions,
  type MooringConfig,
  type GPSTrailPoint,
  type WatchCircleDepthLevel,
} from '../components/watchcircle/watchCircleTypes';

interface WatchCircleLabProps {
  onExit?: () => void;
  initialBuoyId?: string;
}

export default function WatchCircleLab({ onExit, initialBuoyId = 'OMNI-AD06' }: WatchCircleLabProps) {
  // Environmental Conditions (default: Monsoon Gale)
  const [env, setEnv] = useState<EnvironmentalConditions>({
    ...PRESET_SCENARIOS.monsoon.env,
  });

  // Mooring Configuration - NIOT OMNI-AD06 (Arabian Sea Deep-Sea Mooring)
  const [config, setConfig] = useState<MooringConfig>({
    buoyId: initialBuoyId,
    waterDepth: 3338, // GEBCO Bathymetry depth for AD06
    watchCircleRadius: 750, // 750m watch radius (scope = 1.22)
    nominalLatitude: 18.4950,
    nominalLongitude: 67.4500,
    scope: 1.22,
    mbl_kN: 245, // 245 kN reference MBL for 8-strand compliant nylon tether
  });

  // Exploration Depth Level (0 = Surface, 10, 50, 100, 500, 1000, 2500 = Seabed)
  const [currentDepth, setCurrentDepth] = useState<WatchCircleDepthLevel>(0);

  // Selected Mooring Line Segment (0 = Upper Rope, 1 = Compliant Nylon, 2 = Anchor Chain)
  const [selectedSegmentIndex, setSelectedSegmentIndex] = useState<number | null>(null);

  // Visualization Toggles
  const [showBoundary, setShowBoundary] = useState(true);
  const [showTrail, setShowTrail] = useState(true);
  const [showExcursionVector, setShowExcursionVector] = useState(true);
  const [showUnderwater, setShowUnderwater] = useState(true);
  const [isPaused, setIsPaused] = useState(false);

  // Camera preset command
  const [cameraPreset, setCameraPreset] = useState<'top' | 'surface' | 'profile' | 'anchor' | null>(null);

  // GPS Trajectory Breadcrumb Trail
  const [gpsTrail, setGpsTrail] = useState<GPSTrailPoint[]>([]);

  // Physics Model outputs — memoized against environmental inputs to avoid React re-render thrashing
  const physicsData = useMemo(() => {
    return calculateMooringPhysics(env, config, 0);
  }, [env, config]);

  // Gentle breadcrumb recording when excursion shifts or over time
  useEffect(() => {
    if (isPaused) return;

    setGpsTrail((prev) => {
      const nextPoint = {
        x: physicsData.buoyState.excursionX,
        z: physicsData.buoyState.excursionZ,
        time: Date.now() / 1000,
        breach: physicsData.buoyState.status === 'BREACH',
      };
      const next = [...prev, nextPoint];
      return next.slice(-100);
    });
  }, [physicsData, isPaused]);

  // Handle camera viewpoint preset selection
  const handleSetCameraPreset = (preset: 'top' | 'surface' | 'profile' | 'anchor') => {
    setCameraPreset(preset);
    if (preset === 'surface' || preset === 'top') {
      setCurrentDepth(0);
    } else if (preset === 'anchor') {
      setCurrentDepth(2500);
    } else if (preset === 'profile') {
      setCurrentDepth(500);
    }
  };

  const handleResetCamera = () => {
    setCameraPreset('surface');
    setCurrentDepth(0);
    setSelectedSegmentIndex(null);
  };

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', background: '#020617', overflow: 'hidden' }}>
      {/* ── 3D Scene Canvas ── */}
      <WatchCircleScene
        env={env}
        config={config}
        buoyState={physicsData.buoyState}
        catenaryPoints={physicsData.catenaryPoints}
        segments={physicsData.segments}
        selectedSegmentIndex={selectedSegmentIndex}
        onSelectSegment={setSelectedSegmentIndex}
        gpsTrail={gpsTrail}
        showBoundary={showBoundary}
        showTrail={showTrail}
        showExcursionVector={showExcursionVector}
        showUnderwater={showUnderwater}
        cameraPreset={cameraPreset}
        onCameraPresetHandled={() => setCameraPreset(null)}
        currentDepth={currentDepth}
        onDepthChange={setCurrentDepth}
      />

      {/* ── 2D Interactive Scientific HUD Dashboard ── */}
      <WatchCircleHUD
        env={env}
        setEnv={setEnv}
        config={config}
        setConfig={setConfig}
        buoyState={physicsData.buoyState}
        segments={physicsData.segments}
        selectedSegmentIndex={selectedSegmentIndex}
        onSelectSegment={setSelectedSegmentIndex}
        currentDepth={currentDepth}
        onDepthChange={setCurrentDepth}
        showBoundary={showBoundary}
        setShowBoundary={setShowBoundary}
        showTrail={showTrail}
        setShowTrail={setShowTrail}
        showExcursionVector={showExcursionVector}
        setShowExcursionVector={setShowExcursionVector}
        showUnderwater={showUnderwater}
        setShowUnderwater={setShowUnderwater}
        isPaused={isPaused}
        setIsPaused={setIsPaused}
        onClearTrail={() => setGpsTrail([])}
        onResetCamera={handleResetCamera}
        onSetCameraPreset={handleSetCameraPreset}
        onExit={onExit}
      />
    </div>
  );
}
