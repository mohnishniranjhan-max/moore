import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface OceanSkyDomeProps {
  sunDirection?: [number, number, number];
}

const skyDomeVertexShader = /* glsl */ `
varying vec3 vViewDir;

void main() {
  vViewDir = normalize(position);
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

const skyDomeFragmentShader = /* glsl */ `
uniform vec3 uSunDirection;
varying vec3 vViewDir;

void main() {
  vec3 dir = normalize(vViewDir);
  float elev = dir.y; // -1 to +1

  // 1. Natural Overcast Twilight Atmospheric Gradient (Matching Reference Video)
  // Deep moody slate-indigo zenith -> moody slate-blue overcast mid-sky -> luminous pale silvery-cyan horizon band
  vec3 zenithColor    = vec3(0.055, 0.115, 0.210); // Deep twilight slate indigo
  vec3 midSkyColor    = vec3(0.165, 0.265, 0.385); // Moody slate-blue overcast sky
  vec3 horizonHaze    = vec3(0.580, 0.730, 0.840); // Luminous pale silvery-cyan twilight horizon band
  vec3 subWaterColor  = vec3(0.016, 0.058, 0.115); // Deep abyss ocean depth tone below sea level

  vec3 sky;
  if (elev >= 0.0) {
    sky = mix(horizonHaze, midSkyColor, smoothstep(0.0, 0.16, elev));
    sky = mix(sky, zenithColor, smoothstep(0.16, 0.82, elev));

    // Subtle horizontal stratocumulus cloud banding across the overcast twilight sky (Matching Video)
    float cloudBand1 = sin(dir.y * 32.0 + dir.x * 2.5) * 0.5 + 0.5;
    float cloudBand2 = cos(dir.y * 54.0 - dir.z * 3.2) * 0.5 + 0.5;
    float cloudDensity = (cloudBand1 * 0.65 + cloudBand2 * 0.35) * smoothstep(0.03, 0.24, elev) * smoothstep(0.75, 0.28, elev);
    vec3 cloudTone = vec3(0.11, 0.18, 0.27);
    sky = mix(sky, cloudTone, cloudDensity * 0.38);
  } else {
    // Softly maintain horizon haze down to -0.03 so no seam or dark crack can ever appear
    sky = mix(horizonHaze, subWaterColor, smoothstep(-0.03, -0.45, elev));
  }

  // 2. Diffused Solar Aureole & Luminous Horizon Shimmer Corona
  vec3 sunDir = normalize(uSunDirection);
  float cosTheta = dot(dir, sunDir);
  float sunForward = max(cosTheta, 0.0);

  // Soft diffused solar disc behind clouds
  float sunDisc = smoothstep(0.9990, 0.9997, cosTheta);
  vec3 sunDiscColor = vec3(2.6, 2.7, 2.8);

  // Broad forward twilight glow along the horizon
  float corona = pow(sunForward, 32.0) * 0.65 + pow(sunForward, 6.0) * 0.25;
  vec3 coronaColor = vec3(0.85, 0.93, 1.0) * corona;

  // 3. Final Sky Color Composition
  vec3 finalColor = sky + coronaColor + (sunDiscColor * sunDisc * 0.5);

  gl_FragColor = vec4(finalColor, 1.0);
}
`;

export function OceanSkyDome({ sunDirection = [100, 32, -80] }: OceanSkyDomeProps) {
  const meshRef = useRef<THREE.Mesh>(null!);

  const uniforms = useMemo(
    () => ({
      uSunDirection: { value: new THREE.Vector3(...sunDirection).normalize() },
    }),
    [sunDirection]
  );

  useFrame(({ camera }) => {
    if (meshRef.current) {
      // Keep dome centered around camera so horizon is equidistant in all directions
      meshRef.current.position.copy(camera.position);
    }
  });

  return (
    <mesh ref={meshRef} renderOrder={-100}>
      {/* 2200 radius fits cleanly inside camera far plane (3000) */}
      <sphereGeometry args={[2200, 36, 24]} />
      <shaderMaterial
        vertexShader={skyDomeVertexShader}
        fragmentShader={skyDomeFragmentShader}
        uniforms={uniforms}
        side={THREE.BackSide}
        depthWrite={false}
      />
    </mesh>
  );
}
