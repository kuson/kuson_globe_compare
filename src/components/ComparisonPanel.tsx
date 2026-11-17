import React, { useState, useMemo } from 'react';
import * as d3 from 'd3-geo';
import {
  Globe2,
  Sparkles,
  Plane,
  GraduationCap,
  ArrowLeftRight,
  Compass,
  TrendingUp,
  Users,
  Mountain,
  Maximize2,
  Lock,
  Unlock,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { QUIZ_QUESTIONS, QuizQuestion } from '../data/countryDatabase';
import {
  WorldCountry,
  calculateGeodesicDistanceKm,
  getMercatorDistortion,
} from '../utils/sphericalMath';

interface ComparisonPanelProps {
  draggedCountry: WorldCountry;
  targetCountry: WorldCountry | null;
  overlappingCountries: WorldCountry[];
  targetLng: number;
  targetLat: number;
  rotationDeg: number;
  pinnedTargetId: string | null;
  onPinTargetCountry: (id: string | null) => void;
  onSwapCountries: () => void;
  onSelectQuizPreset: (q: QuizQuestion) => void;
}

type ActiveTab = 'vitals' | 'whatif' | 'nomad' | 'quiz';

/**
 * Renders a mini SVG silhouette of a country's GeoJSON feature.
 */
const CountryMiniSilhouette: React.FC<{
  country: WorldCountry;
  color: string;
  size?: number;
}> = ({ country, color, size = 54 }) => {
  const pathData = useMemo(() => {
    const projection = d3
      .geoMercator()
      .fitExtent(
        [
          [4, 4],
          [size - 4, size - 4],
        ],
        country.feature
      );
    const pathGenerator = d3.geoPath(projection);
    return pathGenerator(country.feature) || '';
  }, [country, size]);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="shrink-0 overflow-visible drop-shadow-[0_0_8px_rgba(0,0,0,0.6)]"
    >
      <path
        d={pathData}
        fill={color}
        fillOpacity={0.32}
        stroke={color}
        strokeWidth={1.6}
      />
    </svg>
  );
};

/**
 * 5-Axis Normalized Radar Chart comparing Dragged vs Target Country.
 */
