import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import * as d3 from 'd3-geo';
import { ChoroplethMetric, GlobeLayerId } from '../data/countryDatabase';
import {
  WorldCountry,
  latLngToVector3,
  vector3ToLatLng,
  rotateCountryFeature,
  densifyRingSpherical,
} from '../utils/sphericalMath';
import {
  generateGlobeLayerTexture,
  getGlobeBumpTexture,
} from '../utils/globeTextures';

export interface SecondaryOverlayCountry {
  country: WorldCountry;
  lng: number;
  lat: number;
  rotationDeg: number;
  color: string;
}

interface Globe3DProps {
  countries: WorldCountry[];
  draggedCountry: WorldCountry;
  targetCountry: WorldCountry | null;
  targetLng: number;
  targetLat: number;
  rotationDeg: number;
  layer: GlobeLayerId;
  choroplethMetric: ChoroplethMetric;
  showExtrusion3D: boolean;
  showGeodesicArc: boolean;
  showGraticule: boolean;
  autoRotate: boolean;
  centerLockMode: boolean;
  secondaryOverlay: SecondaryOverlayCountry | null;
  cameraFocusTrigger: { lng: number; lat: number; timestamp: number } | null;
  onMoveCountry: (lng: number, lat: number) => void;
  onRotateCountry: (deg: number) => void;
  onHoverCountry: (country: WorldCountry | null) => void;
  onGlobeCanvasReady?: (canvas: HTMLCanvasElement) => void;
}

const GLOBE_RADIUS = 100;
const OVERLAY_SPHERE_RADIUS = 100.32;
const BORDER_RADIUS_TOP = 100.85;
const BORDER_RADIUS_BASE = 100.08;

