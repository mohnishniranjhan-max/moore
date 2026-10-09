import { useRef, useMemo } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { computeWaveParams } from '../../utils/waveMath';

interface WaveSurfaceProps {
  waveHeight: number;      // Real observed wave height (meters)
  modelWaveHeight: number; // Model predicted wave height
  currentSpeed: number;    // Current speed (m/s) — influences wave direction
  temperature: number;     // SST — influences water color
  depth: number;           // Current dive depth — surface fades as we descend
  isDifference?: boolean;  // Whether to render the model's prediction as a holographic ghost
}

// ── Hybrid Cinematic Vertex Shader ───────────────────────────────────────────
const waveVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uAmplitude;
  uniform float uChoppiness;
  uniform float uFrequency;
  uniform vec2 uDirection;

  varying vec3 vWorldPosition;
  varying vec3 vNormal;
  varying vec2 vUv;
  varying float vElevation;

  vec3 gerstnerWave(vec2 pos, float amp, float freq, vec2 dir, float phase, float steep) {
    float d = dot(dir, pos);
    float s = sin(d * freq - phase);
    float c = cos(d * freq - phase);
    vec3 offset;
    offset.x = steep * amp * dir.x * c;
    offset.z = steep * amp * dir.y * c;
    offset.y = amp * s;
    return offset;
  }
  
  vec2 rotateVec2(vec2 v, float a) {
    float s = sin(a);
    float c = cos(a);
    return vec2(v.x * c - v.y * s, v.x * s + v.y * c);
  }
  
  vec3 getDisplacement(vec2 p, float amp, float freq, vec2 dir, float t, float steep) {
    vec2 d1 = dir;
    vec2 d2 = rotateVec2(dir, 0.5);
    vec2 d3 = rotateVec2(dir, -0.7);
    vec2 d4 = rotateVec2(dir, 1.2);
    
    vec3 w1 = gerstnerWave(p, amp, freq, d1, t * 1.2, steep);
    vec3 w2 = gerstnerWave(p, amp * 0.45, freq * 1.7, d2, t * 1.5, steep * 0.8);
    vec3 w3 = gerstnerWave(p, amp * 0.3, freq * 2.3, d3, t * 1.8, steep * 0.6);
    vec3 w4 = gerstnerWave(p, amp * 0.15, freq * 4.1, d4, t * 2.5, steep * 0.3);
    
    return w1 + w2 + w3 + w4;
  }
  
  void main() {
    vUv = uv;
    vec3 pos = position;
    
    float amp = uAmplitude;
    float t = uTime;
    
    vec3 offset = getDisplacement(pos.xz, amp, uFrequency, uDirection, t, uChoppiness);
    vec3 displaced = pos + offset;
    
    vElevation = displaced.y;
    vWorldPosition = (modelMatrix * vec4(displaced, 1.0)).xyz;
    
    // Finite difference for exact geometric normal
    float eps = 0.1;
    vec3 px = pos + vec3(eps, 0.0, 0.0) + getDisplacement(pos.xz + vec2(eps, 0.0), amp, uFrequency, uDirection, t, uChoppiness);
    vec3 pz = pos + vec3(0.0, 0.0, eps) + getDisplacement(pos.xz + vec2(0.0, eps), amp, uFrequency, uDirection, t, uChoppiness);
    
    vNormal = normalize(cross(pz - displaced, px - displaced));
    
    gl_Position = projectionMatrix * viewMatrix * vec4(vWorldPosition, 1.0);
  }
