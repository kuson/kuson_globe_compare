import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  Download,
  Copy,
  Check,
  Share2,
  Sparkles,
} from 'lucide-react';
import { WorldCountry, getMercatorDistortion } from '../utils/sphericalMath';
import { GlobeLayerId } from '../data/countryDatabase';

interface SharePosterModalProps {
  isOpen: boolean;
  onClose: () => void;
  globeCanvas: HTMLCanvasElement | null;
  draggedCountry: WorldCountry;
  targetCountry: WorldCountry | null;
  targetLng: number;
  targetLat: number;
  rotationDeg: number;
  layer: GlobeLayerId;
}

export const SharePosterModal: React.FC<SharePosterModalProps> = ({
  isOpen,
  onClose,
  globeCanvas,
  draggedCountry,
  targetCountry,
  targetLng,
  targetLat,
  rotationDeg,
  layer,
}) => {
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedText, setCopiedText] = useState(false);

  const d = draggedCountry.stats;
  const t = targetCountry?.stats || null;
  const ratio = t ? d.areaKm2 / Math.max(1, t.areaKm2) : 1;

  // Build shareable deep-link URL
  const shareUrl = (() => {
    const url = new URL(window.location.href);
    url.searchParams.set('drag', draggedCountry.id);
    if (targetCountry) url.searchParams.set('target', targetCountry.id);
    url.searchParams.set('lng', targetLng.toFixed(2));
    url.searchParams.set('lat', targetLat.toFixed(2));
    url.searchParams.set('rot', String(rotationDeg));
    url.searchParams.set('layer', layer);
    return url.toString();
  })();

  const statsAreCurated =
    d.dataQuality !== 'estimated' && (!t || t.dataQuality !== 'estimated');
  const shareSummaryText = t
    ? `🌍 Kuson Globe Compare: ${d.flag} ${d.name} (${d.areaKm2.toLocaleString()} km²) superimposed over ${t.flag} ${t.name} (${t.areaKm2.toLocaleString()} km²)!\n\n` +
      `• True Spherical Scale: ${d.name} is ${
        ratio >= 1
          ? `${ratio.toFixed(2)}× larger than`
          : `${(ratio * 100).toFixed(0)}% the size of`
      } ${t.name}\n` +
      (statsAreCurated
        ? `• Population: ${(d.population / 1e6).toFixed(1)}M vs ${(
            t.population / 1e6
          ).toFixed(1)}M\n` +
          `• Nominal GDP: $${d.gdpNominalB}B vs $${t.gdpNominalB}B\n` +
          `• What-If Density: At ${t.name}'s density, ${d.name} would hold ${(
            (d.areaKm2 * (t.population / t.areaKm2)) /
            1e6
          ).toFixed(1)}M people!\n`
        : `• Other vital figures are estimated for at least one country and are omitted.\n`) +
      `Explore on 3D Globe: ${shareUrl}`
    : `🌍 Exploring ${d.flag} ${d.name} (${d.areaKm2.toLocaleString()} km²) on Kuson Globe Compare 3D! ${shareUrl}`;

  // Composite the 1600x920 high-DPI infographic poster
  useEffect(() => {
    if (!isOpen || !previewCanvasRef.current) return;
    const canvas = previewCanvasRef.current;
    const W = 1600;
    const H = 920;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;

    // 1. Deep space radial background
    const bgGrad = ctx.createRadialGradient(520, H / 2, 60, 520, H / 2, 950);
    bgGrad.addColorStop(0, '#0f2042');
    bgGrad.addColorStop(0.55, '#070d1f');
    bgGrad.addColorStop(1, '#030611');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // 2. Draw Live 3D Globe Canvas on Left Side
    if (globeCanvas) {
      const gw = globeCanvas.width;
      const gh = globeCanvas.height;
      const aspect = gw / Math.max(1, gh);
      const drawH = H;
      const drawW = drawH * aspect;
      const offsetX = 500 - drawW / 2;
      ctx.drawImage(globeCanvas, offsetX, 0, drawW, drawH);
    }

    // 3. Right-hand Editorial Data Card Overlay
    const cardX = 930;
    const cardY = 48;
    const cardW = 622;
    const cardH = H - 96;

    ctx.save();
    ctx.fillStyle = 'rgba(10, 16, 34, 0.90)';
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(cardX, cardY, cardW, cardH, 28);
    ctx.fill();
    ctx.stroke();

    // Brand Header
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 17px Inter, system-ui, sans-serif';
    ctx.fillText(
      '🌐 KUSON GLOBE COMPARE • TRUE 3D SPHERICAL SCALE',
      cardX + 36,
      cardY + 48,
      cardW - 72
    );

    // Main Headline (constrained to card width)
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 32px Inter, system-ui, sans-serif';
    const titleText = t
      ? `${d.flag} ${d.name}  vs  ${t.flag} ${t.name}`
      : `${d.flag} ${d.name} (${d.areaKm2.toLocaleString()} km²)`;
    ctx.fillText(titleText, cardX + 36, cardY + 100, cardW - 72);

    // Scale Multiplier Highlight Pill
    ctx.fillStyle = 'rgba(251, 191, 36, 0.16)';
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.5)';
    ctx.beginPath();
    ctx.roundRect(cardX + 36, cardY + 126, cardW - 72, 66, 16);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#fde68a';
    ctx.font = 'bold 22px Inter, system-ui, sans-serif';
    const scaleLine = t
      ? ratio >= 1
        ? `${d.name} is ${ratio.toFixed(2)}× LARGER than ${t.name}`
        : `${d.name} is ${(ratio * 100).toFixed(1)}% the land area of ${t.name}`
      : `Positioned at ${Math.abs(targetLat).toFixed(1)}°${
          targetLat >= 0 ? 'N' : 'S'
        }, ${Math.abs(targetLng).toFixed(1)}°${targetLng >= 0 ? 'E' : 'W'}`;
    ctx.fillText(scaleLine, cardX + 52, cardY + 167, cardW - 104);

    const fmtGdp = (b: number) =>
      b >= 1000 ? `$${(b / 1000).toFixed(2)}T` : `$${b.toFixed(1)}B`;

    // Vital Statistics Comparison Table
    const shown = (estimated: boolean, text: string) =>
      estimated ? 'Estimated' : text;
    const dEstimated = d.dataQuality === 'estimated';
    const tEstimated = t?.dataQuality === 'estimated';

    const rows = t
      ? [
          [
            'Land Surface Area',
            `${d.areaKm2.toLocaleString()} km²`,
            `${t.areaKm2.toLocaleString()} km²`,
          ],
          [
            'Total Population',
            shown(dEstimated, `${(d.population / 1e6).toFixed(2)}M`),
            shown(Boolean(tEstimated), `${(t.population / 1e6).toFixed(2)}M`),
          ],
          [
            'Pop. Density',
            shown(dEstimated, `${Math.round(d.population / d.areaKm2)} /km²`),
            shown(
              Boolean(tEstimated),
              `${Math.round(t.population / t.areaKm2)} /km²`
            ),
          ],
          [
            'Nominal GDP',
            shown(dEstimated, fmtGdp(d.gdpNominalB)),
            shown(Boolean(tEstimated), fmtGdp(t.gdpNominalB)),
          ],
          [
            'GDP per Capita',
            shown(dEstimated, `$${d.gdpPerCapita.toLocaleString()}`),
            shown(Boolean(tEstimated), `$${t.gdpPerCapita.toLocaleString()}`),
          ],
          [
            'Human Dev. Index',
            shown(dEstimated, d.hdi.toFixed(3)),
            shown(Boolean(tEstimated), t.hdi.toFixed(3)),
          ],
          [
            'Highest Elevation',
            shown(dEstimated, `${d.highestPeakM}m`),
            shown(Boolean(tEstimated), `${t.highestPeakM}m`),
          ],
        ]
      : [
          ['Land Surface Area', `${d.areaKm2.toLocaleString()} km²`, '—'],
          [
            'Total Population',
            shown(dEstimated, `${(d.population / 1e6).toFixed(2)}M`),
            '—',
          ],
          ['Nominal GDP', shown(dEstimated, fmtGdp(d.gdpNominalB)), '—'],
          [
            'GDP per Capita',
            shown(dEstimated, `$${d.gdpPerCapita.toLocaleString()}`),
            '—',
          ],
        ];

    let rowY = cardY + 240;
    // Column headers
    ctx.font = 'bold 15px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('METRIC', cardX + 44, rowY);
    ctx.fillStyle = '#fbbf24';
    ctx.fillText(d.name.toUpperCase(), cardX + 260, rowY, 165);
    if (t) {
      ctx.fillStyle = '#34d399';
      ctx.fillText(t.name.toUpperCase(), cardX + 435, rowY, 150);
    }

    rowY += 18;
    for (const [label, valD, valT] of rows) {
      rowY += 54;
      ctx.fillStyle = 'rgba(30, 41, 59, 0.55)';
      ctx.beginPath();
      ctx.roundRect(cardX + 36, rowY - 34, cardW - 72, 44, 10);
      ctx.fill();

      ctx.font = '600 16px Inter, system-ui, sans-serif';
      ctx.fillStyle = '#cbd5e1';
      ctx.fillText(label, cardX + 48, rowY - 6);

      ctx.font = 'bold 17px JetBrains Mono, monospace';
      ctx.fillStyle = '#fcd34d';
      ctx.fillText(valD, cardX + 260, rowY - 6, 165);

      ctx.fillStyle = '#6ee7b7';
      ctx.fillText(valT, cardX + 435, rowY - 6, 150);
    }

    // What-If & Mercator Footer Box
    const merc = getMercatorDistortion(targetLat);
    ctx.fillStyle = 'rgba(14, 165, 233, 0.14)';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
    ctx.beginPath();
    ctx.roundRect(cardX + 36, cardY + cardH - 148, cardW - 72, 112, 16);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 15px Inter, system-ui, sans-serif';
    ctx.fillText(
      '✨ VIRAL SCALE & MERCATOR INSIGHT',
      cardX + 52,
      cardY + cardH - 114
    );

    ctx.fillStyle = '#e2e8f0';
    ctx.font = '500 15px Inter, system-ui, sans-serif';
    const insightLine1 =
      t && d.dataQuality !== 'estimated' && t.dataQuality !== 'estimated'
        ? `At ${t.name}’s density, ${d.name} would hold ${(
            (d.areaKm2 * (t.population / t.areaKm2)) /
            1e6
          ).toFixed(1)} million people!`
        : `${d.name} covers ${d.areaKm2.toLocaleString()} km² on the sphere.`;
    const insightLine2 = `At ${Math.abs(targetLat).toFixed(1)}°${
      targetLat >= 0 ? 'N' : 'S'
    }, a flat Web Mercator map inflates apparent area by ${merc.areaFactor.toFixed(
      2
    )}×.`;
    ctx.fillText(insightLine1, cardX + 52, cardY + cardH - 82, cardW - 104);
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(insightLine2, cardX + 52, cardY + cardH - 54, cardW - 104);

    ctx.restore();
  }, [
    isOpen,
    globeCanvas,
    draggedCountry,
    targetCountry,
    targetLng,
    targetLat,
    d,
    t,
    ratio,
  ]);

  if (!isOpen) return null;

  const handleDownloadPng = () => {
    if (!previewCanvasRef.current) return;
    const dataUrl = previewCanvasRef.current.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `kuson-globe-compare-${d.iso3}-vs-${t ? t.iso3 : 'GLOBE'}.png`;
    a.click();
  };

  const handleCopyLink = () => {
    window.history.replaceState(null, '', shareUrl);
    navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleCopySummary = () => {
    navigator.clipboard.writeText(shareSummaryText);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="w-full max-w-4xl glass-panel rounded-3xl border border-slate-700/80 overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-400/20 text-amber-300">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                Kuson Globe Compare — Viral Infographic Studio
              </h3>
              <p className="text-xs text-slate-400">
                Export a high-resolution comparison poster or share a live 3D deep link
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Live Poster Canvas Preview */}
          <div className="rounded-2xl overflow-hidden border border-slate-700/80 bg-slate-950 shadow-inner">
            <canvas
              ref={previewCanvasRef}
              className="w-full h-auto block"
            />
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              onClick={handleDownloadPng}
              className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-sm shadow-[0_0_24px_rgba(251,191,36,0.35)] transition-all"
            >
              <Download className="w-4 h-4" />
              Download HD Poster (.PNG)
            </button>

            <button
              onClick={handleCopyLink}
              className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white font-semibold text-sm transition-all"
            >
              {copiedLink ? (
                <>
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span className="text-emerald-300">Deep Link Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-sky-400" />
                  <span>Copy Interactive 3D Link</span>
                </>
              )}
            </button>

            <button
              onClick={handleCopySummary}
              className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white font-semibold text-sm transition-all"
            >
              {copiedText ? (
                <>
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span className="text-emerald-300">Social Post Copied!</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span>Copy Viral Stats Text</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
