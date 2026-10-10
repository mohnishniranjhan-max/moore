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

  const fairlead3D = new THREE.Vector3(buoy3D_X, buoy3D_Y - 1.95, buoy3D_Z);
  const anchor3D = new THREE.Vector3(0, anchorY, 0);

  // Dynamic tension ratio (relative to MBL) for physical compliance
  const tensionRatio = Math.min(1.0, fairleadTension_kN / config.mbl_kN);
  // In low tension/calm states, buoyant S-loop expands; in storm states, line pulls tauter
  const complianceFactor = 1.0 - 0.70 * tensionRatio;

  // Float horizontal offset direction in 3D (primarily in +X to clearly display profile bend)
  const floatOffsetDist = 1.40 * complianceFactor;
  const floatDirX = Math.cos(forceResultantAngle * 0.4) * floatOffsetDist;
  const floatDirZ = Math.sin(forceResultantAngle * 0.4) * floatOffsetDist * 0.35;

  // Physical Spline Control Points matching authoritative diagram (media_1791568214529.png):
  // 1. Upper Riser (Keel -> ADCP -> 500m Inductive Cable -> CTD): Hangs straight down
  const pFairlead = fairlead3D.clone();
  const pAdcp = new THREE.Vector3(buoy3D_X, buoy3D_Y - 2.85, buoy3D_Z);
  const pCableMid = new THREE.Vector3(buoy3D_X, buoy3D_Y - 4.75, buoy3D_Z);
  const pCtd = new THREE.Vector3(buoy3D_X, buoy3D_Y - 6.60, buoy3D_Z);
  const pCtdBase = new THREE.Vector3(buoy3D_X, buoy3D_Y - 6.85, buoy3D_Z);

  // 2. Compliant Nylon S-Loop: Dips DOWN below CTD, then loops UP to buoyant Trawl Float
  const pUDip = new THREE.Vector3(
    buoy3D_X + floatDirX * 0.55,
    buoy3D_Y - 7.75, // Dips 0.9m below the CTD sensor!
    buoy3D_Z + floatDirZ * 0.55
  );
  const pFloatApex = new THREE.Vector3(
    buoy3D_X + floatDirX,
    buoy3D_Y - 6.30, // Elevated apex held up by positive buoyancy (+1800N)
    buoy3D_Z + floatDirZ
  );

  // 3. Deep Polypropylene Tether down to Anchor Cluster
  const pPolyMid = new THREE.Vector3(
    floatDirX * 0.42,
    -11.2,
    floatDirZ * 0.42
  );
  const pGlassTop = new THREE.Vector3(0, -14.60, 0);
  const pRelease = new THREE.Vector3(0, -16.05, 0);
  const pAnchor = anchor3D.clone();

  const controlNodes = [
    pFairlead,
    pAdcp,
    pCableMid,
    pCtd,
    pCtdBase,
    pUDip,
    pFloatApex,
    pPolyMid,
    pGlassTop,
    pRelease,
    pAnchor,
  ];

  const fullSpline = new THREE.CatmullRomCurve3(controlNodes, false, 'centripetal', 0.5);
  const numPoints = 64;
  const catenaryPoints: THREE.Vector3[] = [];
  for (let i = 0; i <= numPoints; i++) {
    catenaryPoints.push(fullSpline.getPointAt(i / numPoints));
  }

  // 6. MoorSense 3-Segment Model Breakdown (Matching Reference Diagram Sequence)
  const totalLineLength_m = config.waterDepth * config.scope;

  // Segment index partitions in the 64-point curve:
  // Seg 0: indices 0 to 22 (Upper Chain, ADCP, 500m Inductive Wire Rope w/ 9x CT & CTD Sensors)
  // Seg 1: indices 20 to 52 (Nylon S-Loop U-bend, Trawl Float in Net & Polypropylene Rope)
  // Seg 2: indices 50 to 65 (3x Glass Spheres, Acoustic Release & Heavy Ground Chain to Bottom Weight)
  const seg0_pts = catenaryPoints.slice(0, 23);
  const seg1_pts = catenaryPoints.slice(20, 53);
  const seg2_pts = catenaryPoints.slice(50, 65);

  // Local angles relative to vertical:
  const lineAngleFairlead = Math.round((Math.atan2(horizontalTension_N, verticalTension_N) * 180) / Math.PI);
  const lineAngleMid = Math.round(lineAngleFairlead * 0.65);
  const lineAngleAnchor = Math.max(4, Math.round(lineAngleFairlead * 0.28));

  const segments: MooringSegmentData[] = [
    {
      index: 0,
      id: 'upper_inductive_riser',
      name: 'Components 1-4: Upper Chain, ADCP, 500m Inductive Cable (9x CT) & CTD',
      material: 'Stud-Link Chain, Inline ADCP Frame, Armored Inductive Cable w/ 9 Clamped CT Sensors & CTD',
      length_m: Math.min(500, Math.round(totalLineLength_m * 0.16)),
      diameter_mm: 14,
      mass_per_m_kg: 0.85,
      submerged_weight_N_m: 6.2,
      breaking_strength_kN: 175,
      localTension_kN: fairleadTension_kN,
      localAngle_deg: lineAngleFairlead,
      depthRange_m: [2.0, Math.min(500, Math.round(config.waterDepth * 0.18))],
      utilization_percent: Math.round((fairleadTension_kN / 175) * 1000) / 10,
      provenance: {
        source: 'mooring_system_spec.md & Reference Schematic (media_1791568214529.png)',
        status: 'AUTHORITATIVE',
        confidence: 'HIGH',
        notes: 'Component 1 (Upper Chain below keel pad eye) -> Component 2 (Inline ADCP Cage Frame) -> Component 3 (500m Inductive Cable with 9x Clamped CT Sensors) -> Component 4 (CTD Sensor at inductive cable base). Provides electrical and inductive telemetry coupling from subsurface ocean layers to the surface buoy.',
      },
      points3D: seg0_pts,
    },
    {
      index: 1,
      id: 'compliant_s_tether',
      name: 'Components 5-7: Nylon S-Loop, Trawl Float in Net & Polypropylene Rope',
      material: 'Compliant Nylon Rope S-Loop, 5x Netted Trawl Floats (Buoyancy Cluster) & Polypropylene Rope',
      length_m: Math.round(totalLineLength_m * 0.72),
      diameter_mm: 28,
      mass_per_m_kg: 0.58,
      submerged_weight_N_m: 1.1,
      breaking_strength_kN: 240,
      localTension_kN: Math.round((fairleadTension_kN * 0.88) * 10) / 10,
      localAngle_deg: lineAngleMid,
      depthRange_m: [Math.min(500, Math.round(config.waterDepth * 0.18)), Math.round(config.waterDepth * 0.90)],
      utilization_percent: Math.round(((fairleadTension_kN * 0.88) / 240) * 1000) / 10,
      provenance: {
        source: 'mooring_system_spec.md & Reference Schematic (media_1791568214529.png)',
        status: 'AUTHORITATIVE',
        confidence: 'HIGH',
        notes: 'Component 5 (Nylon Rope S-Loop compliant belly) -> Component 6 (Trawl Float in Net subsurface buoyancy cluster providing +1800N upward lift) -> Component 7 (Polypropylene Rope deep synthetic tether). Decouples surface wave dynamics from seabed ground tackle.',
      },
      points3D: seg1_pts,
    },
    {
      index: 2,
      id: 'anchor_chain_assembly',
      name: 'Components 8-11: Glass Spheres (x3), Acoustic Release, Ground Chain & Bottom Weight',
      material: '3x Yellow Glass Spheres, Dual Acoustic Release Transponder, Heavy Ground Chain & 2,000 kg Segmented Dead Weight',
      length_m: Math.round(totalLineLength_m * 0.12),
      diameter_mm: 26,
      mass_per_m_kg: 15.2,
      submerged_weight_N_m: 128.0,
      breaking_strength_kN: 520,
      localTension_kN: anchorTension_kN,
      localAngle_deg: lineAngleAnchor,
      depthRange_m: [Math.round(config.waterDepth * 0.90), config.waterDepth],
      utilization_percent: Math.round((anchorTension_kN / 520) * 1000) / 10,
      provenance: {
        source: 'mooring_system_spec.md & Reference Schematic (media_1791568214529.png)',
        status: 'AUTHORITATIVE',
        confidence: 'HIGH',
        notes: 'Component 8 (3x Yellow Glass Spheres in hardhats) -> Component 9 (Dual Acoustic Release Transponder in purple housing) -> Component 10 (Heavy Stud-Link Ground Chain) -> Component 11 (2,000 kg Segmented Clump Dead Weight on seabed). Holds the deep acoustic transponder vertical and securely anchors the mooring.',
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
