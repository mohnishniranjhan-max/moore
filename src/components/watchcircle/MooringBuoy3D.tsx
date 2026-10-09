import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { BuoyState } from './watchCircleTypes';

interface MooringBuoy3DProps {
  buoyState: BuoyState;
  buoyId: string;
  waveHeight?: number;
  wavePeriod?: number;
}

export function MooringBuoy3D({
  buoyState,
  buoyId,
  waveHeight = 1.5,
  wavePeriod = 8.0,
}: MooringBuoy3DProps) {
  const groupRef = useRef<THREE.Group>(null!);
  const strobeLightRef = useRef<THREE.PointLight>(null!);
  const leftAnemometerRef = useRef<THREE.Group>(null!);
  const rightAnemometerRef = useRef<THREE.Group>(null!);

  // Conversion: 1 3D unit = 30m
  const M_TO_3D = 1 / 30;
  const targetX = buoyState.excursionX * M_TO_3D;
  const targetZ = buoyState.excursionZ * M_TO_3D;

  // ── Procedural Canvas Textures for Authentic Photographic Markings ──

  // 1. Solar cell texture with vertical silver busbars (matching left solar panel in photo)
  const solarCellTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Deep photovoltaic blue-black silicon
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, 256, 256);

      // Silver vertical busbars
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 4;
      for (let x = 24; x < 256; x += 28) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 256);
        ctx.stroke();
      }

      // Fine grid cross-lines
      ctx.strokeStyle = 'rgba(203, 213, 225, 0.35)';
      ctx.lineWidth = 1;
      for (let y = 14; y < 256; y += 16) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(256, y);
        ctx.stroke();
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    return tex;
  }, []);

  // 2. Right solar panel texture with uniform monocrystalline cell texture
  const solarCellMonoTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(0, 0, 256, 256);
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 2;
      for (let x = 16; x < 256; x += 32) {
        ctx.strokeRect(x, 8, 26, 240);
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    return tex;
  }, []);

  // 3. Central Housing Stenciled Weather Buoy Lettering (exact match to photo)
  const housingTextTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#64748b'; // galvanized industrial gray
      ctx.fillRect(0, 0, 512, 256);
      ctx.fillStyle = '#090d16'; // stencil black
      ctx.font = 'bold 36px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('WEATHER BUOY', 256, 75);
      ctx.font = 'bold 28px sans-serif';
      ctx.fillText('OOS - NIOT', 256, 125);
      ctx.font = 'bold 24px monospace';
      ctx.fillText('16°21\'N  87°59\'E', 256, 170);
      ctx.font = 'bold 20px sans-serif';
      ctx.fillText('INDIA', 256, 210);
    }
    const tex = new THREE.CanvasTexture(canvas);
    return tex;
  }, []);

  // 4. Front Yellow Hull Stenciled Text: "OOS-NIOT-CHENNAI"
  const hullTextTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#eab308'; // matching safety yellow
      ctx.fillRect(0, 0, 512, 128);
      ctx.fillStyle = '#090d16'; // stencil black
      ctx.font = 'bold 40px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('OOS-NIOT-CHENNAI', 256, 64);
    }
    const tex = new THREE.CanvasTexture(canvas);
    return tex;
  }, []);

  useFrame((state) => {
    if (groupRef.current) {
      const t = state.clock.elapsedTime;
      const omega = (2 * Math.PI) / Math.max(3.5, wavePeriod);

      // Hydrodynamic wave heave, pitch, and roll response
      const heave = (waveHeight * 0.32 * M_TO_3D) * Math.sin(omega * t * 1.05);
      const pitch = THREE.MathUtils.clamp((waveHeight / 15) * Math.sin(omega * t), -0.22, 0.22);
      const roll = THREE.MathUtils.clamp((waveHeight / 18) * Math.cos(omega * t * 0.95), -0.18, 0.18);

      // Smoothly track physics horizontal target position
      groupRef.current.position.x = THREE.MathUtils.lerp(groupRef.current.position.x, targetX, 0.1);
      groupRef.current.position.z = THREE.MathUtils.lerp(groupRef.current.position.z, targetZ, 0.1);
      groupRef.current.position.y = THREE.MathUtils.lerp(groupRef.current.position.y, heave, 0.15);

      groupRef.current.rotation.x = THREE.MathUtils.lerp(groupRef.current.rotation.x, pitch, 0.1);
      groupRef.current.rotation.z = THREE.MathUtils.lerp(groupRef.current.rotation.z, roll, 0.1);
    }

    // Flash masthead navigation strobe light
    if (strobeLightRef.current) {
      const flash = Math.sin(state.clock.elapsedTime * 6.28) > 0.65 ? 2.5 : 0.05;
      strobeLightRef.current.intensity = flash;
    }

    // Spin dual anemometer cups realistically in ocean wind
    if (leftAnemometerRef.current) {
      leftAnemometerRef.current.rotation.y += 0.085;
    }
    if (rightAnemometerRef.current) {
      rightAnemometerRef.current.rotation.y += 0.092;
    }
  });

  return (
    <group ref={groupRef} position={[0, 0, 0]}>
      {/* ══════════════════════════════════════════════════════════════════
          1. EXACT NIOT OMNI BUOY HULL (MATCHING REFERENCE IMAGE)
          - Low-profile Maritime Yellow Torus/Discus Flotation Body
          - Thick Black Rubber Bumper Collar Dividing the Equator
          - Sloping Deck with Embedded Solar Panels, Ports & Shackle
          - Front Stenciled Markings: "OOS-NIOT-CHENNAI"
          ══════════════════════════════════════════════════════════════════ */}
      <group position={[0, 0, 0]}>
        {/* Main Yellow Toroidal Flotation Hull */}
        <mesh position={[0, 0.05, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[1.35, 1.48, 0.44, 40]} />
          <meshStandardMaterial
            color="#eab308"
            roughness={0.35}
            metalness={0.12}
          />
        </mesh>

        {/* Lower Hull Conical Chamfer */}
        <mesh position={[0, -0.22, 0]} receiveShadow>
          <cylinderGeometry args={[1.48, 0.95, 0.22, 40]} />
          <meshStandardMaterial color="#ca8a04" roughness={0.45} metalness={0.15} />
        </mesh>

        {/* Prominent Circumferential Black Rubber Fender Bumper Collar */}
        <mesh position={[0, 0.04, 0]} castShadow receiveShadow>
          <torusGeometry args={[1.46, 0.09, 16, 40]} />
          <meshStandardMaterial color="#0f172a" roughness={0.7} metalness={0.1} />
        </mesh>
        <mesh position={[0, -0.08, 0]} castShadow receiveShadow>
          <torusGeometry args={[1.44, 0.07, 16, 40]} />
          <meshStandardMaterial color="#0f172a" roughness={0.7} metalness={0.1} />
        </mesh>

        {/* Upper Sloping Deck Flange Plate */}
        <mesh position={[0, 0.28, 0]} receiveShadow>
          <cylinderGeometry args={[1.28, 1.35, 0.05, 36]} />
          <meshStandardMaterial color="#facc15" roughness={0.38} metalness={0.1} />
        </mesh>

        {/* Front Hull Rim Stenciled Signboard: "OOS-NIOT-CHENNAI" */}
        <mesh position={[0, 0.16, 1.38]} rotation={[-0.35, 0, 0]}>
          <planeGeometry args={[0.75, 0.18]} />
          <meshStandardMaterial
            map={hullTextTexture}
            roughness={0.4}
            metalness={0.1}
          />
        </mesh>

        {/* ── EMBEDDED SOLAR PANEL 1 (Front-Left, with Vertical Silver Busbars) ── */}
        <group position={[-0.32, 0.32, 0.72]} rotation={[-0.22, -0.25, 0]}>
          {/* Black Protective Frame Border */}
          <mesh castShadow receiveShadow>
            <boxGeometry args={[0.42, 0.025, 0.52]} />
            <meshStandardMaterial color="#090d16" roughness={0.6} />
          </mesh>
          {/* Photovoltaic Silicon Face with Silver Busbars */}
          <mesh position={[0, 0.014, 0]} receiveShadow>
            <planeGeometry args={[0.38, 0.48]} />
            <meshStandardMaterial
              map={solarCellTexture}
              roughness={0.2}
              metalness={0.8}
            />
          </mesh>
        </group>

        {/* ── EMBEDDED SOLAR PANEL 2 (Front-Right, with Silver Anodized Frame) ── */}
        <group position={[0.55, 0.31, 0.58]} rotation={[-0.22, 0.35, 0]}>
          {/* Silver Aluminum Frame */}
          <mesh castShadow receiveShadow>
            <boxGeometry args={[0.44, 0.025, 0.52]} />
            <meshStandardMaterial color="#cbd5e1" metalness={0.88} roughness={0.25} />
          </mesh>
          {/* Dark Monocrystalline Solar Cell Face */}
          <mesh position={[0, 0.014, 0]} receiveShadow>
            <planeGeometry args={[0.40, 0.48]} />
            <meshStandardMaterial
              map={solarCellMonoTexture}
              roughness={0.22}
              metalness={0.75}
            />
          </mesh>
        </group>

        {/* ── DECK DETAILS: Lifting U-Shackle, Circular Hatches & Recesses ── */}
        {/* Left Heavy-Duty Stainless Steel Lifting U-Shackle (Visible standing upright in photo) */}
        <group position={[-0.92, 0.38, 0.22]} rotation={[0, 0.3, 0]}>
          <mesh castShadow>
            <torusGeometry args={[0.075, 0.024, 12, 16]} />
            <meshStandardMaterial color="#cbd5e1" metalness={0.92} roughness={0.2} />
          </mesh>
          {/* Mounting Base Plate */}
          <mesh position={[0, -0.06, 0]}>
            <boxGeometry args={[0.16, 0.03, 0.12]} />
            <meshStandardMaterial color="#475569" metalness={0.9} roughness={0.3} />
          </mesh>
        </group>

        {/* Circular Black Inspection Port (on left deck between solar panel & shackle) */}
        <mesh position={[-0.72, 0.31, 0.52]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.11, 20]} />
          <meshStandardMaterial color="#090d16" roughness={0.7} />
        </mesh>

        {/* Circular Yellow Recessed Deck Wells */}
        <mesh position={[-0.78, 0.31, 0.82]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.08, 16]} />
          <meshStandardMaterial color="#ca8a04" roughness={0.5} />
        </mesh>
        <mesh position={[0.35, 0.31, 1.05]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.08, 16]} />
          <meshStandardMaterial color="#ca8a04" roughness={0.5} />
        </mesh>

        {/* Right Deck Towing / Tag Line Eye */}
        <group position={[1.05, 0.28, 0.55]} rotation={[0, -0.4, 0]}>
          <mesh castShadow>
            <torusGeometry args={[0.05, 0.016, 8, 16]} />
            <meshStandardMaterial color="#cbd5e1" metalness={0.9} />
          </mesh>
        </group>
      </group>

      {/* ══════════════════════════════════════════════════════════════════
          2. CENTRAL INDUSTRIAL EQUIPMENT SHELTER ("THE DOGHOUSE")
          - Galvanized/Painted Industrial Metallic Grey Enclosure
          - Front Face with Stenciled Black Lettering: "WEATHER BUOY..."
          - Flat Metallic Top Deck Supporting the Twin Mast Towers
          ══════════════════════════════════════════════════════════════════ */}
      <group position={[0, 0.52, -0.05]}>
        {/* Main Central Equipment Shelter Enclosure */}
        <mesh position={[0, 0, 0]} castShadow receiveShadow>
          <boxGeometry args={[1.15, 0.46, 0.95]} />
          <meshStandardMaterial color="#64748b" metalness={0.65} roughness={0.38} />
        </mesh>

        {/* Front Face with Stenciled Black Text Texture */}
        <mesh position={[0, 0, 0.48]}>
          <planeGeometry args={[1.12, 0.44]} />
          <meshStandardMaterial
            map={housingTextTexture}
            metalness={0.55}
            roughness={0.42}
          />
        </mesh>

        {/* Top Deck Metallic Flange / Lid Plate */}
        <mesh position={[0, 0.24, 0]} castShadow receiveShadow>
          <boxGeometry args={[1.18, 0.03, 0.98]} />
          <meshStandardMaterial color="#788896" metalness={0.7} roughness={0.35} />
        </mesh>

        {/* Cable Glands and Junction Ports on the Rear-Right Deck */}
        <group position={[0.38, 0.26, -0.28]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.045, 0.045, 0.08, 12]} />
            <meshStandardMaterial color="#1e293b" roughness={0.5} />
          </mesh>
          <mesh position={[0.08, 0, 0.06]} castShadow>
            <cylinderGeometry args={[0.035, 0.035, 0.08, 12]} />
            <meshStandardMaterial color="#1e293b" roughness={0.5} />
          </mesh>
        </group>
      </group>

      {/* ══════════════════════════════════════════════════════════════════
          3. TWIN VERTICAL WHITE MAST TOWERS (EXACT MATCH TO PHOTO)
          - Left Mast: White cylindrical lower column + dark Y-truss crossarm
          - Right Mast: White cylindrical lower column + dark Y-truss crossarm
          - Mounted on left and right sides of the central equipment housing
          ══════════════════════════════════════════════════════════════════ */}
      <group position={[0, 0.75, -0.15]}>
        {/* ────────────────────────────────────────────────────────────
            MAST 1: LEFT WHITE TOWER
            ──────────────────────────────────────────────────────────── */}
        <group position={[-0.42, 0, 0]}>
          {/* Base Mounting Flange on Shelter Roof */}
          <mesh position={[0, 0.02, 0]} castShadow>
            <cylinderGeometry args={[0.085, 0.095, 0.04, 16]} />
            <meshStandardMaterial color="#334155" metalness={0.8} />
          </mesh>

          {/* Lower Thick White Cylindrical Column (Approx 65% of mast height) */}
          <mesh position={[0, 0.88, 0]} castShadow>
            <cylinderGeometry args={[0.052, 0.058, 1.72, 20]} />
            <meshStandardMaterial
              color="#f8fafc"
              roughness={0.22}
              metalness={0.15}
            />
          </mesh>

          {/* Mid Transition Collar (Transition to dark upper neck) */}
          <mesh position={[0, 1.76, 0]}>
            <cylinderGeometry args={[0.045, 0.052, 0.06, 16]} />
            <meshStandardMaterial color="#1e293b" metalness={0.8} />
          </mesh>

          {/* Upper Dark/Black Tubular Neck */}
          <mesh position={[0, 1.95, 0]} castShadow>
            <cylinderGeometry args={[0.035, 0.038, 0.34, 16]} />
            <meshStandardMaterial color="#1e293b" roughness={0.4} metalness={0.65} />
          </mesh>

          {/* ── MASTHEAD Y-TRUSS & T-CROSSARM (Dark Black Tubular Steel) ── */}
          <group position={[0, 2.12, 0]}>
            {/* Horizontal Sensor Cross-Arm Beam */}
            <mesh position={[0, 0.16, 0]} castShadow>
              <boxGeometry args={[0.72, 0.032, 0.04]} />
              <meshStandardMaterial color="#1e293b" roughness={0.35} metalness={0.7} />
            </mesh>

            {/* Left Diagonal 45° Y-Support Strut */}
            <mesh
              position={[-0.14, 0.07, 0]}
              rotation={[0, 0, -0.78]}
              castShadow
            >
              <cylinderGeometry args={[0.016, 0.016, 0.24, 8]} />
              <meshStandardMaterial color="#1e293b" roughness={0.35} metalness={0.7} />
            </mesh>

            {/* Right Diagonal 45° Y-Support Strut */}
            <mesh
              position={[0.14, 0.07, 0]}
              rotation={[0, 0, 0.78]}
              castShadow
            >
              <cylinderGeometry args={[0.016, 0.016, 0.24, 8]} />
              <meshStandardMaterial color="#1e293b" roughness={0.35} metalness={0.7} />
            </mesh>

            {/* ── SENSORS ON LEFT MAST (Matching Image Exactly) ── */}
            {/* 1. Far Left Tip: Wind Anemometer (Black 3-Cup Rotor & Tail Vane) */}
            <group position={[-0.32, 0.28, 0]}>
              <mesh castShadow>
                <cylinderGeometry args={[0.018, 0.018, 0.22, 8]} />
                <meshStandardMaterial color="#090d16" roughness={0.4} />
              </mesh>
              {/* Rotating Anemometer Cup Rotor */}
              <group ref={leftAnemometerRef} position={[0, 0.12, 0]}>
                <mesh>
                  <sphereGeometry args={[0.024, 8, 8]} />
                  <meshStandardMaterial color="#090d16" />
                </mesh>
                {[0, (2 * Math.PI) / 3, (4 * Math.PI) / 3].map((a, i) => (
                  <group key={`lcup-${i}`} rotation={[0, a, 0]}>
                    <mesh position={[0.045, 0, 0]}>
                      <cylinderGeometry args={[0.005, 0.005, 0.09, 4]} />
                      <meshStandardMaterial color="#090d16" />
                    </mesh>
                    <mesh position={[0.09, 0, 0]}>
                      <sphereGeometry args={[0.018, 8, 8, 0, Math.PI]} />
                      <meshStandardMaterial color="#090d16" />
                    </mesh>
                  </group>
                ))}
              </group>
              {/* Direction Vane Tail */}
              <mesh position={[0, 0.05, -0.06]}>
                <boxGeometry args={[0.006, 0.04, 0.10]} />
                <meshStandardMaterial color="#090d16" />
              </mesh>
            </group>

            {/* 2. Mid-Left: White Conical GPS Radome (Pointed Cone Dome) */}
            <group position={[-0.11, 0.24, 0]}>
              <mesh castShadow>
                <cylinderGeometry args={[0.045, 0.055, 0.08, 16]} />
                <meshStandardMaterial color="#f8fafc" roughness={0.2} />
              </mesh>
              <mesh position={[0, 0.06, 0]}>
                <coneGeometry args={[0.045, 0.07, 16]} />
                <meshStandardMaterial color="#f8fafc" roughness={0.2} />
              </mesh>
            </group>

            {/* 3. Mid-Right: Thin White Vertical Whip Antenna */}
            <mesh position={[0.08, 0.36, 0]} castShadow>
              <cylinderGeometry args={[0.006, 0.008, 0.38, 6]} />
              <meshStandardMaterial color="#f8fafc" roughness={0.3} />
            </mesh>

            {/* 4. Far Right Tip: Marine Navigation Beacon Lantern */}
            <group position={[0.32, 0.26, 0]}>
              <mesh castShadow>
                <cylinderGeometry args={[0.045, 0.045, 0.18, 16]} />
                <meshStandardMaterial color="#f8fafc" roughness={0.2} />
              </mesh>
              {/* Flashing Amber Fresnel Beacon Lens */}
              <mesh position={[0, 0.04, 0]}>
                <cylinderGeometry args={[0.048, 0.048, 0.06, 16]} />
                <meshStandardMaterial
                  color="#fef08a"
                  emissive="#f59e0b"
                  emissiveIntensity={0.6}
                  roughness={0.15}
                />
              </mesh>
              <mesh position={[0, 0.10, 0]}>
                <sphereGeometry args={[0.045, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
                <meshStandardMaterial color="#f8fafc" roughness={0.2} />
              </mesh>
              {/* Masthead Point Light Strobe */}
              <pointLight
                ref={strobeLightRef}
                color="#fef08a"
                distance={14}
                decay={2}
                intensity={0.6}
              />
            </group>
          </group>
        </group>

        {/* ────────────────────────────────────────────────────────────
            MAST 2: RIGHT WHITE TOWER
            ──────────────────────────────────────────────────────────── */}
        <group position={[0.42, 0, 0]}>
          {/* Base Mounting Flange on Shelter Roof */}
          <mesh position={[0, 0.02, 0]} castShadow>
            <cylinderGeometry args={[0.085, 0.095, 0.04, 16]} />
            <meshStandardMaterial color="#334155" metalness={0.8} />
          </mesh>

          {/* Lower Thick White Cylindrical Column */}
          <mesh position={[0, 0.88, 0]} castShadow>
            <cylinderGeometry args={[0.052, 0.058, 1.72, 20]} />
            <meshStandardMaterial
              color="#f8fafc"
              roughness={0.22}
              metalness={0.15}
            />
          </mesh>

          {/* Mid Transition Collar */}
          <mesh position={[0, 1.76, 0]}>
            <cylinderGeometry args={[0.045, 0.052, 0.06, 16]} />
            <meshStandardMaterial color="#1e293b" metalness={0.8} />
          </mesh>

          {/* Upper Dark/Black Tubular Neck */}
          <mesh position={[0, 1.95, 0]} castShadow>
            <cylinderGeometry args={[0.035, 0.038, 0.34, 16]} />
            <meshStandardMaterial color="#1e293b" roughness={0.4} metalness={0.65} />
          </mesh>

          {/* ── MASTHEAD Y-TRUSS & T-CROSSARM (Dark Black Tubular Steel) ── */}
          <group position={[0, 2.12, 0]}>
            {/* Horizontal Sensor Cross-Arm Beam */}
            <mesh position={[0, 0.16, 0]} castShadow>
              <boxGeometry args={[0.72, 0.032, 0.04]} />
              <meshStandardMaterial color="#1e293b" roughness={0.35} metalness={0.7} />
            </mesh>

            {/* Left Diagonal 45° Y-Support Strut */}
            <mesh
              position={[-0.14, 0.07, 0]}
              rotation={[0, 0, -0.78]}
              castShadow
            >
              <cylinderGeometry args={[0.016, 0.016, 0.24, 8]} />
              <meshStandardMaterial color="#1e293b" roughness={0.35} metalness={0.7} />
            </mesh>

            {/* Right Diagonal 45° Y-Support Strut */}
            <mesh
              position={[0.14, 0.07, 0]}
              rotation={[0, 0, 0.78]}
              castShadow
            >
              <cylinderGeometry args={[0.016, 0.016, 0.24, 8]} />
              <meshStandardMaterial color="#1e293b" roughness={0.35} metalness={0.7} />
            </mesh>

            {/* ── SENSORS ON RIGHT MAST (Matching Image Exactly) ── */}
            {/* 1. Far Left Tip: Wind Anemometer (Black 3-Cup Rotor & Tail Vane) */}
            <group position={[-0.32, 0.28, 0]}>
              <mesh castShadow>
                <cylinderGeometry args={[0.018, 0.018, 0.22, 8]} />
                <meshStandardMaterial color="#090d16" roughness={0.4} />
              </mesh>
              {/* Rotating Anemometer Cup Rotor */}
              <group ref={rightAnemometerRef} position={[0, 0.12, 0]}>
                <mesh>
                  <sphereGeometry args={[0.024, 8, 8]} />
                  <meshStandardMaterial color="#090d16" />
                </mesh>
                {[0, (2 * Math.PI) / 3, (4 * Math.PI) / 3].map((a, i) => (
                  <group key={`rcup-${i}`} rotation={[0, a, 0]}>
                    <mesh position={[0.045, 0, 0]}>
                      <cylinderGeometry args={[0.005, 0.005, 0.09, 4]} />
                      <meshStandardMaterial color="#090d16" />
                    </mesh>
                    <mesh position={[0.09, 0, 0]}>
                      <sphereGeometry args={[0.018, 8, 8, 0, Math.PI]} />
                      <meshStandardMaterial color="#090d16" />
                    </mesh>
                  </group>
                ))}
              </group>
              {/* Direction Vane Tail */}
              <mesh position={[0, 0.05, -0.06]}>
                <boxGeometry args={[0.006, 0.04, 0.10]} />
                <meshStandardMaterial color="#090d16" />
              </mesh>
            </group>

            {/* 2. Center Hanging: White Octahedral Radar Reflector (Suspended below crossarm in photo!) */}
            <group position={[0.12, -0.06, 0]} rotation={[0.4, 0.5, 0.3]}>
              {/* Hanging Suspension Cord */}
              <mesh position={[0, 0.14, 0]}>
                <cylinderGeometry args={[0.004, 0.004, 0.18, 4]} />
                <meshStandardMaterial color="#e2e8f0" />
              </mesh>
              {/* White Diamond/Octahedral Faceted Metallic Plates */}
              <mesh castShadow>
                <octahedronGeometry args={[0.11, 0]} />
                <meshStandardMaterial color="#f8fafc" metalness={0.7} roughness={0.2} />
              </mesh>
            </group>

            {/* 3. Far Right Tip: White Cylindrical Sensor Canister */}
            <group position={[0.32, 0.26, 0]}>
              <mesh castShadow>
                <cylinderGeometry args={[0.045, 0.045, 0.18, 16]} />
                <meshStandardMaterial color="#f8fafc" roughness={0.2} />
              </mesh>
              <mesh position={[0, 0.10, 0]}>
                <sphereGeometry args={[0.045, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
                <meshStandardMaterial color="#f8fafc" roughness={0.2} />
              </mesh>
            </group>
          </group>

          {/* Black Sensor Cable Bundle Running Down the Mast to Shelter Roof */}
          <mesh position={[0.05, 0.85, 0.03]} rotation={[0, 0, -0.015]}>
            <cylinderGeometry args={[0.012, 0.012, 1.7, 6]} />
            <meshStandardMaterial color="#090d16" roughness={0.8} />
          </mesh>
        </group>
      </group>

      {/* ══════════════════════════════════════════════════════════════════
          4. SUBSURFACE BALLAST KEEL & MOORING BRIDLE ATTACHMENT
          - Keeps buoy physically stable with low center of gravity
          - Connects MoorSense inverse-catenary mooring line at -1.15m
          ══════════════════════════════════════════════════════════════════ */}
      <group position={[0, 0, 0]}>
        {/* Subsurface Central Keel Counterweight Block */}
        <mesh position={[0, -0.42, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.36, 0.30, 0.52, 20]} />
          <meshStandardMaterial color="#1e293b" metalness={0.75} roughness={0.35} />
        </mesh>
        <mesh position={[0, -0.68, 0]} castShadow>
          <cylinderGeometry args={[0.26, 0.24, 0.28, 16]} />
          <meshStandardMaterial color="#0f172a" metalness={0.8} roughness={0.4} />
        </mesh>

        {/* 3-Leg Steel Keel Bridle Legs */}
        {[0, 2.094, 4.188].map((angle, idx) => {
          const legRadius = 0.55;
          const startX = Math.sin(angle) * legRadius;
          const startZ = Math.cos(angle) * legRadius;
          const endY = -1.15;
          const midX = startX * 0.5;
          const midZ = startZ * 0.5;
          const midY = (-0.32 + endY) * 0.5;
          const len = Math.sqrt(midX * midX + midZ * midZ + Math.pow(endY + 0.32, 2));

          return (
            <mesh
              key={`bridle-${idx}`}
              position={[midX, midY, midZ]}
              rotation={[
                Math.atan2(Math.sqrt(midX * midX + midZ * midZ), 0.83),
                Math.atan2(midX, midZ),
                0,
              ]}
              castShadow
            >
              <cylinderGeometry args={[0.024, 0.024, len, 8]} />
              <meshStandardMaterial color="#475569" metalness={0.9} roughness={0.25} />
            </mesh>
          );
        })}

        {/* Heavy Forged Fairlead Attachment Swivel & Mooring Eye (at -1.15m) */}
        <group position={[0, -1.15, 0]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.08, 0.08, 0.16, 16]} />
            <meshStandardMaterial color="#334155" metalness={0.92} roughness={0.2} />
          </mesh>
          <mesh position={[0, -0.12, 0]} castShadow>
            <torusGeometry args={[0.14, 0.038, 12, 24]} />
            <meshStandardMaterial color="#0284c7" emissive="#0284c7" emissiveIntensity={0.6} />
          </mesh>
        </group>
      </group>
    </group>
  );
}
