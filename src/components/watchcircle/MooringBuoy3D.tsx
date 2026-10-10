import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { BuoyState } from './watchCircleTypes';

interface MooringBuoy3DProps {
  buoyState: BuoyState;
  buoyId: string;
  waveHeight?: number;
  wavePeriod?: number;
  windSpeed?: number;
  currentSpeed?: number;
  liveMotionRef?: React.MutableRefObject<{
    position: THREE.Vector3;
    rotation: THREE.Euler;
    keelPosition: THREE.Vector3;
  }>;
}

// 4 multi-directional rolling swells with incommensurate wavelengths (matching OceanSurface.tsx)
const SWELL_COMPONENTS = [
  { dirX: 0.35,  dirZ: 0.94,  perpX: -0.94, perpZ: 0.35,  wavelength: 18.0, speed: 2.50, weight: 0.45 },
  { dirX: -0.42, dirZ: 0.91,  perpX: -0.91, perpZ: -0.42, wavelength: 11.5, speed: 2.05, weight: 0.30 },
  { dirX: 0.80,  dirZ: 0.60,  perpX: -0.60, perpZ: 0.80,  wavelength: 7.2,  speed: 1.65, weight: 0.16 },
  { dirX: -0.65, dirZ: 0.76,  perpX: -0.76, perpZ: -0.65, wavelength: 4.2,  speed: 1.30, weight: 0.09 },
];

// ── Mathematically exact cylindrical structural strut between two 3D coordinates ──
interface ConnectingStrutProps {
  from: [number, number, number];
  to: [number, number, number];
  radius?: number;
  color?: string;
  roughness?: number;
  metalness?: number;
}

function ConnectingStrut({
  from,
  to,
  radius = 0.015,
  color = '#090d16',
  roughness = 0.45,
  metalness = 0.7,
}: ConnectingStrutProps) {
  const { position, quaternion, length } = useMemo(() => {
    const p1 = new THREE.Vector3(...from);
    const p2 = new THREE.Vector3(...to);
    const dir = new THREE.Vector3().subVectors(p2, p1);
    const len = dir.length();
    const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
    const q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      dir.clone().normalize()
    );
    return { position: mid, quaternion: q, length: len };
  }, [from, to]);

  return (
    <group>
      {/* Cylindrical strut pipe */}
      <mesh position={position} quaternion={quaternion} castShadow>
        <cylinderGeometry args={[radius, radius, length, 16]} />
        <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} />
      </mesh>
      {/* Structural mounting weld boss at start point */}
      <mesh position={from}>
        <sphereGeometry args={[radius * 1.3, 10, 10]} />
        <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} />
      </mesh>
      {/* Structural mounting weld boss at end point */}
      <mesh position={to}>
        <sphereGeometry args={[radius * 1.3, 10, 10]} />
        <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} />
      </mesh>
    </group>
  );
}

