import type { Station, DepthLevel } from '../../types/ocean';
import { Compass, Thermometer, Waves, Wind, Droplets } from 'lucide-react';

interface LocalOceanHUDProps {
  station: Station;
  depth: DepthLevel;
  onDepthChange: (d: DepthLevel) => void;
  onExit: () => void;
}

const DEPTHS: DepthLevel[] = [0, 10, 50, 100, 500, 1000];

const DEPTH_LABELS: Record<number, string> = {
  0: 'SURFACE',
  10: '10 M',
  50: '50 M',
  100: '100 M',
  500: '500 M',
  1000: '1000 M',
};

const DEPTH_DESCRIPTIONS: Record<number, { zone: string; desc: string }> = {
  0: { zone: 'EPILPELAGIC / SURFACE', desc: 'Solar penetration, wind waves, surface buoys' },
  10: { zone: 'PHOTIC SHALLOWS', desc: 'Dolphins, sea turtles, coral caustics' },
  50: { zone: 'THERMOCLINE TRANSITION', desc: 'Manta rays, pelagic sharks, rapid temp drops' },
  100: { zone: 'MESOPELAGIC / TWILIGHT', desc: 'Whale sharks, giant squids, diminishing light' },
  500: { zone: 'BATHYPELAGIC / MIDNIGHT', desc: 'Bioluminescent jellyfish, anglerfish, total darkness' },
  1000: { zone: 'ABYSSAL TRENCH', desc: 'Deep-sea anchors, hydrothermal fauna, extreme pressure' },
};

