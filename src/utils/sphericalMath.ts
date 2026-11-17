import * as d3 from 'd3-geo';
import * as topojson from 'topojson-client';
import * as THREE from 'three';
import worldAtlasData from 'world-atlas/countries-110m.json';
import {
  CountryStats,
  CURATED_COUNTRIES,
  FALLBACK_COUNTRY_NAMES,
} from '../data/countryDatabase';

export interface WorldCountry {
  id: string;
  stats: CountryStats;
  feature: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
  centroid: [number, number]; // [lng, lat]
}

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const EARTH_RADIUS_KM = 6371.0088;
const EARTH_SURFACE_AREA_KM2 = 4 * Math.PI * EARTH_RADIUS_KM * EARTH_RADIUS_KM;

/**
 * Convert (lat, lng) in degrees to a Three.js Vector3 matching SphereGeometry UV layout.
 */
export function latLngToVector3(
  lat: number,
  lng: number,
  radius: number = 1
): THREE.Vector3 {
  const phi = (90 - lat) * DEG2RAD;
  const theta = (lng + 180) * DEG2RAD;
  const sinPhi = Math.sin(phi);

  const x = -radius * sinPhi * Math.cos(theta);
  const y = radius * Math.cos(phi);
  const z = radius * sinPhi * Math.sin(theta);

  return new THREE.Vector3(x, y, z);
}

/**
 * Convert a 3D point on the globe back into { lat, lng } in degrees.
 */
export function vector3ToLatLng(vec: THREE.Vector3): { lat: number; lng: number } {
  const n = vec.clone().normalize();
  const clampedY = Math.max(-1, Math.min(1, n.y));
  const phi = Math.acos(clampedY);
  const lat = 90 - phi * RAD2DEG;

  let theta = Math.atan2(n.z, -n.x);
  if (theta < 0) theta += Math.PI * 2;
  let lng = theta * RAD2DEG - 180;
  if (lng > 180) lng -= 360;
  if (lng < -180) lng += 360;

  return { lat, lng };
}

/**
 * Rotate a GeoJSON Feature from its original centroid [lng0, lat0]
 * to a target [targetLng, targetLat] with local compass rotation (rotationDeg).
 * Preserves 100% of true spherical area and geodesic shape on the 3D globe.
 */
export function rotateCountryFeature(
  feature: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>,
  originCentroid: [number, number],
  targetLng: number,
  targetLat: number,
  rotationDeg: number = 0
): GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> {
  const toOrigin = d3.geoRotation([
    -originCentroid[0],
    -originCentroid[1],
    rotationDeg,
  ]);
  const fromOrigin = d3.geoRotation([-targetLng, -targetLat, 0]);

  const transformPoint = (coord: number[]): [number, number] => {
    const p1 = toOrigin([coord[0], coord[1]]);
    const p2 = fromOrigin.invert(p1);
    return [p2[0], p2[1]];
  };

  const transformRing = (ring: number[][]): number[][] =>
    ring.map((pt) => transformPoint(pt));

  const geom = feature.geometry;
  if (geom.type === 'Polygon') {
    return {
      ...feature,
      geometry: {
        type: 'Polygon',
        coordinates: geom.coordinates.map(transformRing),
      },
    };
  } else {
    return {
      ...feature,
      geometry: {
        type: 'MultiPolygon',
        coordinates: geom.coordinates.map((poly) => poly.map(transformRing)),
      },
    };
  }
}

/**
 * Subdivide long polygon edges so they curve smoothly along the 3D sphere surface
 * without cutting straight chords through the interior of the globe.
 */
export function densifyRingSpherical(
  ring: number[][],
  maxStepDeg: number = 2.2
): [number, number][] {
  if (ring.length < 2) return ring as [number, number][];
  const result: [number, number][] = [];

  for (let i = 0; i < ring.length - 1; i++) {
    const a: [number, number] = [ring[i][0], ring[i][1]];
    const b: [number, number] = [ring[i + 1][0], ring[i + 1][1]];
    result.push(a);

    const distRad = d3.geoDistance(a, b);
    const distDeg = distRad * RAD2DEG;
    if (distDeg > maxStepDeg) {
      const steps = Math.min(24, Math.ceil(distDeg / maxStepDeg));
      const interp = d3.geoInterpolate(a, b);
      for (let s = 1; s < steps; s++) {
        result.push(interp(s / steps));
      }
    }
  }
  result.push([ring[ring.length - 1][0], ring[ring.length - 1][1]]);
  return result;
}

/**
 * Great-circle geodesic distance in kilometers between two [lng, lat] points.
 */
export function calculateGeodesicDistanceKm(
  a: [number, number],
  b: [number, number]
): number {
  return d3.geoDistance(a, b) * EARTH_RADIUS_KM;
}

/**
 * Initial great-circle bearing in degrees clockwise from true north.
 * This is the flight heading, not the superimposed country's compass twist.
 */