`;

// ── Hybrid Cinematic Fragment Shader ─────────────────────────────────────────
const waveFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uDeepColor;
  uniform vec3 uShallowColor;
  uniform vec3 uSunDirection;
  uniform sampler2D tNormal;
  uniform float uOpacity;
  uniform float uIsHologram;

  varying vec3 vWorldPosition;
  varying vec3 vNormal;
  varying vec2 vUv;
  varying float vElevation;

  vec3 unpackNormal(vec4 n) {
    return normalize(n.xyz * 2.0 - 1.0);
  }

  float distributionGGX(vec3 N, vec3 H, float roughness) {
    float a = roughness * roughness;
    float a2 = a * a;
    float NdotH = max(dot(N, H), 0.0);
    float NdotH2 = NdotH * NdotH;
    float num = a2;
    float denom = (NdotH2 * (a2 - 1.0) + 1.0);
    denom = 3.14159265 * denom * denom;
    return num / max(denom, 0.0001);
  }

  void main() {
    if (uIsHologram > 0.5) {
      // Holographic glowing wireframe effect for the model difference visualization
      float dist = length(vWorldPosition.xz - cameraPosition.xz);
      float falloff = smoothstep(180.0, 30.0, dist);
      float pulse = sin(uTime * 2.0 - vWorldPosition.x * 0.1) * 0.5 + 0.5;
      vec3 holoColor = mix(vec3(0.133, 0.827, 0.933), vec3(0.961, 0.620, 0.043), vElevation * 0.5 + 0.5);
      gl_FragColor = vec4(holoColor, uOpacity * falloff * (0.3 + pulse * 0.3));
      return;
    }

    // 1. High-frequency wind ripples via dual-layer scrolling normal maps
    vec2 uv0 = (vWorldPosition.xz * 0.035) + vec2(uTime * 0.025, uTime * 0.018);
    vec2 uv1 = (vWorldPosition.xz * 0.075) + vec2(-uTime * 0.018, uTime * 0.022);
    
    vec3 n0 = unpackNormal(texture2D(tNormal, uv0));
    vec3 n1 = unpackNormal(texture2D(tNormal, uv1));
    vec3 microNormal = normalize(n0 + n1 * 0.7);

    // Combine geometric wave normal with animated micro-ripples
    vec3 N = normalize(vNormal + vec3(microNormal.x * 0.55, 0.0, microNormal.y * 0.55));

    vec3 V = normalize(cameraPosition - vWorldPosition);
    vec3 L = normalize(uSunDirection);
    vec3 H = normalize(L + V);

    float NdotV = max(dot(N, V), 0.001);
    float NdotL = max(dot(N, L), 0.0);

    // 2. Base Oceanic Color Gradient
    // Deep navy/slate in troughs and shadows, rich teal at peaks
    float heightMix = smoothstep(-0.8, 1.2, vElevation);
    vec3 deepNavy = vec3(0.012, 0.065, 0.14);    // Deep oceanic body
    vec3 shallowTeal = vec3(0.04, 0.22, 0.32);   // Crest volume
    vec3 baseColor = mix(deepNavy, shallowTeal, heightMix);

    // 3. Subsurface Scattering (sunlight penetrating through wave peaks)
    float sss = pow(max(dot(V, -L), 0.0), 3.0) * heightMix * 0.45;
    baseColor += vec3(0.05, 0.55, 0.60) * sss; // Translucent cyan/emerald glow

    // 4. Wave Crest Foam
    // Foam forms on steep, elevated crests
    float crestSlope = clamp(1.0 - N.y, 0.0, 1.0);
    float foamIntensity = smoothstep(0.55, 1.1, vElevation + crestSlope * 0.6);
    // Modulate foam with micro-normal noise pattern
    float foamNoise = clamp((microNormal.x + microNormal.y) * 0.5 + 0.5, 0.0, 1.0);
    foamIntensity *= smoothstep(0.3, 0.7, foamNoise);
    vec3 foamColor = vec3(0.88, 0.95, 1.0);

    // 5. Sky Reflection & Fresnel (Schlick approximation)
    float f0 = 0.02; // Water Index of Refraction (IOR 1.333)
    float fresnel = f0 + (1.0 - f0) * pow(1.0 - NdotV, 5.0);
    
    // Atmospheric sky reflection corresponding to the sky dome palette
    vec3 R = reflect(-V, N);
    vec3 skyZenith = vec3(0.04, 0.12, 0.28);    // Deep slate blue
    vec3 skyMid = vec3(0.18, 0.38, 0.60);       // Cool azure
    vec3 skyHorizon = vec3(0.50, 0.66, 0.78);   // Atmospheric haze
    
    float skyElev = max(R.y, 0.0);
    vec3 skyRefl = mix(skyHorizon, skyMid, pow(skyElev, 0.7));
    skyRefl = mix(skyRefl, skyZenith, pow(skyElev, 1.8));

    // 6. Physically-inspired GGX Sun Glitter
    float ggxSharp = distributionGGX(N, H, 0.045) * 0.35; // Sharp glints
    float ggxBroad = distributionGGX(N, H, 0.22) * 0.12;  // Soft luster
    vec3 sunLightColor = vec3(1.0, 0.88, 0.68) * 4.5;
    vec3 sunSpecular = (ggxSharp + ggxBroad) * sunLightColor * NdotL;

    // 7. Composition of Water Shading
    vec3 waterColor = mix(baseColor, skyRefl, fresnel) + sunSpecular * fresnel;
    
    // Apply crest foam
    waterColor = mix(waterColor, foamColor, foamIntensity * 0.65);

    // 8. Distance-Aware Atmospheric Horizon Fade (aerial perspective)
    float dist = length(vWorldPosition.xz - cameraPosition.xz);
    float fogFactor = smoothstep(60.0, 240.0, dist);
    waterColor = mix(waterColor, skyHorizon, fogFactor * 0.82);

    gl_FragColor = vec4(waterColor, uOpacity);
  }
`;

