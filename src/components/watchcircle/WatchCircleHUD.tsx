import React, { useState } from 'react';
import {
  Compass,
  Wind,
  Waves,
  Eye,
  Sliders,
  Play,
  Pause,
  RotateCcw,
  AlertTriangle,
  CheckCircle,
  Activity,
  Layers,
  HelpCircle,
  Anchor,
  ArrowDownCircle,
  Crosshair,
  X,
} from 'lucide-react';
import type {
  EnvironmentalConditions,
  MooringConfig,
  BuoyState,
  WatchCircleDepthLevel,
  MooringSegmentData,
} from './watchCircleTypes';
import { PRESET_SCENARIOS } from './watchCircleTypes';

interface WatchCircleHUDProps {
  env: EnvironmentalConditions;
  setEnv: React.Dispatch<React.SetStateAction<EnvironmentalConditions>>;
  config: MooringConfig;
  setConfig: React.Dispatch<React.SetStateAction<MooringConfig>>;
  buoyState: BuoyState;
  segments?: MooringSegmentData[];
  selectedSegmentIndex?: number | null;
  onSelectSegment?: (index: number | null) => void;
  currentDepth: WatchCircleDepthLevel;
  onDepthChange: (depth: WatchCircleDepthLevel) => void;
  showBoundary: boolean;
  setShowBoundary: (v: boolean) => void;
  showTrail: boolean;
  setShowTrail: (v: boolean) => void;
  showExcursionVector: boolean;
  setShowExcursionVector: (v: boolean) => void;
  showUnderwater: boolean;
  setShowUnderwater: (v: boolean) => void;
  isPaused: boolean;
  setIsPaused: (v: boolean) => void;
  onClearTrail: () => void;
  onResetCamera: () => void;
  onSetCameraPreset: (preset: 'top' | 'surface' | 'profile' | 'anchor') => void;
  onExit?: () => void;
}

const DEPTHS: WatchCircleDepthLevel[] = [0, 10, 50, 100, 500, 1000, 2500];

const DEPTH_LABELS: Record<WatchCircleDepthLevel, string> = {
  0: 'SURFACE',
  10: '10 M',
  50: '50 M',
  100: '100 M',
  500: '500 M',
  1000: '1000 M',
  2500: 'SEABED',
};

const DEPTH_DESCRIPTIONS: Record<WatchCircleDepthLevel, { zone: string; desc: string }> = {
  0: {
    zone: 'EPILPELAGIC / SURFACE',
    desc: 'Solar penetration, wind waves, surface buoy & 3D watch circle boundary',
  },
  10: {
    zone: 'PHOTIC SHALLOWS (10m)',
    desc: 'Upper synthetic rope segment, dolphins, coral caustics',
  },
  50: {
    zone: 'THERMOCLINE TRANSITION (50m)',
    desc: 'Compliant nylon line, subsurface buoyancy floats, manta rays',
  },
  100: {
    zone: 'MESOPELAGIC / TWILIGHT (100m)',
    desc: 'Apex sharks, diminishing sunlight, mid-water compliant catenary',
  },
  500: {
    zone: 'BATHYPELAGIC / MIDNIGHT (500m)',
    desc: 'Bioluminescent jellyfish, giant squids, catenary curvature belly',
  },
  1000: {
    zone: 'ABYSSAL TRANSITION (1000m)',
    desc: 'Extreme hydrostatic pressure, abyssal leviathans, deep line catenary',
  },
  2500: {
    zone: 'HADOPELAGIC / SEABED (2500m)',
    desc: 'Cast steel ground chain, anchor sinker weight, acoustic release transponder',
  },
};