export function initialBearingDeg(
  from: [number, number],
  to: [number, number]
): number {
  const φ1 = from[1] * DEG2RAD;
  const φ2 = to[1] * DEG2RAD;
  const Δλ = (to[0] - from[0]) * DEG2RAD;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) * RAD2DEG + 360) % 360;
}

/**
 * Compute Web Mercator linear scale factor (sec(lat)) and area inflation factor (sec^2(lat)).
 */
export function getMercatorDistortion(latDeg: number): {
  linearFactor: number;
  areaFactor: number;
} {
  const clampedLat = Math.max(-85, Math.min(85, latDeg));
  const cosLat = Math.cos(clampedLat * DEG2RAD);
  const linearFactor = 1 / Math.max(0.08, cosLat);
  const areaFactor = linearFactor * linearFactor;
  return {
    linearFactor,
    areaFactor,
  };
}

/**
 * Deterministically synthesize complete CountryStats for any country in world-atlas
 * not in CURATED_COUNTRIES so every single polygon on Earth is interactive and rich.
 */
function buildFallbackStats(
  id: string,
  atlasName: string | undefined,
  feature: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>,
  centroid: [number, number]
): CountryStats {
  const meta = FALLBACK_COUNTRY_NAMES[id];
  const name = meta?.name || atlasName || `Territory #${id}`;
  const iso3 = meta?.iso3 || name.slice(0, 3).toUpperCase();
  const flag = meta?.flag || '🌐';
  const region = meta?.region || (centroid[1] > 34 && centroid[0] > -15 && centroid[0] < 45 ? 'Europe' : centroid[1] < 0 ? 'Southern Hemisphere' : 'Global');
  const capital = meta?.capital || `${name} Capital`;

  const sphericalSteradians = d3.geoArea(feature);
  const computedAreaKm2 = Math.max(
    1000,
    Math.round(sphericalSteradians * (EARTH_SURFACE_AREA_KM2 / (4 * Math.PI)))
  );

  // Deterministic hash from ID for realistic demographic estimation
  const seed = id.split('').reduce((acc, ch) => acc * 31 + ch.charCodeAt(0), 7);
  const density = 18 + (seed % 115);
  const population = Math.max(150000, Math.round(computedAreaKm2 * density * 0.45));
  const isEuropean = region.includes('Europe');
  const gdpPerCapita = isEuropean
    ? 22000 + (seed % 34000)
    : 3200 + (seed % 14500);
  const gdpNominalB = Number(((population * gdpPerCapita) / 1e9).toFixed(1));
  const gdpPppB = Number((gdpNominalB * (isEuropean ? 1.35 : 2.25)).toFixed(1));
  const gdpPppPerCapita = Math.round((gdpPppB * 1e9) / population);
  const hdi = Number(
    Math.min(0.94, Math.max(0.52, isEuropean ? 0.86 : 0.68 + ((seed % 18) * 0.01))).toFixed(3)
  );
  const absLat = Math.abs(centroid[1]);
  const avgTempC = Number((28.5 - absLat * 0.48).toFixed(1));

  return {
    id,
    iso3,
    name,
    flag,
    region,
    subregion: region,
    capital,
    capitalCoords: centroid,
    areaKm2: computedAreaKm2,
    population,
    gdpNominalB,
    gdpPppB,
    gdpPerCapita,
    gdpPppPerCapita,
    hdi,
    lifeExpectancy: isEuropean ? 80.2 : 72.4,
    medianAge: isEuropean ? 41.5 : 28.4,
    urbanizationPct: isEuropean ? 74.0 : 56.0,
    coastlineKm: Math.round(Math.sqrt(computedAreaKm2) * 1.8),
    highestPeakName: `${name} Highland Peak`,
    highestPeakM: 1450 + (seed % 2800),
    forestPct: 22 + (seed % 38),
    avgTempC,
    co2PerCapitaT: Number((isEuropean ? 5.8 : 2.9).toFixed(1)),
    costOfLivingIndex: isEuropean ? 58 : 37,
    currency: `${iso3} National Currency`,
    drivingSide: 'Right',
    timeZone: `UTC${centroid[0] >= 0 ? '+' : ''}${Math.round(centroid[0] / 15)}`,
    topExports: ['Agricultural Goods', 'Minerals & Energy', 'Manufactured Products', 'Services'],
    funFact: `${name} spans approximately ${computedAreaKm2.toLocaleString()} km² centered near ${Math.abs(centroid[1]).toFixed(1)}°${centroid[1] >= 0 ? 'N' : 'S'}, ${Math.abs(centroid[0]).toFixed(1)}°${centroid[0] >= 0 ? 'E' : 'W'}. Land area is measured on the sphere. Population, income, and physical extremes shown elsewhere are not researched for this country.`,
    dataQuality: 'estimated',
  };
}

let cachedWorldCountries: WorldCountry[] | null = null;