const ComparisonRadarChart: React.FC<{
  dragged: WorldCountry;
  target: WorldCountry;
}> = ({ dragged, target }) => {
  const axes = useMemo(() => {
    const d = dragged.stats;
    const t = target.stats;
    const dDensity = d.population / Math.max(1, d.areaKm2);
    const tDensity = t.population / Math.max(1, t.areaKm2);

    const normRatio = (a: number, b: number) => {
      const max = Math.max(a, b, 0.001);
      return [
        Math.max(0.15, Math.min(1, a / max)),
        Math.max(0.15, Math.min(1, b / max)),
      ];
    };

    const [dArea, tArea] = normRatio(d.areaKm2, t.areaKm2);
    const [dPop, tPop] = normRatio(d.population, t.population);
    const [dGdp, tGdp] = normRatio(d.gdpNominalB, t.gdpNominalB);
    const [dGdpCap, tGdpCap] = normRatio(d.gdpPerCapita, t.gdpPerCapita);
    const [dDens, tDens] = normRatio(dDensity, tDensity);

    return [
      { label: 'Land Area', dVal: dArea, tVal: tArea },
      { label: 'Population', dVal: dPop, tVal: tPop },
      { label: 'Total GDP', dVal: dGdp, tVal: tGdp },
      { label: 'GDP/Capita', dVal: dGdpCap, tVal: tGdpCap },
      { label: 'Density', dVal: dDens, tVal: tDens },
    ];
  }, [dragged, target]);

  const cx = 95;
  const cy = 82;
  const radius = 56;

  const getPolygonPoints = (key: 'dVal' | 'tVal') =>
    axes
      .map((axis, i) => {
        const angle = -Math.PI / 2 + (i * 2 * Math.PI) / axes.length;
        const r = axis[key] * radius;
        return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
      })
      .join(' ');

  return (
    <div className="flex flex-col items-center bg-slate-900/55 border border-slate-800/80 rounded-xl p-2.5">
      <div className="w-full flex items-center justify-between text-[11px] text-slate-400 mb-1 px-1">
        <span className="font-semibold text-slate-300">
          5-Dimension Scale Fingerprint
        </span>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-amber-300 font-medium">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            {dragged.stats.iso3}
          </span>
          <span className="flex items-center gap-1 text-emerald-300 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            {target.stats.iso3}
          </span>
        </div>
      </div>

      <svg width={190} height={162} className="overflow-visible">
        {/* Concentric pentagon rings */}
        {[0.33, 0.66, 1.0].map((level) => {
          const pts = axes
            .map((_, i) => {
              const angle = -Math.PI / 2 + (i * 2 * Math.PI) / axes.length;
              const r = level * radius;
              return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
            })
            .join(' ');
          return (
            <polygon
              key={level}
              points={pts}
              fill="none"
              stroke="rgba(148, 163, 184, 0.18)"
              strokeWidth={1}
            />
          );
        })}

        {/* Axis spokes & labels */}
        {axes.map((axis, i) => {
          const angle = -Math.PI / 2 + (i * 2 * Math.PI) / axes.length;
          const x2 = cx + radius * Math.cos(angle);
          const y2 = cy + radius * Math.sin(angle);
          const lx = cx + (radius + 19) * Math.cos(angle);
          const ly = cy + (radius + 14) * Math.sin(angle);
          return (
            <g key={axis.label}>
              <line
                x1={cx}
                y1={cy}
                x2={x2}
                y2={y2}
                stroke="rgba(148, 163, 184, 0.2)"
                strokeWidth={1}
              />
              <text
                x={lx}
                y={ly}
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-slate-400 text-[9px] font-medium"
              >
                {axis.label}
              </text>
            </g>
          );
        })}

        {/* Target Country Polygon */}
        <polygon
          points={getPolygonPoints('tVal')}
          fill="rgba(16, 185, 129, 0.25)"
          stroke="#10b981"
          strokeWidth={1.8}
        />

        {/* Dragged Country Polygon */}
        <polygon
          points={getPolygonPoints('dVal')}
          fill="rgba(251, 191, 36, 0.28)"
          stroke="#fbbf24"
          strokeWidth={2}
        />
      </svg>
    </div>
  );
};

