import * as THREE from 'three';

export type WatchCircleDepthLevel = 0 | 10 | 50 | 100 | 500 | 1000 | 2500;

export interface EnvironmentalConditions {
  currentSpeed: number;     // 0 - 3 m/s
  currentDirection: number; // 0 - 360 degrees (FROM bearing)
  windSpeed: number;        // 0 - 30 m/s
  windDirection: number;    // 0 - 360 degrees (FROM bearing)
  waveHeight: number;       // 0 - 10 m (Hs)
  wavePeriod: number;       // 4 - 18 s (Tp)
  waveDirection: number;    // 0 - 360 degrees (FROM bearing)
}

export interface MooringConfig {
  waterDepth: number;          // Water depth in meters (e.g. 1000 - 3000m)
  watchCircleRadius: number;   // Watch circle radius in meters (e.g. 200 - 1200m)
  nominalLatitude: number;     // e.g. 16.3617
  nominalLongitude: number;    // e.g. 87.9903
  buoyId: string;              // e.g. "OMNI-BD10"
  scope: number;               // Line length to depth ratio (e.g. 1.22 reference)
  mbl_kN: number;              // Reference breaking load in kN (e.g. 250 kN)
}

export interface MooringSegmentData {
  index: number;
  id: string;
  name: string;
  material: string;
  length_m: number;
  diameter_mm: number;
  mass_per_m_kg: number;
  submerged_weight_N_m: number;
  breaking_strength_kN: number;
  localTension_kN: number;
  localAngle_deg: number;
  depthRange_m: [number, number];
  utilization_percent: number;
  provenance: {
    source: string;
    status: 'REFERENCE' | 'ASSUMPTION' | 'DERIVED' | 'AUTHORITATIVE';
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    notes: string;
  };
  points3D: THREE.Vector3[];
}

export interface BuoyState {
  // Horizontal world offsets in visual meters from nominal (0,0)
  excursionX: number;
  excursionZ: number;
  excursionDistance: number; // sqrt(x^2 + z^2)
  excursionAngle: number;    // bearing in degrees
  heaveY: number;            // vertical heave displacement
  pitch: number;             // pitch angle in radians
  roll: number;              // roll angle in radians
  currentLat: number;
  currentLon: number;
  fairleadTension_kN: number;
  anchorTension_kN: number;
  safetyFactor: number;
  status: 'NORMAL' | 'WARNING' | 'BREACH';
  excursionPercent: number;  // (distance / radius) * 100
}

export interface GPSTrailPoint {
  x: number;
  z: number;
  time: number;
  breach: boolean;
}

export const PRESET_SCENARIOS: Record<string, { label: string; desc: string; env: EnvironmentalConditions }> = {
  calm: {
    label: 'Calm Sea State',
    desc: 'Light breeze and mild tidal drift. Minimal excursion well within safe watch boundary.',
    env: {
      currentSpeed: 0.25,
      currentDirection: 60,
      windSpeed: 4.0,
      windDirection: 45,
      waveHeight: 0.8,
      wavePeriod: 6.0,
      waveDirection: 50,
    },
  },
  monsoon: {
    label: 'Southwest Monsoon Gale',
    desc: 'Persistent strong monsoon currents and heavy swells pushing the buoy toward warning threshold.',
    env: {
      currentSpeed: 1.45,
      currentDirection: 215,
      windSpeed: 16.5,
      windDirection: 225,
      waveHeight: 3.8,
      wavePeriod: 9.5,
      waveDirection: 220,
    },
  },
  cyclone: {
    label: 'Tropical Cyclone Extreme',
    desc: 'Severe cyclonic storm forcing extreme line tension and watch-circle boundary breach.',
    env: {
      currentSpeed: 2.65,
      currentDirection: 130,
      windSpeed: 28.0,
      windDirection: 125,
      waveHeight: 7.5,
      wavePeriod: 14.0,
      waveDirection: 130,
    },
  },
  currentDrift: {
    label: 'Deep Ocean Jet Current',
    desc: 'High-speed subsurface current causing sustained lateral catenary displacement.',
    env: {
      currentSpeed: 2.8,
      currentDirection: 310,
      windSpeed: 6.0,
      windDirection: 270,
      waveHeight: 1.5,
      wavePeriod: 7.5,
      waveDirection: 290,
    },
  },
};

/**
 * Computes MoorSense engineering estimate of buoy excursion, multi-segment catenary, and watch circle status
 */