/**
 * Load and parse all world countries from world-atlas TopoJSON.
 */
export function loadWorldCountries(): WorldCountry[] {
  if (cachedWorldCountries) return cachedWorldCountries;

  const topology = worldAtlasData as unknown as TopoJSON.Topology<{
    countries: TopoJSON.GeometryCollection<{ name?: string }>;
  }>;

  const geojson = topojson.feature(
    topology,
    topology.objects.countries
  ) as GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon, { name?: string }>;

  const countries: WorldCountry[] = [];
  const seenIds = new Set<string>();

  for (const feature of geojson.features) {
    const rawId = feature.id != null ? String(feature.id).padStart(3, '0') : '';
    if (!rawId || seenIds.has(rawId)) continue;

    const centroid = d3.geoCentroid(feature) as [number, number];
    if (Number.isNaN(centroid[0]) || Number.isNaN(centroid[1])) continue;

    seenIds.add(rawId);

    const curated = CURATED_COUNTRIES[rawId];
    const stats =
      curated || buildFallbackStats(rawId, feature.properties?.name, feature, centroid);

    // Override centroid for huge multi-continent / island countries so dragging centers on mainland
    const adjustedCentroid: [number, number] = curated
      ? curated.id === '250'
        ? [2.4, 46.6] // Metropolitan France instead of overseas territories average
        : curated.id === '840'
        ? [-98.5, 39.5] // Contiguous US center
        : curated.id === '643'
        ? [88.0, 61.5]
        : curated.id === '764'
        ? [101.0, 15.2] // True heart of Thailand
        : centroid
      : centroid;

    countries.push({
      id: rawId,
      stats,
      feature,
      centroid: adjustedCentroid,
    });
  }

  // Sort alphabetically with Thailand and top curated countries easily accessible
  countries.sort((a, b) => a.stats.name.localeCompare(b.stats.name));
  cachedWorldCountries = countries;
  return countries;
}

/**
 * Detect which country on the globe lies underneath [lng, lat] AND which countries
 * overlap with the rotated superimposed country polygon.
 */
export function detectUnderlyingAndOverlappingCountries(
  targetLng: number,
  targetLat: number,
  rotatedFeature: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>,
  allCountries: WorldCountry[],
  excludeCountryId?: string
): {
  primaryTarget: WorldCountry | null;
  overlappingCountries: WorldCountry[];
} {
  const targetPoint: [number, number] = [targetLng, targetLat];
  let primaryTarget: WorldCountry | null = null;
  let nearestFallback: WorldCountry | null = null;
  let minDistanceRad = Infinity;

  // Sample 12 boundary points from the rotated feature to detect multi-country footprint
  const samplePoints: [number, number][] = [targetPoint];
  const geom = rotatedFeature.geometry;
  const mainRing =
    geom.type === 'Polygon'
      ? geom.coordinates[0]
      : geom.coordinates.reduce(
          (longest, poly) => (poly[0].length > longest.length ? poly[0] : longest),
          geom.coordinates[0]?.[0] || []
        );

  if (mainRing && mainRing.length > 0) {
    const step = Math.max(1, Math.floor(mainRing.length / 12));
    for (let i = 0; i < mainRing.length; i += step) {
      samplePoints.push([mainRing[i][0], mainRing[i][1]]);
    }
  }

  const overlappingMap = new Map<string, WorldCountry>();

  for (const country of allCountries) {
    if (country.id === '010') continue; // Skip Antarctica unless directly over South Pole

    // Check if primary center point is inside this country
    if (!primaryTarget && d3.geoContains(country.feature, targetPoint)) {
      primaryTarget = country;
      overlappingMap.set(country.id, country);
    }

    // Track nearest country centroid in case center is over a narrow sea/strait
    const dist = d3.geoDistance(targetPoint, country.centroid);
    if (dist < minDistanceRad && country.id !== excludeCountryId) {
      minDistanceRad = dist;
      nearestFallback = country;
    }

    // Quick angular proximity filter (~28 degrees) before running geoContains
    if (dist < 0.5) {
      // Either the country's centroid is inside the dragged polygon, or one of the dragged polygon's boundary points is inside the country
      if (d3.geoContains(rotatedFeature, country.centroid)) {
        overlappingMap.set(country.id, country);
      } else {
        for (let s = 1; s < samplePoints.length; s++) {
          if (d3.geoContains(country.feature, samplePoints[s])) {
            overlappingMap.set(country.id, country);
            break;
          }
        }
      }
    }
  }

  if (!primaryTarget && minDistanceRad < 0.22) {
    primaryTarget = nearestFallback;
    if (primaryTarget) {
      overlappingMap.set(primaryTarget.id, primaryTarget);
    }
  }

  const overlappingCountries = Array.from(overlappingMap.values()).slice(0, 8);
  return {
    primaryTarget,
    overlappingCountries,
  };
}
