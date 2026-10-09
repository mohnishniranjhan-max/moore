import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface OceanSurfaceProps {
  waveHeight: number;
  wavePeriod: number;
  showUnderwater: boolean;
}

const waterVertexShader = /* glsl */ `
uniform float uTime;
uniform float uWaveHeight;
uniform float uWaveFreq;
uniform vec2 uCameraOffset;

varying vec3 vWorldPosition;
varying vec3 vNormal;
varying float vElevation;
varying float vDistToCam;

// Gentle, calm open-ocean swell formulation
vec3 gerstnerSwell(vec2 dir, float steepness, float wavelength, float speed, vec2 p, inout vec3 normal) {
  float k = 2.0 * 3.14159265 / wavelength;
  float c = sqrt(9.81 / k) * speed;
  float f = k * (dot(dir, p) - c * uTime);
  float a = (steepness / k) * clamp(uWaveHeight * 0.35, 0.1, 1.1);
  
  normal.x -= dir.x * (steepness * sin(f));
  normal.z -= dir.y * (steepness * sin(f));
  normal.y -= steepness * cos(f);
  
  return vec3(
    dir.x * (a * cos(f)),
    a * sin(f),
    dir.y * (a * cos(f))
  );
}

void main() {
  // World space horizontal coordinates: local vertex offset + camera world offset
  vec2 worldXZ = position.xz + uCameraOffset;
  float dist = length(position.xz);
  vDistToCam = dist;

  // Gentle wave displacement softly attenuates towards distant horizon to avoid aliasing
  float waveFade = 1.0 - smoothstep(50.0, 380.0, dist);

  vec3 normal = vec3(0.0, 1.0, 0.0);
  vec3 disp = vec3(0.0);

  // 3 long-period offshore swells (calm, dignified marine engineering state)
  disp += gerstnerSwell(normalize(vec2(1.0, 0.28)),  0.042, 38.0, 0.62, worldXZ, normal);
  disp += gerstnerSwell(normalize(vec2(0.42, 0.89)), 0.028, 24.0, 0.78, worldXZ, normal);
  disp += gerstnerSwell(normalize(vec2(-0.35, 0.94)), 0.016, 13.0, 1.02, worldXZ, normal);

  vec3 p = position;
  p.y += disp.y * waveFade;
  p.x += disp.x * waveFade;
  p.z += disp.z * waveFade;

  vElevation = p.y;
  vNormal = normalize(normal);

  vec4 worldPos = modelMatrix * vec4(p, 1.0);
  vWorldPosition = worldPos.xyz;

  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

const waterFragmentShader = /* glsl */ `
uniform sampler2D tNormal;
uniform vec3 uSunDirection;
uniform float uWaveHeight;
uniform float uUnderwater;
uniform float uTime;
uniform vec2 uCameraOffset;

varying vec3 vWorldPosition;
varying vec3 vNormal;
varying float vElevation;
varying float vDistToCam;

// GGX Microfacet Distribution for physically realistic sun glitter
float distributionGGX(vec3 N, vec3 H, float roughness) {
  float a = roughness * roughness;
  float a2 = a * a;
  float NdotH = max(dot(N, H), 0.0);
  float denom = (NdotH * NdotH * (a2 - 1.0) + 1.0);
  return a2 / max(3.14159265 * denom * denom, 0.0001);
}

