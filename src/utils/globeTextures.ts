import * as d3 from 'd3-geo';
import * as THREE from 'three';
import { ChoroplethMetric, GlobeLayerId } from '../data/countryDatabase';
import { WorldCountry } from './sphericalMath';

const TEX_WIDTH = 2048;
const TEX_HEIGHT = 1024;

// Real-world major mountain ranges & plateaus [lng, lat, radiusDeg, intensity]
const MOUNTAIN_RANGES: [number, number, number, number][] = [
  // Himalayas & Tibetan Plateau
  [86.9, 28.0, 9.5, 1.0],
  [82.0, 32.5, 12.0, 0.92],
  [92.0, 33.0, 11.0, 0.88],
  [76.5, 35.8, 8.0, 0.95], // Karakoram / Pamirs
  [70.0, 38.0, 7.0, 0.8], // Tian Shan / Hindu Kush
  // Southeast Asia: Shan Hills, Tenasserim, Annamite Range
  [98.5, 19.5, 5.5, 0.58],
  [99.0, 14.0, 4.5, 0.45],
  [106.5, 17.5, 5.0, 0.52],
  // Andes Spine (South America)
  [-70.0, -33.0, 5.5, 0.92],
  [-68.0, -22.0, 6.5, 0.9],
  [-75.5, -11.0, 6.0, 0.88],
  [-78.0, -1.5, 5.5, 0.82],
  [-74.0, 5.0, 5.0, 0.75],
  // North American Rockies & Sierra Madre
  [-115.0, 51.0, 7.5, 0.78],
  [-109.0, 41.0, 8.5, 0.76],
  [-106.5, 38.5, 7.0, 0.82],
  [-118.5, 36.8, 5.5, 0.75],
  [-100.0, 20.0, 7.5, 0.72],
  [-151.0, 63.0, 6.5, 0.88], // Alaska Range
  // European Alps, Pyrenees, Caucasus, Carpathians, Urals
  [9.5, 46.5, 4.8, 0.82],
  [0.5, 42.7, 3.5, 0.65],
  [43.0, 42.5, 5.0, 0.86],
  [25.0, 46.5, 4.5, 0.58],
  [60.0, 58.0, 8.0, 0.52],
  // Iranian & Anatolian Plateaus
  [52.0, 33.5, 8.5, 0.72],
  [38.0, 39.0, 7.0, 0.68],
  // East African Rift & Ethiopian Highlands
  [39.0, 9.0, 6.5, 0.78],
  [36.5, -2.5, 6.0, 0.76],
  [29.0, -26.0, 6.5, 0.64], // Drakensberg
  // Japanese Alps & New Zealand Southern Alps & New Guinea Highlands
  [138.2, 36.2, 3.5, 0.72],
  [170.2, -43.6, 3.5, 0.75],
  [138.0, -4.5, 5.5, 0.82],
];

