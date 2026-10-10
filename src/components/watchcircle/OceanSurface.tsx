import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface OceanSurfaceProps {
  waveHeight: number;
  wavePeriod: number;
  showUnderwater: boolean;
}

/**
 * Adaptive non-linear ocean grid geometry centered at (0, 0).
 * Vertices are concentrated densely in the observation zone (sub-meter resolution near the buoy,
 * mooring line, and watch circle overlay within radius 35m), while smoothly expanding outward
 * to 4,000m to form a seamless infinite ocean horizon with zero edges.
 */
function createAdaptiveOceanGeometry(size = 4000, segments = 200): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  const halfSize = size / 2;

  const positions = new Float32Array((segments + 1) * (segments + 1) * 3);
  const uvs = new Float32Array((segments + 1) * (segments + 1) * 2);
  const indices: number[] = [];

  let pIdx = 0;
  let uvIdx = 0;

  for (let j = 0; j <= segments; j++) {
    const vLinear = (j / segments) * 2 - 1; // -1 to +1
    const aV = Math.abs(vLinear);
    let z: number;
    if (aV <= 0.45) {
      // Sub-meter resolution (~0.38m grid spacing) within r <= 35m
      z = Math.sign(vLinear) * (aV / 0.45) * 35;
    } else {
      // Smooth non-linear expansion to outer boundary
      const t = (aV - 0.45) / 0.55;
      z = Math.sign(vLinear) * (35 + Math.pow(t, 2.2) * (halfSize - 35));
    }

    for (let i = 0; i <= segments; i++) {
      const uLinear = (i / segments) * 2 - 1; // -1 to +1
      const aU = Math.abs(uLinear);
      let x: number;
      if (aU <= 0.45) {
        x = Math.sign(uLinear) * (aU / 0.45) * 35;
      } else {
        const t = (aU - 0.45) / 0.55;
        x = Math.sign(uLinear) * (35 + Math.pow(t, 2.2) * (halfSize - 35));
      }

      positions[pIdx++] = x;
      positions[pIdx++] = 0; // Horizontal XZ plane at datum Y = 0
      positions[pIdx++] = z;

      uvs[uvIdx++] = i / segments;
      uvs[uvIdx++] = j / segments;
    }
  }

  for (let j = 0; j < segments; j++) {
    for (let i = 0; i < segments; i++) {
      const a = j * (segments + 1) + i;
      const b = (j + 1) * (segments + 1) + i;
      const c = (j + 1) * (segments + 1) + (i + 1);
      const d = j * (segments + 1) + (i + 1);

      // Two triangles per quad with upward-pointing normals (+Y)
      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  return geo;
}

const waterVertexShader = /* glsl */ `
uniform float uTime;
uniform float uWaveHeight;
uniform float uSpeedScale;

varying vec3 vWorldPosition;
varying vec3 vNormal;
varying float vElevation;
varying float vDistToCam;

// Pure Sinusoidal Swell with transverse curvature:
// Completely eliminates horizontal Gerstner pinching (q=0), ensuring 100% rounded, silky,
// calm rolling swells with ZERO sharp crests, ZERO ridges, and ZERO choppiness.
void addSmoothSwell(
  vec2 dir,          // Propagation direction
  vec2 perpDir,      // Transverse direction for gentle crescent curve
  float wavelength,  // Wavelength in meters
  float speed,       // Phase velocity
  float amp,         // Wave amplitude
  vec2 pos,          // World XZ position
  inout vec3 disp,   // Accumulated displacement (X, Y, Z)
  inout vec2 slope   // Exact analytical partial derivatives (dY/dX, dY/dZ)
) {
  float k = 6.2831853 / wavelength;
  float omega = k * speed * uSpeedScale;

  // Gentle transverse curvature creates organic, curving wavefronts without straight lines
  float pTrans = dot(perpDir, pos);
  float curveMod = 0.20 * sin(k * 0.25 * pTrans + 1.1);
  float phase = k * (dot(dir, pos) + curveMod) - omega * uTime;

  float s = sin(phase);
  float c = cos(phase);

  // Pure vertical sinusoidal elevation (zero horizontal pinching = zero sharpness)
  disp.y += amp * s;

  // Exact analytical partial derivatives for mathematical smoothness
  float dCurveDx = 0.20 * k * 0.25 * perpDir.x * cos(k * 0.25 * pTrans + 1.1);
  float dCurveDz = 0.20 * k * 0.25 * perpDir.y * cos(k * 0.25 * pTrans + 1.1);

  float dSlope = amp * k * c;
  slope.x -= (dir.x + dCurveDx) * dSlope;
  slope.y -= (dir.y + dCurveDz) * dSlope;
}

void main() {
  vec2 worldXZ = position.xz;
  float dist = length(position.xz);

  // Smooth distance attenuation towards horizon
  float waveFade = 1.0 - smoothstep(180.0, 1000.0, dist);

  // Gentle large-scale spatial envelope creates natural calm expanses across the ocean
  float macroEnvelope = 0.92 + 0.16 * sin(worldXZ.x * 0.020 + worldXZ.y * 0.014) * cos(worldXZ.x * 0.012 - worldXZ.y * 0.022);

  vec3 disp = vec3(0.0);
  vec2 slope = vec2(0.0);

  // Calibrated wave amplitude for clearly visible, rolling 3D ocean swells
  float baseAmp = clamp(uWaveHeight * 0.16, 0.12, 0.68) * macroEnvelope;

  // 4 broad, rolling long-wavelength ocean swells matching open ocean physics:
  // 1. Dominant primary rolling swell
  addSmoothSwell(
    normalize(vec2(0.35, 0.94)), normalize(vec2(-0.94, 0.35)),
    18.0, 2.50, baseAmp * 0.45, worldXZ, disp, slope
  );
  // 2. Secondary rolling swell
  addSmoothSwell(
    normalize(vec2(-0.42, 0.91)), normalize(vec2(-0.91, -0.42)),
    11.5, 2.05, baseAmp * 0.30, worldXZ, disp, slope
  );
  // 3. Oblique cross swell
  addSmoothSwell(
    normalize(vec2(0.80, 0.60)), normalize(vec2(-0.60, 0.80)),
    7.2, 1.65, baseAmp * 0.16, worldXZ, disp, slope
  );
  // 4. Soft wind swell
  addSmoothSwell(
    normalize(vec2(-0.65, 0.76)), normalize(vec2(-0.76, -0.65)),
    4.2, 1.30, baseAmp * 0.09, worldXZ, disp, slope
  );

  vec3 p = position;
  p.y += disp.y * waveFade;

  vElevation = p.y;

  // Mathematically exact, silky smooth surface normal from analytical derivatives
  vec3 geoNormal = normalize(vec3(-slope.x * waveFade, 1.0, -slope.y * waveFade));
  vNormal = geoNormal;

  vec4 worldPos = modelMatrix * vec4(p, 1.0);
  vWorldPosition = worldPos.xyz;
  vDistToCam = length(cameraPosition - worldPos.xyz);

  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

const waterFragmentShader = /* glsl */ `
uniform vec3 uSunDirection;
uniform float uWaveHeight;
uniform float uUnderwater;
uniform float uTime;

varying vec3 vWorldPosition;
varying vec3 vNormal;
varying float vElevation;
varying float vDistToCam;

void main() {
  vec3 V = normalize(cameraPosition - vWorldPosition);
  vec3 L = normalize(uSunDirection);
  vec2 p = vWorldPosition.xz;

  // ── 1. Pure Analytical Silky Fluid Micro-Undulations (100% Procedural) ──
  // Replaces all harsh, noisy external texture files with pure, mathematically smooth
  // harmonic wavelets. Zero grain, zero sharpness, zero pixelation.
  // Frequencies are incommensurate and directions rotated at golden angles.
  float w1 = sin(dot(vec2(0.52, 0.85), p) * 0.42 - uTime * 0.80);
  float w2 = sin(dot(vec2(-0.74, 0.67), p) * 0.58 - uTime * 0.98);
  float w3 = sin(dot(vec2(0.86, -0.51), p) * 0.82 - uTime * 1.20);
  float w4 = sin(dot(vec2(-0.48, -0.88), p) * 1.15 - uTime * 1.45);

  // Exact analytical gradients of the fluid wavelets
  vec2 rippleGrad = (
    vec2(0.52, 0.85) * 0.42 * cos(dot(vec2(0.52, 0.85), p) * 0.42 - uTime * 0.80) * 0.016 +
    vec2(-0.74, 0.67) * 0.58 * cos(dot(vec2(-0.74, 0.67), p) * 0.58 - uTime * 0.98) * 0.012 +
    vec2(0.86, -0.51) * 0.82 * cos(dot(vec2(0.86, -0.51), p) * 0.82 - uTime * 1.20) * 0.008 +
    vec2(-0.48, -0.88) * 1.15 * cos(dot(vec2(-0.48, -0.88), p) * 1.15 - uTime * 1.45) * 0.005
  );

  // Distance-adaptive LOD: ripples dissolve smoothly with distance
  // Leaves a mirror-like, silky sky reflection in the mid- and far-field (matching the video)
  float rippleLod = 1.0 - smoothstep(12.0, 75.0, vDistToCam);
  vec2 slopePerturb = rippleGrad * rippleLod;

  // Integrated Surface Normal: perfectly smooth, with gentle deviation (< 2.5 degrees)
  vec3 N = normalize(vec3(
    vNormal.x - slopePerturb.x,
    vNormal.y,
    vNormal.z - slopePerturb.y
  ));

  // Underwater orientation handling
  bool isUnderwater = cameraPosition.y < 0.0;
  vec3 effN = isUnderwater ? -N : N;
  float NdotV = max(dot(effN, V), 0.001);

  // ── 2. Soft & Silky Optical Fresnel Reflectance ──
  // Optical water constant R0 = 0.021 with gentle, gradual exponent for soft transition
  float R0 = 0.021;
  float fresnel = R0 + (1.0 - R0) * pow(clamp(1.0 - NdotV, 0.0, 1.0), 3.2);

  // ── 3. Smooth Deep Ocean Body Color (Directly from Reference Video) ──
  // Dynamically calibrate elevation range to current wave height for rich contrast
  float waveSpan = max(0.24, uWaveHeight * 0.32);
  float elevT = clamp((vElevation + waveSpan * 0.5) / waveSpan, 0.0, 1.0);
  float smoothElev = elevT * elevT * (3.0 - 2.0 * elevT); // Smooth cubic S-curve

  // Authentic twilight oceanic palette matching the reference video:
  vec3 deepTroughNavy = vec3(0.012, 0.045, 0.095); // Deep twilight navy (#031124)
  vec3 midSlopeBlue   = vec3(0.035, 0.138, 0.248); // Rich oceanic teal-blue (#09233f)
  vec3 crestSoftCyan  = vec3(0.075, 0.265, 0.395); // Luminous translucent crest cyan (#134365)

  vec3 waterBody = mix(deepTroughNavy, midSlopeBlue, smoothElev);
  waterBody = mix(waterBody, crestSoftCyan, smoothElev * 0.55);

  // Directional illumination across wave slopes (gentle, unhurried 3D sculpting)
  float NdotL = max(dot(N, L), 0.0);
  waterBody *= (0.72 + 0.46 * NdotL);

  // Soft subsurface scattering through wave peaks facing the viewer
  float sss = pow(max(dot(V, -L), 0.0), 2.4) * smoothElev * 0.34;
  waterBody += vec3(0.045, 0.220, 0.320) * sss;

  // ── 4. Overcast Twilight Sky Dome Reflection (Matching Reference Video) ──
  vec3 R = reflect(-V, N);
  float skyElev = max(R.y, 0.0);

  // Moody overcast twilight sky palette:
  vec3 skyZenith  = vec3(0.055, 0.115, 0.210); // Deep twilight slate indigo
  vec3 skyMid     = vec3(0.165, 0.265, 0.385); // Moody slate-blue overcast sky
  vec3 skyHorizon = vec3(0.580, 0.730, 0.840); // Luminous pale silvery-cyan twilight horizon band

  vec3 skyRefl = mix(skyHorizon, skyMid, smoothstep(0.0, 0.18, skyElev));
  skyRefl = mix(skyRefl, skyZenith, smoothstep(0.18, 0.80, skyElev));

  // Broad horizontal twilight shimmer path along the horizon (Matching Video)
  float sunR = max(dot(R, L), 0.0);
  vec3 twilightGlow = vec3(0.82, 0.91, 0.98) * pow(sunR, 5.0) * 0.36;
  skyRefl += twilightGlow;

  // ── 5. Soft Satin Specular Sheen (Zero Sharp Glitter, Zero Pin-Point Glare) ──
  // A wide, velvety specular sheen reflecting the overcast horizon sky across wave crests.
  // Completely eliminates sharp pin-point speckles for a silky, molten-liquid look.
  vec3 H = normalize(L + V);
  float NdotH = max(dot(N, H), 0.0);

  // Soft satin sheen: wide exponent (24.0) gives a smooth, continuous velvety glow across crests
  float sheen = pow(NdotH, 24.0) * 0.65;
  vec3 specularColor = vec3(0.88, 0.94, 1.0) * sheen * NdotL * max(fresnel, 0.12);

  // ── 6. Surface Color Composition ──
  vec3 waterColor = mix(waterBody, skyRefl, fresnel) + specularColor;

  // ── 7. Seamless Infinite Horizon Blend ──
  // Smoothly merges into the horizon haze beyond 120m with zero visible edge
  float horizonBlend = smoothstep(120.0, 950.0, vDistToCam);
  vec3 finalColor = mix(waterColor, skyHorizon, horizonBlend);

  // ── 8. Surface Alpha / Opacity ──
  float surfaceAlpha = mix(0.94, 1.0, fresnel);
  float alpha = mix(surfaceAlpha, 1.0, horizonBlend);

  // ── 9. Underwater Optics: Snell's Window and Total Internal Reflection ──
  if (isUnderwater) {
    float cosAngle = max(dot(V, vec3(0.0, 1.0, 0.0)), 0.0);
    float snellWindow = smoothstep(0.56, 0.72, cosAngle);

    vec3 tirColor = deepTroughNavy * 1.5;
    vec3 skyWindowColor = mix(skyHorizon, skyZenith, smoothstep(0.68, 0.98, cosAngle));
    float sunUnder = pow(max(dot(V, L), 0.0), 24.0) * 1.6;
    skyWindowColor += vec3(0.90, 0.95, 1.0) * sunUnder;

    finalColor = mix(tirColor, skyWindowColor, snellWindow);
    alpha = mix(0.88, 0.96, 1.0 - snellWindow);
  }

  gl_FragColor = vec4(finalColor, alpha);
}
`;

export function OceanSurface({ waveHeight, wavePeriod, showUnderwater }: OceanSurfaceProps) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const materialRef = useRef<THREE.ShaderMaterial>(null!);

  // Adaptive non-linear plane geometry centered at (0,0):
  // Sub-meter quads within 35m of origin, smoothly expansive to 4000m
  const planeGeometry = useMemo(() => {
    return createAdaptiveOceanGeometry(4000, 200);
  }, []);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uWaveHeight: { value: Math.max(0.5, waveHeight) },
      uSpeedScale: { value: 7.5 / Math.max(3.5, wavePeriod) },
      uSunDirection: { value: new THREE.Vector3(100, 32, -80).normalize() },
      uUnderwater: { value: showUnderwater ? 1.0 : 0.0 },
    }),
    []
  );

  useFrame((state) => {
    const { clock, camera } = state;
    const t = clock.getElapsedTime();

    if (materialRef.current) {
      const mat = materialRef.current;
      mat.uniforms.uTime.value = t;
      mat.uniforms.uWaveHeight.value = THREE.MathUtils.lerp(
        mat.uniforms.uWaveHeight.value,
        Math.max(0.5, waveHeight),
        0.05
      );
      mat.uniforms.uSpeedScale.value = 7.5 / Math.max(3.5, wavePeriod);
      mat.uniforms.uUnderwater.value = camera.position.y < 0.0 ? 1.0 : 0.0;
    }
  });

  return (
    <group position={[0, 0, 0]}>
      <mesh
        ref={meshRef}
        geometry={planeGeometry}
        position={[0, 0, 0]}
        renderOrder={-10}
        receiveShadow
      >
        <shaderMaterial
          ref={materialRef}
          vertexShader={waterVertexShader}
          fragmentShader={waterFragmentShader}
          uniforms={uniforms}
          transparent
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
