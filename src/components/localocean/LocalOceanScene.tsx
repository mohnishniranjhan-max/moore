import { Suspense, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { WaveSurface } from './WaveSurface';
import { ArgoBuoyMarker } from './ArgoBuoyMarker';
import { UnderwaterEnvironment } from './UnderwaterEnvironment';
import { MarineEcosystemManager } from './MarineEcosystem/MarineEcosystemManager';
import { LocalOceanCamera } from './LocalOceanCamera';
import { LocalOceanHUD } from './LocalOceanHUD';

import type { Station, OceanParameter, DepthLevel, OceanLayer } from '../../types/ocean';

// ── Cinematic Atmospheric Sky Dome (Rayleigh/Mie Scattering, Sun & Clouds) ──
const skyVertexShader = /* glsl */ `
varying vec3 vWorldPosition;
varying vec3 vViewDir;

void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  vViewDir = normalize(worldPosition.xyz);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const skyFragmentShader = /* glsl */ `
uniform vec3 uSunPosition;
uniform float uTime;

varying vec3 vWorldPosition;
varying vec3 vViewDir;

// Optimized procedural 2D noise for clouds
float hash2D(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise2D(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash2D(i), hash2D(i + vec2(1.0, 0.0)), f.x),
    mix(hash2D(i + vec2(0.0, 1.0)), hash2D(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}

// Lightweight Fractal Brownian Motion for cloud volumes
float fbm(vec3 p) {
  vec2 uv = p.xz;
  float f = 0.55 * noise2D(uv);
  uv = uv * 2.05 + vec2(0.15, 0.25);
  f += 0.30 * noise2D(uv);
  return f * 1.18;
}

void main() {
  vec3 viewDir = normalize(vViewDir);
  vec3 sunDir = normalize(uSunPosition);
  
  float cosTheta = dot(viewDir, sunDir);
  float elev = max(viewDir.y, 0.0);
  
  // 1. Natural Oceanic Atmospheric Rayleigh Gradient
  // Deep navy zenith -> Royal azure mid-sky -> Soft cyan/haze horizon
  vec3 zenithColor  = vec3(0.04, 0.14, 0.32); // Deep rich navy
  vec3 upperSky     = vec3(0.12, 0.32, 0.56); // Royal azure
  vec3 midSky       = vec3(0.28, 0.52, 0.72); // Atmospheric blue
  vec3 horizonHaze  = vec3(0.62, 0.78, 0.88); // Crisp oceanic horizon haze
  
  // Smooth atmospheric elevation interpolation
  vec3 sky = mix(horizonHaze, midSky, smoothstep(0.0, 0.15, elev));
  sky = mix(sky, upperSky, smoothstep(0.15, 0.45, elev));
  sky = mix(sky, zenithColor, smoothstep(0.45, 0.90, elev));
  
  // 2. Realistic Sun Disc & Solar Corona
  float sunForward = max(cosTheta, 0.0);
  
  // Crisp, bright sun disc
  float sunDisc = smoothstep(0.9992, 0.9998, cosTheta);
  vec3 sunDiscColor = vec3(3.5, 3.4, 3.2); // Brilliant white sun
  
  // Solar corona (soft golden-white forward glow)
  float corona = pow(sunForward, 128.0) * 1.5;
  vec3 coronaColor = vec3(1.0, 0.95, 0.85) * corona;
  
  // Atmospheric solar haze (soft wide aureole)
  float aureole = pow(sunForward, 16.0) * 0.35 + pow(sunForward, 4.0) * 0.08;
  vec3 aureoleColor = vec3(0.95, 0.88, 0.78) * aureole;
  
  vec3 atmosphere = sky + aureoleColor + coronaColor + (sunDiscColor * sunDisc);
  
  // 3. Crisp Procedural Cumulus Clouds
  // Spherical/Planar hybrid projection for natural cloud distribution
  vec2 cloudUv = (viewDir.xz / max(viewDir.y + 0.18, 0.06)) * 1.5;
  vec3 cloudPos = vec3(cloudUv.x, 1.0, cloudUv.y);
  cloudPos.x += uTime * 0.006;
  cloudPos.z += uTime * 0.003;
  
  float cloudNoise = fbm(cloudPos);
  // High threshold so clouds are distinct fluffy masses with clean blue sky between
  float cloudMask = smoothstep(0.56, 0.72, cloudNoise);
  
  // Horizon fade & zenith clearing
  cloudMask *= smoothstep(0.02, 0.16, elev);
  cloudMask *= smoothstep(0.92, 0.40, elev);
  
  // Cloud shading: bright white illuminated tops, soft blue-gray bases
  vec3 cloudBase = vec3(0.45, 0.55, 0.68);
  vec3 cloudLit = vec3(0.96, 0.98, 1.0);
  
  float lightPenetration = smoothstep(0.48, 0.68, fbm(cloudPos + sunDir * 0.2));
  vec3 cloudColor = mix(cloudBase, cloudLit, lightPenetration);
  
  // Subtle forward sunlight boost on cloud edges facing the sun
  cloudColor += vec3(0.3, 0.25, 0.15) * pow(sunForward, 4.0);
  
  // 4. Final Sky Composition
  vec3 finalColor = mix(atmosphere, cloudColor, cloudMask * 0.92);
  
  // Blend into smooth horizon haze right at ocean water line
  float horizonBlend = smoothstep(0.06, 0.0, elev);
  finalColor = mix(finalColor, horizonHaze, horizonBlend * 0.4);
  
  gl_FragColor = vec4(finalColor, 1.0);
}
`;

export function CinematicSkyDome() {
  const shaderRef = useRef<THREE.ShaderMaterial>(null!);
  const uniforms = useMemo(() => ({
    uSunPosition: { value: new THREE.Vector3(100, 32, -80) },
    uTime: { value: 0.0 }
  }), []);

  useFrame((state) => {
    if (shaderRef.current) {
      shaderRef.current.uniforms.uTime.value = state.clock.elapsedTime;
    }
  });

  return (
    <mesh>
      {/* 250 radius fits safely inside camera far plane (300) */}
      <sphereGeometry args={[250, 64, 32]} />
      <shaderMaterial
        ref={shaderRef}
        vertexShader={skyVertexShader}
        fragmentShader={skyFragmentShader}
        uniforms={uniforms}
        side={THREE.BackSide}
        depthWrite={false}
      />
    </mesh>
  );
}

// ── Dynamic Lighting ────────────────────────────────────────────────────────
export function DynamicLighting({ maxDepthY = 100 }: { maxDepthY?: number }) {
  const { camera } = useThree();
  const ambientRef = useRef<THREE.AmbientLight>(null!);
  const dirRef = useRef<THREE.DirectionalLight>(null!);
  const camLightRef = useRef<THREE.PointLight>(null!);

  useFrame(() => {
    const camDepth = Math.max(0, -camera.position.y);
    const depthT = Math.min(1, camDepth / maxDepthY);

    if (ambientRef.current) {
      ambientRef.current.intensity = THREE.MathUtils.lerp(0.55, 0.12, depthT);
      const color = new THREE.Color('#7aa2dc').lerp(new THREE.Color('#020b18'), depthT);
      ambientRef.current.color = color;
    }

    if (dirRef.current) {
      // Directional (sun) light fades out smoothly as depth increases
      const sunT = Math.min(1, camDepth / (maxDepthY * 0.4));
      dirRef.current.intensity = THREE.MathUtils.lerp(2.8, 0.0, sunT);
    }

    if (camLightRef.current) {
      camLightRef.current.position.copy(camera.position);
      camLightRef.current.intensity = depthT * 1.5; // Submarine headlight
    }
  });

  return (
    <>
      <ambientLight ref={ambientRef} intensity={0.55} color="#7aa2dc" />
      <directionalLight ref={dirRef} position={[100, 32, -80]} intensity={2.8} color="#fff2e2" />
      <pointLight ref={camLightRef} color="#22d3ee" distance={40} decay={2} intensity={0} />
    </>
  );
}

interface LocalOceanSceneProps {
  station: Station;
  parameter?: OceanParameter;
  layer?: OceanLayer;
  onExit?: () => void;
  // Hand tracking refs (reused from existing hook)
  handDelta?: React.MutableRefObject<{ dx: number; dy: number }>;
  handDeltaRef?: React.MutableRefObject<{ dx: number; dy: number }>;
  handZoom?: React.MutableRefObject<number>;
  handZoomRef?: React.MutableRefObject<number>;
  numHands?: number;
  isHandEnabled?: boolean;
}

export function LocalOcean3D({
  station,
  depth,
  layer,
  parameter,
  handDelta,
  handDeltaRef,
  handZoom,
  handZoomRef,
  numHands = 0,
  isHandEnabled = false,
}: LocalOceanSceneProps & { depth: DepthLevel }) {
  const { scene } = useThree();
  const activeHandDelta = handDeltaRef || handDelta;
  const activeHandZoom = handZoomRef || handZoom;
  const isDifference = layer === 'difference';
  
  // Apply hazy, moody atmospheric fog for the horizon
  useEffect(() => {
    const oldFog = scene.fog;
    // Soft atmospheric haze for distant horizon blending
    scene.fog = new THREE.Fog('#8ea5b8', 50, 280);
    return () => { scene.fog = oldFog; };
  }, [scene]);

  return (
    <group>
      {/* Lighting is now fully dynamic based on camera Y */}
      <DynamicLighting />
      
      {/* Deep Ocean Hazy Sky */}
      {depth < 50 && (
        <CinematicSkyDome />
      )}

      <Suspense fallback={null}>
        {/* Wave Surface */}
        <WaveSurface
          waveHeight={station.waveHeight}
          modelWaveHeight={station.modelWaveHeight}
          currentSpeed={station.currentSpeed}
          temperature={station.temperature}
          depth={depth}
          isDifference={isDifference}
        />

        {/* ARGO Buoy */}
        <ArgoBuoyMarker station={station} isDifference={isDifference} />

        {/* Underwater Environment */}
        <UnderwaterEnvironment depth={depth} visible={true} />

        {/* Dynamic Depth-Based Marine Ecosystem */}
        <MarineEcosystemManager depth={depth} />
      </Suspense>

      {/* Camera Controller */}
      <LocalOceanCamera
        depth={depth}
        handDeltaRef={activeHandDelta}
        handZoomRef={activeHandZoom}
        numHands={numHands}
        isHandEnabled={isHandEnabled}
      />
    </group>
  );
}

export function LocalOceanUI({
  station,
  parameter,
  onExit,
  depth,
  onDepthChange,
}: {
  station: Station;
  parameter: OceanParameter;
  onExit: () => void;
  depth: DepthLevel;
  onDepthChange: (d: DepthLevel) => void;
}) {
  // Background color shifts with depth
  const bgColor = depth === 0 ? '#010409' :
    depth < 50 ? '#041220' :
    depth < 100 ? '#030d1a' :
    depth < 500 ? '#020810' :
    '#010408';

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 10,
        pointerEvents: 'none',
        background: bgColor,
        transition: 'background 1.5s ease',
        // Make background slightly transparent so WebGL canvas behind it shows through
        backgroundColor: 'transparent',
      }}
    >
      {/* Cinematic Vignette */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background: 'radial-gradient(circle at center, transparent 40%, rgba(1, 4, 9, 0.8) 100%)',
          zIndex: 1,
        }}
      />

      {/* HUD Overlay */}
      <div style={{ pointerEvents: 'auto' }}>
        <LocalOceanHUD
          station={station}
          depth={depth}
          onDepthChange={onDepthChange}
          onExit={onExit}
        />
      </div>


    </div>
  );
}
