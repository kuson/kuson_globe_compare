import React, { useState, useMemo, useEffect } from 'react';
import {
  Globe,
  RotateCcw,
  Compass,
  Layers,
  Share2,
  Sparkles,
  Navigation,
  Box,
  Crosshair,
  Play,
  Pause,
  Plus,
  X,
  Search,
  ChevronRight,
  HelpCircle,
  Grid3x3,
} from 'lucide-react';
import {
  GLOBE_LAYERS,
  COMPARISON_PRESETS,
  GlobeLayerId,
  ChoroplethMetric,
  ComparisonPreset,
  QuizQuestion,
} from './data/countryDatabase';
import {
  loadWorldCountries,
  WorldCountry,
  rotateCountryFeature,
  detectUnderlyingAndOverlappingCountries,
} from './utils/sphericalMath';
import { Globe3D, SecondaryOverlayCountry } from './components/Globe3D';
import { ComparisonPanel } from './components/ComparisonPanel';
import { SharePosterModal } from './components/SharePosterModal';

export const App: React.FC = () => {
  const allCountries = useMemo(() => loadWorldCountries(), []);

  // Default to Thailand ('764')
  const defaultThailand = useMemo(
    () =>
      allCountries.find((c) => c.id === '764') ||
      allCountries.find((c) => c.stats.iso3 === 'THA') ||
      allCountries[0],
    [allCountries]
  );

  // Parse URL params if present for shared links
  const initialParams = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const dragId = params.get('drag') || '764';
    const lng = parseFloat(params.get('lng') || '2.8');
    const lat = parseFloat(params.get('lat') || '46.8');
    const rot = parseInt(params.get('rot') || '0', 10);
    const layerParam = (params.get('layer') as GlobeLayerId) || 'geographic';
    const targetParam = params.get('target') || null;
    return {
      dragId,
      lng: Number.isNaN(lng) ? 2.8 : lng,
      lat: Number.isNaN(lat) ? 46.8 : lat,
      rot: Number.isNaN(rot) ? 0 : rot,
      layer: GLOBE_LAYERS.some((l) => l.id === layerParam)
        ? layerParam
        : ('geographic' as GlobeLayerId),
      targetParam,
    };
  }, []);

  const [draggedCountryId, setDraggedCountryId] = useState<string>(
    initialParams.dragId
  );
  const [targetLng, setTargetLng] = useState<number>(initialParams.lng);
  const [targetLat, setTargetLat] = useState<number>(initialParams.lat);
  const [rotationDeg, setRotationDeg] = useState<number>(initialParams.rot);
  const [layer, setLayer] = useState<GlobeLayerId>(initialParams.layer);
  const [choroplethMetric, setChoroplethMetric] =
    useState<ChoroplethMetric>('gdpPerCapita');

  const [pinnedTargetId, setPinnedTargetId] = useState<string | null>(
    initialParams.targetParam
  );
  const [hoveredCountry, setHoveredCountry] = useState<WorldCountry | null>(
    null
  );

  // 3D Visual Toggles
  const [showExtrusion3D, setShowExtrusion3D] = useState<boolean>(true);
  const [showGeodesicArc, setShowGeodesicArc] = useState<boolean>(true);
  const [showGraticule, setShowGraticule] = useState<boolean>(true);
  const [autoRotate, setAutoRotate] = useState<boolean>(false);
  const [centerLockMode, setCenterLockMode] = useState<boolean>(false);

  // Secondary Superimposed Country (for 3-way comparison)
  const [secondaryCountryId, setSecondaryCountryId] = useState<string | null>(
    null
  );

  // UI Modals & Search Dropdowns
  const [isShareOpen, setIsShareOpen] = useState<boolean>(false);
  const [globeCanvas, setGlobeCanvas] = useState<HTMLCanvasElement | null>(
    null
  );
  const [dragSearchQuery, setDragSearchQuery] = useState<string>('');
  const [showDragPicker, setShowDragPicker] = useState<boolean>(false);
  const [flySearchQuery, setFlySearchQuery] = useState<string>('');
  const [showFlyPicker, setShowFlyPicker] = useState<boolean>(false);
  const [secondarySearchQuery, setSecondarySearchQuery] = useState<string>('');
  const [showSecondaryPicker, setShowSecondaryPicker] = useState<boolean>(false);
  const [mobileDockOpen, setMobileDockOpen] = useState<boolean>(false);
  const [activePresetInsight, setActivePresetInsight] = useState<string | null>(
    COMPARISON_PRESETS[0].insight
  );
  const [showGuideBanner, setShowGuideBanner] = useState<boolean>(true);

  const [cameraFocusTrigger, setCameraFocusTrigger] = useState<{
    lng: number;
    lat: number;
    timestamp: number;
  } | null>({
    lng: initialParams.lng,
    lat: initialParams.lat,
    timestamp: Date.now(),
  });

  const draggedCountry = useMemo(
    () =>
      allCountries.find((c) => c.id === draggedCountryId) || defaultThailand,
    [allCountries, draggedCountryId, defaultThailand]
  );

  // Compute rotated polygon and detect underlying + overlapping countries
  const { primaryTarget, overlappingCountries } = useMemo(() => {
    const rotated = rotateCountryFeature(
      draggedCountry.feature,
      draggedCountry.centroid,
      targetLng,
      targetLat,
      rotationDeg
    );
    return detectUnderlyingAndOverlappingCountries(
      targetLng,
      targetLat,
      rotated,
      allCountries,
      draggedCountry.id
    );
  }, [draggedCountry, targetLng, targetLat, rotationDeg, allCountries]);

  const activeTargetCountry = useMemo(() => {
    if (pinnedTargetId) {
      const pinned = allCountries.find((c) => c.id === pinnedTargetId);
      if (pinned) return pinned;
    }
    return primaryTarget;
  }, [pinnedTargetId, primaryTarget, allCountries]);

  // Optional 2nd floating overlay country offset slightly East
  const secondaryOverlay: SecondaryOverlayCountry | null = useMemo(() => {
    if (!secondaryCountryId) return null;
    const sec = allCountries.find((c) => c.id === secondaryCountryId);
    if (!sec) return null;
    return {
      country: sec,
      lng: ((targetLng + 12 + 180) % 360) - 180,
      lat: targetLat,
      rotationDeg: 0,
      color: '#ec4899',
    };
  }, [secondaryCountryId, allCountries, targetLng, targetLat]);

  // Keyboard: R rotates, Space toggles orbit, G toggles graticule, Esc closes overlays
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName;
      if (e.key === 'Escape') {
        setShowDragPicker(false);
        setShowFlyPicker(false);
        setShowSecondaryPicker(false);
        setIsShareOpen(false);
        setMobileDockOpen(false);
        if (tag === 'INPUT' || tag === 'TEXTAREA') {
          (document.activeElement as HTMLElement | null)?.blur();
        }
        return;
      }
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') {
        return;
      }
      if (e.key === 'r' || e.key === 'R') {
        setRotationDeg((prev) => (prev + (e.shiftKey ? 345 : 15)) % 360);
      } else if (e.key === 'g' || e.key === 'G') {
        setShowGraticule((prev) => !prev);
      } else if (e.key === ' ' || e.code === 'Space') {
        if (tag === 'BUTTON' || tag === 'A') return;
        e.preventDefault();
        setAutoRotate((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleSelectPreset = (preset: ComparisonPreset) => {
    setDraggedCountryId(preset.draggedId);
    setPinnedTargetId(preset.targetId);
    setTargetLng(preset.targetLng);
    setTargetLat(preset.targetLat);
    setRotationDeg(preset.rotationDeg);
    if (preset.layer) setLayer(preset.layer);
    setActivePresetInsight(preset.insight);
    setCameraFocusTrigger({
      lng: preset.targetLng,
      lat: preset.targetLat,
      timestamp: Date.now(),
    });
  };

  const handleSelectQuizPreset = (q: QuizQuestion) => {
    setDraggedCountryId(q.draggedId);
    setPinnedTargetId(q.targetId);
    setTargetLng(q.targetLng);
    setTargetLat(q.targetLat);
    setRotationDeg(0);
    setCameraFocusTrigger({
      lng: q.targetLng,
      lat: q.targetLat,
      timestamp: Date.now(),
    });
  };

  const handleSwapCountries = () => {
    if (!activeTargetCountry) return;
    const prevDragged = draggedCountry;
    const prevTarget = activeTargetCountry;
    setDraggedCountryId(prevTarget.id);
    setPinnedTargetId(prevDragged.id);
    setTargetLng(prevDragged.centroid[0]);
    setTargetLat(prevDragged.centroid[1]);
    setRotationDeg(0);
    setCameraFocusTrigger({
      lng: prevDragged.centroid[0],
      lat: prevDragged.centroid[1],
      timestamp: Date.now(),
    });
  };

  const handleReturnHome = () => {
    setPinnedTargetId(null);
    setTargetLng(draggedCountry.centroid[0]);
    setTargetLat(draggedCountry.centroid[1]);
    setRotationDeg(0);
    setCameraFocusTrigger({
      lng: draggedCountry.centroid[0],
      lat: draggedCountry.centroid[1],
      timestamp: Date.now(),
    });
  };

  const filteredDragCountries = useMemo(() => {
    const q = dragSearchQuery.trim().toLowerCase();
    if (!q) return allCountries;
    return allCountries.filter(
      (c) =>
        c.stats.name.toLowerCase().includes(q) ||
        c.stats.iso3.toLowerCase().includes(q) ||
        c.stats.region.toLowerCase().includes(q)
    );
  }, [allCountries, dragSearchQuery]);

  const filteredFlyCountries = useMemo(() => {
    const q = flySearchQuery.trim().toLowerCase();
    if (!q) return allCountries;
    return allCountries.filter(
      (c) =>
        c.stats.name.toLowerCase().includes(q) ||
        c.stats.iso3.toLowerCase().includes(q) ||
        c.stats.capital.toLowerCase().includes(q)
    );
  }, [allCountries, flySearchQuery]);

  const filteredSecondaryCountries = useMemo(() => {
    const q = secondarySearchQuery.trim().toLowerCase();
    const pool = allCountries.filter((c) => c.id !== draggedCountry.id);
    if (!q) return pool;
    return pool.filter(
      (c) =>
        c.stats.name.toLowerCase().includes(q) ||
        c.stats.iso3.toLowerCase().includes(q)
    );
  }, [allCountries, secondarySearchQuery, draggedCountry.id]);

  const quickPickCountryIds = ['764', '392', '826', '840', '250', '304', '360', '152'];

  return (
    <div className="relative w-screen h-screen overflow-hidden select-none bg-[#050814]">
      {/* Fullscreen 3D WebGL Globe Background */}
      <div className="fixed inset-0 z-0">
        <Globe3D
          countries={allCountries}
          draggedCountry={draggedCountry}
          targetCountry={activeTargetCountry}
          targetLng={targetLng}
          targetLat={targetLat}
          rotationDeg={rotationDeg}
          layer={layer}
          choroplethMetric={choroplethMetric}
          showExtrusion3D={showExtrusion3D}
          showGeodesicArc={showGeodesicArc}
          showGraticule={showGraticule}
          autoRotate={autoRotate}
          centerLockMode={centerLockMode}
          secondaryOverlay={secondaryOverlay}
          cameraFocusTrigger={cameraFocusTrigger}
          onMoveCountry={(lng, lat) => {
            setTargetLng(lng);
            setTargetLat(lat);
          }}
          onRotateCountry={(deg) => setRotationDeg(deg)}
          onHoverCountry={(c) => setHoveredCountry(c)}
          onGlobeCanvasReady={(canvas) => setGlobeCanvas(canvas)}
        />
      </div>

      {!mobileDockOpen && (
        <button
          type="button"
          onClick={() => setMobileDockOpen(true)}
          className="md:hidden fixed top-3 left-3 z-30 px-3 py-2 rounded-xl glass-panel text-xs font-semibold text-amber-200"
        >
          Countries
        </button>
      )}

      {/* LEFT COMMAND DOCK (Pinned cleanly between top-3 and bottom bar) */}
      <div
        className={`fixed top-3 left-3 ${
          layer === 'choropleth' ? 'bottom-28' : 'bottom-20'
        } z-20 w-[355px] xl:w-[378px] ${
          mobileDockOpen ? 'flex' : 'hidden'
        } md:flex flex-col gap-2.5 pointer-events-auto overflow-y-auto pr-1 transition-all`}
      >
          <button
            type="button"
            onClick={() => setMobileDockOpen(false)}
            className="md:hidden self-end px-2 py-1 text-[11px] text-slate-300"
          >
            Close
          </button>
          {/* Brand Header Card */}
          <div className="glass-panel rounded-2xl p-3.5 border border-slate-700/80">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-slate-950 shadow-[0_0_20px_rgba(251,191,36,0.45)]">
                  <Globe className="w-5 h-5 stroke-[2.2]" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <h1 className="font-display text-base font-bold tracking-tight text-white">
                      KUSON GLOBE COMPARE
                    </h1>
                    <span className="px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-300 border border-amber-400/40 text-[9px] font-mono font-bold">
                      3D PRO
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    True Spherical Country Superimposition & Vital Stats
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsShareOpen(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs shadow-[0_0_18px_rgba(251,191,36,0.35)] transition-all"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Share</span>
              </button>
            </div>

            {/* Interactive Controls Guide Pill */}
            {showGuideBanner && (
              <div className="mt-2.5 px-2.5 py-1.5 rounded-xl bg-slate-900/85 border border-slate-800 flex items-center justify-between text-[11px] text-slate-300">
                <span className="flex items-center gap-1.5">
                  <HelpCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>
                    <strong>Drag {draggedCountry.stats.name}</strong> directly on
                    globe • <strong>Double-click</strong> any spot to teleport
                  </span>
                </span>
                <button
                  onClick={() => setShowGuideBanner(false)}
                  className="text-slate-500 hover:text-slate-300 ml-1"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Superimposed Nation Selector & Rotation Controls */}
          <div className="glass-panel rounded-2xl p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                <Navigation className="w-3.5 h-3.5" />
                Superimposed Dragged Nation
              </span>
              <button
                onClick={handleReturnHome}
                className="text-[11px] text-sky-300 hover:text-sky-200 flex items-center gap-1 font-medium"
              >
                <RotateCcw className="w-3 h-3" />
                Return to {draggedCountry.stats.capital}
              </button>
            </div>

            {/* Primary Country Selector Button */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowDragPicker((v) => !v);
                  setShowFlyPicker(false);
                }}
                className="w-full flex items-center justify-between p-2.5 rounded-xl bg-slate-900/90 hover:bg-slate-800/90 border border-amber-400/40 text-left transition-all"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl">{draggedCountry.stats.flag}</span>
                  <div>
                    <div className="text-sm font-bold text-white">
                      {draggedCountry.stats.name}
                    </div>
                    <div className="text-[11px] font-mono text-amber-300/90">
                      {draggedCountry.stats.areaKm2.toLocaleString()} km² •{' '}
                      {(draggedCountry.stats.population / 1e6).toFixed(1)}M pop
                    </div>
                  </div>
                </div>
                <span className="px-2 py-1 rounded-lg bg-slate-800 text-xs text-slate-300 border border-slate-700">
                  Change ▾
                </span>
              </button>

              {showDragPicker && (
                <div className="absolute left-0 right-0 top-full mt-1.5 z-40 glass-panel rounded-xl border border-slate-700 p-2 shadow-2xl max-h-64 flex flex-col">
                  <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 mb-2">
                    <Search className="w-3.5 h-3.5 text-slate-400" />
                    <input
                      type="text"
                      value={dragSearchQuery}
                      onChange={(e) => setDragSearchQuery(e.target.value)}
                      placeholder="Search any country (e.g. Thailand, Japan)..."
                      className="w-full bg-transparent text-xs text-white focus:outline-none"
                      autoFocus
                    />
                  </div>
                  <div className="overflow-y-auto space-y-0.5">
                    {filteredDragCountries.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => {
                          setDraggedCountryId(c.id);
                          setShowDragPicker(false);
                          setDragSearchQuery('');
                        }}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs text-left transition-colors ${
                          c.id === draggedCountry.id
                            ? 'bg-amber-400/20 text-amber-200 font-bold'
                            : 'text-slate-200 hover:bg-slate-800/80'
                        }`}
                      >
                        <span>
                          {c.stats.flag} {c.stats.name}
                        </span>
                        <span className="font-mono text-[10px] text-slate-400">
                          {c.stats.areaKm2.toLocaleString()} km²
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Quick-Pick Country Pills */}
            <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
              {quickPickCountryIds.map((id) => {
                const c = allCountries.find((item) => item.id === id);
                if (!c) return null;
                const active = c.id === draggedCountry.id;
                return (
                  <button
                    key={id}
                    onClick={() => setDraggedCountryId(c.id)}
                    className={`px-2 py-1 rounded-lg text-[11px] font-medium shrink-0 border transition-all ${
                      active
                        ? 'bg-amber-400 text-slate-950 border-amber-300 font-bold'
                        : 'bg-slate-900/75 text-slate-300 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {c.stats.flag} {c.stats.iso3}
                  </button>
                );
              })}
            </div>

            {/* Place Over Target Country Quick Fly-To */}
            <div className="relative pt-1 border-t border-slate-800/80">
              <div className="flex items-center justify-between gap-2">
                <button
                  onClick={() => {
                    setShowFlyPicker((v) => !v);
                    setShowDragPicker(false);
                  }}
                  className="flex-1 flex items-center justify-between px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 text-xs text-emerald-200 font-medium transition-all"
                >
                  <span>
                    🎯 Place {draggedCountry.stats.iso3} Over:{' '}
                    <strong>
                      {activeTargetCountry
                        ? `${activeTargetCountry.stats.flag} ${activeTargetCountry.stats.name}`
                        : 'Select Nation...'}
                    </strong>
                  </span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>

                {/* Add 2nd Comparison Country Toggle */}
                <button
                  onClick={() => {
                    setShowSecondaryPicker((open) => !open);
                    setShowDragPicker(false);
                    setShowFlyPicker(false);
                  }}
                  title="Choose a second superimposed country"
                  className={`px-2.5 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1 transition-all ${
                    secondaryCountryId
                      ? 'bg-pink-500/25 border-pink-400 text-pink-200'
                      : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>
                    {secondaryCountryId
                      ? allCountries.find((c) => c.id === secondaryCountryId)?.stats
                          .iso3 || '2nd'
                      : '2nd'}
                  </span>
                </button>
                {secondaryCountryId && (
                  <button
                    onClick={() => {
                      setSecondaryCountryId(null);
                      setShowSecondaryPicker(false);
                    }}
                    title="Remove the second country"
                    className="px-2 py-1.5 rounded-xl border border-slate-800 text-slate-400 hover:text-slate-200"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {showFlyPicker && (
                <div className="absolute left-0 right-0 top-full mt-1.5 z-40 glass-panel rounded-xl border border-slate-700 p-2 shadow-2xl max-h-60 flex flex-col">
                  <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 mb-2">
                    <Search className="w-3.5 h-3.5 text-slate-400" />
                    <input
                      type="text"
                      value={flySearchQuery}
                      onChange={(e) => setFlySearchQuery(e.target.value)}
                      placeholder="Fly & superimpose over country..."
                      className="w-full bg-transparent text-xs text-white focus:outline-none"
                      autoFocus
                    />
                  </div>
                  <div className="overflow-y-auto space-y-0.5">
                    {filteredFlyCountries.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => {
                          setPinnedTargetId(c.id);
                          setTargetLng(c.centroid[0]);
                          setTargetLat(c.centroid[1]);
                          setCameraFocusTrigger({
                            lng: c.centroid[0],
                            lat: c.centroid[1],
                            timestamp: Date.now(),
                          });
                          setShowFlyPicker(false);
                          setFlySearchQuery('');
                        }}
                        className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs text-slate-200 hover:bg-emerald-500/20 text-left transition-colors"
                      >
                        <span>
                          {c.stats.flag} {c.stats.name}
                        </span>
                        <span className="font-mono text-[10px] text-slate-400">
                          {c.stats.capital}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {showSecondaryPicker && (
                <div className="absolute left-0 right-0 top-full mt-1.5 z-40 glass-panel rounded-xl border border-pink-500/40 p-2 shadow-2xl max-h-60 flex flex-col">
                  <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 mb-2">
                    <Search className="w-3.5 h-3.5 text-slate-400" />
                    <input
                      type="text"
                      value={secondarySearchQuery}
                      onChange={(e) => setSecondarySearchQuery(e.target.value)}
                      placeholder="Second country to superimpose..."
                      className="w-full bg-transparent text-xs text-white focus:outline-none"
                      autoFocus
                    />
                  </div>
                  <div className="overflow-y-auto space-y-0.5">
                    {filteredSecondaryCountries.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => {
                          setSecondaryCountryId(c.id);
                          setShowSecondaryPicker(false);
                          setSecondarySearchQuery('');
                        }}
                        className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs text-slate-200 hover:bg-pink-500/20 text-left transition-colors"
                      >
                        <span>
                          {c.stats.flag} {c.stats.name}
                        </span>
                        <span className="font-mono text-[10px] text-slate-400">
                          {c.stats.iso3}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Compass Rotation Slider & Presets */}
            <div className="pt-1 border-t border-slate-800/80 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 flex items-center gap-1">
                  <Compass className="w-3.5 h-3.5 text-amber-400" />
                  Compass Orientation
                </span>
                <div className="flex items-center gap-1">
                  {[0, 45, 90, 180].map((deg) => (
                    <button
                      key={deg}
                      onClick={() => setRotationDeg(deg)}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                        rotationDeg === deg
                          ? 'bg-amber-400 text-slate-950 font-bold'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      {deg}°
                    </button>
                  ))}
                </div>
              </div>
              <input
                type="range"
                min={0}
                max={359}
                value={rotationDeg}
                onChange={(e) => setRotationDeg(Number(e.target.value))}
                className="w-full accent-amber-400 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
              />
            </div>
          </div>

          {/* Curated Mind-Blowing Tours & Presets */}
          <div className="glass-panel rounded-2xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-sky-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                Mind-Blowing Scale Tours
              </span>
              <span className="text-[10px] text-slate-400">1-Click Fly</span>
            </div>

            <div className="grid grid-cols-1 gap-1.5 max-h-48 overflow-y-auto pr-1">
              {COMPARISON_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => handleSelectPreset(preset)}
                  className="w-full text-left p-2 rounded-xl bg-slate-900/75 hover:bg-slate-800/90 border border-slate-800 hover:border-amber-400/40 transition-all group"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-100 group-hover:text-amber-300 transition-colors">
                      {preset.title}
                    </span>
                    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30">
                      {preset.badge}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 truncate mt-0.5">
                    {preset.subtitle}
                  </p>
                </button>
              ))}
            </div>

            {activePresetInsight && (
              <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/25 text-[11px] text-sky-100 leading-relaxed">
                {activePresetInsight}
              </div>
            )}
          </div>
      </div>

      {/* RIGHT VITAL INTELLIGENCE & COMPARISON PANEL (Pinned cleanly between top-3 and bottom bar) */}
      <div
        className={`fixed top-3 right-3 ${
          layer === 'choropleth' ? 'bottom-28' : 'bottom-20'
        } z-20 pointer-events-auto flex flex-col transition-all`}
      >
        <ComparisonPanel
          draggedCountry={draggedCountry}
          targetCountry={activeTargetCountry}
          overlappingCountries={overlappingCountries}
          targetLng={targetLng}
          targetLat={targetLat}
          rotationDeg={rotationDeg}
          pinnedTargetId={pinnedTargetId}
          onPinTargetCountry={(id) => setPinnedTargetId(id)}
          onSwapCountries={handleSwapCountries}
          onSelectQuizPreset={handleSelectQuizPreset}
        />
      </div>

      {/* BOTTOM FLOATING GLOBE LAYER & TELEMETRY BAR */}
      <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center pointer-events-none w-max max-w-[96vw]">
        {/* Choropleth Metric Sub-Selector when Data Heatmap layer is active */}
        {layer === 'choropleth' && (
          <div className="pointer-events-auto mb-2 px-3 py-1.5 rounded-full glass-panel flex items-center gap-1.5 border border-emerald-500/40 shadow-lg">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-300 mr-1">
              Heatmap:
            </span>
            {[
              { id: 'gdpPerCapita', label: 'GDP / Capita' },
              { id: 'populationDensity', label: 'Pop. Density' },
              { id: 'gdpNominalB', label: 'Nominal GDP' },
              { id: 'hdi', label: 'Human Dev (HDI)' },
              { id: 'areaKm2', label: 'Land Area' },
            ].map((m) => (
              <button
                key={m.id}
                onClick={() => setChoroplethMetric(m.id as ChoroplethMetric)}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
                  choroplethMetric === m.id
                    ? 'bg-emerald-400 text-slate-950 font-bold'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                {m.label}
              </button>
            ))}
            <span className="text-[10px] text-slate-400 pl-1">
              Neutral = no researched figure. Land Area uses the sphere.
            </span>
          </div>
        )}

        <div className="pointer-events-auto glass-panel rounded-2xl px-3 py-2 flex flex-wrap items-center justify-center gap-2 border border-slate-700/80 shadow-2xl">
          {/* 6 Globe Layer Switcher Buttons */}
          <div className="flex items-center gap-1 pr-2 border-r border-slate-800">
            <Layers className="w-4 h-4 text-amber-400 mr-1 hidden sm:block" />
            {GLOBE_LAYERS.map((l) => {
              const active = layer === l.id;
              return (
                <button
                  key={l.id}
                  onClick={() => setLayer(l.id)}
                  title={l.description}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                    active
                      ? 'bg-amber-400 text-slate-950 shadow-[0_0_16px_rgba(251,191,36,0.35)] font-bold'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                  }`}
                >
                  {l.shortName}
                </button>
              );
            })}
          </div>

          {/* 3D Interactive Mode Toggles */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCenterLockMode((v) => !v)}
              title="Lock superimposed country to screen center while spinning the globe underneath"
              className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1 border transition-all ${
                centerLockMode
                  ? 'bg-amber-500/25 border-amber-400 text-amber-200'
                  : 'bg-slate-900/70 border-slate-800 text-slate-300 hover:border-slate-700'
              }`}
            >
              <Crosshair className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Center-Lock</span>
            </button>

            <button
              onClick={() => setShowExtrusion3D((v) => !v)}
              title="Toggle 3D Volumetric Prism Extrusion Wall"
              className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1 border transition-all ${
                showExtrusion3D
                  ? 'bg-sky-500/20 border-sky-400/50 text-sky-200'
                  : 'bg-slate-900/70 border-slate-800 text-slate-400'
              }`}
            >
              <Box className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">3D Prism</span>
            </button>

            <button
              onClick={() => setShowGraticule((v) => !v)}
              title="Toggle latitude and longitude grid (G)"
              className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1 border transition-all ${
                showGraticule
                  ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-200'
                  : 'bg-slate-900/70 border-slate-800 text-slate-400'
              }`}
            >
              <Grid3x3 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Grid</span>
            </button>

            <button
              onClick={() => setAutoRotate((v) => !v)}
              title="Toggle Cinematic Auto-Orbit"
              className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1 border transition-all ${
                autoRotate
                  ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-200'
                  : 'bg-slate-900/70 border-slate-800 text-slate-300 hover:border-slate-700'
              }`}
            >
              {autoRotate ? (
                <Pause className="w-3.5 h-3.5" />
              ) : (
                <Play className="w-3.5 h-3.5" />
              )}
              <span className="hidden sm:inline">Orbit</span>
            </button>

            <div className="hidden lg:flex items-center gap-2 pl-2 border-l border-slate-800 text-[11px] font-mono text-slate-400">
              <span>
                {Math.abs(targetLat).toFixed(1)}°{targetLat >= 0 ? 'N' : 'S'},{' '}
                {Math.abs(targetLng).toFixed(1)}°{targetLng >= 0 ? 'E' : 'W'}
              </span>
              {hoveredCountry && (
                <span className="text-emerald-300">
                  • {hoveredCountry.stats.flag} {hoveredCountry.stats.iso3}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Viral Infographic & Social Share Studio Modal */}
      <SharePosterModal
        isOpen={isShareOpen}
        onClose={() => setIsShareOpen(false)}
        globeCanvas={globeCanvas}
        draggedCountry={draggedCountry}
        targetCountry={activeTargetCountry}
        targetLng={targetLng}
        targetLat={targetLat}
        rotationDeg={rotationDeg}
        layer={layer}
      />
    </div>
  );
};

export default App;