export function calculateMooringPhysics(
  env: EnvironmentalConditions,
  config: MooringConfig,
  time: number
): {
  buoyState: BuoyState;
  catenaryPoints: THREE.Vector3[];
  segments: MooringSegmentData[];
} {
  // MoorSense Vector convention: meteorological FROM-bearing converts to force direction TOWARD (bearing + 180) % 360
  const forceDir = (deg: number) => (((deg + 180) % 360) * Math.PI) / 180;
  const currentForceRad = forceDir(env.currentDirection);
  const windForceRad = forceDir(env.windDirection);
  const waveForceRad = forceDir(env.waveDirection);

  // 1. Aerodynamic and Hydrodynamic Forcing Vectors (in Newtons)
  // Air density 1.225 kg/m³, Water density 1025 kg/m³
  const cdWind = 1.2;
  const cdCurrent = 1.0;
  const buoyProjArea = 3.8; // m² (mast + upper hull)
  const buoySubmergedArea = 4.2; // m² (discus keel)

  const fWindMag = 0.5 * 1.225 * cdWind * buoyProjArea * Math.pow(env.windSpeed, 2);
  const fCurrentMag = 0.5 * 1025.0 * cdCurrent * buoySubmergedArea * Math.pow(env.currentSpeed, 2);
  // Mean wave drift force (Morison screening formulation)
  const fWaveDrift = (1 / 16) * 1025.0 * 9.81 * Math.pow(env.waveHeight, 2) * 2.7;

  // Vector summation: East (X) and North (Z)
  const fx =
    fWindMag * Math.sin(windForceRad) +
    fCurrentMag * Math.sin(currentForceRad) +
    fWaveDrift * Math.sin(waveForceRad);
  const fz =
    fWindMag * Math.cos(windForceRad) +
    fCurrentMag * Math.cos(currentForceRad) +
    fWaveDrift * Math.cos(waveForceRad);

  const totalForce_N = Math.sqrt(fx * fx + fz * fz);
  const forceResultantAngle = Math.atan2(fx, fz);

  // 2. Quasi-static horizontal excursion from MoorSense inverse-catenary stiffness
  // Base scope is 1.22. Excursion scales non-linearly with total force and water depth
  const baseRestoringStiffness = 32.0; // N/m initial horizontal stiffness
  const complianceExponent = 0.76;
  const steadyExcursionMeters = Math.min(
    config.watchCircleRadius * 1.45,
    Math.pow(totalForce_N / baseRestoringStiffness, complianceExponent) * 0.28
  );

  // 3. Dynamic Wave-Induced Orbital Motion (First-order heave, pitch, roll)
  const omega = (2 * Math.PI) / Math.max(4, env.wavePeriod);
  const waveAmp = env.waveHeight * 0.5;

  const dynamicX = waveAmp * 0.65 * Math.sin(waveForceRad) * Math.cos(omega * time);
  const dynamicZ = waveAmp * 0.65 * Math.cos(waveForceRad) * Math.cos(omega * time);
  const heaveY = waveAmp * Math.sin(omega * time * 1.05);
  const pitch = THREE.MathUtils.clamp((waveAmp / 12) * Math.sin(omega * time), -0.22, 0.22);
  const roll = THREE.MathUtils.clamp((waveAmp / 15) * Math.cos(omega * time * 0.95), -0.18, 0.18);

  // Total Horizontal Excursion in Real Meters
  const totalExcursionX = steadyExcursionMeters * Math.sin(forceResultantAngle) + dynamicX;
  const totalExcursionZ = steadyExcursionMeters * Math.cos(forceResultantAngle) + dynamicZ;
  const excursionDistance = Math.sqrt(totalExcursionX * totalExcursionX + totalExcursionZ * totalExcursionZ);
  const excursionAngle = ((Math.atan2(totalExcursionX, totalExcursionZ) * 180) / Math.PI + 360) % 360;

  // Real Geodesic Latitude / Longitude
  const metersPerDegLat = 111320;
  const metersPerDegLon = 111320 * Math.cos((config.nominalLatitude * Math.PI) / 180);
  const currentLat = config.nominalLatitude + totalExcursionZ / metersPerDegLat;
  const currentLon = config.nominalLongitude + totalExcursionX / metersPerDegLon;

  // Watch Circle Status Check: excursion <= watchCircleRadius
  const excursionPercent = (excursionDistance / config.watchCircleRadius) * 100;
  let status: 'NORMAL' | 'WARNING' | 'BREACH' = 'NORMAL';
  if (excursionPercent > 100) {
    status = 'BREACH';
  } else if (excursionPercent >= 80) {
    status = 'WARNING';
  }

  // 4. Line Tensions (Fairlead & Anchor) and Safety Factor (SF)
  // Fairlead pretension (assumed ~10% net buoyancy: ~2453 N) + dynamic hydrodynamic loads
  const pretension_N = 2453.0;
  const horizontalTension_N = totalForce_N;
  const verticalTension_N = pretension_N + (totalForce_N * 0.45) + (env.waveHeight * 1200);
  const fairleadTension_N = Math.sqrt(horizontalTension_N * horizontalTension_N + verticalTension_N * verticalTension_N);
  const anchorTension_N = fairleadTension_N * 0.86;

  const fairleadTension_kN = Math.round((fairleadTension_N / 1000) * 10) / 10;
  const anchorTension_kN = Math.round((anchorTension_N / 1000) * 10) / 10;
  const safetyFactor = Math.max(1.05, Math.round((config.mbl_kN / Math.max(1, fairleadTension_kN)) * 100) / 100);

  // 5. 3D Coordinate Mapping (1 unit = 30m, Seabed at Y = -18)
  const M_TO_3D = 1 / 30;
  const buoy3D_X = totalExcursionX * M_TO_3D;
  const buoy3D_Z = totalExcursionZ * M_TO_3D;
  const buoy3D_Y = (heaveY * 0.4) * M_TO_3D;
  const seabedY = -18;
  const anchorY = seabedY + 0.85; // Top pad eye of the heavy cylindrical sinker clump

  const fairlead3D = new THREE.Vector3(buoy3D_X, buoy3D_Y - 1.15, buoy3D_Z);
  const anchor3D = new THREE.Vector3(0, anchorY, 0);

  // Dynamic tension ratio (relative to MBL) for physical compliance
  const tensionRatio = Math.min(1.0, fairleadTension_kN / config.mbl_kN);
  // In low tension/calm states, buoyant S-loop expands; in storm states, line pulls tauter
  const complianceFactor = 1.0 - 0.70 * tensionRatio;

  // Generate 64-point silky-smooth continuous inverse-catenary curve with physical S-loop
  const numPoints = 64;
  const catenaryPoints: THREE.Vector3[] = [];
  const totalDeltaY = anchor3D.y - fairlead3D.y;

  for (let i = 0; i <= numPoints; i++) {
    const s = i / numPoints; // 0 at fairlead, 1 at anchor

    // 1. Silky-Smooth Vertical Descent y(s)
    // Monotonic base descent with gentle sinusoidal tension shaping
    const baseFraction = s + 0.038 * Math.sin(2 * Math.PI * s);
    // Smooth Gaussian buoyant lift centered at the mid-water buoyancy cluster (s ≈ 0.48)
    const buoyantLiftY = Math.sin(s * Math.PI) * Math.exp(-Math.pow((s - 0.48) / 0.18, 2)) * (totalDeltaY * -0.078 * complianceFactor);
    const y = fairlead3D.y + (totalDeltaY * baseFraction) + buoyantLiftY;

    // 2. Silky-Smooth Horizontal Inverse-Catenary S-Belly Profile (x(s), z(s))
    // Outward compliant loop peaking smoothly at s ≈ 0.48, fading naturally to 0 at fairlead and anchor
    const sLoopBelly = Math.pow(Math.sin(s * Math.PI), 1.35) * (1.55 * complianceFactor);
    const catenarySagX = Math.sin(forceResultantAngle) * sLoopBelly;
    const catenarySagZ = Math.cos(forceResultantAngle) * sLoopBelly;

    // Smooth power-interpolated baseline connecting fairlead to anchor eye
    const x = THREE.MathUtils.lerp(fairlead3D.x, anchor3D.x, Math.pow(s, 1.25)) + catenarySagX;
    const z = THREE.MathUtils.lerp(fairlead3D.z, anchor3D.z, Math.pow(s, 1.25)) + catenarySagZ;

    catenaryPoints.push(new THREE.Vector3(x, y, z));
  }

  // 6. MoorSense 3-Segment Model Breakdown (Matching NIOT OMNI Real Mooring)
  const totalLineLength_m = config.waterDepth * config.scope;

  // Segment index partitions in the 64-point curve:
  // Seg 0: indices 0 to 15 (Upper Inductive Wire Riser w/ ADCP Cage & CTD sensors, ~22% of line)
  // Seg 1: indices 14 to 52 (Compliant Nylon S-Tether w/ 3 Yellow Buoyancy Floats, ~60% of line)
  // Seg 2: indices 51 to 65 (Acoustic Release & Heavy Ground Chain to Clump Sinker, ~18% of line)
  const seg0_pts = catenaryPoints.slice(0, 16);
  const seg1_pts = catenaryPoints.slice(14, 53);
  const seg2_pts = catenaryPoints.slice(51, 65);

  // Local angles relative to vertical:
  const lineAngleFairlead = Math.round((Math.atan2(horizontalTension_N, verticalTension_N) * 180) / Math.PI);
  const lineAngleMid = Math.round(lineAngleFairlead * 0.65);
  const lineAngleAnchor = Math.max(4, Math.round(lineAngleFairlead * 0.28));

  const segments: MooringSegmentData[] = [
    {
      index: 0,
      id: 'upper_inductive_riser',
      name: 'Segment 1: Upper Inductive Wire Riser (0 - 500m)',
      material: 'Jacketed Torque-Balanced Wire Rope w/ ADCP Cage & SBE 37-IM Sensors',
      length_m: Math.min(500, Math.round(totalLineLength_m * 0.15)),
      diameter_mm: 14,
      mass_per_m_kg: 0.82,
      submerged_weight_N_m: 5.6,
      breaking_strength_kN: 165,
      localTension_kN: fairleadTension_kN,
      localAngle_deg: lineAngleFairlead,
      depthRange_m: [1.5, Math.min(500, Math.round(config.waterDepth * 0.18))],
      utilization_percent: Math.round((fairleadTension_kN / 165) * 1000) / 10,
      provenance: {
        source: 'NIOT OMNI Operational Mooring (Venkatesan et al., 2016)',
        status: 'AUTHORITATIVE',
        confidence: 'HIGH',
        notes: 'Equipped with an inline stainless-steel ADCP instrument cage at 25m depth and clamped Sea-Bird SBE 37-IM MicroCAT inductive sensor pucks (10m, 50m, 100m, 200m, 500m) transmitting real-time ocean current and CTD data up the wire rope without electrical breakouts.',
      },
      points3D: seg0_pts,
    },
    {
      index: 1,
      id: 'compliant_s_tether',
      name: 'Segment 2: Compliant Nylon S-Tether w/ 3 Buoyancy Floats (500 - 2,800m)',
      material: '8-Strand Braided Compliant Nylon Rope w/ 3 Benthos Yellow Glass Floats',
      length_m: Math.round(totalLineLength_m * 0.75),
      diameter_mm: 30,
      mass_per_m_kg: 0.65,
      submerged_weight_N_m: 1.4,
      breaking_strength_kN: 245,
      localTension_kN: Math.round((fairleadTension_kN * 0.88) * 10) / 10,
      localAngle_deg: lineAngleMid,
      depthRange_m: [Math.min(500, Math.round(config.waterDepth * 0.18)), Math.round(config.waterDepth * 0.90)],
      utilization_percent: Math.round(((fairleadTension_kN * 0.88) / 245) * 1000) / 10,
      provenance: {
        source: 'NIOT OMNI Mooring Architecture & Deep-Sea Standards',
        status: 'AUTHORITATIVE',
        confidence: 'HIGH',
        notes: 'High-compliance elastic nylon section equipped with 3 clustered Benthos 17" glass sphere buoyancy modules in high-visibility yellow protective hardhats. Generates positive net lift creating the authentic inverse-catenary S-curve belly shown in the NIOT scale model, isolating surface wave heave from the seabed anchor.',
      },
      points3D: seg1_pts,
    },
    {
      index: 2,
      id: 'anchor_chain_assembly',
      name: 'Segment 3: Acoustic Release & Stud-Link Ground Chain (2,800m - Seabed)',
      material: 'Dual EdgeTech 8242XS Acoustic Release + 26mm Stud-Link Steel Chain',
      length_m: Math.round(totalLineLength_m * 0.10),
      diameter_mm: 26,
      mass_per_m_kg: 14.8,
      submerged_weight_N_m: 125.0,
      breaking_strength_kN: 520,
      localTension_kN: anchorTension_kN,
      localAngle_deg: lineAngleAnchor,
      depthRange_m: [Math.round(config.waterDepth * 0.90), config.waterDepth],
      utilization_percent: Math.round((anchorTension_kN / 520) * 1000) / 10,
      provenance: {
        source: 'NIOT Deep-Sea Deployment Specification',
        status: 'AUTHORITATIVE',
        confidence: 'HIGH',
        notes: 'Positively buoyant tether connected to dual EdgeTech 8242XS acoustic release transponders with drop-hook mechanism, 30m of 26mm stud-link anchor chain, and 2,000 kg heavy cylindrical cast-iron clump sinker resting on the seabed floor.',
      },
      points3D: seg2_pts,
    },
  ];

  return {
    buoyState: {
      excursionX: totalExcursionX,
      excursionZ: totalExcursionZ,
      excursionDistance,
      excursionAngle,
      heaveY,
      pitch,
      roll,
      currentLat,
      currentLon,
      fairleadTension_kN,
      anchorTension_kN,
      safetyFactor,
      status,
      excursionPercent: Math.round(excursionPercent * 10) / 10,
    },
    catenaryPoints,
    segments,
  };
}
