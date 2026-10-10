import { useEffect, useState, useMemo } from 'react';
import * as THREE from 'three';
import { latLonToXYZ } from '../../utils/oceanCalc';

interface IndiaEEZProps {
  visible: boolean;
}

export function IndiaEEZ({ visible }: IndiaEEZProps) {
  const [geoData, setGeoData] = useState<any>(null);

  useEffect(() => {
    // Fetch the authoritative GeoJSON from the public data directory
    fetch('/data/india_eez.geojson')
      .then((res) => res.json())
      .then((data) => setGeoData(data))
      .catch((err) => console.error('Failed to load India EEZ GeoJSON:', err));
  }, []);

  const eezRings = useMemo(() => {
    if (!geoData || !geoData.features) return [];
    const rings: {
      points: THREE.Vector3[];
      curve: THREE.CatmullRomCurve3;
      geometry: THREE.BufferGeometry;
    }[] = [];

    const processRing = (coordList: number[][]) => {
      const pts: THREE.Vector3[] = [];
      coordList.forEach(([lon, lat]) => {
        // Radius 2.012 sits precisely above Earth surface (2.000) and below buoy markers (2.025)
        const [x, y, z] = latLonToXYZ(lat, lon, 2.012);
        pts.push(new THREE.Vector3(x, y, z));
      });

      if (pts.length > 2) {
        const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
        const geometry = new THREE.BufferGeometry().setFromPoints(pts);
        rings.push({ points: pts, curve, geometry });
      }
    };

    geoData.features.forEach((feature: any) => {
      const geom = feature.geometry;
      if (!geom) return;
      if (geom.type === 'Polygon') {
        geom.coordinates.forEach((ring: number[][]) => processRing(ring));
      } else if (geom.type === 'MultiPolygon') {
        geom.coordinates.forEach((poly: number[][][]) => {
          poly.forEach((ring: number[][]) => processRing(ring));
        });
      } else if (geom.type === 'LineString') {
        processRing(geom.coordinates);
      }
    });

    return rings;
  }, [geoData]);

  if (!visible || eezRings.length === 0) return null;

  return (
    <group name="MaritimeEconomicZones">
      {eezRings.map((ring, idx) => (
        <group key={`eez-boundary-${idx}`}>
          {/* Razor-sharp 1px line loop for clean outline at distant zoom */}
          <lineLoop geometry={ring.geometry}>
            <lineBasicMaterial
              color="#ff2233"
              transparent
              opacity={0.95}
              depthWrite={false}
            />
          </lineLoop>

          {/* Clean, thin 3D tubular boundary for smooth anti-aliased close-up view */}
          <mesh>
            <tubeGeometry
              args={[
                ring.curve,
                Math.max(40, ring.points.length * 2),
                0.0022, // Clean thin radius
                6,
                true, // Closed geographic loop
              ]}
            />
            <meshBasicMaterial
              color="#ef4444"
              transparent
              opacity={0.88}
              depthWrite={false}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}