// Real-world night-light megacity corridors [lng, lat, spreadPx, brightness]
const NIGHT_CITY_CLUSTERS: [number, number, number, number][] = [
  // Thailand & ASEAN
  [100.5, 13.75, 22, 1.0], // Bangkok Metropolitan
  [100.9, 12.93, 14, 0.85], // Eastern Seaboard / Pattaya / Rayong
  [98.98, 18.79, 13, 0.78], // Chiang Mai
  [98.39, 7.88, 11, 0.72], // Phuket
  [102.83, 16.43, 12, 0.7], // Khon Kaen / Isan
  [103.82, 1.35, 20, 1.0], // Singapore / Johor
  [101.69, 3.14, 18, 0.92], // Kuala Lumpur
  [106.63, 10.82, 19, 0.92], // Ho Chi Minh City
  [105.83, 21.03, 17, 0.88], // Hanoi
  [106.85, -6.21, 24, 0.96], // Jakarta
  [112.75, -7.25, 19, 0.86], // Surabaya / Java
  [120.98, 14.6, 21, 0.94], // Manila
  // East Asia
  [114.1, 22.5, 32, 1.0], // Pearl River Delta (HK-Shenzhen-Guangzhou)
  [121.47, 31.23, 34, 1.0], // Shanghai / Yangtze Delta
  [116.4, 39.9, 30, 0.98], // Beijing-Tianjin
  [104.06, 30.67, 22, 0.88], // Chengdu-Chongqing
  [114.3, 30.6, 20, 0.85], // Wuhan
  [121.56, 25.03, 18, 0.92], // Taipei
  [139.69, 35.69, 34, 1.0], // Tokyo-Yokohama
  [135.5, 34.69, 25, 0.95], // Osaka-Kobe-Kyoto
  [136.9, 35.18, 20, 0.9], // Nagoya
  [126.98, 37.57, 28, 1.0], // Seoul-Incheon
  [129.07, 35.18, 18, 0.86], // Busan
  // South Asia & Middle East
  [77.21, 28.61, 32, 0.98], // Delhi NCR
  [72.88, 19.08, 26, 0.96], // Mumbai
  [88.36, 22.57, 25, 0.9], // Kolkata
  [77.59, 12.97, 22, 0.9], // Bengaluru
  [80.27, 13.08, 20, 0.86], // Chennai
  [67.0, 24.86, 21, 0.88], // Karachi
  [74.35, 31.52, 22, 0.88], // Lahore
  [55.27, 25.2, 24, 1.0], // Dubai-Abu Dhabi
  [46.68, 24.71, 20, 0.9], // Riyadh
  [51.39, 35.69, 22, 0.9], // Tehran
  [31.24, 30.04, 28, 1.0], // Cairo & Nile Delta
  [34.78, 32.08, 18, 0.9], // Tel Aviv-Jerusalem
  [28.98, 41.01, 24, 0.95], // Istanbul
  // Europe
  [-0.13, 51.51, 30, 1.0], // London
  [-2.24, 53.48, 22, 0.9], // Manchester-Birmingham
  [2.35, 48.86, 28, 1.0], // Paris
  [4.9, 52.37, 26, 0.96], // Randstad (Amsterdam-Rotterdam-Brussels)
  [6.96, 50.94, 28, 0.96], // Rhine-Ruhr
  [13.4, 52.52, 22, 0.9], // Berlin
  [11.58, 48.14, 20, 0.88], // Munich
  [9.19, 45.46, 26, 0.95], // Milan / Po Valley
  [12.5, 41.9, 21, 0.88], // Rome-Naples
  [-3.7, 40.42, 23, 0.92], // Madrid
  [2.17, 41.39, 19, 0.88], // Barcelona
  [21.01, 52.23, 20, 0.86], // Warsaw
  [37.62, 55.76, 30, 0.98], // Moscow
  [30.33, 59.93, 20, 0.88], // St. Petersburg
  [18.07, 59.33, 17, 0.85], // Stockholm
  // Americas
  [-74.0, 40.71, 34, 1.0], // New York - BosWash Corridor
  [-77.04, 38.91, 26, 0.94], // Washington-Baltimore
  [-87.63, 41.88, 28, 0.96], // Chicago-Great Lakes
  [-79.38, 43.65, 23, 0.92], // Toronto
  [-84.39, 33.75, 24, 0.9], // Atlanta
  [-80.19, 25.76, 22, 0.92], // Miami
  [-95.37, 29.76, 25, 0.94], // Houston
  [-96.8, 32.78, 25, 0.94], // Dallas-Fort Worth
  [-118.24, 34.05, 30, 1.0], // Los Angeles-SoCal
  [-122.42, 37.77, 23, 0.92], // San Francisco Bay Area
  [-99.13, 19.43, 28, 0.98], // Mexico City
  [-46.63, -23.55, 30, 0.98], // São Paulo-Rio
  [-58.38, -34.6, 25, 0.94], // Buenos Aires
  [-70.67, -33.45, 19, 0.86], // Santiago
  [-74.07, 4.71, 19, 0.86], // Bogotá
  // Africa & Oceania
  [3.38, 6.52, 22, 0.88], // Lagos
  [28.05, -26.2, 22, 0.9], // Johannesburg-Pretoria
  [36.82, -1.29, 16, 0.78], // Nairobi
  [151.21, -33.87, 22, 0.92], // Sydney
  [144.96, -37.81, 21, 0.9], // Melbourne
];

