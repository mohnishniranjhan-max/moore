import { useRef, useEffect, useState, useCallback, lazy, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { Starfield } from '../components/scene/Starfield';
import { MoorSenseEarth } from '../components/scene/MoorSenseEarth';
import { BuoyMarkersLayer } from '../components/scene/buoy/BuoyMarkersLayer';
import { CameraController } from '../components/scene/CameraController';
import { HandControlWidget } from '../components/ui/HandControlWidget';
import { HandCrosshair } from '../components/ui/HandCrosshair';
import { BuoyDetailsPanel } from '../components/ui/BuoyDetailsPanel';
import { useBuoyData } from '../services/buoy/buoyService';
import { useHandGesture } from '../hooks/useHandGesture';
import type { CameraStage, Station, DepthLevel } from '../types/ocean';
import type { BuoyLocation } from '../services/buoy/buoyTypes';
import type { CloudMetadata } from '../services/cloudService';
import { LocalOcean3D, LocalOceanUI } from '../components/localocean/LocalOceanScene';
import { RotateCcw, Hand, Cloud, Compass, CircleDot, Shield } from 'lucide-react';

const WatchCircleLab = lazy(() => import('./WatchCircleLab'));

interface ExplorerProps {
  initialStage?: CameraStage;
}

export default function Explorer({ initialStage = 'space' }: ExplorerProps) {
  // Camera stage state
  const [stage, setStage] = useState<CameraStage>(initialStage);
  const [isReadyToInteract, setIsReadyToInteract] = useState(false);
  const [cloudMeta, setCloudMeta] = useState<CloudMetadata | null>(null);

  // Local Ocean Area Dive Simulation State
  const [isLocalOcean, setIsLocalOcean] = useState(false);
  const [localOceanDepth, setLocalOceanDepth] = useState<DepthLevel>(0);
  const [exploreStation, setExploreStation] = useState<Station | null>(null);

  // Mooring Watch Circle 3D Mode State
  const [isWatchCircleMode, setIsWatchCircleMode] = useState(false);
  const [selectedWatchBuoyId, setSelectedWatchBuoyId] = useState<string>('OMNI-BD10');

  // Maritime Exclusive Economic Zone (EEZ) Overlay Toggle
  const [showEEZ, setShowEEZ] = useState(false);

  // Buoy Data Layer
  const { buoys, selectedBuoy, selectedBuoyId, selectBuoy } = useBuoyData();

  // Hand Gesture Control
  const hand = useHandGesture();
  const handHoverRef = useRef<boolean>(false);

  // Orbit controls ref & camera target ref
  const orbitRef = useRef<OrbitControlsImpl>(null!);
  const cameraTargetRef = useRef(new THREE.Vector3(0, 0, 0));

  // Sun directional light position (identical to Ocean Sentry)
  const sunPosition: [number, number, number] = [12, 5, 8];

  // Helper to convert BuoyLocation to Station for Local Ocean Simulation
  const buoyToStation = useCallback((buoy: BuoyLocation | null): Station => {
    const b = buoy || (buoys.length > 0 ? buoys[0] : {
      id: 'OMNI-BD10',
      name: 'OMNI-BD10',
      type: 'buoy',
      latitude: 16.3617,
      longitude: 87.9903,
      coordinateKind: 'registry',
      metadataSource: 'GEBCO_OMNI_SEED',
    });

    return {
      id: b.id,
      name: b.name || b.id,
      type: 'buoy',
      region: b.latitude > 14 && b.longitude > 80 ? 'BAY OF BENGAL' : 'ARABIAN SEA',
      latitude: b.latitude,
      longitude: b.longitude,
      depth: 2627,
      isOnline: true,
      lastSyncMinutes: 10,
      temperature: 28.5,
      salinity: 34.4,
      waveHeight: 1.45,
      currentSpeed: 0.38,
      seaLevel: 0.12,
      modelTemperature: 28.2,
      modelSalinity: 34.1,
      modelWaveHeight: 1.40,
      modelCurrentSpeed: 0.35,
      modelSeaLevel: 0.10,
      status: 'normal',
    };
  }, [buoys]);

  // Handler to enter Local Ocean Mode
  const handleExploreOcean = useCallback((buoy?: BuoyLocation | null) => {
    const target = buoy || selectedBuoy || (buoys.length > 0 ? buoys[0] : null);
    setExploreStation(buoyToStation(target));
    setLocalOceanDepth(0);
    setIsLocalOcean(true);
  }, [buoyToStation, selectedBuoy, buoys]);

  // Handler to enter Watch Circle 3D Mode
  const handleOpenWatchCircle = useCallback((buoy?: BuoyLocation | null) => {
    const targetId = buoy?.id || selectedBuoy?.id || (buoys.length > 0 ? buoys[0].id : 'OMNI-BD10');
    setSelectedWatchBuoyId(targetId);
    setIsWatchCircleMode(true);
  }, [selectedBuoy, buoys]);

  // Cinematic sequence timing
  useEffect(() => {
    const stages: CameraStage[] = ['space', 'earth', 'indianOcean', 'bayOfBengal', 'exploration'];
    const delays = [1200, 3600, 6800, 10500];
    const timers: ReturnType<typeof setTimeout>[] = [];

    stages.forEach((s, i) => {
      if (i === 0) return;
      const t = setTimeout(() => {
        setStage(s);
        if (s === 'exploration') {
          setIsReadyToInteract(true);
          if (orbitRef.current) {
            orbitRef.current.enabled = true;
          }
        }
      }, delays[i - 1]);
      timers.push(t);
    });

    return () => timers.forEach(clearTimeout);
  }, []);

  const isExploring = stage === 'exploration';

  // Smooth re-center view handler
  const handleRecenter = useCallback(() => {
    if (selectedBuoy) {
      selectBuoy(null);
    }
    if (orbitRef.current) {
      orbitRef.current.target.set(0, 0, 0);
      cameraTargetRef.current.set(0, 0, 0);
      orbitRef.current.update();
    }
  }, [selectedBuoy, selectBuoy]);

  // Hook up hand gesture events for buoy deselection & recenter
  useEffect(() => {
    hand.onCloseEvent(() => {
      if (isWatchCircleMode) {
        setIsWatchCircleMode(false);
      } else if (isLocalOcean) {
        setIsLocalOcean(false);
      } else if (selectedBuoy) {
        selectBuoy(null);
      }
    });
  }, [hand, selectedBuoy, selectBuoy, isLocalOcean, isWatchCircleMode]);

  useEffect(() => {
    hand.onRecenterEvent(() => {
      if (!isLocalOcean && !isWatchCircleMode) handleRecenter();
    });
  }, [hand, handleRecenter, isLocalOcean, isWatchCircleMode]);

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        background: '#000208',
        overflow: 'hidden',
      }}
    >
      {/* ═══ 3D WATCH CIRCLE LAB MODE ═══ */}
      {isWatchCircleMode ? (
        <Suspense fallback={<div style={{ width: '100%', height: '100%', background: '#020617' }} />}>
          <WatchCircleLab
            onExit={() => setIsWatchCircleMode(false)}
            initialBuoyId={selectedWatchBuoyId}
          />
        </Suspense>
      ) : isLocalOcean && exploreStation ? (
        /* ═══ 3D LOCAL OCEAN UNDERWATER DIVE MODE ═══ */
        <div style={{ position: 'absolute', inset: 0, zIndex: 10, background: '#010409' }}>
          <Canvas
            camera={{ position: [0, 2, 8], fov: 46, near: 0.1, far: 400 }}
            gl={{
              antialias: true,
              alpha: false,
              powerPreference: 'high-performance',
              toneMapping: THREE.ACESFilmicToneMapping,
              toneMappingExposure: 1.1,
            }}
            dpr={[1, 2]}
            style={{ width: '100%', height: '100%', background: '#010409' }}
          >
            <LocalOcean3D
              station={exploreStation}
              depth={localOceanDepth}
              layer="observation"
              parameter="temperature"
              handDeltaRef={hand.deltaRot}
              handZoomRef={hand.zoomFactor}
              isHandEnabled={hand.isEnabled}
            />
          </Canvas>

          <LocalOceanUI
            station={exploreStation}
            parameter="temperature"
            depth={localOceanDepth}
            onDepthChange={setLocalOceanDepth}
            onExit={() => setIsLocalOcean(false)}
          />
        </div>
      ) : (
        /* ═══ 3D PLANETARY EARTH GLOBE MODE ═══ */
        <>
          <Canvas
            camera={{ position: [1.2, 2.0, -15.0], fov: 42, near: 0.1, far: 300 }}
            gl={{
              antialias: true,
              alpha: false,
              powerPreference: 'high-performance',
              toneMapping: THREE.ACESFilmicToneMapping,
              toneMappingExposure: 1.05,
            }}
            dpr={[1, 2]}
            style={{ background: '#000208' }}
          >
            {/* Lighting system */}
            <ambientLight intensity={0.08} />
            <directionalLight
              position={sunPosition}
              intensity={1.35}
              color="#fffdfa"
              castShadow={false}
            />
            <pointLight position={[-12, -6, 12]} intensity={0.12} color="#081832" />

            {/* Deep cosmos stars */}
            <Starfield count={3200} />

            {/* MoorSense Earth Base Layer + Operational OMNI Buoy Markers */}
            <MoorSenseEarth
              sunPosition={sunPosition}
              depth={0}
              showWind={true}
              showEEZ={showEEZ}
              onCloudMetadataUpdate={setCloudMeta}
            >
              <BuoyMarkersLayer
                buoys={buoys}
                selectedBuoyId={selectedBuoyId}
                onSelectBuoy={(b) => selectBuoy(b.id)}
                visible={isReadyToInteract || stage === 'bayOfBengal'}
              />
            </MoorSenseEarth>

            {/* Camera Controller */}
            <CameraController
              stage={stage}
              targetStation={selectedBuoy ? { latitude: selectedBuoy.latitude, longitude: selectedBuoy.longitude } : null}
              isExploring={isExploring}
              handDelta={hand.deltaRot}
              handZoom={hand.zoomFactor}
              currentTargetRef={cameraTargetRef}
              orbitControlsRef={orbitRef}
            />

            {/* OrbitControls */}
            <OrbitControls
              ref={orbitRef}
              enabled={isExploring && !selectedBuoy}
              enablePan={false}
              minDistance={2.8}
              maxDistance={14.0}
              rotateSpeed={0.4}
              zoomSpeed={0.6}
              enableDamping
              dampingFactor={0.06}
              makeDefault={false}
            />
          </Canvas>

          {/* Cinematic Vignette Overlay */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              background: 'radial-gradient(circle at center, transparent 40%, rgba(1, 4, 9, 0.75) 100%)',
              zIndex: 1,
            }}
          />

          {/* ═══ TOP HUD HEADER ═══ */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '60px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 24px',
              zIndex: 25,
              pointerEvents: 'none',
              background: 'linear-gradient(180deg, rgba(2, 6, 23, 0.8) 0%, transparent 100%)',
              borderBottom: '1px solid rgba(34, 211, 238, 0.1)',
            }}
          >
            {/* Brand Monogram & Title */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', pointerEvents: 'auto' }}>
              <div
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  background: '#22d3ee',
                  boxShadow: '0 0 10px #22d3ee',
                }}
              />
              <div>
                <div
                  style={{
                    fontSize: '15px',
                    fontWeight: 600,
                    letterSpacing: '0.24em',
                    color: '#ffffff',
                    fontFamily: "'Space Grotesk', system-ui, sans-serif",
                    lineHeight: 1.1,
                  }}
                >
                  MOORSENSE
                </div>
                <div
                  style={{
                    fontSize: '8px',
                    letterSpacing: '0.18em',
                    color: 'rgba(34, 211, 238, 0.85)',
                    fontFamily: 'monospace',
                    marginTop: '2px',
                  }}
                >
                  MOORING INTEGRITY DIGITAL TWIN SYSTEM
                </div>
              </div>
            </div>

            {/* Controls Bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', pointerEvents: 'auto' }}>
              {/* NOAA Clouds Status Indicator */}
              <div
                className="sci-panel"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '5px 11px',
                  borderRadius: '4px',
                  border: '1px solid rgba(14, 165, 233, 0.25)',
                  fontSize: '8.5px',
                  letterSpacing: '0.12em',
                  fontFamily: 'monospace',
                  color: '#38bdf8',
                }}
                title={
                  cloudMeta
                    ? `NOAA SOS Composite: ${cloudMeta.frame_id}`
                    : 'NOAA Science On a Sphere: Real-time satellite clouds'
                }
              >
                <Cloud size={11} color="#38bdf8" />
                <span>NOAA CLOUDS:</span>
                <span style={{ color: '#ffffff', fontWeight: 700 }}>
                  {cloudMeta?.status === 'LIVE' ? '● LIVE (10 MIN)' : '● ACTIVE'}
                </span>
              </div>

              {/* OMNI Network Counter */}
              <div
                className="sci-panel"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '5px 12px',
                  borderRadius: '4px',
                  border: '1px solid rgba(34, 211, 238, 0.2)',
                  fontSize: '8.5px',
                  letterSpacing: '0.14em',
                  fontFamily: 'monospace',
                  color: '#38bdf8',
                }}
              >
                <span
                  style={{
                    display: 'inline-block',
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: '#10b981',
                    boxShadow: '0 0 8px #10b981',
                  }}
                />
                <span>OMNI BUOY NETWORK:</span>
                <span style={{ color: '#ffffff', fontWeight: 700 }}>{buoys.length} STATIONS</span>
              </div>

              {/* 🛡️ MARITIME EXCLUSIVE ECONOMIC ZONE (EEZ) TOGGLE */}
              <button
                onClick={() => setShowEEZ((prev) => !prev)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: showEEZ ? 'rgba(239, 68, 68, 0.25)' : 'rgba(15, 23, 42, 0.75)',
                  border: `1px solid ${showEEZ ? '#ef4444' : 'rgba(239, 68, 68, 0.35)'}`,
                  borderRadius: '4px',
                  padding: '5px 12px',
                  color: showEEZ ? '#fca5a5' : '#94a3b8',
                  fontSize: '8.5px',
                  fontWeight: 600,
                  letterSpacing: '0.14em',
                  fontFamily: 'monospace',
                  cursor: 'pointer',
                  boxShadow: showEEZ ? '0 0 14px rgba(239, 68, 68, 0.35)' : 'none',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  if (!showEEZ) {
                    (e.currentTarget as HTMLElement).style.background = 'rgba(239, 68, 68, 0.15)';
                    (e.currentTarget as HTMLElement).style.borderColor = '#ef4444';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!showEEZ) {
                    (e.currentTarget as HTMLElement).style.background = 'rgba(15, 23, 42, 0.75)';
                    (e.currentTarget as HTMLElement).style.borderColor = 'rgba(239, 68, 68, 0.35)';
                  }
                }}
                title="Toggle maritime Exclusive Economic Zone (EEZ) boundaries on the ocean globe map"
              >
                <Shield size={11} color={showEEZ ? '#ef4444' : '#94a3b8'} />
                <span>ECONOMIC ZONE</span>
                <span style={{ fontWeight: 700, color: showEEZ ? '#ffffff' : '#64748b' }}>
                  {showEEZ ? '[ ON ]' : '[ OFF ]'}
                </span>
              </button>

              {/* ⭕ WATCH CIRCLE 3D QUICK ACTION BUTTON */}
              <button
                onClick={() => handleOpenWatchCircle(selectedBuoy)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'linear-gradient(135deg, rgba(34, 211, 238, 0.3) 0%, rgba(14, 116, 144, 0.6) 100%)',
                  border: '1px solid rgba(34, 211, 238, 0.65)',
                  borderRadius: '4px',
                  padding: '5px 12px',
                  color: '#ffffff',
                  fontSize: '8.5px',
                  fontWeight: 700,
                  letterSpacing: '0.14em',
                  fontFamily: 'monospace',
                  cursor: 'pointer',
                  boxShadow: '0 0 16px rgba(34, 211, 238, 0.35)',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = 'linear-gradient(135deg, rgba(34, 211, 238, 0.5) 0%, rgba(14, 116, 144, 0.8) 100%)';
                  (e.currentTarget as HTMLElement).style.borderColor = '#22d3ee';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = 'linear-gradient(135deg, rgba(34, 211, 238, 0.3) 0%, rgba(14, 116, 144, 0.6) 100%)';
                  (e.currentTarget as HTMLElement).style.borderColor = 'rgba(34, 211, 238, 0.65)';
                }}
                title="Launch 3D Mooring Watch Circle & Excursion Simulation"
              >
                <CircleDot size={11} color="#22d3ee" />
                <span>WATCH CIRCLE 3D</span>
              </button>

              {/* 🌊 EXPLORE OCEAN AREA QUICK BUTTON */}
              <button
                onClick={() => handleExploreOcean(selectedBuoy)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'rgba(15, 23, 42, 0.75)',
                  border: '1px solid rgba(34, 211, 238, 0.35)',
                  borderRadius: '4px',
                  padding: '5px 11px',
                  color: '#38bdf8',
                  fontSize: '8.5px',
                  fontWeight: 600,
                  letterSpacing: '0.14em',
                  fontFamily: 'monospace',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = 'rgba(34, 211, 238, 0.15)';
                  (e.currentTarget as HTMLElement).style.borderColor = '#22d3ee';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = 'rgba(15, 23, 42, 0.75)';
                  (e.currentTarget as HTMLElement).style.borderColor = 'rgba(34, 211, 238, 0.35)';
                }}
                title="Dive into local 3D ocean ecosystem with Gerstner waves & marine fauna"
              >
                <Compass size={11} color="#38bdf8" />
                <span>EXPLORE OCEAN</span>
              </button>

              {/* Hand Control Status Badge */}
              <div
                className="sci-panel"
                onClick={hand.toggleEnabled}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '5px 10px',
                  borderRadius: '4px',
                  border: `1px solid ${hand.isEnabled ? 'rgba(34, 197, 94, 0.4)' : 'rgba(100, 116, 139, 0.3)'}`,
                  fontSize: '8.5px',
                  letterSpacing: '0.12em',
                  fontFamily: 'monospace',
                  color: hand.isEnabled ? '#22c55e' : '#94a3b8',
                  cursor: 'pointer',
                  userSelect: 'none',
                  transition: 'all 0.2s ease',
                }}
                title="Click to toggle webcam hand gesture tracking"
              >
                <Hand size={11} color={hand.isEnabled ? '#22c55e' : '#64748b'} />
                <span>GESTURE:</span>
                <span style={{ fontWeight: 700 }}>
                  {hand.isEnabled ? '● ACTIVE' : '○ OFFLINE'}
                </span>
              </div>

              {isExploring && (
                <button
                  onClick={handleRecenter}
                  title="Reset View"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: 'rgba(15, 23, 42, 0.75)',
                    border: '1px solid rgba(34, 211, 238, 0.25)',
                    borderRadius: '4px',
                    padding: '6px 10px',
                    color: 'rgba(34, 211, 238, 0.9)',
                    fontSize: '8.5px',
                    letterSpacing: '0.14em',
                    fontFamily: 'monospace',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = 'rgba(34, 211, 238, 0.15)';
                    (e.currentTarget as HTMLElement).style.borderColor = 'rgba(34, 211, 238, 0.6)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = 'rgba(15, 23, 42, 0.75)';
                    (e.currentTarget as HTMLElement).style.borderColor = 'rgba(34, 211, 238, 0.25)';
                  }}
                >
                  <RotateCcw size={11} />
                  <span>RECENTER</span>
                </button>
              )}
            </div>
          </div>

          <BuoyDetailsPanel
            buoy={selectedBuoy}
            onClose={() => selectBuoy(null)}
            onExploreOcean={handleExploreOcean}
            onOpenWatchCircle={handleOpenWatchCircle}
          />

          {/* Hand Gesture Control Widget */}
          {isReadyToInteract && (
            <HandControlWidget
              isEnabled={hand.isEnabled}
              onToggle={hand.toggleEnabled}
              status={hand.status}
              gesture={hand.gesture}
              confidence={hand.confidence}
              videoRef={hand.videoRef}
              canvasRef={hand.canvasRef}
            />
          )}

          {/* Hand Gesture Spatial Aiming Crosshair */}
          <HandCrosshair
            isEnabled={hand.isEnabled}
            pointerRef={hand.pointerRef}
            hoverRef={handHoverRef}
          />

          {/* Camera Stage Status Indicator */}
          {stage !== 'exploration' && (
            <div
              style={{
                position: 'absolute',
                bottom: '48px',
                left: '50%',
                transform: 'translateX(-50%)',
                fontSize: '9px',
                letterSpacing: '0.24em',
                color: 'rgba(34, 211, 238, 0.8)',
                fontFamily: 'monospace',
                zIndex: 20,
                pointerEvents: 'none',
                background: 'rgba(2, 8, 22, 0.75)',
                padding: '6px 18px',
                borderRadius: '4px',
                border: '1px solid rgba(34, 211, 238, 0.25)',
                backdropFilter: 'blur(8px)',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
              }}
            >
              {stage === 'space' && '● ORBITAL SATELLITE VIEW'}
              {stage === 'earth' && '● APPROACHING PLANET EARTH'}
              {stage === 'indianOcean' && '● LOCKING TARGET: INDIAN OCEAN BASIN'}
              {stage === 'bayOfBengal' && '● FOCUSING OBSERVATION GRID: BAY OF BENGAL'}
            </div>
          )}

          {/* Exploration Mode Hint */}
          {isReadyToInteract && !selectedBuoy && (
            <div
              style={{
                position: 'absolute',
                bottom: '24px',
                left: '50%',
                transform: 'translateX(-50%)',
                fontSize: '8.5px',
                letterSpacing: '0.18em',
                color: 'rgba(148, 163, 184, 0.65)',
                fontFamily: 'monospace',
                zIndex: 20,
                pointerEvents: 'none',
                background: 'rgba(2, 8, 22, 0.6)',
                padding: '4px 14px',
                borderRadius: '3px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
              }}
            >
              SELECT BUOY &nbsp;·&nbsp; CLICK 'WATCH CIRCLE 3D' &nbsp;·&nbsp; DRAG TO ORBIT GLOBE
            </div>
          )}
        </>
      )}
    </div>
  );
}