export function WaveSurface({ waveHeight, modelWaveHeight, currentSpeed, temperature, depth, isDifference }: WaveSurfaceProps) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const materialRef = useRef<THREE.ShaderMaterial>(null!);
  const modelMaterialRef = useRef<THREE.ShaderMaterial>(null!);

  const waveParams = useMemo(() => {
    return computeWaveParams(waveHeight, modelWaveHeight, currentSpeed, temperature);
  }, [waveHeight, modelWaveHeight, currentSpeed, temperature]);

  const modelWaveParams = useMemo(() => {
    // For the model's prediction, the primary amplitude is derived from the modelWaveHeight
    return computeWaveParams(modelWaveHeight, waveHeight, currentSpeed, temperature);
  }, [waveHeight, modelWaveHeight, currentSpeed, temperature]);

  const waterNormals = useLoader(THREE.TextureLoader, '/textures/waternormals.jpg');
  waterNormals.wrapS = waterNormals.wrapT = THREE.RepeatWrapping;

  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(2000, 2000, 64, 64);
    geo.rotateX(-Math.PI / 2);
    return geo;
  }, []);

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uAmplitude: { value: waveParams.amplitude },
    uChoppiness: { value: waveParams.choppiness },
    uFrequency: { value: waveParams.frequency },
    uDirection: { value: waveParams.direction },
    uDeepColor: { value: waveParams.deepColor },
    uShallowColor: { value: waveParams.shallowColor },
    uSunDirection: { value: new THREE.Vector3(100, 32, -80).normalize() },
    tNormal: { value: waterNormals },
    uOpacity: { value: 1.0 },
    uIsHologram: { value: 0.0 },
  }), [waterNormals]); // eslint-disable-line react-hooks/exhaustive-deps

  const modelUniforms = useMemo(() => ({
    uTime: { value: 0 },
    uAmplitude: { value: modelWaveParams.amplitude },
    uChoppiness: { value: modelWaveParams.choppiness },
    uFrequency: { value: modelWaveParams.frequency },
    uDirection: { value: modelWaveParams.direction },
    uDeepColor: { value: modelWaveParams.deepColor },
    uShallowColor: { value: modelWaveParams.shallowColor },
    uSunDirection: { value: new THREE.Vector3(100, 32, -80).normalize() },
    tNormal: { value: waterNormals },
    uOpacity: { value: 1.0 },
    uIsHologram: { value: 1.0 },
  }), [waterNormals]); // eslint-disable-line react-hooks/exhaustive-deps

  useFrame((state) => {
    const targetOpacity = depth > 50 ? Math.max(0.1, 1.0 - depth / 1200) : 1.0;

    if (materialRef.current) {
      const mat = materialRef.current;
      mat.uniforms.uTime.value = state.clock.elapsedTime;
      mat.uniforms.uAmplitude.value += (waveParams.amplitude - mat.uniforms.uAmplitude.value) * 0.02;
      mat.uniforms.uChoppiness.value += (waveParams.choppiness - mat.uniforms.uChoppiness.value) * 0.02;
      mat.uniforms.uFrequency.value += (waveParams.frequency - mat.uniforms.uFrequency.value) * 0.02;
      mat.uniforms.uOpacity.value += (targetOpacity - mat.uniforms.uOpacity.value) * 0.03;
    }

    if (modelMaterialRef.current) {
      const mat = modelMaterialRef.current;
      mat.uniforms.uTime.value = state.clock.elapsedTime;
      mat.uniforms.uAmplitude.value += (modelWaveParams.amplitude - mat.uniforms.uAmplitude.value) * 0.02;
      mat.uniforms.uChoppiness.value += (modelWaveParams.choppiness - mat.uniforms.uChoppiness.value) * 0.02;
      mat.uniforms.uFrequency.value += (modelWaveParams.frequency - mat.uniforms.uFrequency.value) * 0.02;
      mat.uniforms.uOpacity.value += (targetOpacity - mat.uniforms.uOpacity.value) * 0.03;
    }
  });

  return (
    <group>
      {/* Real Observed Wave Surface */}
      <mesh
        ref={meshRef}
        geometry={geometry}
        position={[0, 0, 0]}
        receiveShadow
      >
        <shaderMaterial
          ref={materialRef}
          vertexShader={waveVertexShader}
          fragmentShader={waveFragmentShader}
          uniforms={uniforms}
          transparent
          side={THREE.DoubleSide}
          depthWrite
        />
      </mesh>

      {/* Holographic Model Wave Surface */}
      {isDifference && (
        <mesh
          geometry={geometry}
          position={[0, 0, 0]}
        >
          <shaderMaterial
            ref={modelMaterialRef}
            vertexShader={waveVertexShader}
            fragmentShader={waveFragmentShader}
            uniforms={modelUniforms}
            transparent
            wireframe={true}
            side={THREE.DoubleSide}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      )}
    </group>
  );
}

