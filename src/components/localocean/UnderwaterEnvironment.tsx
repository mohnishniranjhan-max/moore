import { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { DepthLevel } from '../../types/ocean';

interface UnderwaterEnvironmentProps {
  depth: DepthLevel | number;
  visible: boolean;
  maxDepthY?: number;
}

// ── Depth utilities ──────────────────────────────────────────────────────────

function depthFraction(depth: number): number {
  return Math.min(1, depth / 1000);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// ── 6-Stage Depth Color Palette ──────────────────────────────────────────

const COLOR_10M   = new THREE.Color('#0891b2'); // 10m: Bright turquoise/cyan
const COLOR_50M   = new THREE.Color('#0c3b6d'); // 50m: Deep oceanic blue
const COLOR_100M  = new THREE.Color('#082245'); // 100m: Twilight dark navy
const COLOR_500M  = new THREE.Color('#041224'); // 500m: Midnight deep blue
const COLOR_1000M = new THREE.Color('#01060e'); // 1000m: Pitch black abyssal navy

function getDepthColor(t: number): THREE.Color {
  // t is camDepth / maxDepthY where 1.0 is maximum seabed depth (t in [0, 1])
  if (t < 0.05) {
    // 0 to 50m
    return new THREE.Color().copy(COLOR_10M).lerp(COLOR_50M, t / 0.05);
  } else if (t < 0.10) {
    // 50m to 100m
    return new THREE.Color().copy(COLOR_50M).lerp(COLOR_100M, (t - 0.05) / 0.05);
  } else if (t < 0.50) {
    // 100m to 500m
    return new THREE.Color().copy(COLOR_100M).lerp(COLOR_500M, (t - 0.10) / 0.40);
  } else {
    // 500m to 1000m+
    return new THREE.Color().copy(COLOR_500M).lerp(COLOR_1000M, (t - 0.50) / 0.50);
  }
}

// ── Constants ────────────────────────────────────────────────────────────────

const PARTICLE_COUNT = 400;
const PARTICLE_BOX = 40; // 40x40x40 wrapping volume

const RAY_COUNT = 8;

// ── Caustic Shader ───────────────────────────────────────────────────────────

const causticVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const causticFrag = /* glsl */ `
  uniform float uTime;
  uniform float uOpacity;
  varying vec2 vUv;
  
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i+vec2(1,0)), f.x),
               mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
  }
  void main() {
    vec2 p1 = vUv * 8.0 + vec2(uTime * 0.2, uTime * 0.15);
    vec2 p2 = vUv * 6.0 - vec2(uTime * 0.18, uTime * 0.25);
    float n = noise(p1) * noise(p2);
    float c = pow(n, 2.0) * 3.0;
    vec3 color = vec3(0.3, 0.75, 0.9) * c;
    gl_FragColor = vec4(color, c * uOpacity);
  }
`;

// ── Component ────────────────────────────────────────────────────────────────

export function UnderwaterEnvironment({ depth, visible, maxDepthY = 100 }: UnderwaterEnvironmentProps) {
  const { scene } = useThree();
  const particlesRef = useRef<THREE.Points>(null!);
  const raysGroupRef = useRef<THREE.Group>(null!);
  const causticRef = useRef<THREE.Mesh>(null!);
  const fogColorRef = useRef(new THREE.Color(0x0891b2));

  const animState = useRef({
    currentDepthT: 0,
    masterOpacity: 0,
  });

  // ── Particle geometry ──────────────────────────────────────────────────────
  const { particleGeo, offsets, speeds } = useMemo(() => {
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const offs: THREE.Vector3[] = [];
    const spds: number[] = [];

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      // Store raw 0-1 values for offsets
      const x = Math.random();
      const y = Math.random();
      const z = Math.random();
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
      offs.push(new THREE.Vector3(x, y, z));
      spds.push(0.01 + Math.random() * 0.04);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return { particleGeo: geo, offsets: offs, speeds: spds };
  }, []);

  // Light rays removed to prevent giant vertical pillar overlap in UI

  // ── Caustic uniforms ───────────────────────────────────────────────────────
  const causticUniforms = useMemo(() => ({
    uTime: { value: 0 },
    uOpacity: { value: 0 },
  }), []);

  // ── Frame update ───────────────────────────────────────────────────────────
  useFrame((state, delta) => {
    const { camera } = state;
    const t = state.clock.elapsedTime;
    const dt = Math.min(delta, 0.05);

    // Compute depth fraction strictly based on camera Y scaled by maxDepthY
    const camDepth = Math.max(0, -camera.position.y);
    const depthT = Math.min(1, camDepth / maxDepthY);
    const master = 1.0; // Always visible in local ocean, just darkens

    // Update scene fog & background based on camera altitude
    if (!scene.fog || !(scene.fog as any).isFogExp2) {
      scene.fog = new THREE.FogExp2('#0891b2', 0.02);
    }

    const expFog = scene.fog as THREE.FogExp2;
    if (camera.position.y < 0.0) {
      // Submerged: deep underwater color and exponential depth fog
      const fogColor = getDepthColor(depthT);
      fogColorRef.current.copy(fogColor);
      scene.background = fogColor;
      expFog.color.copy(fogColor);
      expFog.density = lerp(0.015, 0.04, depthT);
    } else {
      // Above surface: clear sky dome view with soft distant horizon haze
      scene.background = null;
      expFog.color.set('#7da3ba');
      expFog.density = 0.0006;
    }

    // Particles — wrap around camera
    if (particlesRef.current) {
      const pos = particlesRef.current.geometry.attributes.position as THREE.BufferAttribute;
      const density = lerp(1.0, 0.2, depthT);
      const halfBox = PARTICLE_BOX / 2;

      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const o = offsets[i];
        const sp = speeds[i];
        
        // Calculate theoretical absolute position based on offset + time drift
        let px = (o.x * PARTICLE_BOX) + Math.sin(t * sp + i) * 2.0;
        let py = (o.y * PARTICLE_BOX) - (t * sp * 10.0); // Drift down
        let pz = (o.z * PARTICLE_BOX) + Math.cos(t * sp * 1.5 + i) * 2.0;

        // Wrap relative to camera
        let dx = ((px - camera.position.x + halfBox) % PARTICLE_BOX + PARTICLE_BOX) % PARTICLE_BOX - halfBox;
        let dy = ((py - camera.position.y + halfBox) % PARTICLE_BOX + PARTICLE_BOX) % PARTICLE_BOX - halfBox;
        let dz = ((pz - camera.position.z + halfBox) % PARTICLE_BOX + PARTICLE_BOX) % PARTICLE_BOX - halfBox;

        let worldY = camera.position.y + dy;
        // Keep marine snow/plankton particles strictly submerged under sea level (Y <= -0.2)
        if (worldY > -0.2) {
          worldY = -0.2 - Math.abs(dy);
        }

        pos.setX(i, camera.position.x + dx);
        pos.setY(i, worldY);
        pos.setZ(i, camera.position.z + dz);
      }
      pos.needsUpdate = true;

      const mat = particlesRef.current.material as THREE.PointsMaterial;
      mat.opacity = density * 0.5;
      mat.size = lerp(0.06, 0.03, depthT);
    }

    // Light rays update removed

    // Caustics on surface
    if (causticRef.current) {
      causticUniforms.uTime.value = t;
      causticUniforms.uOpacity.value = depthT < 0.15 ? (1 - depthT / 0.15) * 0.4 : 0;
    }
  });

  if (!visible && animState.current.masterOpacity < 0.001) return null;

  return (
    <group>
      {/* Exponential fog — attached to scene in useFrame */}

      {/* Suspended particles */}
      <points ref={particlesRef} geometry={particleGeo}>
        <pointsMaterial
          color="#a8d8ea"
          size={0.04}
          transparent
          opacity={0.4}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          sizeAttenuation
        />
      </points>

      {/* Volumetric light rays removed to prevent giant vertical pillars */}

      {/* Caustic pattern on underside of surface */}
      <mesh
        ref={causticRef}
        position={[0, -0.1, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <planeGeometry args={[30, 30]} />
        <shaderMaterial
          vertexShader={causticVert}
          fragmentShader={causticFrag}
          uniforms={causticUniforms}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Ambient underwater glow tied to camera */}
      <pointLight
        position={[0, 0, 0]}
        color="#0891b2"
        intensity={0.2}
        distance={25}
        decay={2}
      />
    </group>
  );
}