const POLITICAL_PALETTE = [
  '#3b82f6', // Royal Blue
  '#10b981', // Emerald
  '#8b5cf6', // Violet
  '#f59e0b', // Amber
  '#ec4899', // Rose
  '#06b6d4', // Cyan
  '#84cc16', // Lime
  '#f97316', // Orange
  '#6366f1', // Indigo
  '#14b8a6', // Teal
];

const textureCache = new Map<string, THREE.CanvasTexture>();
let cachedBumpTexture: THREE.CanvasTexture | null = null;

function lngLatToPixel(lng: number, lat: number): [number, number] {
  const x = ((lng + 180) / 360) * TEX_WIDTH;
  const y = ((90 - lat) / 180) * TEX_HEIGHT;
  return [x, y];
}

/**
 * Generate a 3D bump/relief map texture for mountain elevation & continental shelf height.
 */
export function getGlobeBumpTexture(countries: WorldCountry[]): THREE.CanvasTexture {
  if (cachedBumpTexture) return cachedBumpTexture;

  const canvas = document.createElement('canvas');
  canvas.width = TEX_WIDTH;
  canvas.height = TEX_HEIGHT;
  const ctx = canvas.getContext('2d')!;

  // Deep ocean floor = black (low elevation)
  ctx.fillStyle = '#080808';
  ctx.fillRect(0, 0, TEX_WIDTH, TEX_HEIGHT);

  const projection = d3
    .geoEquirectangular()
    .scale(TEX_WIDTH / (2 * Math.PI))
    .translate([TEX_WIDTH / 2, TEX_HEIGHT / 2]);
  const path = d3.geoPath(projection, ctx);

  // Continental shelf glow
  ctx.save();
  ctx.beginPath();
  for (const c of countries) {
    path(c.feature);
  }
  ctx.shadowColor = '#383838';
  ctx.shadowBlur = 14;
  ctx.fillStyle = '#323232';
  ctx.fill();
  ctx.restore();

  // Base landmass elevation
  ctx.save();
  ctx.beginPath();
  for (const c of countries) {
    path(c.feature);
  }
  ctx.clip();

  ctx.fillStyle = '#4a4a4a';
  ctx.fillRect(0, 0, TEX_WIDTH, TEX_HEIGHT);

  // Add mountain range elevation radial peaks
  for (const [lng, lat, radiusDeg, intensity] of MOUNTAIN_RANGES) {
    const [cx, cy] = lngLatToPixel(lng, lat);
    const rPx = (radiusDeg / 360) * TEX_WIDTH * 1.3;
    const grad = ctx.createRadialGradient(cx, cy, rPx * 0.08, cx, cy, rPx);
    const peakVal = Math.round(90 + intensity * 165);
    grad.addColorStop(0, `rgb(${peakVal}, ${peakVal}, ${peakVal})`);
    grad.addColorStop(0.5, `rgb(${Math.round(peakVal * 0.65)}, ${Math.round(peakVal * 0.65)}, ${Math.round(peakVal * 0.65)})`);
    grad.addColorStop(1, 'rgba(74, 74, 74, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, rPx, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  cachedBumpTexture = texture;
  return texture;
}

/**
 * Helper to compute normalized [0..1] choropleth score for a country.
 */
export function getChoroplethNormalizedValue(
  country: WorldCountry,
  metric: ChoroplethMetric
): number {
  const s = country.stats;
  switch (metric) {
    case 'gdpPerCapita': {
      // Log scale from $500 to $100,000
      const v = Math.max(500, Math.min(100000, s.gdpPerCapita));
      return (Math.log10(v) - Math.log10(500)) / (Math.log10(100000) - Math.log10(500));
    }
    case 'populationDensity': {
      const density = s.population / Math.max(1, s.areaKm2);
      const v = Math.max(1, Math.min(1200, density));
      return Math.log10(v) / Math.log10(1200);
    }
    case 'gdpNominalB': {
      const v = Math.max(1, Math.min(28000, s.gdpNominalB));
      return Math.log10(v) / Math.log10(28000);
    }
    case 'hdi': {
      return Math.max(0, Math.min(1, (s.hdi - 0.45) / (0.97 - 0.45)));
    }
    case 'areaKm2': {
      const v = Math.max(5000, Math.min(17000000, s.areaKm2));
      return (Math.log10(v) - Math.log10(5000)) / (Math.log10(17000000) - Math.log10(5000));
    }
  }
}

/**
 * Map a [0..1] value to a vivid Plasma/Emerald/Gold heatmap RGB string.
 */
export function getHeatmapColor(t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  if (clamped < 0.25) {
    // Deep indigo to electric blue
    const k = clamped / 0.25;
    return `rgb(${Math.round(30 + k * 10)}, ${Math.round(27 + k * 105)}, ${Math.round(115 + k * 115)})`;
  } else if (clamped < 0.55) {
    // Electric blue to emerald teal
    const k = (clamped - 0.25) / 0.3;
    return `rgb(${Math.round(40 - k * 24)}, ${Math.round(132 + k * 58)}, ${Math.round(230 - k * 95)})`;
  } else if (clamped < 0.8) {
    // Emerald to warm amber
    const k = (clamped - 0.55) / 0.25;
    return `rgb(${Math.round(16 + k * 229)}, ${Math.round(190 - k * 25)}, ${Math.round(135 - k * 115)})`;
  } else {
    // Warm amber to radiant solar gold
    const k = (clamped - 0.8) / 0.2;
    return `rgb(${Math.round(245 + k * 10)}, ${Math.round(165 + k * 75)}, ${Math.round(20 + k * 110)})`;
  }
}

/**
 * Generate (or return cached) 2048x1024 Three.js CanvasTexture for the requested globe layer.
 */
export function generateGlobeLayerTexture(
  layer: GlobeLayerId,
  countries: WorldCountry[],
  choroplethMetric: ChoroplethMetric = 'gdpPerCapita'
): THREE.CanvasTexture {
  const cacheKey = layer === 'choropleth' ? `${layer}:${choroplethMetric}` : layer;
  const existing = textureCache.get(cacheKey);
  if (existing) return existing;

  const canvas = document.createElement('canvas');
  canvas.width = TEX_WIDTH;
  canvas.height = TEX_HEIGHT;
  const ctx = canvas.getContext('2d')!;

  const projection = d3
    .geoEquirectangular()
    .scale(TEX_WIDTH / (2 * Math.PI))
    .translate([TEX_WIDTH / 2, TEX_HEIGHT / 2]);
  const path = d3.geoPath(projection, ctx);
  const graticule15 = d3.geoGraticule().step([15, 15])();

  if (layer === 'geographic') {
    // 1. Bathymetric Ocean Gradient
    const oceanGrad = ctx.createLinearGradient(0, 0, 0, TEX_HEIGHT);
    oceanGrad.addColorStop(0, '#071b36');
    oceanGrad.addColorStop(0.22, '#072a52');
    oceanGrad.addColorStop(0.5, '#09386b');
    oceanGrad.addColorStop(0.78, '#072a52');
    oceanGrad.addColorStop(1, '#071b36');
    ctx.fillStyle = oceanGrad;
    ctx.fillRect(0, 0, TEX_WIDTH, TEX_HEIGHT);

    // Subtle ocean graticule
    ctx.beginPath();
    path(graticule15);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.08)';
    ctx.lineWidth = 0.8;
    ctx.stroke();

    // Shallow turquoise continental shelf glow around coastlines
    ctx.save();
    ctx.beginPath();
    for (const c of countries) path(c.feature);
    ctx.shadowColor = 'rgba(14, 165, 233, 0.65)';
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#0c4a6e';
    ctx.fill();
    ctx.restore();

    // 2. Clip to all landmasses and paint latitude biomes + deserts + mountains
    ctx.save();
    ctx.beginPath();
    for (const c of countries) path(c.feature);
    ctx.clip();

    const landGrad = ctx.createLinearGradient(0, 0, 0, TEX_HEIGHT);
    landGrad.addColorStop(0.0, '#f1f5f9'); // Arctic ice
    landGrad.addColorStop(0.11, '#7c8b75'); // Tundra
    landGrad.addColorStop(0.2, '#2e583b'); // Boreal forest
    landGrad.addColorStop(0.32, '#476e43'); // Temperate plains
    landGrad.addColorStop(0.41, '#728246'); // Subtropical savanna
    landGrad.addColorStop(0.5, '#1b5e37'); // Equatorial rainforest
    landGrad.addColorStop(0.59, '#687e42'); // Southern savanna
    landGrad.addColorStop(0.72, '#3d6641'); // Southern temperate
    landGrad.addColorStop(0.88, '#cbd5e1'); // Sub-Antarctic
    landGrad.addColorStop(1.0, '#f8fafc'); // Antarctica ice sheet
    ctx.fillStyle = landGrad;
    ctx.fillRect(0, 0, TEX_WIDTH, TEX_HEIGHT);

    // Paint Major Desert Belts (Sahara, Arabia, Central Asia, Australian Outback, SW USA, Atacama)
    const deserts: [number, number, number, number, string][] = [
      [12, 23, 28, 10, 'rgba(194, 155, 97, 0.82)'], // Sahara
      [45, 23, 14, 9, 'rgba(198, 158, 98, 0.82)'], // Arabian Peninsula
      [62, 41, 16, 8, 'rgba(176, 144, 96, 0.65)'], // Central Asia / Karakum
      [88, 42, 16, 7, 'rgba(181, 149, 102, 0.72)'], // Taklamakan & Gobi
      [129, -24, 15, 8, 'rgba(189, 126, 74, 0.78)'], // Australian Outback
      [-111, 31, 9, 7, 'rgba(184, 142, 92, 0.65)'], // Sonoran / Mojave
      [-69, -23, 4, 9, 'rgba(185, 148, 102, 0.7)'], // Atacama
      [18, -24, 6, 7, 'rgba(182, 138, 86, 0.65)'], // Namib / Kalahari
    ];

    for (const [lng, lat, rxDeg, ryDeg, color] of deserts) {
      const [cx, cy] = lngLatToPixel(lng, lat);
      const rx = (rxDeg / 360) * TEX_WIDTH;
      const ry = (ryDeg / 180) * TEX_HEIGHT;
      const grad = ctx.createRadialGradient(cx, cy, rx * 0.1, cx, cy, Math.max(rx, ry));
      grad.addColorStop(0, color);
      grad.addColorStop(0.65, color.replace(/0\.\d+\)$/, '0.35)'));
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx * 1.35, ry * 1.35, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Lush Tropical Rainforest Boost (Southeast Asia / Thailand, Amazon, Congo)
    const rainforests: [number, number, number][] = [
      [101.5, 13.5, 14], // Thailand & Mainland SE Asia
      [112.0, 0.5, 16], // Maritime SE Asia (Borneo/Sumatra)
      [-62.0, -4.5, 18], // Amazon Basin
      [21.0, 0.5, 14], // Congo Basin
    ];
    for (const [lng, lat, rDeg] of rainforests) {
      const [cx, cy] = lngLatToPixel(lng, lat);
      const rPx = (rDeg / 360) * TEX_WIDTH;
      const grad = ctx.createRadialGradient(cx, cy, rPx * 0.1, cx, cy, rPx);
      grad.addColorStop(0, 'rgba(20, 92, 50, 0.75)');
      grad.addColorStop(1, 'rgba(20, 92, 50, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, rPx, 0, Math.PI * 2);
      ctx.fill();
    }

    // Mountain Ridge Highlights
    for (const [lng, lat, rDeg, intensity] of MOUNTAIN_RANGES) {
      const [cx, cy] = lngLatToPixel(lng, lat);
      const rPx = (rDeg / 360) * TEX_WIDTH;
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rPx);
      grad.addColorStop(
        0,
        intensity > 0.85
          ? 'rgba(226, 232, 240, 0.72)'
          : 'rgba(146, 124, 102, 0.55)'
      );
      grad.addColorStop(0.5, 'rgba(120, 102, 82, 0.32)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, rPx, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    // Crisp Coastlines & Subtle Borders
    ctx.beginPath();
    for (const c of countries) path(c.feature);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.24)';
    ctx.lineWidth = 0.9;
    ctx.stroke();
  } else if (layer === 'terrain') {
    // 3D Topographic Relief Layer
    const oceanGrad = ctx.createLinearGradient(0, 0, 0, TEX_HEIGHT);
    oceanGrad.addColorStop(0, '#072238');
    oceanGrad.addColorStop(0.5, '#0c3759');
    oceanGrad.addColorStop(1, '#072238');
    ctx.fillStyle = oceanGrad;
    ctx.fillRect(0, 0, TEX_WIDTH, TEX_HEIGHT);

    // Bathymetric grid & contour rings
    const graticule5 = d3.geoGraticule().step([10, 10])();
    ctx.beginPath();
    path(graticule5);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.14)';
    ctx.lineWidth = 0.7;
    ctx.stroke();

    // Continental shelf shallow relief
    ctx.save();
    ctx.beginPath();
    for (const c of countries) path(c.feature);
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = 14;
    ctx.fillStyle = '#256b4e';
    ctx.fill();
    ctx.restore();

    // Clip to land for Hypsometric Elevation Tinting
    ctx.save();
    ctx.beginPath();
    for (const c of countries) path(c.feature);
    ctx.clip();

    // Base lowland emerald-olive
    ctx.fillStyle = '#2f6f4e';
    ctx.fillRect(0, 0, TEX_WIDTH, TEX_HEIGHT);

    // Mid-elevation upland wash
    for (const c of countries) {
      ctx.beginPath();
      path(c.feature);
      const peak = c.stats.highestPeakM;
      ctx.fillStyle =
        peak > 5000
          ? 'rgba(180, 142, 78, 0.45)'
          : peak > 2500
          ? 'rgba(132, 158, 75, 0.38)'
          : 'rgba(65, 128, 82, 0.35)';
      ctx.fill();
    }

    // Hypsometric mountain elevation rings (olive -> ochre -> sienna -> alpine snow)
    for (const [lng, lat, rDeg, intensity] of MOUNTAIN_RANGES) {
      const [cx, cy] = lngLatToPixel(lng, lat);
      const rPx = (rDeg / 360) * TEX_WIDTH * 1.25;
      const grad = ctx.createRadialGradient(cx, cy, rPx * 0.04, cx, cy, rPx);
      if (intensity > 0.82) {
        grad.addColorStop(0, '#f8fafc'); // Snow peak
        grad.addColorStop(0.22, '#9a5833'); // High alpine rock
        grad.addColorStop(0.52, '#c89d51'); // Plateau ochre
        grad.addColorStop(0.82, '#6b8e47'); // Foothills
        grad.addColorStop(1, 'rgba(47, 111, 78, 0)');
      } else {
        grad.addColorStop(0, '#c28442');
        grad.addColorStop(0.45, '#9ab054');
        grad.addColorStop(1, 'rgba(47, 111, 78, 0)');
      }
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, rPx, 0, Math.PI * 2);
      ctx.fill();

      // Topographic contour ring around peak
      ctx.beginPath();
      ctx.arc(cx, cy, rPx * 0.42, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(30, 41, 59, 0.28)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }

    ctx.restore();

    // Crisp topographic country borders
    ctx.beginPath();
    for (const c of countries) path(c.feature);
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.55)';
    ctx.lineWidth = 1.1;
    ctx.stroke();
  } else if (layer === 'political') {
    // Editorial Political Atlas
    const oceanGrad = ctx.createLinearGradient(0, 0, 0, TEX_HEIGHT);
    oceanGrad.addColorStop(0, '#0b192c');
    oceanGrad.addColorStop(0.5, '#102542');
    oceanGrad.addColorStop(1, '#0b192c');
    ctx.fillStyle = oceanGrad;
    ctx.fillRect(0, 0, TEX_WIDTH, TEX_HEIGHT);

    // Atlas Graticules
    ctx.beginPath();
    path(graticule15);
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.16)';
    ctx.lineWidth = 0.8;
    ctx.stroke();

    // Equator & Tropics lines
    const drawParallel = (lat: number, dashed: boolean, color: string) => {
      const [, y] = lngLatToPixel(0, lat);
      ctx.save();
      ctx.beginPath();
      if (dashed) ctx.setLineDash([8, 6]);
      ctx.moveTo(0, y);
      ctx.lineTo(TEX_WIDTH, y);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.restore();
    };
    drawParallel(0, false, 'rgba(251, 191, 36, 0.35)');
    drawParallel(23.436, true, 'rgba(148, 163, 184, 0.25)');
    drawParallel(-23.436, true, 'rgba(148, 163, 184, 0.25)');

    // Color each sovereign nation distinctly
    countries.forEach((c, idx) => {
      ctx.beginPath();
      path(c.feature);
      const numId = parseInt(c.id, 10) || idx;
      const color =
        c.id === '010'
          ? '#cbd5e1'
          : POLITICAL_PALETTE[(numId * 7 + idx) % POLITICAL_PALETTE.length];
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = '#091326';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    });
  } else if (layer === 'night') {
    // Orbital Night Lights
    ctx.fillStyle = '#020611';
    ctx.fillRect(0, 0, TEX_WIDTH, TEX_HEIGHT);

    // Subtle dark-blue graticule
    ctx.beginPath();
    path(graticule15);
    ctx.strokeStyle = 'rgba(30, 58, 138, 0.16)';
    ctx.lineWidth = 0.7;
    ctx.stroke();

    // Midnight landmasses
    ctx.beginPath();
    for (const c of countries) path(c.feature);
    ctx.fillStyle = '#081226';
    ctx.fill();

    // Clip to land for city light corridors
    ctx.save();
    ctx.beginPath();
    for (const c of countries) path(c.feature);
    ctx.clip();

    // Draw all major night-light metropolitan clusters + satellite towns
    for (const [lng, lat, spread, brightness] of NIGHT_CITY_CLUSTERS) {
      const [cx, cy] = lngLatToPixel(lng, lat);
      const r = spread * 1.45;
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0, `rgba(255, 251, 235, ${brightness})`);
      grad.addColorStop(0.22, `rgba(251, 191, 36, ${brightness * 0.85})`);
      grad.addColorStop(0.55, `rgba(217, 119, 6, ${brightness * 0.42})`);
      grad.addColorStop(1, 'rgba(217, 119, 6, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Also illuminate every country's capital / centroid proportional to urban population
    for (const c of countries) {
      if (c.id === '010') continue;
      const [cx, cy] = lngLatToPixel(c.stats.capitalCoords[0], c.stats.capitalCoords[1]);
      const popFactor = Math.min(1, Math.log10(Math.max(100000, c.stats.population)) / 8.5);
      const r = 6 + popFactor * 14;
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0, 'rgba(254, 240, 138, 0.9)');
      grad.addColorStop(0.4, 'rgba(245, 158, 11, 0.55)');
      grad.addColorStop(1, 'rgba(245, 158, 11, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    // Glowing nocturnal borders
    ctx.beginPath();
    for (const c of countries) path(c.feature);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.28)';
    ctx.lineWidth = 0.85;
    ctx.stroke();
  } else if (layer === 'choropleth') {
    // Global Statistical Heatmap Layer
    ctx.fillStyle = '#050d1a';
    ctx.fillRect(0, 0, TEX_WIDTH, TEX_HEIGHT);

    ctx.beginPath();
    path(graticule15);
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.1)';
    ctx.lineWidth = 0.7;
    ctx.stroke();

    for (const c of countries) {
      ctx.beginPath();
      path(c.feature);
      if (c.id === '010') {
        ctx.fillStyle = '#1e293b';
      } else {
        const norm = getChoroplethNormalizedValue(c, choroplethMetric);
        ctx.fillStyle = getHeatmapColor(norm);
      }
      ctx.fill();
      ctx.strokeStyle = '#060d1b';
      ctx.lineWidth = 1.0;
      ctx.stroke();
    }
  } else if (layer === 'hologram') {
    // Tactical Hologram Grid
    ctx.fillStyle = '#020b16';
    ctx.fillRect(0, 0, TEX_WIDTH, TEX_HEIGHT);

    const graticule10 = d3.geoGraticule().step([10, 10])();
    ctx.beginPath();
    path(graticule10);
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.22)';
    ctx.lineWidth = 0.8;
    ctx.stroke();

    for (const c of countries) {
      ctx.beginPath();
      path(c.feature);
      ctx.fillStyle = 'rgba(6, 182, 212, 0.18)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(34, 211, 238, 0.78)';
      ctx.lineWidth = 1.15;
      ctx.stroke();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 8;
  texture.needsUpdate = true;

  textureCache.set(cacheKey, texture);
  return texture;
}
