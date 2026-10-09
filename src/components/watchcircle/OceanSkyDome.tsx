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

  // 1. Natural Oceanic Atmospheric Gradient
  // Deep oceanic zenith -> Royal azure -> Soft crisp oceanic horizon haze
  vec3 zenithColor    = vec3(0.04, 0.15, 0.35); // Deep navy azure
  vec3 midSkyColor    = vec3(0.18, 0.42, 0.66); // Cerulean atmospheric blue
  vec3 horizonHaze    = vec3(0.49, 0.64, 0.73); // Crisp oceanic horizon haze (#7da2ba)
  vec3 subWaterColor  = vec3(0.015, 0.08, 0.18); // Oceanic depth tone below sea level

  vec3 sky;
  if (elev >= 0.0) {
    sky = mix(horizonHaze, midSkyColor, smoothstep(0.0, 0.18, elev));
    sky = mix(sky, zenithColor, smoothstep(0.18, 0.85, elev));
  } else {
    // Softly maintain horizon haze down to -0.03 so no seam or dark crack can ever appear
    sky = mix(horizonHaze, subWaterColor, smoothstep(-0.03, -0.45, elev));
  }

  // 2. Realistic Solar Disc & Radiant Atmospheric Corona
  vec3 sunDir = normalize(uSunDirection);
  float cosTheta = dot(dir, sunDir);
  float sunForward = max(cosTheta, 0.0);

  // Sharp brilliant sun disc
  float sunDisc = smoothstep(0.9993, 0.9998, cosTheta);
  vec3 sunDiscColor = vec3(3.0, 2.9, 2.7);

  // Solar aureole & wide forward corona glow
  float corona = pow(sunForward, 48.0) * 0.75 + pow(sunForward, 8.0) * 0.18;
  vec3 coronaColor = vec3(1.0, 0.94, 0.84) * corona;

  // 3. Subtle Atmospheric Layering near Horizon
  vec3 finalColor = sky + coronaColor + (sunDiscColor * sunDisc);

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