export function MooringBuoy3D({
  buoyState,
  buoyId,
  waveHeight = 1.5,
  wavePeriod = 8.0,
  windSpeed = 6.0,
  currentSpeed = 1.0,
  liveMotionRef,
}: MooringBuoy3DProps) {
  const groupRef = useRef<THREE.Group>(null!);
  const pivotRef = useRef<THREE.Group>(null!);
  const strobeLightRef = useRef<THREE.PointLight>(null!);
  const anemometerRef = useRef<THREE.Group>(null!);

  // Conversion: 1 3D unit = 30m
  const M_TO_3D = 1 / 30;
  const targetX = buoyState.excursionX * M_TO_3D;
  const targetZ = buoyState.excursionZ * M_TO_3D;

  // Second-order dynamical state with realistic inertia, damping, and continuous integration
  // Starts at buoyant floating waterline (y: 0.26m) so the yellow hull rides proudly above the sea surface
  const nominalFloatY = 0.26;
  const dynamicsRef = useRef({
    x: targetX,
    y: nominalFloatY,
    z: targetZ,
    pitch: 0,
    roll: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    vPitch: 0,
    vRoll: 0,
  });

  // ── Procedural Canvas Textures for Authentic Photographic Markings ──

  // 3. Sailor Inmarsat Satellite Antenna Dome Texture (Matching photo exactly)
  const sailorDomeTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // 1. Off-white marine gelcoat background with subtle vertical shading
      const grad = ctx.createLinearGradient(0, 0, 0, 512);
      grad.addColorStop(0, '#f8fafc');   // Pure clean white near top dome
      grad.addColorStop(0.7, '#eef2f6'); // Subtle marine off-white
      grad.addColorStop(1.0, '#e2e8f0'); // Slightly weathered near base
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1024, 512);

      // 2. Subtle horizontal circumferential panel seam line near bottom
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, 440);
      ctx.lineTo(1024, 440);
      ctx.stroke();

      // Front Face Decal: Since CylinderGeometry with rotation=[0, Math.PI, 0] maps U=0.5 to front (+Z),
      // U=0.5 corresponds to X = 512 in our 1024px canvas.
      const cx = 512;
      const cy = 295; // Vertically centered on the cone body

      // 3. Black Rectangular Label Badge (Matching the authentic Sailor / Capsat badge in photo)
      const badgeW = 175;
      const badgeH = 74;
      const badgeX = cx - 105; // Slightly left so warning triangle sits to the right
      const badgeY = cy - badgeH / 2;

      // Dark Charcoal / Black Badge Background
      ctx.fillStyle = '#090d16';
      if (typeof ctx.roundRect === 'function') {
        ctx.beginPath();
        ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 6);
        ctx.fill();
      } else {
        ctx.fillRect(badgeX, badgeY, badgeW, badgeH);
      }

      // Thin silver-white inner border
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 2;
      if (typeof ctx.roundRect === 'function') {
        ctx.beginPath();
        ctx.roundRect(badgeX + 3, badgeY + 3, badgeW - 6, badgeH - 6, 4);
        ctx.stroke();
      } else {
        ctx.strokeRect(badgeX + 3, badgeY + 3, badgeW - 6, badgeH - 6);
      }

      // Bold white "SAILOR" brand text
      ctx.fillStyle = '#f8fafc';
      ctx.font = '900 36px "Trebuchet MS", "Arial Black", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('SAILOR', badgeX + badgeW / 2, badgeY + 41);

      // Subtitle text: "Thrane & Thrane"
      ctx.fillStyle = '#cbd5e1';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText('Thrane & Thrane', badgeX + badgeW / 2, badgeY + 60);

      // 4. Yellow / Orange Warning Hazard Triangle (Placed right beside the badge, matching photo!)
      const triX = cx + 86;
      const triY = cy - 2;
      const triSize = 42;

      // Yellow-Amber Warning Triangle Fill
      ctx.fillStyle = '#f59e0b';
      ctx.strokeStyle = '#090d16';
      ctx.lineWidth = 5;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(triX, triY - triSize);
      ctx.lineTo(triX - triSize * 0.866, triY + triSize * 0.5);
      ctx.lineTo(triX + triSize * 0.866, triY + triSize * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Black exclamation mark / RF warning symbol inside triangle
      ctx.fillStyle = '#090d16';
      ctx.font = '900 28px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('!', triX, triY + 14);

      // Subtle atmospheric / marine weathering spots
      ctx.fillStyle = 'rgba(100, 116, 139, 0.08)';
      ctx.beginPath();
      ctx.arc(cx - 30, cy - 80, 18, 0, Math.PI * 2);
      ctx.arc(cx + 120, cy + 90, 24, 0, Math.PI * 2);
      ctx.fill();
    }
    const tex = new THREE.CanvasTexture(canvas);
    return tex;
  }, []);

  // 4. Sailor Antenna Saucer Dish Top Surface Texture (Weathered marine off-white fiberglass dish)
  const sailorDishTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Weathered off-white / light silver-grey fiberglass disc
      const radGrad = ctx.createRadialGradient(256, 256, 20, 256, 256, 256);
      radGrad.addColorStop(0, '#f1f5f9');
      radGrad.addColorStop(0.7, '#e2e8f0');
      radGrad.addColorStop(0.95, '#cbd5e1');
      radGrad.addColorStop(1.0, '#94a3b8');
      ctx.fillStyle = radGrad;
      ctx.fillRect(0, 0, 512, 512);

      // Concentric machining / molded lip rings
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.4)';
      ctx.lineWidth = 2;
      [80, 140, 200, 240].forEach((r) => {
        ctx.beginPath();
        ctx.arc(256, 256, r, 0, Math.PI * 2);
        ctx.stroke();
      });
    }
    const tex = new THREE.CanvasTexture(canvas);
    return tex;
  }, []);

  // 5. Solar Panel Photovoltaic Cell Texture (Authentic 4x3 Monocrystalline Wafer Grid Matching Reference Photos)
  const solarCellTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // 1. Dark navy-blue backing sheet
      ctx.fillStyle = '#0a1628';
      ctx.fillRect(0, 0, 512, 512);

      // 2. 4 columns x 3 rows of monocrystalline solar wafer cells with chamfered wafer corners
      const cols = 4;
      const rows = 3;
      const marginX = 22;
      const marginY = 22;
      const gap = 10;
      const cellW = (512 - marginX * 2 - gap * (cols - 1)) / cols; // ~109px
      const cellH = (512 - marginY * 2 - gap * (rows - 1)) / rows; // ~149px
      const cornerCut = 14;

      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          const x = marginX + c * (cellW + gap);
          const y = marginY + r * (cellH + gap);

          // Solar wafer polygon with 45-degree chamfered corners (monocrystalline)
          ctx.beginPath();
          ctx.moveTo(x + cornerCut, y);
          ctx.lineTo(x + cellW - cornerCut, y);
          ctx.lineTo(x + cellW, y + cornerCut);
          ctx.lineTo(x + cellW, y + cellH - cornerCut);
          ctx.lineTo(x + cellW - cornerCut, y + cellH);
          ctx.lineTo(x + cornerCut, y + cellH);
          ctx.lineTo(x, y + cellH - cornerCut);
          ctx.lineTo(x, y + cornerCut);
          ctx.closePath();

          // Cell gradient: deep marine photovoltaic blue
          const grad = ctx.createLinearGradient(x, y, x + cellW, y + cellH);
          grad.addColorStop(0, '#1e3a5f');
          grad.addColorStop(0.4, '#172554');
          grad.addColorStop(1, '#0f172a');
          ctx.fillStyle = grad;
          ctx.fill();

          ctx.strokeStyle = '#2563eb';
          ctx.lineWidth = 1.5;
          ctx.stroke();

          // Silver vertical busbars through each cell
          ctx.strokeStyle = '#e2e8f0';
          ctx.lineWidth = 2.5;
          const bar1 = x + cellW * 0.33;
          const bar2 = x + cellW * 0.67;
          ctx.beginPath();
          ctx.moveTo(bar1, y);
          ctx.lineTo(bar1, y + cellH);
          ctx.moveTo(bar2, y);
          ctx.lineTo(bar2, y + cellH);
          ctx.stroke();

          // Micro grid contact lines (fingers)
          ctx.strokeStyle = 'rgba(226, 232, 240, 0.32)';
          ctx.lineWidth = 1;
          for (let gy = y + 8; gy < y + cellH; gy += 9) {
            ctx.beginPath();
            ctx.moveTo(x + 2, gy);
            ctx.lineTo(x + cellW - 2, gy);
            ctx.stroke();
          }
        }
      }

      // Outer silver bezel border
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 6;
      ctx.strokeRect(8, 8, 496, 496);
    }
    const tex = new THREE.CanvasTexture(canvas);
    return tex;
  }, []);

  // 6. R.M. YOUNG Precipitation / Meteorological Sensor Label Texture (Matching the black cylinder in photo!)
  const youngSensorTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Solid semi-matte black sensor body
      ctx.fillStyle = '#090d16';
      ctx.fillRect(0, 0, 512, 256);

      // In Three.js CylinderGeometry with rotation=[0, Math.PI, 0], U=0.5 (X=256) is front!
      const cx = 256;
      const cy = 138;

      // Bold white stenciled brand text: "YOUNG" (Matching visible "...UNG" in photo)
      ctx.fillStyle = '#f8fafc';
      ctx.font = '900 48px "Arial Black", "Trebuchet MS", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('YOUNG', cx, cy);

      // Sub-label: "METEOROLOGICAL SENSOR"
      ctx.font = 'bold 13px sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText('METEOROLOGICAL SENSOR', cx, cy + 30);
    }
    const tex = new THREE.CanvasTexture(canvas);
    return tex;
  }, []);

  // 4. Keel Counterweight Center of Gravity (CG) Marker Texture (Exact match to specification diagram)
  const cgCounterweightTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Base vibrant green matching the keel weight
      ctx.fillStyle = '#16a34a';
      ctx.fillRect(0, 0, 512, 256);

      // Centered on the front face (x = 256, y = 128)
      // "CG" in bold black
      ctx.font = 'bold 44px "Inter", "Segoe UI", sans-serif';
      ctx.fillStyle = '#0f172a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText('CG', 256, 115);

      // Blue Center of Gravity circular symbol
      ctx.beginPath();
      ctx.arc(256, 150, 26, 0, Math.PI * 2);
      ctx.fillStyle = '#0284c7';
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#f8fafc';
      ctx.stroke();

      // White crosshair inside the blue circle
      ctx.strokeStyle = '#f8fafc';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(256 - 18, 150);
      ctx.lineTo(256 + 18, 150);
      ctx.moveTo(256, 150 - 18);
      ctx.lineTo(256, 150 + 18);
      ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(canvas);
    return tex;
  }, []);

  useFrame((state, delta) => {
    if (groupRef.current && pivotRef.current) {
      const t = state.clock.elapsedTime;
      const dyn = dynamicsRef.current;

      // Hydrodynamic ocean swell field (identically aligned with OceanSurface.tsx)
      const speedScale = 7.5 / Math.max(3.5, wavePeriod);
      const macroEnvelope = 0.92 + 0.16 * Math.sin(dyn.x * 0.020 + dyn.z * 0.014) * Math.cos(dyn.x * 0.012 - dyn.z * 0.022);
      const baseAmp = Math.max(0.12, Math.min(0.68, waveHeight * 0.16)) * macroEnvelope;

      let waveElev = 0;
      let waveSlopeX = 0;
      let waveSlopeZ = 0;

      for (let i = 0; i < SWELL_COMPONENTS.length; i++) {
        const sw = SWELL_COMPONENTS[i];
        const k = (2 * Math.PI) / sw.wavelength;
        const omega = k * sw.speed * speedScale;

        const pTrans = sw.perpX * dyn.x + sw.perpZ * dyn.z;
        const curveMod = 0.20 * Math.sin(k * 0.25 * pTrans + 1.1);
        const phase = k * (sw.dirX * dyn.x + sw.dirZ * dyn.z + curveMod) - omega * t;

        const s = Math.sin(phase);
        const c = Math.cos(phase);

        const amp = baseAmp * sw.weight;
        waveElev += amp * s;

        const dCurveDx = 0.20 * k * 0.25 * sw.perpX * Math.cos(k * 0.25 * pTrans + 1.1);
        const dCurveDz = 0.20 * k * 0.25 * sw.perpZ * Math.cos(k * 0.25 * pTrans + 1.1);

        const dSlope = amp * k * c;
        waveSlopeX -= (sw.dirX + dCurveDx) * dSlope;
        waveSlopeZ -= (sw.dirZ + dCurveDz) * dSlope;
      }

      // Physical target displacements directly driven by the local wave surface
      // nominalFloatY (0.26m) provides realistic reserve buoyancy so the yellow freeboard band and deck ride cleanly above the waves
      const targetHeave = nominalFloatY + waveElev;
      // Deck normal naturally aligns with the wave slopes (keel righting moment slightly reduces max tilt)
      const targetPitch = -waveSlopeZ * 0.85;
      const targetRoll = waveSlopeX * 0.85;

      // Gentle horizontal wave orbital surge/sway ellipse constrained by catenary restoring stiffness
      const targetSurge = -waveSlopeX * 0.40;
      const targetSway = -waveSlopeZ * 0.40;
      const targetPosX = targetX + targetSurge;
      const targetPosZ = targetZ + targetSway;

      // Clamped delta timestep prevents jumps on tab switch / lag spikes
      const dt = Math.min(delta, 0.045);

      // 1. Heave Dynamics: High waterplane buoyancy restoring stiffness + hydrodynamic radiation damping
      const omegaY = 2.8;
      const zetaY = 0.72;
      const aY = omegaY * omegaY * (targetHeave - dyn.y) - 2.0 * zetaY * omegaY * dyn.vy;
      dyn.vy += aY * dt;
      dyn.y += dyn.vy * dt;

      // 2. Pitch Dynamics: Water-plane metacentric restoring moment + pitch damping (NO CLAMPING!)
      const omegaP = 2.1;
      const zetaP = 0.75;
      const aP = omegaP * omegaP * (targetPitch - dyn.pitch) - 2.0 * zetaP * omegaP * dyn.vPitch;
      dyn.vPitch += aP * dt;
      dyn.pitch += dyn.vPitch * dt;

      // 3. Roll Dynamics: Water-plane metacentric restoring moment + roll damping (NO CLAMPING!)
      const omegaR = 2.1;
      const zetaR = 0.75;
      const aR = omegaR * omegaR * (targetRoll - dyn.roll) - 2.0 * zetaR * omegaR * dyn.vRoll;
      dyn.vRoll += aR * dt;
      dyn.roll += dyn.vRoll * dt;

      // 4. Horizontal Surge/Sway Dynamics: Catenary mooring restoring tension + hull drag
      const omegaH = 0.85;
      const zetaH = 0.85;
      const aX = omegaH * omegaH * (targetPosX - dyn.x) - 2.0 * zetaH * omegaH * dyn.vx;
      dyn.vx += aX * dt;
      dyn.x += dyn.vx * dt;

      const aZ = omegaH * omegaH * (targetPosZ - dyn.z) - 2.0 * zetaH * omegaH * dyn.vz;
      dyn.vz += aZ * dt;
      dyn.z += dyn.vz * dt;

      // Apply smooth, continuous position and rotation
      groupRef.current.position.set(dyn.x, dyn.y, dyn.z);
      pivotRef.current.rotation.set(dyn.pitch, 0, dyn.roll);

      // Continuously update shared live motion ref for zero-gap mooring connection
      if (liveMotionRef?.current) {
        liveMotionRef.current.position.set(dyn.x, dyn.y, dyn.z);
        liveMotionRef.current.rotation.set(dyn.pitch, 0, dyn.roll);
        // Keel mooring eye is at local Y = -1.95m
        liveMotionRef.current.keelPosition.set(dyn.x, dyn.y - 1.95, dyn.z);
      }
    }

    // Flash masthead navigation beacon strobe light
    if (strobeLightRef.current) {
      const flash = Math.sin(state.clock.elapsedTime * 6.28) > 0.65 ? 2.5 : 0.05;
      strobeLightRef.current.intensity = flash;
    }

    // Spin 3-cup anemometer continuously in ocean wind
    if (anemometerRef.current) {
      const spinSpeed = Math.max(0.04, windSpeed * 0.012 + 0.04);
      anemometerRef.current.rotation.y += spinSpeed;
    }
  });

  // ── Solar Panel Coordinates & Sloping Conical Deck Angle ──
  // Conical deck rises from R=1.18m at Y=0.22m to R=0.58m at Y=0.44m (DeltaY = 0.22m, DeltaR = 0.60m)
  const DECK_SLOPE_ALPHA = Math.atan(0.22 / 0.60); // ~0.351 rad (20.1°)
  const solarPanels = useMemo(() => {
    const radius = 0.86;
    const yDeck = 0.337; // Exact surface height of conical deck at R=0.86m
    // Exactly opposite pairs at 4 cardinal directions when looking from above:
    // Bottom (+Z), Right (+X), Top (-Z), Left (-X)
    const panels = [
      { name: 'bottom', angle: 0 },
      { name: 'right', angle: Math.PI / 2 },
      { name: 'top', angle: Math.PI },
      { name: 'left', angle: -Math.PI / 2 },
    ];
    return panels.map(({ name, angle }) => ({
      name,
      x: Math.sin(angle) * radius,
      y: yDeck,
      z: Math.cos(angle) * radius,
      rotY: angle,
    }));
  }, []);

  return (
    <group ref={groupRef} position={[0, 0, 0]}>
      {/* Keel-Pivoted Dynamic Wave Motion Group (Keel attachment at local Y = -1.95m remains steady) */}
      <group ref={pivotRef} position={[0, -1.95, 0]}>
        <group position={[0, 1.95, 0]}>
          {/* ══════════════════════════════════════════════════════════════════
              1. 2.4m FLOTATION HULL (EXACT MATCH TO SPECIFICATION DIAGRAM)
              - 2400mm Outer Diameter (R = 1.20m)
              - 528mm Yellow Freeboard Band with TWO Horizontal Black Rubber Fender Rings
              - 372mm Dark Navy-Blue / Charcoal Inward-Tapering Conical Chine
              - Heavy Stainless Steel / Galvanized Base Clamping Flange Ring
              - 4 Rectangular Photovoltaic Solar Panels in Cardinal Directions
              - Paired Bronze Lifting Arches beside the Front Solar Panel
              ══════════════════════════════════════════════════════════════════ */}
          <group position={[0, 0, 0]}>
            {/* Sloping Conical Upper Deck (From R=1.18m at Y=0.22m to R=0.58m at Y=0.44m) */}
            <mesh position={[0, 0.33, 0]} receiveShadow>
              <cylinderGeometry args={[0.58, 1.18, 0.22, 64]} />
              <meshStandardMaterial
                color="#eab308"
                roughness={0.35}
                metalness={0.08}
              />
            </mesh>

            {/* ── 528mm MARITIME YELLOW FREEBOARD BAND (From Y=0.22m down to Y=-0.308m, D=2400mm) ── */}
            <mesh position={[0, -0.044, 0]} castShadow receiveShadow>
              <cylinderGeometry args={[1.18, 1.18, 0.528, 64]} />
              <meshStandardMaterial color="#eab308" roughness={0.35} metalness={0.08} />
            </mesh>

            {/* ── DOUBLE HORIZONTAL BLACK RUBBER FENDER BUMPER RINGS (Matching Reference Diagram) ── */}
            {/* 1. Upper Black Rubber Fender Ring (at Y = +0.12m) */}
            <mesh position={[0, 0.12, 0]} rotation={[-Math.PI / 2, 0, 0]} castShadow receiveShadow>
              <torusGeometry args={[1.215, 0.055, 20, 64]} />
              <meshStandardMaterial color="#0f172a" roughness={0.82} metalness={0.05} />
            </mesh>

            {/* 2. Lower Black Rubber Fender Ring (at Y = -0.16m) */}
            <mesh position={[0, -0.16, 0]} rotation={[-Math.PI / 2, 0, 0]} castShadow receiveShadow>
              <torusGeometry args={[1.215, 0.055, 20, 64]} />
              <meshStandardMaterial color="#0f172a" roughness={0.82} metalness={0.05} />
            </mesh>

            {/* Recessed Bumper Mounting Stud Sockets around Both Fender Rings */}
            {Array.from({ length: 16 }).map((_, idx) => {
              const ang = (idx * Math.PI * 2) / 16;
              const x = Math.sin(ang) * 1.265;
              const z = Math.cos(ang) * 1.265;
              return (
                <group key={`bumper-studs-${idx}`}>
                  <mesh position={[x, 0.12, z]} rotation={[0, -ang, 0]}>
                    <cylinderGeometry args={[0.010, 0.010, 0.024, 8]} />
                    <meshStandardMaterial color="#020617" roughness={0.92} />
                  </mesh>
                  <mesh position={[x, -0.16, z]} rotation={[0, -ang, 0]}>
                    <cylinderGeometry args={[0.010, 0.010, 0.024, 8]} />
                    <meshStandardMaterial color="#020617" roughness={0.92} />
                  </mesh>
                </group>
              );
            })}

            {/* ── 372mm DARK NAVY-BLUE INWARD-TAPERING CHINE SECTION (From Y=-0.308m down to Y=-0.680m) ── */}
            {/* Upper Dark Cylindrical Collar Band immediately below freeboard (Height = 0.072m) */}
            <mesh position={[0, -0.344, 0]} receiveShadow>
              <cylinderGeometry args={[1.18, 1.18, 0.072, 64]} />
              <meshStandardMaterial color="#0f172a" roughness={0.45} metalness={0.15} />
            </mesh>

            {/* Inward-Tapering Dark Navy-Blue Conical Chine (From R=1.18m to R=0.52m, Height = 0.300m) */}
            <mesh position={[0, -0.530, 0]} receiveShadow>
              <cylinderGeometry args={[1.18, 0.52, 0.300, 64]} />
              <meshStandardMaterial color="#172554" roughness={0.42} metalness={0.12} />
            </mesh>

            {/* Heavy Stainless Steel / Galvanized Hull Base Clamping Ring at base of chine */}
            <mesh position={[0, -0.680, 0]} castShadow>
              <cylinderGeometry args={[0.53, 0.53, 0.040, 48]} />
              <meshStandardMaterial color="#cbd5e1" metalness={0.88} roughness={0.25} />
            </mesh>
            {/* Clamping Flange Fastener Studs */}
            {Array.from({ length: 8 }).map((_, idx) => {
              const ang = (idx * Math.PI * 2) / 8;
              return (
                <mesh
                  key={`clamp-stud-${idx}`}
                  position={[Math.sin(ang) * 0.54, -0.680, Math.cos(ang) * 0.54]}
                >
                  <cylinderGeometry args={[0.010, 0.010, 0.05, 8]} />
                  <meshStandardMaterial color="#475569" metalness={0.9} roughness={0.3} />
                </mesh>
              );
            })}

        {/* ── 4 RECTANGULAR SOLAR PANELS FIXED DIRECTLY ON SLOPING HULL DECK ── */}
        {solarPanels.map((sp, idx) => (
          <group
            key={`solar-panel-${idx}`}
            position={[sp.x, sp.y, sp.z]}
            rotation={[0, sp.rotY, 0]}
          >
            {/* Tilted along the conical deck slope: +DECK_SLOPE_ALPHA tilts outer edge down */}
            <group rotation={[DECK_SLOPE_ALPHA, 0, 0]}>
              {/* Molded Yellow Seating Recess / Pad in Hull Body (Zero Floating Gap) */}
              <mesh position={[0, -0.003, 0]}>
                <boxGeometry args={[0.44, 0.022, 0.54]} />
                <meshStandardMaterial color="#eab308" roughness={0.35} metalness={0.08} />
              </mesh>

              {/* Silver Anodized Aluminum Panel Frame */}
              <mesh position={[0, 0.012, 0]} castShadow receiveShadow>
                <boxGeometry args={[0.42, 0.024, 0.52]} />
                <meshStandardMaterial color="#cbd5e1" metalness={0.88} roughness={0.22} />
              </mesh>

              {/* Photovoltaic Silicon Cell Face (Lies 100% Flat on Top of Frame) */}
              <mesh position={[0, 0.0245, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                <planeGeometry args={[0.38, 0.48]} />
                <meshStandardMaterial
                  map={solarCellTexture}
                  roughness={0.25}
                  metalness={0.7}
                />
              </mesh>

              {/* 4 Black Corner Mounting Clamps Holding Panel to Hull Body (Matching Reference Photo) */}
              {[
                [-0.19, -0.23],
                [0.19, -0.23],
                [-0.19, 0.23],
                [0.19, 0.23],
              ].map(([cx, cz], cidx) => (
                <group key={`clamp-${cidx}`} position={[cx, 0.014, cz]}>
                  <mesh castShadow>
                    <boxGeometry args={[0.036, 0.022, 0.036]} />
                    <meshStandardMaterial color="#0f172a" roughness={0.85} />
                  </mesh>
                  <mesh position={[0, 0.013, 0]} castShadow>
                    <cylinderGeometry args={[0.007, 0.007, 0.012, 8]} />
                    <meshStandardMaterial color="#cbd5e1" metalness={0.9} roughness={0.2} />
                  </mesh>
                </group>
              ))}
            </group>
          </group>
        ))}

        {/* ── PAIRED BRONZE LIFTING ARCHES ON DECK (Matching Reference Photos beside Front Panel) ── */}
        <group position={[0.55, 0.324, 0.55]} rotation={[0, Math.PI / 4, 0]}>
          <group rotation={[DECK_SLOPE_ALPHA, 0, 0]}>
            {/* Base mounting pad plate */}
            <mesh position={[0, 0.008, 0]}>
              <boxGeometry args={[0.16, 0.016, 0.09]} />
              <meshStandardMaterial color="#78350f" roughness={0.4} metalness={0.7} />
            </mesh>
            {/* Two Arched Lifting Loops side by side */}
            <mesh position={[-0.045, 0.046, 0]} castShadow>
              <torusGeometry args={[0.042, 0.012, 10, 16, Math.PI]} />
              <meshStandardMaterial color="#b45309" metalness={0.8} roughness={0.3} />
            </mesh>
            <mesh position={[0.045, 0.046, 0]} castShadow>
              <torusGeometry args={[0.042, 0.012, 10, 16, Math.PI]} />
              <meshStandardMaterial color="#b45309" metalness={0.8} roughness={0.3} />
            </mesh>
          </group>
        </group>
      </group>

      {/* ══════════════════════════════════════════════════════════════════
          2. CENTRAL CYLINDRICAL EQUIPMENT HOUSING (EXACT MATCH TO REFERENCE IMAGES)
          - Centered at [0, Y, 0] in the middle of the buoy
          - Pure Maritime Yellow Gelcoat / Polyurethane (No boards, signs, text, or logos)
          - Main Yellow Vertical Cylinder Body (R = 0.58m, from Y = 0.44m to Y = 0.945m)
          - Smooth Flat Circular Yellow Top Lid (R = 0.59m at Y = 0.945m)
          - Base transition collar at deck junction (Y = 0.445m)
          - Molded shoulder turret boss at [0.54, Y, 0.18] encloses mast socket
            so mast emerges cleanly from top surface matching reference images
          ══════════════════════════════════════════════════════════════════ */}
      <group position={[0, 0, 0]}>
        {/* Main Yellow Cylinder Body */}
        <mesh position={[0, 0.6925, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.58, 0.58, 0.505, 64]} />
          <meshStandardMaterial color="#eab308" roughness={0.35} metalness={0.08} />
        </mesh>

        {/* Base Junction Transition Ring where Cylinder meets Sloping Deck */}
        <mesh position={[0, 0.445, 0]}>
          <cylinderGeometry args={[0.595, 0.60, 0.02, 64]} />
          <meshStandardMaterial color="#ca8a04" roughness={0.4} metalness={0.1} />
        </mesh>

        {/* Clean Flat Circular Yellow Top Lid */}
        <mesh position={[0, 0.945, 0]} receiveShadow>
          <cylinderGeometry args={[0.59, 0.59, 0.03, 64]} />
          <meshStandardMaterial color="#facc15" roughness={0.32} metalness={0.08} />
        </mesh>

        {/* Molded Mast Shoulder Column Boss on Right Side (Matching Reference Photos) */}
        <group position={[0.54, 0, 0.18]}>
          {/* Yellow Shoulder Column body up to lid height */}
          <mesh position={[0, 0.6925, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.11, 0.11, 0.505, 32]} />
            <meshStandardMaterial color="#eab308" roughness={0.35} metalness={0.08} />
          </mesh>
          {/* Top Shoulder Lid Plate */}
          <mesh position={[0, 0.945, 0]}>
            <cylinderGeometry args={[0.115, 0.115, 0.03, 32]} />
            <meshStandardMaterial color="#facc15" roughness={0.32} metalness={0.08} />
          </mesh>
          {/* Raised Circular Mast Base Socket Collar where the white mast emerges */}
          <mesh position={[0, 0.965, 0]} castShadow>
            <cylinderGeometry args={[0.075, 0.082, 0.03, 24]} />
            <meshStandardMaterial color="#eab308" roughness={0.35} metalness={0.1} />
          </mesh>
        </group>
      </group>

      {/* ══════════════════════════════════════════════════════════════════
          3. SINGLE TALL WHITE MAST (MOUNTED ON DECK, OFF-CENTER)
          (EXACT MATCH TO IMAGES 2, 3, 4)
          - Rises vertically from the deck at [X=0.54, Z=0.18], beside the central cylinder
          - Bolted Flanged Base Plate on the yellow deck
          - Tall White Steel Cylindrical Mast Pipe rising to Y = 2.45m
          - Upper Black Transition Section & V-Strut Mounting Bracket
          ══════════════════════════════════════════════════════════════════ */}
      <group position={[0.54, 0, 0.18]}>
        {/* Bolted Base Flange on Deck */}
        <mesh position={[0, 0.25, 0]} castShadow>
          <cylinderGeometry args={[0.09, 0.11, 0.05, 20]} />
          <meshStandardMaterial color="#cbd5e1" metalness={0.88} roughness={0.25} />
        </mesh>

        {/* Tall White Cylindrical Steel Mast Pipe (From Y=0.27 to Y=2.15, length 1.88m) */}
        <mesh position={[0, 1.21, 0]} castShadow>
          <cylinderGeometry args={[0.045, 0.050, 1.88, 24]} />
          <meshStandardMaterial color="#f8fafc" roughness={0.2} metalness={0.15} />
        </mesh>

        {/* Upper Black Mast Collar / Sleeve (From Y=2.15 to Y=2.45, length 0.30m) */}
        <mesh position={[0, 2.30, 0]} castShadow>
          <cylinderGeometry args={[0.046, 0.046, 0.30, 20]} />
          <meshStandardMaterial color="#090d16" roughness={0.4} metalness={0.7} />
        </mesh>

        {/* Sensor Cable Conduit Tube (Continuous from Deck Flange Y=0.25 to Collar Y=2.15) */}
        <mesh position={[0, 1.20, -0.054]} castShadow>
          <cylinderGeometry args={[0.011, 0.011, 1.90, 12]} />
          <meshStandardMaterial color="#090d16" roughness={0.7} metalness={0.5} />
        </mesh>
        {/* Conduit Clamping Saddles securing tube cleanly to mast */}
        {[0.65, 1.20, 1.75].map((sy, i) => (
          <mesh key={`saddle-${i}`} position={[0, sy, -0.052]}>
            <boxGeometry args={[0.032, 0.024, 0.018]} />
            <meshStandardMaterial color="#475569" metalness={0.9} roughness={0.25} />
          </mesh>
        ))}

        {/* ══════════════════════════════════════════════════════════════════
            MASTHEAD SENSOR GUARD RING ASSEMBLY (At Y = 2.45, EXACT MATCH TO PHOTO)
            - Heavy Bolted Split Clamp Collar on Mast Pipe
            - Authentic Structural V-Strut Truss Bracing below Ring
            - Horizontal Circular Black Tubular Protection Guard Ring
            - Left Perforated Channel Bracket with Machined Lightening Holes
            - Center: Sailor Inmarsat Satellite Antenna Radome on Pedestal
            - Left: 11-Plate Aerated Radiation Shield & Rigid Vertical Anemometer
            - Right: Marine Navigation Beacon Lantern with Fluted Fresnel Lens
            - Right-Front: Tall Optical / Precipitation Cylinder Sensor with Hood
            ══════════════════════════════════════════════════════════════════ */}
        <group position={[0, 2.45, 0]}>
          {/* 1. Bolted Split Clamp Collar on Mast Pipe (Origin of V-Struts, Y = -0.26) */}
          <group position={[0, -0.26, 0]}>
            <mesh castShadow>
              <cylinderGeometry args={[0.052, 0.052, 0.08, 20]} />
              <meshStandardMaterial color="#090d16" roughness={0.5} metalness={0.7} />
            </mesh>
            {/* Clamping Hex Bolt Flanges */}
            <mesh position={[0.055, 0, 0]} castShadow>
              <boxGeometry args={[0.025, 0.06, 0.04]} />
              <meshStandardMaterial color="#475569" metalness={0.9} roughness={0.25} />
            </mesh>
            <mesh position={[-0.055, 0, 0]} castShadow>
              <boxGeometry args={[0.025, 0.06, 0.04]} />
              <meshStandardMaterial color="#475569" metalness={0.9} roughness={0.25} />
            </mesh>
          </group>

          {/* 2. Central Vertical Mast Pipe from Clamp Collar to Antenna Base */}
          <mesh position={[0, -0.13, 0]} castShadow>
            <cylinderGeometry args={[0.046, 0.046, 0.26, 24]} />
            <meshStandardMaterial color="#090d16" roughness={0.45} metalness={0.7} />
          </mesh>

          {/* 3. Authentic Structural V-Struts Bracing the Ring (Trident "\ | /" Truss Matching Photo!) */}
          {/* Left Diagonal Strut: Connects from Clamp Collar [-0.046, -0.26, 0] up to Left Channel [-0.20, 0.005, 0] */}
          <ConnectingStrut
            from={[-0.046, -0.26, 0.0]}
            to={[-0.20, 0.005, 0.0]}
            radius={0.015}
          />
          {/* Right Diagonal Strut: Connects from Clamp Collar [0.046, -0.26, 0.02] up to Right-Front Sensor Bracket [0.16, 0.005, 0.14] */}
          <ConnectingStrut
            from={[0.046, -0.26, 0.02]}
            to={[0.16, 0.005, 0.14]}
            radius={0.015}
          />

          {/* 4. Horizontal Black Circular Tubular Guard Ring (Parallel to Sea/Deck) */}
          <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} castShadow receiveShadow>
            <torusGeometry args={[0.40, 0.019, 16, 48]} />
            <meshStandardMaterial color="#090d16" roughness={0.45} metalness={0.7} />
          </mesh>

          {/* 5. Horizontal Guard Ring Structural Bracing Arms (Rigid 4-Quadrant Frame) */}
          {/* Left Channel Bracket extending from mast [X=0] to Ring [X=-0.40] with Punched Lightening Holes */}
          <group position={[-0.20, 0.01, 0]}>
            <mesh castShadow receiveShadow>
              <boxGeometry args={[0.40, 0.016, 0.075]} />
              <meshStandardMaterial color="#090d16" roughness={0.45} metalness={0.7} />
            </mesh>
            {/* 3 Circular Punched Lightening Holes with Metallic Bevel Rims */}
            {[-0.10, 0.0, 0.10].map((hx, idx) => (
              <group key={`hole-${idx}`} position={[hx, 0.009, 0]}>
                <mesh>
                  <cylinderGeometry args={[0.016, 0.016, 0.022, 16]} />
                  <meshStandardMaterial color="#020617" roughness={0.95} />
                </mesh>
                <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
                  <ringGeometry args={[0.015, 0.018, 16]} />
                  <meshStandardMaterial color="#64748b" metalness={0.8} roughness={0.3} />
                </mesh>
              </group>
            ))}
          </group>

          {/* Right Bracket Arm extending from mast [X=0] to Ring [X=+0.40] */}
          <mesh position={[0.20, 0.01, -0.01]} castShadow>
            <boxGeometry args={[0.40, 0.016, 0.065]} />
            <meshStandardMaterial color="#090d16" roughness={0.45} metalness={0.7} />
          </mesh>

          {/* Rear Radial Support Arm extending from mast [Z=0] to Ring [Z=-0.40] */}
          <mesh position={[0, 0.01, -0.20]} castShadow>
            <boxGeometry args={[0.05, 0.016, 0.40]} />
            <meshStandardMaterial color="#090d16" roughness={0.45} metalness={0.7} />
          </mesh>

          {/* Right-Front Sensor Mounting Arm (Holding YOUNG sensor & bracing front ring) */}
          <mesh position={[0.10, 0.01, 0.14]} rotation={[0, -0.65, 0]} castShadow>
            <boxGeometry args={[0.26, 0.016, 0.055]} />
            <meshStandardMaterial color="#090d16" roughness={0.45} metalness={0.7} />
          </mesh>

          {/* ══════════════════════════════════════════════════════════════════
              CENTER ANTENNA: SAILOR INMARSAT SATELLITE RADOME (EXACT MATCH TO PHOTO)
              - Sits directly on top of the central post at the guard ring plane
              - Flared Underside Pedestal Collar expanding to Saucer Diameter
              - Weathered Off-White / Silver Saucer Dish with Rubber Perimeter Gasket
              - Aerodynamic Conical Bullet Radome Body with Rounded Top Dome Cap
              - Forward-Facing "SAILOR Thrane & Thrane" Badge & Warning Triangle
              ══════════════════════════════════════════════════════════════════ */}
          <group position={[0, 0.0, 0]}>
            {/* Flared Dark Underside Pedestal Collar */}
            <mesh position={[0, 0.020, 0]} castShadow>
              <cylinderGeometry args={[0.135, 0.046, 0.040, 32]} />
              <meshStandardMaterial color="#090d16" roughness={0.45} metalness={0.7} />
            </mesh>
            {/* Dark Rubber Equatorial Gasket Rim Ring (Aligned with Guard Ring) */}
            <mesh position={[0, 0.038, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.135, 0.012, 10, 36]} />
              <meshStandardMaterial color="#0f172a" roughness={0.85} />
            </mesh>
            {/* Weathered Off-White / Silver Saucer Dish Upper Surface */}
            <mesh position={[0, 0.048, 0]} castShadow>
              <cylinderGeometry args={[0.100, 0.135, 0.020, 32]} />
              <meshStandardMaterial
                map={sailorDishTexture}
                roughness={0.35}
                metalness={0.2}
              />
            </mesh>
            {/* White Conical Bullet Radome Body with Forward-Facing Decals */}
            <mesh position={[0, 0.143, 0]} rotation={[0, Math.PI, 0]} castShadow>
              <cylinderGeometry args={[0.044, 0.100, 0.170, 36]} />
              <meshStandardMaterial
                map={sailorDomeTexture}
                roughness={0.22}
                metalness={0.08}
              />
            </mesh>
            {/* Rounded Radome Dome Top Cap */}
            <mesh position={[0, 0.228, 0]} castShadow>
              <sphereGeometry args={[0.044, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
              <meshStandardMaterial color="#f8fafc" roughness={0.22} metalness={0.08} />
            </mesh>
          </group>

          {/* ══════════════════════════════════════════════════════════════════
              LEFT: 11-PLATE RADIATION SHIELD & RIGID ANEMOMETER (MATCHING PHOTO)
              - 11 Aerated Conical Saucer Plates on Stainless Standoff Bolt
              - Anemometer securely clamped behind shield with rigid vertical shaft
              - Perfectly horizontal 3-cup rotor with tangential aerodynamic cups
              - Stationary transducer housing body & wind vane (non-spinning)
              ══════════════════════════════════════════════════════════════════ */}
          {/* Radiation Shield Assembly on Left Channel Bracket */}
          <group position={[-0.30, 0.01, 0.0]}>
            {/* Stainless Metallic Threaded Mounting Riser Bolt */}
            <mesh position={[0, 0.025, 0]} castShadow>
              <cylinderGeometry args={[0.014, 0.014, 0.05, 12]} />
              <meshStandardMaterial color="#94a3b8" metalness={0.92} roughness={0.2} />
            </mesh>
            {/* Shield Base Mounting Collar */}
            <mesh position={[0, 0.055, 0]} castShadow>
              <cylinderGeometry args={[0.035, 0.035, 0.02, 16]} />
              <meshStandardMaterial color="#f1f5f9" roughness={0.3} />
            </mesh>
            {/* 11 Stacked Aerated Conical Radiation Shield Plates */}
            {Array.from({ length: 11 }).map((_, i) => (
              <mesh key={`plate-${i}`} position={[0, 0.07 + i * 0.022, 0]} castShadow>
                <cylinderGeometry args={[0.058, 0.070, 0.010, 24]} />
                <meshStandardMaterial color="#e2e8f0" roughness={0.3} />
              </mesh>
            ))}
            {/* Rounded Mushroom Dome Cap on Shield Top */}
            <mesh position={[0, 0.315, 0]} castShadow>
              <sphereGeometry args={[0.066, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
              <meshStandardMaterial color="#f1f5f9" roughness={0.3} />
            </mesh>
          </group>

          {/* Anemometer Sensor Assembly Mounted Behind Radiation Shield */}
          <group position={[-0.30, 0.01, -0.16]}>
            {/* Horizontal Mounting Bracket Arm connecting from channel to shaft base */}
            <mesh position={[0, 0.008, 0.08]} castShadow>
              <boxGeometry args={[0.035, 0.016, 0.16]} />
              <meshStandardMaterial color="#090d16" roughness={0.45} metalness={0.7} />
            </mesh>
            {/* Bolted Shaft Clamp Collar at Base */}
            <mesh position={[0, 0.018, 0]} castShadow>
              <cylinderGeometry args={[0.020, 0.020, 0.036, 16]} />
              <meshStandardMaterial color="#090d16" roughness={0.45} metalness={0.7} />
            </mesh>
            <mesh position={[0.022, 0.018, 0]} castShadow>
              <boxGeometry args={[0.015, 0.028, 0.022]} />
              <meshStandardMaterial color="#475569" metalness={0.9} roughness={0.25} />
            </mesh>

            {/* Straight Vertical Anemometer Support Shaft (Diameter 18mm, Height 0.34m) */}
            <mesh position={[0, 0.19, 0]} castShadow>
              <cylinderGeometry args={[0.009, 0.009, 0.34, 16]} />
              <meshStandardMaterial color="#090d16" roughness={0.35} metalness={0.7} />
            </mesh>

            {/* Stationary Sensor Transducer Housing Body (From Y=0.36 to Y=0.43) */}
            <mesh position={[0, 0.395, 0]} castShadow>
              <cylinderGeometry args={[0.016, 0.016, 0.07, 20]} />
              <meshStandardMaterial color="#090d16" roughness={0.35} metalness={0.7} />
            </mesh>
            <mesh position={[0, 0.435, 0]} castShadow>
              <cylinderGeometry args={[0.011, 0.011, 0.02, 16]} />
              <meshStandardMaterial color="#cbd5e1" metalness={0.92} roughness={0.2} />
            </mesh>

            {/* Directional Wind Vane (Stationary on housing, oriented in ambient wind +Z) */}
            <group position={[0, 0.385, 0]}>
              {/* Vane Counterweight Nose pointing Upwind (+Z) */}
              <mesh position={[0, 0, 0.032]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.005, 0.005, 0.035, 12]} />
                <meshStandardMaterial color="#090d16" roughness={0.4} />
              </mesh>
              <mesh position={[0, 0, 0.050]}>
                <sphereGeometry args={[0.007, 10, 10]} />
                <meshStandardMaterial color="#090d16" />
              </mesh>
              {/* Vane Boom pointing Downwind (-Z) */}
              <mesh position={[0, 0, -0.040]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.003, 0.003, 0.065, 8]} />
                <meshStandardMaterial color="#090d16" />
              </mesh>
              {/* Aerodynamic Vertical Tail Fin */}
              <mesh position={[0, 0.012, -0.070]}>
                <boxGeometry args={[0.002, 0.048, 0.055]} />
                <meshStandardMaterial color="#090d16" roughness={0.4} />
              </mesh>
            </group>

            {/* 3-Cup Rotor Assembly (Spins smoothly around vertical Y-axis) */}
            <group ref={anemometerRef} position={[0, 0.450, 0]}>
              {/* Aerodynamic Conical Rotor Hub Cap */}
              <mesh position={[0, 0.008, 0]}>
                <cylinderGeometry args={[0.008, 0.015, 0.016, 20]} />
                <meshStandardMaterial color="#090d16" roughness={0.35} metalness={0.6} />
              </mesh>
              <mesh position={[0, 0.016, 0]}>
                <sphereGeometry args={[0.008, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
                <meshStandardMaterial color="#090d16" roughness={0.35} metalness={0.6} />
              </mesh>

              {/* 3 Symmetrical Horizontal Radial Arms with Tangential Conical Cups */}
              {[0, (2 * Math.PI) / 3, (4 * Math.PI) / 3].map((angle, idx) => (
                <group key={`cup-arm-${idx}`} rotation={[0, angle, 0]}>
                  {/* Horizontal Radial Spoke Rod (Along +X, Length 0.065m) */}
                  <mesh position={[0.0325, 0.004, 0]} rotation={[0, 0, Math.PI / 2]}>
                    <cylinderGeometry args={[0.0022, 0.0022, 0.065, 8]} />
                    <meshStandardMaterial color="#090d16" roughness={0.4} metalness={0.7} />
                  </mesh>
                  {/* Hemispherical Cup at Tip of Arm (Mouth opens tangentially toward +Z) */}
                  <mesh position={[0.065, 0.004, 0]} rotation={[Math.PI / 2, 0, 0]}>
                    <sphereGeometry args={[0.016, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
                    <meshStandardMaterial
                      color="#090d16"
                      roughness={0.35}
                      metalness={0.5}
                      side={THREE.DoubleSide}
                    />
                  </mesh>
                </group>
              ))}
            </group>
          </group>

          {/* ══════════════════════════════════════════════════════════════════
              RIGHT: MARINE NAVIGATION BEACON LANTERN (MATCHING PHOTO)
              - Dark Bronze Pedestal Base on Right Ring Shelf
              - Clear/Amber Cylindrical Fresnel Lens with Horizontal Ridges
              - Rounded Glass Dome Top & Flashing Amber Strobe Light
              ══════════════════════════════════════════════════════════════════ */}
          <group position={[0.34, 0.01, -0.02]}>
            {/* Bronze/Brass Base Flange */}
            <mesh position={[0, 0.02, 0]} castShadow>
              <cylinderGeometry args={[0.065, 0.075, 0.035, 20]} />
              <meshStandardMaterial color="#78350f" roughness={0.4} metalness={0.7} />
            </mesh>
            {/* Clear Cylindrical Fresnel Lens with Fluted Ridges */}
            <mesh position={[0, 0.085, 0]} castShadow>
              <cylinderGeometry args={[0.052, 0.052, 0.10, 24]} />
              <meshStandardMaterial
                color="#fef08a"
                emissive="#f59e0b"
                emissiveIntensity={0.8}
                roughness={0.1}
                transparent
                opacity={0.88}
              />
            </mesh>
            {/* Horizontal Optical Ridge Rings on Fresnel Lens */}
            {[0.05, 0.075, 0.10, 0.12].map((ry, i) => (
              <mesh key={`fresnel-ring-${i}`} position={[0, ry, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <torusGeometry args={[0.053, 0.003, 6, 24]} />
                <meshStandardMaterial color="#fde047" emissive="#f59e0b" emissiveIntensity={0.5} transparent opacity={0.9} />
              </mesh>
            ))}
            {/* Rounded Glass Dome Top Cap */}
            <mesh position={[0, 0.138, 0]}>
              <sphereGeometry args={[0.052, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
              <meshStandardMaterial
                color="#fde047"
                emissive="#f59e0b"
                emissiveIntensity={0.6}
                roughness={0.12}
                transparent
                opacity={0.85}
              />
            </mesh>
            {/* Flashing Amber Navigation Point Light */}
            <pointLight
              ref={strobeLightRef}
              color="#fef08a"
              distance={16}
              decay={2}
              intensity={0.8}
            />
          </group>

          {/* ══════════════════════════════════════════════════════════════════
              RIGHT-FRONT: TALL OPTICAL / PRECIPITATION SENSOR (MATCHING PHOTO)
              - Prominent Vertical Cylinder in Right Foreground
              - Lower Black Base Mounting Sleeve clamped to Bracket
              - Middle Clean White Cylindrical Spacer Band
              - Upper Black Sensor Tube with Stenciled "YOUNG" Brand
              - Top Flared Cowl / Hood with Hollow Aperture Recess
              ══════════════════════════════════════════════════════════════════ */}
          <group position={[0.18, 0.0, 0.22]}>
            {/* Lower Black Mounting Sleeve extending below ring */}
            <mesh position={[0, -0.05, 0]} castShadow>
              <cylinderGeometry args={[0.050, 0.050, 0.12, 20]} />
              <meshStandardMaterial color="#090d16" roughness={0.5} metalness={0.7} />
            </mesh>
            {/* Clamping Collar Bracket to Mast Frame */}
            <mesh position={[-0.045, -0.04, 0]} rotation={[0, 0, 0.4]}>
              <boxGeometry args={[0.04, 0.05, 0.04]} />
              <meshStandardMaterial color="#090d16" metalness={0.8} />
            </mesh>
            {/* Middle Clean White Cylindrical Spacer Band (Contrasting collar in photo) */}
            <mesh position={[0, 0.038, 0]}>
              <cylinderGeometry args={[0.048, 0.048, 0.055, 20]} />
              <meshStandardMaterial color="#f8fafc" roughness={0.25} />
            </mesh>
            {/* Upper Black Sensor Tube with Forward-Facing "YOUNG" Stencil */}
            <mesh position={[0, 0.135, 0]} rotation={[0, Math.PI, 0]} castShadow>
              <cylinderGeometry args={[0.046, 0.046, 0.14, 20]} />
              <meshStandardMaterial map={youngSensorTexture} roughness={0.4} metalness={0.5} />
            </mesh>
            {/* Flared Top Hood / Cowl with Aperture Rim */}
            <mesh position={[0, 0.215, 0]} castShadow>
              <cylinderGeometry args={[0.052, 0.046, 0.035, 20]} />
              <meshStandardMaterial color="#090d16" roughness={0.4} metalness={0.7} />
            </mesh>
            {/* Top Optical Sensor Aperture Recess */}
            <mesh position={[0, 0.233, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[0.044, 20]} />
              <meshStandardMaterial color="#020617" roughness={0.9} />
            </mesh>
          </group>
        </group>
      </group>

      {/* ══════════════════════════════════════════════════════════════════
          4. UNDERWATER KEEL & ADCP CAGE ASSEMBLY (EXACT MATCH TO SPEC DIAGRAM)
          - 540mm Deep Blue Instrument Container Cylinder with 12 Silver Reinforcing Strakes
          - Reference Line Lower Flange at Y = -1.210m
          - 192mm Bright Green Cylindrical Keel Weight with CG Marker Decal Texture
          - Full-Height (558mm) Bright Green Hexagonal Bipyramidal Keel Frame / ADCP Cage
          - Forged Mooring Lug Eye seamlessly interlocking with Fairlead Bow Shackle
          ══════════════════════════════════════════════════════════════════ */}
      <group position={[0, 0, 0]}>
        {/* ── 1. 540mm DEEP BLUE INSTRUMENT CONTAINER CYLINDER (From Y=-0.680m to Y=-1.220m) ── */}
        <mesh position={[0, -0.950, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.48, 0.48, 0.540, 48]} />
          <meshStandardMaterial color="#1d4ed8" metalness={0.65} roughness={0.32} />
        </mesh>

        {/* Upper Flange Ring below Hull Clamping Ring */}
        <mesh position={[0, -0.690, 0]} castShadow>
          <cylinderGeometry args={[0.505, 0.505, 0.024, 48]} />
          <meshStandardMaterial color="#334155" metalness={0.85} roughness={0.25} />
        </mesh>

        {/* Lower Mounting Flange Ring (The "Reference Line" in Spec Diagram!) */}
        <mesh position={[0, -1.210, 0]} castShadow>
          <cylinderGeometry args={[0.510, 0.510, 0.026, 48]} />
          <meshStandardMaterial color="#cbd5e1" metalness={0.85} roughness={0.25} />
        </mesh>

        {/* 12 Vertical Structural Reinforcing Strakes / Ribs around Blue Canister */}
        {/* High-contrast light silver/white metallic plates matching reference diagram! */}
        {Array.from({ length: 12 }).map((_, idx) => {
          const ang = (idx * Math.PI * 2) / 12;
          return (
            <group
              key={`canister-strake-${idx}`}
              position={[Math.sin(ang) * 0.485, -0.950, Math.cos(ang) * 0.485]}
              rotation={[0, -ang, 0]}
            >
              {/* Main vertical strake blade */}
              <mesh castShadow>
                <boxGeometry args={[0.018, 0.520, 0.040]} />
                <meshStandardMaterial color="#e2e8f0" metalness={0.85} roughness={0.25} />
              </mesh>
              {/* Top mounting gusset bracket */}
              <mesh position={[0, 0.250, 0.015]}>
                <boxGeometry args={[0.022, 0.024, 0.030]} />
                <meshStandardMaterial color="#cbd5e1" metalness={0.8} roughness={0.3} />
              </mesh>
              {/* Bottom mounting gusset bracket meeting Reference Line */}
              <mesh position={[0, -0.250, 0.015]}>
                <boxGeometry args={[0.022, 0.024, 0.030]} />
                <meshStandardMaterial color="#cbd5e1" metalness={0.8} roughness={0.3} />
              </mesh>
            </group>
          );
        })}

        {/* ── 2. 192mm BRIGHT GREEN CYLINDRICAL KEEL COUNTERWEIGHT (From Y=-1.220m to Y=-1.412m) ── */}
        <mesh position={[0, -1.316, 0]} castShadow>
          <cylinderGeometry args={[0.20, 0.20, 0.160, 36]} />
          <meshStandardMaterial color="#16a34a" metalness={0.65} roughness={0.35} />
        </mesh>

        {/* Top and Bottom Flanges on Green Keel Weight */}
        <mesh position={[0, -1.228, 0]} castShadow>
          <cylinderGeometry args={[0.23, 0.23, 0.018, 36]} />
          <meshStandardMaterial color="#15803d" metalness={0.75} roughness={0.3} />
        </mesh>
        <mesh position={[0, -1.402, 0]} castShadow>
          <cylinderGeometry args={[0.23, 0.23, 0.018, 36]} />
          <meshStandardMaterial color="#15803d" metalness={0.75} roughness={0.3} />
        </mesh>

        {/* Center of Gravity (CG) Marker Texture & Front Badge (Matching Reference Diagram!) */}
        <mesh position={[0, -1.316, 0]} rotation={[0, Math.PI, 0]} castShadow>
          <cylinderGeometry args={[0.202, 0.202, 0.158, 48]} />
          <meshStandardMaterial map={cgCounterweightTexture} roughness={0.35} metalness={0.4} />
        </mesh>

        {/* ── 3. FULL-HEIGHT BRIGHT GREEN TUBULAR KEEL FRAME / ADCP CAGE (From Y=-1.412m to Y=-1.970m) ── */}
        {/* Exact bipyramidal hexagonal space-frame truss matching CAD spec diagram */}
        {(() => {
          const N = 6;
          const yTop = -1.412;
          const yWaistTop = -1.610;
          const yWaistBot = -1.770;
          const yBotCollar = -1.940;

          const rTop = 0.20;
          const rWaist = 0.38;
          const rBot = 0.05;

          const nodes = Array.from({ length: N }).map((_, i) => {
            const angle = (i * Math.PI * 2) / N;
            const sin = Math.sin(angle);
            const cos = Math.cos(angle);
            return {
              top: [sin * rTop, yTop, cos * rTop] as [number, number, number],
              wTop: [sin * rWaist, yWaistTop, cos * rWaist] as [number, number, number],
              wBot: [sin * rWaist, yWaistBot, cos * rWaist] as [number, number, number],
              bot: [sin * rBot, yBotCollar, cos * rBot] as [number, number, number],
            };
          });

          return (
            <group>
              {/* 1. Upper Slanting Struts (Flaring outward from Keel Weight to Upper Waist) */}
              {nodes.map((node, i) => (
                <ConnectingStrut
                  key={`cage-upper-${i}`}
                  from={node.top}
                  to={node.wTop}
                  radius={0.016}
                  color="#16a34a"
                  metalness={0.7}
                  roughness={0.3}
                />
              ))}

              {/* 2. Upper Horizontal Hexagonal Waist Perimeter Ring */}
              {nodes.map((node, i) => (
                <ConnectingStrut
                  key={`cage-ring-upper-${i}`}
                  from={node.wTop}
                  to={nodes[(i + 1) % N].wTop}
                  radius={0.016}
                  color="#16a34a"
                  metalness={0.7}
                  roughness={0.3}
                />
              ))}

              {/* 3. Vertical Protective Guard Bars across Cage Waist */}
              {nodes.map((node, i) => (
                <ConnectingStrut
                  key={`cage-waist-vert-${i}`}
                  from={node.wTop}
                  to={node.wBot}
                  radius={0.016}
                  color="#16a34a"
                  metalness={0.7}
                  roughness={0.3}
                />
              ))}

              {/* 4. Lower Horizontal Hexagonal Waist Perimeter Ring */}
              {nodes.map((node, i) => (
                <ConnectingStrut
                  key={`cage-ring-lower-${i}`}
                  from={node.wBot}
                  to={nodes[(i + 1) % N].wBot}
                  radius={0.016}
                  color="#16a34a"
                  metalness={0.7}
                  roughness={0.3}
                />
              ))}

              {/* 5. Lower Slanting Struts (Tapering inward towards Mooring Lug Boss) */}
              {nodes.map((node, i) => (
                <ConnectingStrut
                  key={`cage-lower-${i}`}
                  from={node.wBot}
                  to={node.bot}
                  radius={0.016}
                  color="#16a34a"
                  metalness={0.7}
                  roughness={0.3}
                />
              ))}

              {/* Internal Protected ADCP Instrument Canister */}
              <group position={[0, -1.690, 0]}>
                {/* Cylindrical titanium sensor body */}
                <mesh castShadow>
                  <cylinderGeometry args={[0.13, 0.13, 0.14, 24]} />
                  <meshStandardMaterial color="#0f172a" metalness={0.85} roughness={0.25} />
                </mesh>
                {/* Downward 4-Beam ADCP Transducer Head */}
                <mesh position={[0, -0.075, 0]} castShadow>
                  <cylinderGeometry args={[0.14, 0.105, 0.04, 24]} />
                  <meshStandardMaterial color="#0284c7" emissive="#0284c7" emissiveIntensity={0.3} metalness={0.7} />
                </mesh>
              </group>

              {/* ── 4. FORGED MOORING LUG EYE (Seamless connection to mooring shackle at Y = -1.95m) ── */}
              <group position={[0, -1.950, 0]}>
                {/* Structural forged boss collar */}
                <mesh castShadow>
                  <cylinderGeometry args={[0.065, 0.065, 0.040, 24]} />
                  <meshStandardMaterial color="#15803d" metalness={0.8} roughness={0.25} />
                </mesh>
                {/* Vertical forged pad eye web plate */}
                <mesh position={[0, -0.020, 0]} castShadow>
                  <boxGeometry args={[0.035, 0.045, 0.12]} />
                  <meshStandardMaterial color="#15803d" metalness={0.8} roughness={0.25} />
                </mesh>
                {/* Heavy Forged Mooring Eye Ring (Interlocks with top bow shackle at 90°) */}
                <mesh position={[0, -0.020, 0]} rotation={[0, Math.PI / 2, 0]} castShadow>
                  <torusGeometry args={[0.065, 0.022, 16, 32]} />
                  <meshStandardMaterial color="#15803d" metalness={0.8} roughness={0.25} />
                </mesh>
              </group>
            </group>
          );
        })()}
      </group>
        </group>
      </group>
    </group>
  );
}