void main() {
  vec3 V = normalize(cameraPosition - vWorldPosition);
  vec3 L = normalize(uSunDirection);

  // 1. Dual-layer counter-scrolling normal map for fine, natural capillary ripples
  vec2 uv0 = (vWorldPosition.xz * 0.042) + vec2(uTime * 0.016, uTime * 0.011);
  vec2 uv1 = (vWorldPosition.xz * 0.088) + vec2(-uTime * 0.013, uTime * 0.018);
  vec3 rawN0 = texture2D(tNormal, uv0).rgb;
  vec3 rawN1 = texture2D(tNormal, uv1).rgb;
  
  vec3 n0 = length(rawN0) > 0.05 ? rawN0 * 2.0 - 1.0 : vec3(0.0, 0.0, 1.0);
  vec3 n1 = length(rawN1) > 0.05 ? rawN1 * 2.0 - 1.0 : vec3(0.0, 0.0, 1.0);
  vec3 microNormal = normalize(n0 + n1 * 0.72);

  // Distance fade on micro-ripples to avoid moiré shimmering at distance
  float rippleFade = 1.0 - smoothstep(30.0, 320.0, vDistToCam);
  vec3 N = normalize(vNormal + vec3(microNormal.x * 0.38 * rippleFade, 0.0, microNormal.y * 0.38 * rippleFade));

  // 2. Scientifically Realistic Deep-Ocean Color Shading
  // Deep Atlantic/Indian ocean indigo body color (absorbing red/yellow wavelengths)
  vec3 deepNavy      = vec3(0.012, 0.052, 0.125); // Deep ocean abyss body
  vec3 shallowVolume = vec3(0.035, 0.142, 0.252); // Crest illuminated volume
  vec3 waterBody = mix(deepNavy, shallowVolume, smoothstep(-0.35, 0.40, vElevation));

  // Subtle subsurface scattering (soft light penetration through gentle swell crests)
  float sss = pow(max(dot(V, -L), 0.0), 3.2) * smoothstep(-0.05, 0.35, vElevation) * 0.24;
  waterBody += vec3(0.02, 0.17, 0.24) * sss;

  // 3. Physical Fresnel Reflection (Schlick approximation: Water IOR = 1.333 -> F0 = 0.02)
  float NdotV = max(dot(N, V), 0.001);
  float f0 = 0.02;
  float fresnel = f0 + (1.0 - f0) * pow(1.0 - NdotV, 5.0);

  // 4. Photorealistic Sky Dome Reflection matching OceanSkyDome palette
  vec3 R = reflect(-V, N);
  float skyElev = max(R.y, 0.0);
  vec3 skyZenith  = vec3(0.04, 0.15, 0.35); // Deep navy azure
  vec3 skyMid     = vec3(0.18, 0.42, 0.66); // Cerulean atmospheric blue
  vec3 skyHorizon = vec3(0.49, 0.64, 0.73); // Crisp oceanic horizon haze
  vec3 skyRefl = mix(skyHorizon, skyMid, smoothstep(0.0, 0.22, skyElev));
  skyRefl = mix(skyRefl, skyZenith, smoothstep(0.22, 0.85, skyElev));

  // 5. Physically-Based GGX Sun Specular Highlight (Sun Glitter Path)
  vec3 H = normalize(L + V);
  float NdotL = max(dot(N, L), 0.0);
  float ggxSharp  = distributionGGX(N, H, 0.040) * 0.42; // Pinpoint sun glints
  float ggxLuster = distributionGGX(N, H, 0.19)  * 0.13; // Soft golden luster
  vec3 sunColor = vec3(1.0, 0.94, 0.82) * 4.2;
  vec3 sunSpecular = (ggxSharp + ggxLuster) * sunColor * NdotL;

  // 6. Surface Shading Composition
  vec3 waterColor = mix(waterBody, skyRefl, fresnel) + sunSpecular * fresnel;

  // 7. Subtle, natural wave foam (only present on steep crests in heavy seas)
  float crestSlope = clamp(1.0 - N.y, 0.0, 1.0);
  float foamFactor = smoothstep(0.42, 0.78, vElevation * (uWaveHeight * 0.32) + crestSlope * 0.38);
  foamFactor *= smoothstep(0.35, 0.75, (microNormal.x + microNormal.y) * 0.5 + 0.5) * rippleFade;
  vec3 foamColor = vec3(0.88, 0.95, 1.0);
  waterColor = mix(waterColor, foamColor, foamFactor * 0.32);

  // 8. Seamless Infinite Horizon Blend
  // Water color smoothly merges into the exact sky dome horizon haze
  float horizonBlend = smoothstep(80.0, 600.0, vDistToCam);
  vec3 finalColor = mix(waterColor, skyHorizon, horizonBlend);

  // 9. Natural water opacity: increases with fresnel reflection at glancing angles
  float surfaceAlpha = mix(0.52, 0.96, fresnel);
  float alpha = mix(surfaceAlpha, 0.68, uUnderwater);
  alpha = mix(alpha, 1.0, horizonBlend);

  // 10. Underwater Underside Reflection
  if (cameraPosition.y < 0.0) {
    float tir = pow(1.0 - max(dot(V, -N), 0.0), 2.5);
    finalColor = mix(deepNavy * 1.6, skyHorizon, tir);
    alpha = 0.85;
  }

  gl_FragColor = vec4(finalColor, alpha);
}
`;

export function OceanSurface({ waveHeight, wavePeriod, showUnderwater }: OceanSurfaceProps) {
  const meshRef = useRef<THREE.Mesh>(null!);

  // Pre-rotate plane geometry so local position is in the horizontal (X, Z) plane with Y = 0
  const planeGeometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(4000, 4000, 96, 96);
    geo.rotateX(-Math.PI / 2);
    return geo;
  }, []);

  // High-resolution photographic water normal map
  const waterNormals = useMemo(() => {
    const loader = new THREE.TextureLoader();
    const tex = loader.load('/textures/waternormals.jpg');
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }, []);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uWaveHeight: { value: Math.max(0.2, waveHeight) },
      uWaveFreq: { value: (2 * Math.PI) / Math.max(4, wavePeriod) },
      uSunDirection: { value: new THREE.Vector3(100, 32, -80).normalize() },
      tNormal: { value: waterNormals },
      uUnderwater: { value: showUnderwater ? 1.0 : 0.0 },
      uCameraOffset: { value: new THREE.Vector2(0, 0) },
    }),
    [waterNormals]
  );

  useFrame((state, delta) => {
    const { camera } = state;
    if (meshRef.current) {
      // 1. Follow camera horizontally so viewer NEVER reaches an edge
      meshRef.current.position.x = camera.position.x;
      meshRef.current.position.z = camera.position.z;
      meshRef.current.position.y = 0; // Surface remains at Y = 0 ocean datum level

      // 2. Pass horizontal camera coordinates to world-space wave calculation
      uniforms.uCameraOffset.value.set(camera.position.x, camera.position.z);

      // 3. Gentle, stable time advancement for realistic slow offshore swell
      uniforms.uTime.value += delta * 0.52;
      uniforms.uWaveHeight.value = THREE.MathUtils.lerp(
        uniforms.uWaveHeight.value,
        Math.max(0.15, waveHeight),
        0.05
      );
      uniforms.uWaveFreq.value = (2 * Math.PI) / Math.max(4, wavePeriod);
      uniforms.uUnderwater.value = THREE.MathUtils.lerp(
        uniforms.uUnderwater.value,
        camera.position.y < 0.0 ? 1.0 : 0.0,
        0.1
      );
    }
  });

  return (
    <group position={[0, 0, 0]}>
      {/* 
        Expansive 4000x4000 plane with 96x96 subdivisions.
        Because it follows the camera in X and Z and has pre-rotated horizontal geometry,
        it creates an infinite ocean in every direction without polygon distortion.
      */}
      <mesh
        ref={meshRef}
        geometry={planeGeometry}
        renderOrder={-10}
        receiveShadow
      >
        <shaderMaterial
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