export function WatchCircleHUD({
  env,
  setEnv,
  config,
  setConfig,
  buoyState,
  segments = [],
  selectedSegmentIndex = null,
  onSelectSegment,
  currentDepth,
  onDepthChange,
  showBoundary,
  setShowBoundary,
  showTrail,
  setShowTrail,
  showExcursionVector,
  setShowExcursionVector,
  showUnderwater,
  setShowUnderwater,
  isPaused,
  setIsPaused,
  onClearTrail,
  onResetCamera,
  onSetCameraPreset,
  onExit,
}: WatchCircleHUDProps) {
  const [controlsTab, setControlsTab] = useState<'presets' | 'custom'>('presets');
  const [activeScenario, setActiveScenario] = useState<string>('monsoon');
  const [rightPanelTab, setRightPanelTab] = useState<'status' | 'segments'>('status');

  // Handle preset scenario switch
  const handleSelectScenario = (key: string) => {
    setActiveScenario(key);
    if (PRESET_SCENARIOS[key]) {
      setEnv({ ...PRESET_SCENARIOS[key].env });
    }
  };

  const statusBg =
    buoyState.status === 'BREACH'
      ? 'rgba(239, 68, 68, 0.2)'
      : buoyState.status === 'WARNING'
      ? 'rgba(245, 158, 11, 0.2)'
      : 'rgba(34, 211, 238, 0.15)';

  const statusBorder =
    buoyState.status === 'BREACH'
      ? '#ef4444'
      : buoyState.status === 'WARNING'
      ? '#f59e0b'
      : '#22d3ee';

  const statusText =
    buoyState.status === 'BREACH'
      ? 'BREACH · WATCH CIRCLE EXCURSION'
      : buoyState.status === 'WARNING'
      ? 'WARNING · APPROACHING BOUNDARY'
      : 'NORMAL · INSIDE WATCH CIRCLE';

  const currentDepthInfo = DEPTH_DESCRIPTIONS[currentDepth] || DEPTH_DESCRIPTIONS[0];
  const selectedSegment =
    selectedSegmentIndex !== null && segments[selectedSegmentIndex]
      ? segments[selectedSegmentIndex]
      : null;

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 30 }}>
      {/* ── TOP HEADER BAR ── */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '62px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
          background: 'linear-gradient(180deg, rgba(2, 6, 23, 0.92) 0%, transparent 100%)',
          borderBottom: '1px solid rgba(34, 211, 238, 0.18)',
        }}
      >
        {/* Project Branding */}
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
                fontSize: '14.5px',
                fontWeight: 700,
                letterSpacing: '0.22em',
                color: '#ffffff',
                fontFamily: "'Space Grotesk', system-ui, sans-serif",
                lineHeight: 1.1,
              }}
            >
              MOORSENSE · 3D DIVE & WATCH CIRCLE
            </div>
            <div
              style={{
                fontSize: '8.5px',
                letterSpacing: '0.14em',
                color: 'rgba(34, 211, 238, 0.9)',
                fontFamily: 'monospace',
                marginTop: '2px',
              }}
            >
              SURFACE-TO-SEABED EXPLORATION · INVERSE CATENARY & HORIZONTAL BOUNDARY
            </div>
          </div>
        </div>

        {/* Center: Current Depth Zone Indicator Banner */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '2px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'rgba(6, 182, 212, 0.14)',
              border: '1px solid rgba(34, 211, 238, 0.35)',
              borderRadius: '4px',
              padding: '4px 14px',
              backdropFilter: 'blur(8px)',
            }}
          >
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: '#22d3ee',
                boxShadow: '0 0 8px #22d3ee',
              }}
            />
            <span
              style={{
                fontSize: '9.5px',
                fontWeight: 700,
                letterSpacing: '0.18em',
                color: '#22d3ee',
                fontFamily: 'monospace',
              }}
            >
              {currentDepthInfo.zone}
            </span>
          </div>
          <span
            style={{
              fontSize: '8px',
              letterSpacing: '0.1em',
              color: 'rgba(148, 163, 184, 0.85)',
              fontFamily: 'monospace',
            }}
          >
            {currentDepthInfo.desc}
          </span>
        </div>

        {/* Camera Viewpoint Presets Bar & Return */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', pointerEvents: 'auto' }}>
          <span style={{ fontSize: '8.5px', color: '#94a3b8', fontFamily: 'monospace', marginRight: '2px' }}>
            VIEW:
          </span>
          <button
            onClick={() => onSetCameraPreset('surface')}
            style={btnStyle}
            title="Perspective view at surface buoy"
          >
            SURFACE
          </button>
          <button
            onClick={() => onSetCameraPreset('top')}
            style={btnStyle}
            title="Top-down bird's-eye orthogonal view"
          >
            TOP-DOWN
          </button>
          <button
            onClick={() => onSetCameraPreset('profile')}
            style={btnStyle}
            title="Full water column side profile view"
          >
            PROFILE
          </button>
          <button
            onClick={() => onSetCameraPreset('anchor')}
            style={btnStyle}
            title="Seabed anchor and clump sinker view"
          >
            ANCHOR
          </button>
          <button
            onClick={onResetCamera}
            style={{ ...btnStyle, borderColor: 'rgba(255,255,255,0.2)' }}
            title="Reset camera orientation"
          >
            <RotateCcw size={11} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
            RESET
          </button>
          {onExit && (
            <button
              onClick={onExit}
              style={{
                ...btnStyle,
                background: 'rgba(239, 68, 68, 0.15)',
                borderColor: '#ef4444',
                color: '#fca5a5',
              }}
            >
              ← RETURN
            </button>
          )}
        </div>
      </div>

      {/* ── LEFT FLOATING DOCK: ENVIRONMENTAL SIMULATION CONTROLS ── */}
      <div
        style={{
          position: 'absolute',
          top: '76px',
          left: '24px',
          width: '320px',
          maxHeight: 'calc(100vh - 160px)',
          background: 'rgba(2, 8, 23, 0.88)',
          border: '1px solid rgba(34, 211, 238, 0.25)',
          borderRadius: '8px',
          padding: '14px',
          backdropFilter: 'blur(16px)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.7)',
          pointerEvents: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          overflowY: 'auto',
        }}
      >
        {/* Controls Header & Tabs */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Sliders size={13} color="#22d3ee" />
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.14em',
                color: '#ffffff',
                fontFamily: 'monospace',
              }}
            >
              SIMULATION CONTROLS
            </span>
          </div>

          {/* Presets vs Custom Tabs */}
          <div style={{ display: 'flex', background: 'rgba(15, 23, 42, 0.8)', borderRadius: '4px', padding: '2px' }}>
            <button
              onClick={() => setControlsTab('presets')}
              style={{
                ...tabBtnStyle,
                background: controlsTab === 'presets' ? 'rgba(34, 211, 238, 0.2)' : 'transparent',
                color: controlsTab === 'presets' ? '#22d3ee' : '#94a3b8',
              }}
            >
              PRESETS
            </button>
            <button
              onClick={() => setControlsTab('custom')}
              style={{
                ...tabBtnStyle,
                background: controlsTab === 'custom' ? 'rgba(34, 211, 238, 0.2)' : 'transparent',
                color: controlsTab === 'custom' ? '#22d3ee' : '#94a3b8',
              }}
            >
              CUSTOM
            </button>
          </div>
        </div>

        {/* Tab 1: Presets Scenarios */}
        {controlsTab === 'presets' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {Object.entries(PRESET_SCENARIOS).map(([key, item]) => {
              const isSelected = activeScenario === key;
              return (
                <button
                  key={key}
                  onClick={() => handleSelectScenario(key)}
                  style={{
                    background: isSelected ? 'rgba(6, 182, 212, 0.2)' : 'rgba(15, 23, 42, 0.6)',
                    border: `1px solid ${isSelected ? '#22d3ee' : 'rgba(255, 255, 255, 0.08)'}`,
                    borderRadius: '5px',
                    padding: '8px 10px',
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: 700,
                        color: isSelected ? '#ffffff' : '#cbd5e1',
                        fontFamily: 'monospace',
                      }}
                    >
                      {item.label}
                    </span>
                    {key === 'cyclone' && (
                      <span
                        style={{
                          fontSize: '7.5px',
                          color: '#ef4444',
                          border: '1px solid #ef4444',
                          borderRadius: '3px',
                          padding: '1px 4px',
                        }}
                      >
                        BREACH
                      </span>
                    )}
                    {key === 'monsoon' && (
                      <span
                        style={{
                          fontSize: '7.5px',
                          color: '#f59e0b',
                          border: '1px solid #f59e0b',
                          borderRadius: '3px',
                          padding: '1px 4px',
                        }}
                      >
                        WARNING
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: '8px',
                      color: 'rgba(148, 163, 184, 0.8)',
                      fontFamily: 'system-ui, sans-serif',
                      marginTop: '3px',
                      lineHeight: 1.25,
                    }}
                  >
                    {item.desc}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Tab 2: Custom Sliders */}
        {controlsTab === 'custom' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {/* Current Speed */}
            <div>
              <div style={sliderHeaderStyle}>
                <span>Current Velocity</span>
                <span style={sliderValStyle}>{env.currentSpeed.toFixed(2)} m/s</span>
              </div>
              <input
                type="range"
                min="0"
                max="3.0"
                step="0.05"
                value={env.currentSpeed}
                onChange={(e) => setEnv((prev) => ({ ...prev, currentSpeed: parseFloat(e.target.value) }))}
                style={sliderStyle}
              />
            </div>

            {/* Current Direction */}
            <div>
              <div style={sliderHeaderStyle}>
                <span>Current Direction (FROM)</span>
                <span style={sliderValStyle}>{Math.round(env.currentDirection)}°</span>
              </div>
              <input
                type="range"
                min="0"
                max="360"
                step="5"
                value={env.currentDirection}
                onChange={(e) => setEnv((prev) => ({ ...prev, currentDirection: parseFloat(e.target.value) }))}
                style={sliderStyle}
              />
            </div>

            {/* Wind Speed */}
            <div>
              <div style={sliderHeaderStyle}>
                <span>Wind Speed</span>
                <span style={sliderValStyle}>{env.windSpeed.toFixed(1)} m/s</span>
              </div>
              <input
                type="range"
                min="0"
                max="30"
                step="0.5"
                value={env.windSpeed}
                onChange={(e) => setEnv((prev) => ({ ...prev, windSpeed: parseFloat(e.target.value) }))}
                style={sliderStyle}
              />
            </div>

            {/* Significant Wave Height (Hs) */}
            <div>
              <div style={sliderHeaderStyle}>
                <span>Wave Height (Hs)</span>
                <span style={sliderValStyle}>{env.waveHeight.toFixed(2)} m</span>
              </div>
              <input
                type="range"
                min="0.1"
                max="10"
                step="0.1"
                value={env.waveHeight}
                onChange={(e) => setEnv((prev) => ({ ...prev, waveHeight: parseFloat(e.target.value) }))}
                style={sliderStyle}
              />
            </div>

            {/* Wave Period (Tp) */}
            <div>
              <div style={sliderHeaderStyle}>
                <span>Wave Period (Tp)</span>
                <span style={sliderValStyle}>{env.wavePeriod.toFixed(1)} s</span>
              </div>
              <input
                type="range"
                min="4"
                max="18"
                step="0.5"
                value={env.wavePeriod}
                onChange={(e) => setEnv((prev) => ({ ...prev, wavePeriod: parseFloat(e.target.value) }))}
                style={sliderStyle}
              />
            </div>

            {/* Watch Circle Radius */}
            <div>
              <div style={sliderHeaderStyle}>
                <span>Watch-Circle Radius</span>
                <span style={sliderValStyle}>{config.watchCircleRadius} m</span>
              </div>
              <input
                type="range"
                min="150"
                max="1200"
                step="25"
                value={config.watchCircleRadius}
                onChange={(e) => setConfig((prev) => ({ ...prev, watchCircleRadius: parseInt(e.target.value) }))}
                style={sliderStyle}
              />
            </div>
          </div>
        )}

        {/* Simulation Toggles & Layer Options */}
        <div style={{ marginTop: 'auto', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '10px' }}>
          <div style={{ fontSize: '9px', color: '#94a3b8', fontFamily: 'monospace', marginBottom: '8px' }}>
            LAYER & VISUALIZATION TOGGLES:
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
            <button
              onClick={() => setShowBoundary(!showBoundary)}
              style={{ ...toggleBtnStyle, color: showBoundary ? '#22d3ee' : '#64748b' }}
            >
              <Eye size={10} /> Watch Ring: {showBoundary ? 'ON' : 'OFF'}
            </button>
            <button
              onClick={() => setShowTrail(!showTrail)}
              style={{ ...toggleBtnStyle, color: showTrail ? '#22d3ee' : '#64748b' }}
            >
              <Activity size={10} /> GPS Track: {showTrail ? 'ON' : 'OFF'}
            </button>
            <button
              onClick={() => setShowExcursionVector(!showExcursionVector)}
              style={{ ...toggleBtnStyle, color: showExcursionVector ? '#22d3ee' : '#64748b' }}
            >
              <Compass size={10} /> Vector: {showExcursionVector ? 'ON' : 'OFF'}
            </button>
            <button
              onClick={() => setShowUnderwater(!showUnderwater)}
              style={{ ...toggleBtnStyle, color: showUnderwater ? '#22d3ee' : '#64748b' }}
            >
              <Layers size={10} /> Ocean Dive: {showUnderwater ? 'ON' : 'OFF'}
            </button>
          </div>

          {/* Simulation Controls */}
          <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
            <button
              onClick={() => setIsPaused(!isPaused)}
              style={{
                flex: 1,
                padding: '7px',
                borderRadius: '4px',
                background: isPaused ? 'rgba(34, 197, 94, 0.25)' : 'rgba(239, 68, 68, 0.25)',
                border: `1px solid ${isPaused ? '#22c55e' : '#ef4444'}`,
                color: '#ffffff',
                fontSize: '9px',
                fontFamily: 'monospace',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              {isPaused ? <Play size={11} /> : <Pause size={11} />}
              {isPaused ? 'RESUME SIM' : 'PAUSE SIM'}
            </button>

            <button
              onClick={onClearTrail}
              style={{
                padding: '7px 10px',
                borderRadius: '4px',
                background: 'rgba(15, 23, 42, 0.75)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#94a3b8',
                fontSize: '9px',
                fontFamily: 'monospace',
                cursor: 'pointer',
              }}
              title="Clear GPS breadcrumb history trail"
            >
              CLEAR TRACK
            </button>
          </div>
        </div>
      </div>

      {/* ── RIGHT FLOATING DOCK: TELEMETRY & MOORING LINE INSPECTOR ── */}
      <div
        style={{
          position: 'absolute',
          top: '76px',
          right: '24px',
          width: '330px',
          maxHeight: 'calc(100vh - 160px)',
          background: 'rgba(2, 8, 23, 0.88)',
          border: '1px solid rgba(34, 211, 238, 0.25)',
          borderRadius: '8px',
          padding: '14px',
          backdropFilter: 'blur(16px)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.7)',
          pointerEvents: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          overflowY: 'auto',
        }}
      >
        {/* Tab switch: STATUS vs SEGMENT INSPECTOR */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(34, 211, 238, 0.15)', paddingBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#ffffff', fontFamily: 'monospace' }}>
              {config.buoyId}
            </span>
            <span style={{ fontSize: '8px', color: '#94a3b8', fontFamily: 'monospace' }}>OMNI ARRAY</span>
          </div>

          <div style={{ display: 'flex', background: 'rgba(15, 23, 42, 0.8)', borderRadius: '4px', padding: '2px' }}>
            <button
              onClick={() => setRightPanelTab('status')}
              style={{
                ...tabBtnStyle,
                background: rightPanelTab === 'status' ? 'rgba(34, 211, 238, 0.2)' : 'transparent',
                color: rightPanelTab === 'status' ? '#22d3ee' : '#94a3b8',
              }}
            >
              TELEMETRY
            </button>
            <button
              onClick={() => setRightPanelTab('segments')}
              style={{
                ...tabBtnStyle,
                background: rightPanelTab === 'segments' ? 'rgba(34, 211, 238, 0.2)' : 'transparent',
                color: rightPanelTab === 'segments' ? '#22d3ee' : '#94a3b8',
              }}
            >
              SEGMENTS {selectedSegment ? '(1)' : ''}
            </button>
          </div>
        </div>

        {/* ── SUB-VIEW A: ACTIVE MOORING SEGMENT INSPECTOR ── */}
        {rightPanelTab === 'segments' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {selectedSegment ? (
              <div
                style={{
                  background: 'rgba(6, 182, 212, 0.1)',
                  border: '1px solid #22d3ee',
                  borderRadius: '6px',
                  padding: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                {/* Segment Header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 800, color: '#38bdf8', fontFamily: 'monospace' }}>
                      {selectedSegment.name}
                    </div>
                    <div style={{ fontSize: '8px', color: '#94a3b8', fontFamily: 'monospace', marginTop: '2px' }}>
                      ID: {selectedSegment.id} · {selectedSegment.material}
                    </div>
                  </div>
                  <button
                    onClick={() => onSelectSegment?.(null)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#94a3b8',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                    title="Close segment inspection"
                  >
                    <X size={14} />
                  </button>
                </div>

                {/* Provenance Pill */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span
                    style={{
                      fontSize: '7.5px',
                      fontWeight: 800,
                      fontFamily: 'monospace',
                      padding: '2px 6px',
                      borderRadius: '3px',
                      background: 'rgba(245, 158, 11, 0.2)',
                      border: '1px solid #f59e0b',
                      color: '#fbbf24',
                    }}
                  >
                    [{selectedSegment.provenance.status}]
                  </span>
                  <span style={{ fontSize: '7.5px', color: '#94a3b8', fontFamily: 'monospace' }}>
                    CONFIDENCE: {selectedSegment.provenance.confidence}
                  </span>
                </div>

                {/* Quantitative Segment Physics Values */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginTop: '4px' }}>
                  <div style={metricBoxStyle}>
                    <span style={metricLabelStyle}>LOCAL TENSION</span>
                    <span style={{ ...metricValueStyle, color: '#22d3ee' }}>
                      {selectedSegment.localTension_kN} kN
                    </span>
                  </div>

                  <div style={metricBoxStyle}>
                    <span style={metricLabelStyle}>LOCAL ANGLE</span>
                    <span style={metricValueStyle}>{selectedSegment.localAngle_deg}°</span>
                  </div>

                  <div style={metricBoxStyle}>
                    <span style={metricLabelStyle}>DEPTH SPAN</span>
                    <span style={metricValueStyle}>
                      {selectedSegment.depthRange_m[0]}m – {selectedSegment.depthRange_m[1]}m
                    </span>
                  </div>

                  <div style={metricBoxStyle}>
                    <span style={metricLabelStyle}>LENGTH / SCOPE</span>
                    <span style={metricValueStyle}>{selectedSegment.length_m} m</span>
                  </div>

                  <div style={metricBoxStyle}>
                    <span style={metricLabelStyle}>BREAKING LOAD (MBL)</span>
                    <span style={metricValueStyle}>{selectedSegment.breaking_strength_kN} kN</span>
                  </div>

                  <div style={metricBoxStyle}>
                    <span style={metricLabelStyle}>SUBMERGED WT</span>
                    <span style={metricValueStyle}>{selectedSegment.submerged_weight_N_m} N/m</span>
                  </div>
                </div>

                {/* Utilization Progress Bar */}
                <div style={{ marginTop: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8px', color: '#94a3b8', fontFamily: 'monospace', marginBottom: '3px' }}>
                    <span>STRUCTURAL UTILIZATION</span>
                    <span style={{ color: selectedSegment.utilization_percent > 80 ? '#ef4444' : '#22d3ee', fontWeight: 700 }}>
                      {selectedSegment.utilization_percent}%
                    </span>
                  </div>
                  <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${Math.min(100, selectedSegment.utilization_percent)}%`,
                        height: '100%',
                        background: selectedSegment.utilization_percent > 80 ? '#ef4444' : '#22d3ee',
                      }}
                    />
                  </div>
                </div>

                {/* Provenance Engineering Notes */}
                <div style={{ fontSize: '7.5px', color: '#94a3b8', fontFamily: 'monospace', lineHeight: 1.35, background: 'rgba(15, 23, 42, 0.6)', padding: '6px 8px', borderRadius: '4px' }}>
                  {selectedSegment.provenance.notes}
                </div>

                {/* Focus Camera Action Button */}
                <button
                  onClick={() => {
                    if (selectedSegment.index === 0) onDepthChange(10);
                    else if (selectedSegment.index === 1) onDepthChange(500);
                    else onDepthChange(2500);
                  }}
                  style={{
                    background: 'rgba(34, 211, 238, 0.25)',
                    border: '1px solid #22d3ee',
                    borderRadius: '4px',
                    padding: '6px',
                    color: '#ffffff',
                    fontSize: '9px',
                    fontFamily: 'monospace',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    marginTop: '2px',
                  }}
                >
                  <ArrowDownCircle size={12} /> DIVE CAMERA TO THIS SEGMENT
                </button>
              </div>
            ) : (
              /* No Segment Currently Selected */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ fontSize: '8.5px', color: '#94a3b8', fontFamily: 'monospace', lineHeight: 1.35 }}>
                  Click any segment in the 3D scene or choose below to inspect local tension, local angle, and engineering specifications:
                </div>

                {segments.map((seg) => (
                  <button
                    key={seg.id}
                    onClick={() => onSelectSegment?.(seg.index)}
                    style={{
                      background: 'rgba(15, 23, 42, 0.7)',
                      border: '1px solid rgba(34, 211, 238, 0.2)',
                      borderRadius: '5px',
                      padding: '8px 10px',
                      textAlign: 'left',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '3px',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '9.5px', fontWeight: 700, color: '#38bdf8', fontFamily: 'monospace' }}>
                        {seg.name}
                      </span>
                      <span style={{ fontSize: '8px', color: '#22d3ee', fontFamily: 'monospace', fontWeight: 700 }}>
                        {seg.localTension_kN} kN
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '7.5px', color: '#64748b', fontFamily: 'monospace' }}>
                      <span>Span: {seg.depthRange_m[0]}m – {seg.depthRange_m[1]}m</span>
                      <span>Angle: {seg.localAngle_deg}°</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* ── SUB-VIEW B: LIVE TELEMETRY & STATUS ── */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {/* Watch Circle Status Banner */}
            <div
              style={{
                padding: '8px 12px',
                borderRadius: '6px',
                background: statusBg,
                border: `1px solid ${statusBorder}`,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              {buoyState.status === 'BREACH' ? (
                <AlertTriangle size={15} color="#ef4444" />
              ) : buoyState.status === 'WARNING' ? (
                <AlertTriangle size={15} color="#f59e0b" />
              ) : (
                <CheckCircle size={15} color="#22d3ee" />
              )}
              <div>
                <div style={{ fontSize: '9.5px', fontWeight: 800, color: statusBorder, fontFamily: 'monospace', letterSpacing: '0.08em' }}>
                  {statusText}
                </div>
                <div style={{ fontSize: '8px', color: '#94a3b8', fontFamily: 'monospace', marginTop: '2px' }}>
                  EXCURSION: {Math.round(buoyState.excursionDistance)}m / {config.watchCircleRadius}m ({buoyState.excursionPercent}%)
                </div>
              </div>
            </div>

            {/* GPS Coordinates Comparison */}
            <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '10px 12px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontSize: '8.5px', color: '#38bdf8', fontFamily: 'monospace', fontWeight: 700, marginBottom: '6px' }}>
                GPS POSITION TRACKING (GEODESIC)
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '9.5px', fontFamily: 'monospace' }}>
                <div>
                  <div style={{ color: '#64748b', fontSize: '8px' }}>NOMINAL ANCHOR</div>
                  <div style={{ color: '#cbd5e1', fontWeight: 600 }}>{config.nominalLatitude.toFixed(4)}° N</div>
                  <div style={{ color: '#cbd5e1', fontWeight: 600 }}>{config.nominalLongitude.toFixed(4)}° E</div>
                </div>
                <div>
                  <div style={{ color: '#64748b', fontSize: '8px' }}>CURRENT BUOY GPS</div>
                  <div style={{ color: '#ffffff', fontWeight: 700 }}>{buoyState.currentLat.toFixed(4)}° N</div>
                  <div style={{ color: '#ffffff', fontWeight: 700 }}>{buoyState.currentLon.toFixed(4)}° E</div>
                </div>
              </div>
            </div>

            {/* Quantitative Engineering Readouts */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div style={metricBoxStyle}>
                <span style={metricLabelStyle}>HORIZ. EXCURSION</span>
                <span style={metricValueStyle}>{Math.round(buoyState.excursionDistance)} m</span>
              </div>

              <div style={metricBoxStyle}>
                <span style={metricLabelStyle}>BEARING ANGLE</span>
                <span style={metricValueStyle}>{Math.round(buoyState.excursionAngle)}° T</span>
              </div>

              <div style={metricBoxStyle}>
                <span style={metricLabelStyle}>FAIRLEAD TENSION</span>
                <span style={metricValueStyle}>{buoyState.fairleadTension_kN} kN</span>
              </div>

              <div style={metricBoxStyle}>
                <span style={metricLabelStyle}>SAFETY FACTOR (SF)</span>
                <span style={{ ...metricValueStyle, color: buoyState.safetyFactor < 2.0 ? '#ef4444' : '#22d3ee' }}>
                  {buoyState.safetyFactor >= 2.0 ? `≥ ${buoyState.safetyFactor}` : buoyState.safetyFactor}
                </span>
              </div>

              <div style={metricBoxStyle}>
                <span style={metricLabelStyle}>WATER DEPTH</span>
                <span style={metricValueStyle}>{config.waterDepth} m</span>
              </div>

              <div style={metricBoxStyle}>
                <span style={metricLabelStyle}>MOORING SCOPE</span>
                <span style={metricValueStyle}>{config.scope.toFixed(2)}</span>
              </div>
            </div>

            {/* Environmental Forcing Summary */}
            <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '10px 12px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontSize: '8.5px', color: '#38bdf8', fontFamily: 'monospace', fontWeight: 700, marginBottom: '6px' }}>
                ACTIVE ENVIRONMENTAL FORCING
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '9px', fontFamily: 'monospace', color: '#cbd5e1' }}>
                <div>Current: <strong>{env.currentSpeed.toFixed(2)} m/s</strong> ({Math.round(env.currentDirection)}°)</div>
                <div>Wind: <strong>{env.windSpeed.toFixed(1)} m/s</strong> ({Math.round(env.windDirection)}°)</div>
                <div>Waves (Hs): <strong>{env.waveHeight.toFixed(2)} m</strong></div>
                <div>Period (Tp): <strong>{env.wavePeriod.toFixed(1)} s</strong></div>
              </div>
            </div>

            {/* Scientific Disclaimer */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', fontSize: '7.5px', color: '#64748b', fontFamily: 'monospace', marginTop: '4px', lineHeight: 1.3 }}>
              <HelpCircle size={10} color="#64748b" style={{ flexShrink: 0, marginTop: '1px' }} />
              <span>Multi-segment inverse catenary formulation. Material specs marked [ASSUMPTION] per MoorSense reference design.</span>
            </div>
          </div>
        )}
      </div>

      {/* ── BOTTOM DEPTH NAVIGATION DOCK (EXPLORE OCEAN AREA 3D DIVE) ── */}
      <div
        style={{
          position: 'absolute',
          bottom: '24px',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          background: 'rgba(2, 8, 23, 0.88)',
          border: '1px solid rgba(34, 211, 238, 0.3)',
          borderRadius: '8px',
          padding: '6px 14px',
          backdropFilter: 'blur(16px)',
          boxShadow: '0 12px 36px rgba(0,0,0,0.75)',
          zIndex: 60,
          pointerEvents: 'auto',
        }}
      >
        <span
          style={{
            fontSize: '9px',
            letterSpacing: '0.16em',
            color: 'rgba(148, 163, 184, 0.9)',
            fontFamily: 'monospace',
            fontWeight: 700,
            marginRight: '6px',
          }}
        >
          EXPLORE DEPTH:
        </span>

        {DEPTHS.map((d) => {
          const isActive = currentDepth === d;
          return (
            <button
              key={d}
              onClick={() => onDepthChange(d)}
              style={{
                background: isActive
                  ? 'linear-gradient(135deg, rgba(6, 182, 212, 0.45) 0%, rgba(14, 116, 144, 0.65) 100%)'
                  : 'rgba(15, 23, 42, 0.65)',
                border: `1px solid ${isActive ? '#22d3ee' : 'rgba(255, 255, 255, 0.1)'}`,
                borderRadius: '4px',
                padding: '6px 14px',
                color: isActive ? '#ffffff' : '#94a3b8',
                fontSize: '10px',
                fontWeight: isActive ? 700 : 500,
                letterSpacing: '0.12em',
                fontFamily: 'monospace',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: isActive ? '0 0 14px rgba(34, 211, 238, 0.45)' : 'none',
              }}
              onMouseEnter={(e) => {
                if (!isActive) (e.currentTarget as HTMLElement).style.background = 'rgba(34, 211, 238, 0.15)';
              }}
              onMouseLeave={(e) => {
                if (!isActive) (e.currentTarget as HTMLElement).style.background = 'rgba(15, 23, 42, 0.65)';
              }}
            >
              {DEPTH_LABELS[d]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  background: 'rgba(15, 23, 42, 0.75)',
  border: '1px solid rgba(34, 211, 238, 0.25)',
  borderRadius: '4px',
  padding: '6px 10px',
  color: '#38bdf8',
  fontSize: '9px',
  fontWeight: 600,
  letterSpacing: '0.12em',
  fontFamily: 'monospace',
  cursor: 'pointer',
  transition: 'all 0.2s ease',
};

const tabBtnStyle: React.CSSProperties = {
  border: '1px solid transparent',
  borderRadius: '4px',
  padding: '3px 8px',
  fontSize: '8.5px',
  fontWeight: 700,
  fontFamily: 'monospace',
  cursor: 'pointer',
  transition: 'all 0.2s ease',
};

const sliderHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  fontSize: '9px',
  color: '#cbd5e1',
  fontFamily: 'monospace',
  marginBottom: '3px',
};

const sliderValStyle: React.CSSProperties = {
  color: '#22d3ee',
  fontWeight: 700,
};

const sliderStyle: React.CSSProperties = {
  width: '100%',
  accentColor: '#22d3ee',
  cursor: 'pointer',
};

const toggleBtnStyle: React.CSSProperties = {
  background: 'rgba(15, 23, 42, 0.6)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  borderRadius: '4px',
  padding: '5px 8px',
  fontSize: '8.5px',
  fontFamily: 'monospace',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  transition: 'all 0.2s ease',
};

const metricBoxStyle: React.CSSProperties = {
  background: 'rgba(15, 23, 42, 0.6)',
  border: '1px solid rgba(255, 255, 255, 0.06)',
  borderRadius: '5px',
  padding: '8px 10px',
};

const metricLabelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '7.5px',
  color: '#64748b',
  fontFamily: 'monospace',
};

const metricValueStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '12px',
  fontWeight: 700,
  color: '#ffffff',
  fontFamily: 'monospace',
  marginTop: '2px',
};