export const Globe3D: React.FC<Globe3DProps> = ({
  countries,
  draggedCountry,
  targetCountry,
  targetLng,
  targetLat,
  rotationDeg,
  layer,
  choroplethMetric,
  showExtrusion3D,
  showGeodesicArc,
  showGraticule,
  autoRotate,
  centerLockMode,
  secondaryOverlay,
  cameraFocusTrigger,
  onMoveCountry,
  onRotateCountry,
  onHoverCountry,
  onGlobeCanvasReady,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [cursorMode, setCursorMode] = useState<
    'default' | 'grab-country' | 'dragging-country' | 'orbiting'
  >('default');
  const [hoverTooltip, setHoverTooltip] = useState<{
    x: number;
    y: number;
    title: string;
    subtitle: string;
    isDraggedCountry: boolean;
  } | null>(null);

  // Refs for latest props inside the requestAnimationFrame / pointer listeners
  const stateRef = useRef({
    countries,
    draggedCountry,
    targetCountry,
    targetLng,
    targetLat,
    rotationDeg,
    centerLockMode,
    autoRotate,
    secondaryOverlay,
    onMoveCountry,
    onRotateCountry,
    onHoverCountry,
  });

  useEffect(() => {
    stateRef.current = {
      countries,
      draggedCountry,
      targetCountry,
      targetLng,
      targetLat,
      rotationDeg,
      centerLockMode,
      autoRotate,
      secondaryOverlay,
      onMoveCountry,
      onRotateCountry,
      onHoverCountry,
    };
  }, [
    countries,
    draggedCountry,
    targetCountry,
    targetLng,
    targetLat,
    rotationDeg,
    centerLockMode,
    autoRotate,
    secondaryOverlay,
    onMoveCountry,
    onRotateCountry,
    onHoverCountry,
  ]);

  // Camera spherical coordinates (longitude/latitude of camera position + distance)
  const cameraCoordRef = useRef({
    lng: targetLng,
    lat: targetLat,
    targetLng: targetLng,
    targetLat: targetLat,
    distance: 265,
    targetDistance: 265,
  });

  // Scene object refs
  const globeMaterialRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const overlayTextureRef = useRef<THREE.CanvasTexture | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const dynamicGroupRef = useRef<THREE.Group | null>(null);
  const graticuleGroupRef = useRef<THREE.Group | null>(null);
  const rotatedFeatureRef = useRef<GeoJSON.Feature<
    GeoJSON.Polygon | GeoJSON.MultiPolygon
  > | null>(null);

  // Smooth camera focus when presets or search trigger a fly-to
  useEffect(() => {
    if (!cameraFocusTrigger) return;
    cameraCoordRef.current.targetLng = cameraFocusTrigger.lng;
    cameraCoordRef.current.targetLat = Math.max(
      -75,
      Math.min(75, cameraFocusTrigger.lat)
    );
  }, [cameraFocusTrigger]);

  // Redraw the 2D spherical overlay canvas (fills for target country, home ghost, and dragged country)
  const updateSphericalOverlayCanvas = useCallback(
    (
      rotatedFeature: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>
    ) => {
      const canvas = overlayCanvasRef.current;
      const tex = overlayTextureRef.current;
      if (!canvas || !tex) return;

      const ctx = canvas.getContext('2d')!;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const projection = d3
        .geoEquirectangular()
        .scale(w / (2 * Math.PI))
        .translate([w / 2, h / 2]);
      const path = d3.geoPath(projection, ctx);

      // 1. Highlight Target Country Underneath (if distinct)
      if (targetCountry) {
        ctx.save();
        ctx.beginPath();
        path(targetCountry.feature);
        ctx.fillStyle = 'rgba(16, 185, 129, 0.28)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(52, 211, 153, 0.9)';
        ctx.lineWidth = 2.0;
        ctx.stroke();
        ctx.restore();
      }

      // 2. Draw Home Ghost Outline of Dragged Country
      ctx.save();
      ctx.beginPath();
      path(draggedCountry.feature);
      ctx.setLineDash([5, 4]);
      ctx.fillStyle = 'rgba(56, 189, 248, 0.10)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.65)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();

      // 3. Draw Secondary Comparison Country (if active)
      if (secondaryOverlay) {
        const secRotated = rotateCountryFeature(
          secondaryOverlay.country.feature,
          secondaryOverlay.country.centroid,
          secondaryOverlay.lng,
          secondaryOverlay.lat,
          secondaryOverlay.rotationDeg
        );
        ctx.save();
        ctx.beginPath();
        path(secRotated);
        ctx.fillStyle = 'rgba(236, 72, 153, 0.36)';
        ctx.fill();
        ctx.strokeStyle = '#f472b6';
        ctx.lineWidth = 2.2;
        ctx.stroke();
        ctx.restore();
      }

      // 4. Draw Primary Superimposed Dragged Country Interior Fill
      ctx.save();
      ctx.beginPath();
      path(rotatedFeature);
      ctx.fillStyle = 'rgba(251, 191, 36, 0.42)';
      ctx.shadowColor = 'rgba(251, 191, 36, 0.85)';
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.restore();

      tex.needsUpdate = true;
    },
    [draggedCountry, targetCountry, secondaryOverlay]
  );

  // Rebuild 3D vector border meshes, 3D prism walls, geodesic arc & centroid handle
  const rebuildDynamic3DOverlays = useCallback(
    (
      rotatedFeature: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>
    ) => {
      const group = dynamicGroupRef.current;
      if (!group) return;

      // Dispose previous geometries & materials
      while (group.children.length > 0) {
        const child = group.children[0] as THREE.Mesh | THREE.Line;
        group.remove(child);
        if (child.geometry) child.geometry.dispose();
      }

      const polygons =
        rotatedFeature.geometry.type === 'Polygon'
          ? [rotatedFeature.geometry.coordinates]
          : rotatedFeature.geometry.coordinates;

      const topLineMaterial = new THREE.LineBasicMaterial({
        color: 0xfef08a,
        linewidth: 2,
      });
      const glowLineMaterial = new THREE.LineBasicMaterial({
        color: 0xf59e0b,
        transparent: true,
        opacity: 0.85,
      });
      const wallMaterial = new THREE.MeshBasicMaterial({
        color: 0xfbbf24,
        transparent: true,
        opacity: 0.34,
        side: THREE.DoubleSide,
        depthWrite: false,
      });

      const topR = showExtrusion3D ? BORDER_RADIUS_TOP + 0.65 : BORDER_RADIUS_TOP;

      for (const poly of polygons) {
        const outerRing = poly[0];
        if (!outerRing || outerRing.length < 3) continue;

        const denseRing = densifyRingSpherical(outerRing, 1.8);
        const topPoints: THREE.Vector3[] = [];
        const glowPoints: THREE.Vector3[] = [];
        const wallPositions: number[] = [];

        for (let i = 0; i < denseRing.length; i++) {
          const [lng, lat] = denseRing[i];
          const pTop = latLngToVector3(lat, lng, topR);
          const pGlow = latLngToVector3(lat, lng, topR + 0.18);
          topPoints.push(pTop);
          glowPoints.push(pGlow);

          if (showExtrusion3D && i < denseRing.length - 1) {
            const [nextLng, nextLat] = denseRing[i + 1];
            const pBase = latLngToVector3(lat, lng, BORDER_RADIUS_BASE);
            const pNextTop = latLngToVector3(nextLat, nextLng, topR);
            const pNextBase = latLngToVector3(
              nextLat,
              nextLng,
              BORDER_RADIUS_BASE
            );

            // Two triangles forming quad segment of the 3D prism wall
            wallPositions.push(
              pBase.x,
              pBase.y,
              pBase.z,
              pTop.x,
              pTop.y,
              pTop.z,
              pNextTop.x,
              pNextTop.y,
              pNextTop.z,

              pBase.x,
              pBase.y,
              pBase.z,
              pNextTop.x,
              pNextTop.y,
              pNextTop.z,
              pNextBase.x,
              pNextBase.y,
              pNextBase.z
            );
          }
        }

        const lineGeom = new THREE.BufferGeometry().setFromPoints(topPoints);
        group.add(new THREE.Line(lineGeom, topLineMaterial));

        const glowGeom = new THREE.BufferGeometry().setFromPoints(glowPoints);
        group.add(new THREE.Line(glowGeom, glowLineMaterial));

        if (showExtrusion3D && wallPositions.length > 0) {
          const wallGeom = new THREE.BufferGeometry();
          wallGeom.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(wallPositions, 3)
          );
          group.add(new THREE.Mesh(wallGeom, wallMaterial));
        }
      }

      // Secondary comparison country 3D border (if enabled)
      if (secondaryOverlay) {
        const secRotated = rotateCountryFeature(
          secondaryOverlay.country.feature,
          secondaryOverlay.country.centroid,
          secondaryOverlay.lng,
          secondaryOverlay.lat,
          secondaryOverlay.rotationDeg
        );
        const secPolys =
          secRotated.geometry.type === 'Polygon'
            ? [secRotated.geometry.coordinates]
            : secRotated.geometry.coordinates;
        const secMat = new THREE.LineBasicMaterial({ color: 0xf472b6 });

        for (const poly of secPolys) {
          const ring = poly[0];
          if (!ring || ring.length < 3) continue;
          const dense = densifyRingSpherical(ring, 2.0);
          const pts = dense.map(([lng, lat]) =>
            latLngToVector3(lat, lng, topR + 0.1)
          );
          const g = new THREE.BufferGeometry().setFromPoints(pts);
          group.add(new THREE.Line(g, secMat));
        }
      }

      // 3D Centroid Drag Handle Ring & Pin
      const centerPos = latLngToVector3(targetLat, targetLng, topR + 0.35);
      const pinGeo = new THREE.SphereGeometry(0.95, 16, 16);
      const pinMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
      const pinMesh = new THREE.Mesh(pinGeo, pinMat);
      pinMesh.position.copy(centerPos);
      group.add(pinMesh);

      // Halo ring oriented tangent to the sphere at (targetLat, targetLng)
      const ringGeo = new THREE.RingGeometry(1.6, 2.25, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xf59e0b,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9,
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.position.copy(centerPos);
      ringMesh.lookAt(centerPos.clone().multiplyScalar(2));
      group.add(ringMesh);

      // 3D Geodesic Flight Arc from Dragged Country's Home to Current Target Position
      if (showGeodesicArc) {
        const homeLng = draggedCountry.centroid[0];
        const homeLat = draggedCountry.centroid[1];
        const angularDist = d3.geoDistance(
          [homeLng, homeLat],
          [targetLng, targetLat]
        );

        if (angularDist > 0.03) {
          const interp = d3.geoInterpolate(
            [homeLng, homeLat],
            [targetLng, targetLat]
          );
          const steps = 48;
          const arcPoints: THREE.Vector3[] = [];
          const maxArchHeight = Math.min(28, angularDist * 18);

          for (let s = 0; s <= steps; s++) {
            const t = s / steps;
            const [lng, lat] = interp(t);
            const archBoost = Math.sin(t * Math.PI) * maxArchHeight;
            arcPoints.push(
              latLngToVector3(lat, lng, GLOBE_RADIUS + 0.6 + archBoost)
            );
          }

          const arcGeom = new THREE.BufferGeometry().setFromPoints(arcPoints);
          const arcMat = new THREE.LineDashedMaterial({
            color: 0x38bdf8,
            dashSize: 2.2,
            gapSize: 1.1,
            transparent: true,
            opacity: 0.85,
          });
          const arcLine = new THREE.Line(arcGeom, arcMat);
          arcLine.computeLineDistances();
          group.add(arcLine);

          // Home anchor beacon
          const homeVec = latLngToVector3(
            homeLat,
            homeLng,
            GLOBE_RADIUS + 0.7
          );
          const homeBeacon = new THREE.Mesh(
            new THREE.SphereGeometry(0.8, 12, 12),
            new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
          );
          homeBeacon.position.copy(homeVec);
          group.add(homeBeacon);
        }
      }
    },
    [
      draggedCountry,
      targetLng,
      targetLat,
      showExtrusion3D,
      showGeodesicArc,
      secondaryOverlay,
    ]
  );

  // Initialize Three.js Scene
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, width / height, 1, 2000);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true, // Required for 1-click poster export
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    if (onGlobeCanvasReady) {
      onGlobeCanvasReady(renderer.domElement);
    }

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xdbeafe, 1.55);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xfffbeb, 1.9);
    sunLight.position.set(220, 140, 180);
    scene.add(sunLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.85);
    rimLight.position.set(-200, -110, -150);
    scene.add(rimLight);

    // 1. Deep Space Starfield
    const starCount = 2000;
    const starPositions = new Float32Array(starCount * 3);
    const starColors = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const r = 650 + Math.random() * 550;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = r * Math.cos(phi);
      starPositions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);

      const tint = Math.random();
      if (tint > 0.8) {
        starColors[i * 3] = 0.98;
        starColors[i * 3 + 1] = 0.85;
        starColors[i * 3 + 2] = 0.55;
      } else if (tint > 0.5) {
        starColors[i * 3] = 0.65;
        starColors[i * 3 + 1] = 0.85;
        starColors[i * 3 + 2] = 1.0;
      } else {
        starColors[i * 3] = 0.92;
        starColors[i * 3 + 1] = 0.95;
        starColors[i * 3 + 2] = 1.0;
      }
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(starPositions, 3)
    );
    starGeo.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
    const starMat = new THREE.PointsMaterial({
      size: 1.8,
      vertexColors: true,
      transparent: true,
      opacity: 0.78,
    });
    const starField = new THREE.Points(starGeo, starMat);
    scene.add(starField);

    // 2. Primary Earth Sphere
    const initialTex = generateGlobeLayerTexture(
      layer,
      countries,
      choroplethMetric
    );
    const bumpTex = getGlobeBumpTexture(countries);

    const globeGeo = new THREE.SphereGeometry(GLOBE_RADIUS, 96, 96);
    const globeMat = new THREE.MeshStandardMaterial({
      map: initialTex,
      bumpMap: bumpTex,
      bumpScale: layer === 'terrain' ? 3.2 : 1.1,
      roughness: 0.62,
      metalness: 0.08,
    });
    globeMaterialRef.current = globeMat;
    const globeMesh = new THREE.Mesh(globeGeo, globeMat);
    scene.add(globeMesh);

    // 3. Atmospheric Fresnel Halo Shader Sphere
    const atmosGeo = new THREE.SphereGeometry(GLOBE_RADIUS * 1.068, 64, 64);
    const atmosMat = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vPositionVector;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vPositionVector = normalize(mvPosition.xyz);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        varying vec3 vPositionVector;
        void main() {
          float intensity = pow(0.66 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.6);
          gl_FragColor = vec4(0.22, 0.68, 0.98, 1.0) * intensity * 0.92;
        }
      `,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
    });
    const atmosMesh = new THREE.Mesh(atmosGeo, atmosMat);
    scene.add(atmosMesh);

    // 4. Spherical Overlay Canvas Sphere (for distortion-free country interior fills)
    const ovCanvas = document.createElement('canvas');
    ovCanvas.width = 2048;
    ovCanvas.height = 1024;
    overlayCanvasRef.current = ovCanvas;

    const ovTex = new THREE.CanvasTexture(ovCanvas);
    ovTex.colorSpace = THREE.SRGBColorSpace;
    ovTex.wrapS = THREE.RepeatWrapping;
    ovTex.wrapT = THREE.ClampToEdgeWrapping;
    overlayTextureRef.current = ovTex;

    const ovGeo = new THREE.SphereGeometry(OVERLAY_SPHERE_RADIUS, 96, 96);
    const ovMat = new THREE.MeshBasicMaterial({
      map: ovTex,
      transparent: true,
      depthWrite: false,
    });
    const ovMesh = new THREE.Mesh(ovGeo, ovMat);
    scene.add(ovMesh);

    // 5. 3D Graticule Ring Group
    const graticuleGroup = new THREE.Group();
    graticuleGroupRef.current = graticuleGroup;
    scene.add(graticuleGroup);

    // Equatorial orbital telemetry ring
    const eqPoints: THREE.Vector3[] = [];
    for (let deg = -180; deg <= 180; deg += 2) {
      eqPoints.push(latLngToVector3(0, deg, GLOBE_RADIUS + 0.22));
    }
    const eqLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(eqPoints),
      new THREE.LineBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.28,
      })
    );
    graticuleGroup.add(eqLine);

    // 6. Dynamic 3D Vector Borders & Extrusion Group
    const dynamicGroup = new THREE.Group();
    dynamicGroupRef.current = dynamicGroup;
    scene.add(dynamicGroup);

    // Raycaster & Pointer Interaction State
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    let activeInteraction: 'none' | 'drag-country' | 'orbit-globe' = 'none';
    let lastClientX = 0;
    let lastClientY = 0;
    let pointerDownX = 0;
    let pointerDownY = 0;
    let pointerDownTime = 0;

    const getGlobeIntersection = (
      clientX: number,
      clientY: number
    ): { lat: number; lng: number; point: THREE.Vector3 } | null => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObject(globeMesh, false);
      if (hits.length === 0) return null;
      const { lat, lng } = vector3ToLatLng(hits[0].point);
      return { lat, lng, point: hits[0].point };
    };

    const isPointOnDraggedCountry = (lng: number, lat: number): boolean => {
      const cur = stateRef.current;
      const distRad = d3.geoDistance([lng, lat], [cur.targetLng, cur.targetLat]);
      // Easy grab radius around centroid (~6.5 degrees) OR inside the polygon
      if (distRad < 0.115) return true;
      if (
        rotatedFeatureRef.current &&
        d3.geoContains(rotatedFeatureRef.current, [lng, lat])
      ) {
        return true;
      }
      return false;
    };

    const handlePointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      lastClientX = e.clientX;
      lastClientY = e.clientY;
      pointerDownX = e.clientX;
      pointerDownY = e.clientY;
      pointerDownTime = performance.now();

      const hit = getGlobeIntersection(e.clientX, e.clientY);
      if (
        hit &&
        !stateRef.current.centerLockMode &&
        isPointOnDraggedCountry(hit.lng, hit.lat)
      ) {
        activeInteraction = 'drag-country';
        setCursorMode('dragging-country');
      } else {
        activeInteraction = 'orbit-globe';
        setCursorMode('orbiting');
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      const dx = e.clientX - lastClientX;
      const dy = e.clientY - lastClientY;
      lastClientX = e.clientX;
      lastClientY = e.clientY;

      const cur = stateRef.current;

      if (activeInteraction === 'drag-country') {
        if (e.shiftKey) {
          // Shift + Drag rotates the superimposed country around its own centroid
          const nextRot = (cur.rotationDeg + dx * 0.65 + 360) % 360;
          cur.onRotateCountry(Math.round(nextRot));
        } else {
          const hit = getGlobeIntersection(e.clientX, e.clientY);
          if (hit) {
            cur.onMoveCountry(
              Number(hit.lng.toFixed(2)),
              Number(hit.lat.toFixed(2))
            );
          }
        }
        return;
      }

      if (activeInteraction === 'orbit-globe') {
        const zoomScale = cameraCoordRef.current.distance / 280;
        const nextLng =
          cameraCoordRef.current.targetLng - dx * 0.28 * zoomScale;
        const nextLat = Math.max(
          -78,
          Math.min(78, cameraCoordRef.current.targetLat + dy * 0.28 * zoomScale)
        );

        let wrappedLng = nextLng;
        if (wrappedLng > 180) wrappedLng -= 360;
        if (wrappedLng < -180) wrappedLng += 360;

        cameraCoordRef.current.targetLng = wrappedLng;
        cameraCoordRef.current.targetLat = nextLat;

        // If Center-Lock mode is enabled, spinning the globe also moves the country to the camera center!
        if (cur.centerLockMode) {
          cur.onMoveCountry(
            Number(wrappedLng.toFixed(2)),
            Number(nextLat.toFixed(2))
          );
        }
        return;
      }

      // Hover state detection when not dragging
      const hit = getGlobeIntersection(e.clientX, e.clientY);
      if (!hit) {
        setCursorMode('default');
        setHoverTooltip(null);
        cur.onHoverCountry(null);
        return;
      }

      const overDragged = isPointOnDraggedCountry(hit.lng, hit.lat);
      if (overDragged && !cur.centerLockMode) {
        setCursorMode('grab-country');
        setHoverTooltip({
          x: e.clientX,
          y: e.clientY,
          title: `${cur.draggedCountry.stats.flag} ${cur.draggedCountry.stats.name} (Superimposed)`,
          subtitle: 'Drag to move across globe • Shift+Drag to rotate',
          isDraggedCountry: true,
        });
      } else {
        setCursorMode('default');
        // Check which globe country is hovered
        const hovered = cur.countries.find(
          (c) => c.id !== '010' && d3.geoContains(c.feature, [hit.lng, hit.lat])
        );
        cur.onHoverCountry(hovered || null);
        if (hovered) {
          setHoverTooltip({
            x: e.clientX,
            y: e.clientY,
            title: `${hovered.stats.flag} ${hovered.stats.name}`,
            subtitle: `${hovered.stats.areaKm2.toLocaleString()} km² • Double-click to place ${cur.draggedCountry.stats.name} here`,
            isDraggedCountry: false,
          });
        } else {
          setHoverTooltip(null);
        }
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      const elapsed = performance.now() - pointerDownTime;
      const moveDist = Math.hypot(
        e.clientX - pointerDownX,
        e.clientY - pointerDownY
      );
      activeInteraction = 'none';
      setCursorMode('default');

      // Quick click support if user double-clicks
      if (elapsed < 220 && moveDist < 5) {
        // Handled by dblclick for teleporting
      }
    };

    const handleDoubleClick = (e: MouseEvent) => {
      const hit = getGlobeIntersection(e.clientX, e.clientY);
      if (!hit) return;
      const cur = stateRef.current;
      cur.onMoveCountry(
        Number(hit.lng.toFixed(2)),
        Number(hit.lat.toFixed(2))
      );
      cameraCoordRef.current.targetLng = hit.lng;
      cameraCoordRef.current.targetLat = Math.max(-75, Math.min(75, hit.lat));
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      cameraCoordRef.current.targetDistance = Math.max(
        142,
        Math.min(440, cameraCoordRef.current.targetDistance + e.deltaY * 0.14)
      );
    };

    const domElem = renderer.domElement;
    domElem.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    domElem.addEventListener('dblclick', handleDoubleClick);
    domElem.addEventListener('wheel', handleWheel, { passive: false });

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // Animation Loop
    let reqId = 0;
    const animate = () => {
      reqId = requestAnimationFrame(animate);

      const cam = cameraCoordRef.current;
      if (stateRef.current.autoRotate && activeInteraction === 'none') {
        cam.targetLng += 0.08;
        if (cam.targetLng > 180) cam.targetLng -= 360;
      }

      // Shortest angular path for longitude interpolation
      let dLng = cam.targetLng - cam.lng;
      if (dLng > 180) dLng -= 360;
      if (dLng < -180) dLng += 360;

      cam.lng += dLng * 0.12;
      if (cam.lng > 180) cam.lng -= 360;
      if (cam.lng < -180) cam.lng += 360;

      cam.lat += (cam.targetLat - cam.lat) * 0.12;
      cam.distance += (cam.targetDistance - cam.distance) * 0.14;

      const camPos = latLngToVector3(cam.lat, cam.lng, cam.distance);
      camera.position.copy(camPos);
      camera.lookAt(0, 0, 0);

      // Keep sunlight gently angled relative to the camera so the user always sees crisp 3D relief
      const rightVec = new THREE.Vector3()
        .crossVectors(camPos, new THREE.Vector3(0, 1, 0))
        .normalize();
      sunLight.position
        .copy(camPos)
        .addScaledVector(rightVec, 90)
        .add(new THREE.Vector3(0, 85, 0));

      starField.rotation.y += 0.00015;
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(reqId);
      domElem.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      domElem.removeEventListener('dblclick', handleDoubleClick);
      domElem.removeEventListener('wheel', handleWheel);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
    };
  }, []);

  // Update Globe Layer & Choropleth Texture when layer or metric changes
  useEffect(() => {
    const mat = globeMaterialRef.current;
    if (!mat) return;
    const nextTex = generateGlobeLayerTexture(
      layer,
      countries,
      choroplethMetric
    );
    mat.map = nextTex;
    mat.bumpScale = layer === 'terrain' ? 3.5 : layer === 'hologram' ? 0.3 : 1.15;
    mat.roughness = layer === 'night' || layer === 'hologram' ? 0.45 : 0.62;
    mat.needsUpdate = true;
  }, [layer, countries, choroplethMetric]);

  // Toggle Graticule visibility
  useEffect(() => {
    if (graticuleGroupRef.current) {
      graticuleGroupRef.current.visible = showGraticule;
    }
  }, [showGraticule]);

  // Recompute Rotated Country Polygon & update both 2D spherical fill and 3D prism/border whenever moved
  useEffect(() => {
    const rotated = rotateCountryFeature(
      draggedCountry.feature,
      draggedCountry.centroid,
      targetLng,
      targetLat,
      rotationDeg
    );
    rotatedFeatureRef.current = rotated;
    updateSphericalOverlayCanvas(rotated);
    rebuildDynamic3DOverlays(rotated);
  }, [
    draggedCountry,
    targetCountry,
    targetLng,
    targetLat,
    rotationDeg,
    showExtrusion3D,
    showGeodesicArc,
    secondaryOverlay,
    updateSphericalOverlayCanvas,
    rebuildDynamic3DOverlays,
  ]);

  const cursorClass =
    cursorMode === 'dragging-country' || cursorMode === 'orbiting'
      ? 'cursor-grabbing'
      : cursorMode === 'grab-country'
      ? 'cursor-grab'
      : 'cursor-default';

  return (
    <div className="relative w-full h-full overflow-hidden">
      <div
        ref={containerRef}
        className={`w-full h-full ${cursorClass}`}
        aria-label="Kuson Globe Compare 3D Interactive Map"
      />

      {/* Center-Lock Mode Crosshair Reticle */}
      {centerLockMode && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="relative flex items-center justify-center w-20 h-20 rounded-full border border-amber-400/60 bg-amber-400/5 shadow-[0_0_30px_rgba(251,191,36,0.25)]">
            <div className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
            <span className="absolute -bottom-6 whitespace-nowrap px-2 py-0.5 rounded bg-slate-950/90 border border-amber-400/40 text-[10px] font-mono text-amber-300">
              CENTER-LOCK ACTIVE
            </span>
          </div>
        </div>
      )}

      {/* Floating Cursor Tooltip */}
      {hoverTooltip && (
        <div
          className="pointer-events-none fixed z-40 px-3 py-2 rounded-xl glass-panel border border-slate-700/80 shadow-2xl transition-opacity duration-75"
          style={{
            left: Math.min(window.innerWidth - 260, hoverTooltip.x + 16),
            top: Math.max(16, hoverTooltip.y - 58),
          }}
        >
          <div
            className={`text-xs font-bold ${
              hoverTooltip.isDraggedCountry
                ? 'text-amber-300'
                : 'text-emerald-300'
            }`}
          >
            {hoverTooltip.title}
          </div>
          <div className="text-[11px] text-slate-300/90">
            {hoverTooltip.subtitle}
          </div>
        </div>
      )}
    </div>
  );
};