export const ComparisonPanel: React.FC<ComparisonPanelProps> = ({
  draggedCountry,
  targetCountry,
  overlappingCountries,
  targetLng,
  targetLat,
  rotationDeg,
  pinnedTargetId,
  onPinTargetCountry,
  onSwapCountries,
  onSelectQuizPreset,
}) => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('vitals');
  const [nomadBudgetUsd, setNomadBudgetUsd] = useState<number>(2500);
  const [quizIndex, setQuizIndex] = useState<number>(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [quizScore, setQuizScore] = useState<number>(0);

  const dStats = draggedCountry.stats;
  const tStats = targetCountry?.stats || null;

  const areaRatio = tStats
    ? dStats.areaKm2 / Math.max(1, tStats.areaKm2)
    : null;

  const geodesicKm = useMemo(
    () =>
      calculateGeodesicDistanceKm(draggedCountry.centroid, [
        targetLng,
        targetLat,
      ]),
    [draggedCountry, targetLng, targetLat]
  );

  const homeMercator = useMemo(
    () => getMercatorDistortion(draggedCountry.centroid[1]),
    [draggedCountry]
  );
  const currentMercator = useMemo(
    () => getMercatorDistortion(targetLat),
    [targetLat]
  );
  const mercatorAreaInflationVsHome =
    currentMercator.areaFactor / Math.max(0.1, homeMercator.areaFactor);

  const dDensity = dStats.population / Math.max(1, dStats.areaKm2);
  const tDensity = tStats
    ? tStats.population / Math.max(1, tStats.areaKm2)
    : 0;

  const formatPop = (n: number) => {
    if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
    return n.toLocaleString();
  };

  const formatGdp = (b: number) => {
    if (b >= 1000) return `$${(b / 1000).toFixed(2)}T`;
    return `$${b.toFixed(1)}B`;
  };

  return (
    <aside className="w-full md:w-[424px] xl:w-[444px] h-full flex flex-col glass-panel rounded-2xl overflow-hidden z-20">
      {/* Top Head-to-Head Hero Card */}
      <div className="p-3.5 border-b border-slate-800/80 bg-gradient-to-b from-slate-900/90 to-slate-950/60">
        <div className="flex items-center justify-between gap-2">
          {/* Dragged Nation */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <CountryMiniSilhouette country={draggedCountry} color="#fbbf24" size={44} />
            <div className="min-w-0">
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30">
                Superimposed
              </span>
              <h2 className="text-sm font-bold text-white leading-tight mt-0.5">
                {dStats.flag} {dStats.name}
              </h2>
              <p className="text-[11px] font-mono text-amber-300/90">
                {dStats.areaKm2.toLocaleString()} km²
              </p>
            </div>
          </div>

          {/* Swap Button */}
          {targetCountry && (
            <button
              onClick={onSwapCountries}
              title="Swap Dragged & Target Country"
              className="p-1.5 rounded-xl bg-slate-800/90 hover:bg-amber-500/20 border border-slate-700 hover:border-amber-400/50 text-slate-300 hover:text-amber-300 transition-all shrink-0"
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Target Nation Underneath */}
          <div className="flex items-center justify-end gap-2 min-w-0 flex-1 text-right">
            {targetCountry && tStats ? (
              <>
                <div className="min-w-0">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() =>
                        onPinTargetCountry(
                          pinnedTargetId === targetCountry.id
                            ? null
                            : targetCountry.id
                        )
                      }
                      title={
                        pinnedTargetId === targetCountry.id
                          ? 'Unpin Target Country'
                          : 'Pin Target Country while dragging'
                      }
                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider border transition-colors ${
                        pinnedTargetId === targetCountry.id
                          ? 'bg-emerald-500/30 text-emerald-200 border-emerald-400'
                          : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25'
                      }`}
                    >
                      {pinnedTargetId === targetCountry.id ? (
                        <Lock className="w-2.5 h-2.5" />
                      ) : (
                        <Unlock className="w-2.5 h-2.5" />
                      )}
                      Underneath
                    </button>
                  </div>
                  <h2 className="text-sm font-bold text-white leading-tight mt-0.5">
                    {tStats.flag} {tStats.name}
                  </h2>
                  <p className="text-[11px] font-mono text-emerald-300/90">
                    {tStats.areaKm2.toLocaleString()} km²
                  </p>
                </div>
                <CountryMiniSilhouette
                  country={targetCountry}
                  color="#10b981"
                  size={44}
                />
              </>
            ) : (
              <div className="py-1">
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-sky-500/15 text-sky-300 border border-sky-500/30">
                  Oceanic Waters
                </span>
                <h2 className="text-sm font-bold text-slate-200 mt-0.5">
                  🌊 International Waters
                </h2>
                <p className="text-[11px] font-mono text-slate-400">
                  {targetLat.toFixed(1)}°{targetLat >= 0 ? 'N' : 'S'},{' '}
                  {targetLng.toFixed(1)}°{targetLng >= 0 ? 'E' : 'W'}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* True Spherical Scale Multiplier Banner */}
        {tStats && areaRatio !== null && (
          <div className="mt-3 px-3 py-2 rounded-xl bg-gradient-to-r from-amber-500/15 via-slate-900/90 to-emerald-500/15 border border-slate-700/80 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Maximize2 className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="text-xs text-slate-200">
                <strong className="text-amber-300">{dStats.name}</strong> is{' '}
                <strong className="text-white font-mono text-sm">
                  {areaRatio >= 1
                    ? `${areaRatio.toFixed(2)}× larger`
                    : `${(areaRatio * 100).toFixed(0)}% the size`}
                </strong>{' '}
                {areaRatio >= 1 ? 'than' : 'of'}{' '}
                <strong className="text-emerald-300">{tStats.name}</strong>
              </span>
            </div>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-950/80 text-slate-300 border border-slate-800 shrink-0">
              {areaRatio >= 1
                ? `Fits ${areaRatio.toFixed(1)}×`
                : `${(1 / areaRatio).toFixed(1)} fit in ${tStats.iso3}`}
            </span>
          </div>
        )}

        {/* Overlapping Countries Footprint Bar */}
        {overlappingCountries.length > 0 && (
          <div className="mt-2.5 flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold shrink-0">
              Footprint:
            </span>
            {overlappingCountries.map((c) => {
              const isSelected = targetCountry?.id === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() =>
                    onPinTargetCountry(
                      pinnedTargetId === c.id ? null : c.id
                    )
                  }
                  className={`px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0 transition-all border ${
                    isSelected
                      ? 'bg-emerald-500/25 text-emerald-200 border-emerald-400/60 shadow-sm'
                      : 'bg-slate-800/70 text-slate-300 border-slate-700/70 hover:bg-slate-800'
                  }`}
                >
                  {c.stats.flag} {c.stats.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 4 Persona Intelligence Navigation Tabs */}
      <div className="grid grid-cols-4 gap-1 p-1.5 bg-slate-950/80 border-b border-slate-800/80 shrink-0">
        {[
          { id: 'vitals', label: 'Vital Stats', icon: Globe2 },
          { id: 'whatif', label: 'What-If Lab', icon: Sparkles },
          { id: 'nomad', label: 'Nomad Hub', icon: Plane },
          { id: 'quiz', label: 'Scale Quiz', icon: GraduationCap },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as ActiveTab)}
              className={`flex items-center justify-center gap-1 py-2 px-1.5 rounded-xl text-[11px] font-semibold whitespace-nowrap transition-all ${
                active
                  ? 'bg-amber-400 text-slate-950 shadow-[0_0_16px_rgba(251,191,36,0.35)]'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Scrollable Intelligence Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeTab === 'vitals' && (
          <>
            {tStats && targetCountry ? (
              <>
                <ComparisonRadarChart
                  dragged={draggedCountry}
                  target={targetCountry}
                />

                {/* Proportional Head-to-Head Metric Bars */}
                <div className="space-y-2.5">
                  {[
                    {
                      label: 'Land Surface Area',
                      dText: `${dStats.areaKm2.toLocaleString()} km²`,
                      tText: `${tStats.areaKm2.toLocaleString()} km²`,
                      dVal: dStats.areaKm2,
                      tVal: tStats.areaKm2,
                      unit: 'km²',
                    },
                    {
                      label: 'Total Population',
                      dText: formatPop(dStats.population),
                      tText: formatPop(tStats.population),
                      dVal: dStats.population,
                      tVal: tStats.population,
                      unit: 'people',
                    },
                    {
                      label: 'Population Density',
                      dText: `${Math.round(dDensity).toLocaleString()} /km²`,
                      tText: `${Math.round(tDensity).toLocaleString()} /km²`,
                      dVal: dDensity,
                      tVal: tDensity,
                      unit: '/km²',
                    },
                    {
                      label: 'Nominal GDP',
                      dText: formatGdp(dStats.gdpNominalB),
                      tText: formatGdp(tStats.gdpNominalB),
                      dVal: dStats.gdpNominalB,
                      tVal: tStats.gdpNominalB,
                      unit: 'USD',
                    },
                    {
                      label: 'GDP (Purchasing Power PPP)',
                      dText: formatGdp(dStats.gdpPppB),
                      tText: formatGdp(tStats.gdpPppB),
                      dVal: dStats.gdpPppB,
                      tVal: tStats.gdpPppB,
                      unit: 'PPP',
                    },
                    {
                      label: 'GDP per Capita (Nominal)',
                      dText: `$${dStats.gdpPerCapita.toLocaleString()}`,
                      tText: `$${tStats.gdpPerCapita.toLocaleString()}`,
                      dVal: dStats.gdpPerCapita,
                      tVal: tStats.gdpPerCapita,
                      unit: 'USD',
                    },
                    {
                      label: 'Human Development Index (HDI)',
                      dText: dStats.hdi.toFixed(3),
                      tText: tStats.hdi.toFixed(3),
                      dVal: dStats.hdi,
                      tVal: tStats.hdi,
                      unit: 'idx',
                    },
                    {
                      label: 'Life Expectancy / Median Age',
                      dText: `${dStats.lifeExpectancy}y (Med ${dStats.medianAge}y)`,
                      tText: `${tStats.lifeExpectancy}y (Med ${tStats.medianAge}y)`,
                      dVal: dStats.lifeExpectancy,
                      tVal: tStats.lifeExpectancy,
                      unit: 'yrs',
                    },
                    {
                      label: 'Highest Peak Elevation',
                      dText: `${dStats.highestPeakM.toLocaleString()}m (${dStats.highestPeakName})`,
                      tText: `${tStats.highestPeakM.toLocaleString()}m (${tStats.highestPeakName})`,
                      dVal: dStats.highestPeakM,
                      tVal: tStats.highestPeakM,
                      unit: 'm',
                    },
                    {
                      label: 'Coastline & Forest Cover',
                      dText: `${dStats.coastlineKm.toLocaleString()} km • ${dStats.forestPct}% forest`,
                      tText: `${tStats.coastlineKm.toLocaleString()} km • ${tStats.forestPct}% forest`,
                      dVal: dStats.coastlineKm + 100,
                      tVal: tStats.coastlineKm + 100,
                      unit: 'km',
                    },
                  ].map((row) => {
                    const total = Math.max(0.0001, row.dVal + row.tVal);
                    const dPct = Math.max(8, Math.min(92, (row.dVal / total) * 100));
                    return (
                      <div
                        key={row.label}
                        className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/80"
                      >
                        <div className="flex items-center justify-between text-[11px] mb-1">
                          <span className="font-mono font-semibold text-amber-300">
                            {row.dText}
                          </span>
                          <span className="text-slate-400 font-medium">
                            {row.label}
                          </span>
                          <span className="font-mono font-semibold text-emerald-300">
                            {row.tText}
                          </span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden flex">
                          <div
                            className="h-full bg-gradient-to-r from-amber-500 to-amber-300 transition-all duration-300"
                            style={{ width: `${dPct}%` }}
                          />
                          <div
                            className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-all duration-300"
                            style={{ width: `${100 - dPct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-center space-y-2">
                <p className="text-xs text-slate-300">
                  Drag <strong>{dStats.flag} {dStats.name}</strong> over any
                  continent on the 3D globe (or double-click any nation) to see
                  full head-to-head statistics!
                </p>
              </div>
            )}

            {/* Geopolitical Fun Fact Callout */}
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 space-y-1.5">
              <div className="text-[11px] font-bold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                Geographic Scale Insight
              </div>
              <p className="text-xs text-slate-200 leading-relaxed">
                {dStats.funFact}
              </p>
              {tStats && tStats.id !== dStats.id && (
                <p className="text-xs text-emerald-200/90 leading-relaxed pt-1 border-t border-amber-500/20">
                  {tStats.funFact}
                </p>
              )}
            </div>
          </>
        )}

        {activeTab === 'whatif' && (
          <div className="space-y-3.5">
            {/* Mercator Distortion Mythbuster Card */}
            <div className="p-3.5 rounded-xl bg-gradient-to-br from-sky-950/60 to-slate-900/90 border border-sky-500/30 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-sky-300 flex items-center gap-1.5">
                  <Compass className="w-4 h-4" />
                  Mercator Projection Mythbuster
                </span>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-sky-500/20 text-sky-200 border border-sky-400/30">
                  Lat {Math.abs(targetLat).toFixed(1)}°
                  {targetLat >= 0 ? 'N' : 'S'}
                </span>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">
                On our <strong>true 3D sphere</strong>,{' '}
                <strong className="text-amber-300">{dStats.name}</strong> always
                maintains its true{' '}
                <span className="font-mono">
                  {dStats.areaKm2.toLocaleString()} km²
                </span>{' '}
                size. However, on a flat{' '}
                <strong>Web Mercator map</strong> at{' '}
                <span className="font-mono">
                  {Math.abs(targetLat).toFixed(1)}°{targetLat >= 0 ? 'N' : 'S'}
                </span>
                , its apparent area would be inflated by{' '}
                <strong className="text-sky-300 font-mono">
                  {mercatorAreaInflationVsHome.toFixed(2)}×
                </strong>{' '}
                (looking like{' '}
                <strong className="text-white font-mono">
                  {Math.round(
                    dStats.areaKm2 * mercatorAreaInflationVsHome
                  ).toLocaleString()}{' '}
                  km²
                </strong>
                )!
              </p>

              {/* Visual 3D True Sphere vs 2D Flat Mercator Box Comparison */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800 flex flex-col items-center">
                  <span className="text-[10px] text-slate-400 mb-1">
                    True 3D Globe Area
                  </span>
                  <div className="w-11 h-11 rounded-lg bg-amber-400/25 border-2 border-amber-400 flex items-center justify-center font-mono text-xs font-bold text-amber-200">
                    1.00×
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800 flex flex-col items-center">
                  <span className="text-[10px] text-slate-400 mb-1">
                    Flat Mercator at {Math.abs(targetLat).toFixed(0)}°
                  </span>
                  <div
                    className="rounded-lg bg-sky-400/25 border-2 border-dashed border-sky-400 flex items-center justify-center font-mono text-xs font-bold text-sky-200 transition-all"
                    style={{
                      width: `${Math.min(
                        76,
                        Math.max(28, 44 * currentMercator.linearFactor)
                      )}px`,
                      height: `${Math.min(
                        76,
                        Math.max(28, 44 * currentMercator.linearFactor)
                      )}px`,
                    }}
                  >
                    {mercatorAreaInflationVsHome.toFixed(2)}×
                  </div>
                </div>
              </div>
            </div>

            {/* Counterfactual Simulation Cards */}
            {tStats ? (
              <>
                <div className="p-3.5 rounded-xl bg-slate-900/75 border border-amber-500/30 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
                    <Users className="w-4 h-4" />
                    What if {dStats.name} had {tStats.name}’s Population Density?
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    At {tStats.name}’s density of{' '}
                    <span className="font-mono text-emerald-300">
                      {Math.round(tDensity).toLocaleString()} people/km²
                    </span>
                    , {dStats.name} would have a population of{' '}
                    <strong className="text-base font-mono text-white">
                      {formatPop(Math.round(dStats.areaKm2 * tDensity))}
                    </strong>{' '}
                    (compared to {formatPop(dStats.population)} today).
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-900/75 border border-emerald-500/30 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-300">
                    <TrendingUp className="w-4 h-4" />
                    What if {dStats.name} had {tStats.name}’s GDP per Capita?
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    With {tStats.name}’s nominal GDP per capita of{' '}
                    <span className="font-mono text-emerald-300">
                      ${tStats.gdpPerCapita.toLocaleString()}
                    </span>
                    , {dStats.name}’s total national GDP would be{' '}
                    <strong className="text-base font-mono text-white">
                      {formatGdp(
                        (dStats.population * tStats.gdpPerCapita) / 1e9
                      )}
                    </strong>{' '}
                    (vs. {formatGdp(dStats.gdpNominalB)} today).
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-900/75 border border-purple-500/30 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-purple-300">
                    <Mountain className="w-4 h-4" />
                    Reverse Density Simulation
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    If <strong className="text-emerald-300">{tStats.name}</strong>{' '}
                    had {dStats.name}’s density of{' '}
                    <span className="font-mono text-amber-300">
                      {Math.round(dDensity).toLocaleString()} people/km²
                    </span>
                    , {tStats.name}’s population would be{' '}
                    <strong className="text-white font-mono">
                      {formatPop(Math.round(tStats.areaKm2 * dDensity))}
                    </strong>
                    .
                  </p>
                </div>
              </>
            ) : (
              <p className="text-xs text-slate-400 text-center py-4">
                Place {dStats.name} over a country to unlock live What-If
                simulations.
              </p>
            )}
          </div>
        )}

        {activeTab === 'nomad' && (
          <div className="space-y-3.5">
            {/* Great Circle Flight & Telemetry */}
            <div className="p-3.5 rounded-xl bg-slate-900/75 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-sky-300 flex items-center gap-1.5">
                  <Plane className="w-4 h-4" />
                  Great-Circle Geodesic Displacement
                </span>
                <span className="text-xs font-mono text-white font-bold">
                  {Math.round(geodesicKm).toLocaleString()} km (
                  {Math.round(geodesicKm * 0.621371).toLocaleString()} mi)
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                <div className="p-2 rounded-lg bg-slate-950/70 border border-slate-800/80">
                  <div className="text-[10px] text-slate-400">Direct Flight</div>
                  <div className="text-xs font-mono font-bold text-amber-300 mt-0.5">
                    ~{Math.max(0.5, geodesicKm / 840).toFixed(1)} hrs
                  </div>
                </div>
                <div className="p-2 rounded-lg bg-slate-950/70 border border-slate-800/80">
                  <div className="text-[10px] text-slate-400">Bearing</div>
                  <div className="text-xs font-mono font-bold text-sky-300 mt-0.5">
                    {rotationDeg}° Rotated
                  </div>
                </div>
                <div className="p-2 rounded-lg bg-slate-950/70 border border-slate-800/80">
                  <div className="text-[10px] text-slate-400">Avg Temp Diff</div>
                  <div className="text-xs font-mono font-bold text-emerald-300 mt-0.5">
                    {tStats
                      ? `${dStats.avgTempC} vs ${tStats.avgTempC}°C`
                      : `${dStats.avgTempC}°C`}
                  </div>
                </div>
              </div>
            </div>

            {tStats && (
              <>
                {/* Interactive PPP / Cost of Living Calculator */}
                <div className="p-3.5 rounded-xl bg-gradient-to-br from-emerald-950/40 to-slate-900/90 border border-emerald-500/30 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-300">
                      Purchasing Power & Lifestyle Equivalent
                    </span>
                    <span className="text-xs font-mono text-amber-300 font-bold">
                      ${nomadBudgetUsd.toLocaleString()} / mo
                    </span>
                  </div>

                  <input
                    type="range"
                    min={1000}
                    max={10000}
                    step={250}
                    value={nomadBudgetUsd}
                    onChange={(e) => setNomadBudgetUsd(Number(e.target.value))}
                    className="w-full accent-amber-400 cursor-pointer"
                  />

                  <p className="text-xs text-slate-200 leading-relaxed">
                    A monthly lifestyle costing{' '}
                    <strong className="text-amber-300 font-mono">
                      ${nomadBudgetUsd.toLocaleString()}
                    </strong>{' '}
                    in <strong>{dStats.name}</strong> (Index{' '}
                    {dStats.costOfLivingIndex}) requires approximately{' '}
                    <strong className="text-emerald-300 font-mono text-sm">
                      $
                      {Math.round(
                        nomadBudgetUsd *
                          (tStats.costOfLivingIndex /
                            Math.max(1, dStats.costOfLivingIndex))
                      ).toLocaleString()}
                    </strong>{' '}
                    in <strong>{tStats.name}</strong> (Index{' '}
                    {tStats.costOfLivingIndex}).
                  </p>
                </div>

                {/* Practical Travel & Expat Matrix */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 rounded-xl bg-slate-900/70 border border-slate-800 space-y-1">
                    <div className="text-[10px] uppercase text-amber-300 font-bold">
                      {dStats.flag} {dStats.name}
                    </div>
                    <div className="text-slate-300">
                      <span className="text-slate-500">Capital:</span>{' '}
                      {dStats.capital}
                    </div>
                    <div className="text-slate-300">
                      <span className="text-slate-500">Currency:</span>{' '}
                      {dStats.currency}
                    </div>
                    <div className="text-slate-300">
                      <span className="text-slate-500">Drives on:</span>{' '}
                      {dStats.drivingSide} • {dStats.timeZone}
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-900/70 border border-slate-800 space-y-1">
                    <div className="text-[10px] uppercase text-emerald-300 font-bold">
                      {tStats.flag} {tStats.name}
                    </div>
                    <div className="text-slate-300">
                      <span className="text-slate-500">Capital:</span>{' '}
                      {tStats.capital}
                    </div>
                    <div className="text-slate-300">
                      <span className="text-slate-500">Currency:</span>{' '}
                      {tStats.currency}
                    </div>
                    <div className="text-slate-300">
                      <span className="text-slate-500">Drives on:</span>{' '}
                      {tStats.drivingSide} • {tStats.timeZone}
                    </div>
                  </div>
                </div>

                {/* Key Exports Comparison */}
                <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
                  <div className="text-[11px] font-semibold text-slate-300">
                    Signature Economic & Export Pillars
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {dStats.topExports.map((exp) => (
                      <span
                        key={exp}
                        className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-200 border border-amber-500/30 text-[10px]"
                      >
                        {dStats.flag} {exp}
                      </span>
                    ))}
                    {tStats.topExports.map((exp) => (
                      <span
                        key={exp}
                        className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-200 border border-emerald-500/30 text-[10px]"
                      >
                        {tStats.flag} {exp}
                      </span>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'quiz' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-bold text-amber-300">
                Question {quizIndex + 1} of {QUIZ_QUESTIONS.length}
              </span>
              <span className="text-xs font-mono px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Score: {quizScore} / {QUIZ_QUESTIONS.length}
              </span>
            </div>

            {(() => {
              const q = QUIZ_QUESTIONS[quizIndex];
              return (
                <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
                  <p className="text-xs font-semibold text-white leading-relaxed">
                    {q.question}
                  </p>

                  <button
                    onClick={() => onSelectQuizPreset(q)}
                    className="w-full py-1.5 px-3 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/40 text-sky-200 text-xs font-medium transition-all"
                  >
                    🌍 Fly 3D Globe to Inspect This Comparison Live
                  </button>

                  <div className="space-y-1.5">
                    {q.options.map((opt, idx) => {
                      const isPicked = selectedOption === idx;
                      const isCorrect = idx === q.correctIndex;
                      let btnStyle =
                        'bg-slate-950/70 border-slate-800 text-slate-200 hover:border-slate-600';
                      if (selectedOption !== null) {
                        if (isCorrect) {
                          btnStyle =
                            'bg-emerald-500/25 border-emerald-400 text-emerald-200';
                        } else if (isPicked) {
                          btnStyle =
                            'bg-rose-500/25 border-rose-400 text-rose-200';
                        }
                      }

                      return (
                        <button
                          key={opt}
                          disabled={selectedOption !== null}
                          onClick={() => {
                            setSelectedOption(idx);
                            if (idx === q.correctIndex) {
                              setQuizScore((s) => s + 1);
                            }
                            onSelectQuizPreset(q);
                          }}
                          className={`w-full text-left p-2.5 rounded-xl border text-xs font-medium flex items-center justify-between transition-all ${btnStyle}`}
                        >
                          <span>{opt}</span>
                          {selectedOption !== null && isCorrect && (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                          )}
                          {selectedOption !== null && isPicked && !isCorrect && (
                            <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {selectedOption !== null && (
                    <div className="p-2.5 rounded-lg bg-slate-950/90 border border-slate-700 space-y-2">
                      <p className="text-xs text-slate-300 leading-relaxed">
                        {q.explanation}
                      </p>
                      <button
                        onClick={() => {
                          setSelectedOption(null);
                          setQuizIndex(
                            (prev) => (prev + 1) % QUIZ_QUESTIONS.length
                          );
                        }}
                        className="w-full py-1.5 rounded-lg bg-amber-400 text-slate-950 font-bold text-xs hover:bg-amber-300 transition-colors"
                      >
                        Next Challenge →
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </aside>
  );
};