export function LocalOceanHUD({ station, depth, onDepthChange, onExit }: LocalOceanHUDProps) {
  const currentDepthInfo = DEPTH_DESCRIPTIONS[depth] || DEPTH_DESCRIPTIONS[0];

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {/* ── Top Header / Return Bar ── */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '64px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
          zIndex: 60,
          background: 'linear-gradient(180deg, rgba(2, 6, 23, 0.85) 0%, transparent 100%)',
          borderBottom: '1px solid rgba(34, 211, 238, 0.15)',
        }}
      >
        {/* Left: Station Title */}
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
                fontSize: '14px',
                fontWeight: 700,
                letterSpacing: '0.18em',
                color: '#ffffff',
                fontFamily: "'Space Grotesk', system-ui, sans-serif",
                lineHeight: 1.1,
              }}
            >
              LOCAL OCEAN AREA · {station.name || station.id}
            </div>
            <div
              style={{
                fontSize: '8.5px',
                letterSpacing: '0.14em',
                color: '#38bdf8',
                fontFamily: 'monospace',
                marginTop: '3px',
              }}
            >
              LAT {Math.abs(station.latitude).toFixed(4)}° {station.latitude >= 0 ? 'N' : 'S'} · LON{' '}
              {Math.abs(station.longitude).toFixed(4)}° {station.longitude >= 0 ? 'E' : 'W'} · {station.region || 'INDIAN OCEAN'}
            </div>
          </div>
        </div>

        {/* Center: Current Depth Zone Banner */}
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
              background: 'rgba(6, 182, 212, 0.12)',
              border: '1px solid rgba(34, 211, 238, 0.3)',
              borderRadius: '4px',
              padding: '4px 12px',
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
                fontSize: '9px',
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
              color: 'rgba(148, 163, 184, 0.8)',
              fontFamily: 'monospace',
            }}
          >
            {currentDepthInfo.desc}
          </span>
        </div>

        {/* Right: Return to Global View Button */}
        <div style={{ pointerEvents: 'auto' }}>
          <button
            onClick={onExit}
            style={{
              background: 'rgba(15, 23, 42, 0.85)',
              border: '1px solid rgba(34, 211, 238, 0.4)',
              borderRadius: '5px',
              padding: '7px 16px',
              color: '#38bdf8',
              fontSize: '10px',
              fontWeight: 700,
              letterSpacing: '0.14em',
              fontFamily: 'monospace',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 0 15px rgba(6, 182, 212, 0.2)',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = 'rgba(34, 211, 238, 0.25)';
              (e.currentTarget as HTMLElement).style.borderColor = '#22d3ee';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = 'rgba(15, 23, 42, 0.85)';
              (e.currentTarget as HTMLElement).style.borderColor = 'rgba(34, 211, 238, 0.4)';
            }}
          >
            <Compass size={13} />
            <span>← RETURN TO GLOBE</span>
          </button>
        </div>
      </div>

      {/* ── Top-Left Floating In-Situ Telemetry Card ── */}
      <div
        style={{
          position: 'absolute',
          top: '76px',
          left: '24px',
          width: '240px',
          background: 'rgba(2, 8, 23, 0.82)',
          border: '1px solid rgba(34, 211, 238, 0.22)',
          borderRadius: '8px',
          padding: '12px 14px',
          backdropFilter: 'blur(12px)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
          zIndex: 50,
          pointerEvents: 'auto',
        }}
      >
        <div
          style={{
            fontSize: '9px',
            letterSpacing: '0.18em',
            color: 'rgba(34, 211, 238, 0.9)',
            fontWeight: 700,
            fontFamily: 'monospace',
            marginBottom: '8px',
            borderBottom: '1px solid rgba(34, 211, 238, 0.15)',
            paddingBottom: '4px',
          }}
        >
          COLUMN TELEMETRY
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '6px 8px', borderRadius: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#94a3b8', fontSize: '7.5px', fontFamily: 'monospace' }}>
              <Thermometer size={10} color="#38bdf8" /> TEMP
            </div>
            <div style={{ color: '#ffffff', fontSize: '13px', fontWeight: 700, fontFamily: 'monospace', marginTop: '2px' }}>
              {station.temperature ? `${station.temperature.toFixed(1)}°C` : '28.4°C'}
            </div>
          </div>

          <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '6px 8px', borderRadius: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#94a3b8', fontSize: '7.5px', fontFamily: 'monospace' }}>
              <Waves size={10} color="#38bdf8" /> WAVES
            </div>
            <div style={{ color: '#ffffff', fontSize: '13px', fontWeight: 700, fontFamily: 'monospace', marginTop: '2px' }}>
              {station.waveHeight ? `${station.waveHeight.toFixed(2)} m` : '1.45 m'}
            </div>
          </div>

          <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '6px 8px', borderRadius: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#94a3b8', fontSize: '7.5px', fontFamily: 'monospace' }}>
              <Wind size={10} color="#38bdf8" /> CURRENT
            </div>
            <div style={{ color: '#ffffff', fontSize: '13px', fontWeight: 700, fontFamily: 'monospace', marginTop: '2px' }}>
              {station.currentSpeed ? `${station.currentSpeed.toFixed(2)} m/s` : '0.38 m/s'}
            </div>
          </div>

          <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '6px 8px', borderRadius: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#94a3b8', fontSize: '7.5px', fontFamily: 'monospace' }}>
              <Droplets size={10} color="#38bdf8" /> SALINITY
            </div>
            <div style={{ color: '#ffffff', fontSize: '13px', fontWeight: 700, fontFamily: 'monospace', marginTop: '2px' }}>
              {station.salinity ? `${station.salinity.toFixed(1)} PSU` : '34.8 PSU'}
            </div>
          </div>
        </div>
      </div>

      {/* ── Bottom Depth Control Dock ── */}
      <div
        style={{
          position: 'absolute',
          bottom: '24px',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          background: 'rgba(2, 8, 23, 0.85)',
          border: '1px solid rgba(34, 211, 238, 0.3)',
          borderRadius: '8px',
          padding: '6px 12px',
          backdropFilter: 'blur(16px)',
          boxShadow: '0 12px 36px rgba(0,0,0,0.7)',
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
          DEPTH LEVEL:
        </span>

        {DEPTHS.map((d) => {
          const isActive = depth === d;
          return (
            <button
              key={d}
              onClick={() => onDepthChange(d)}
              style={{
                background: isActive
                  ? 'linear-gradient(135deg, rgba(6, 182, 212, 0.4) 0%, rgba(14, 116, 144, 0.6) 100%)'
                  : 'rgba(15, 23, 42, 0.6)',
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
                boxShadow: isActive ? '0 0 12px rgba(34, 211, 238, 0.4)' : 'none',
              }}
              onMouseEnter={(e) => {
                if (!isActive) (e.currentTarget as HTMLElement).style.background = 'rgba(34, 211, 238, 0.15)';
              }}
              onMouseLeave={(e) => {
                if (!isActive) (e.currentTarget as HTMLElement).style.background = 'rgba(15, 23, 42, 0.6)';
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
