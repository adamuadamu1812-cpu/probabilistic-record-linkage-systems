import React, { useMemo, useState } from 'react';
import * as d3 from 'd3';
import type { CandidatePair } from '../types/linkage';

interface SimilarityProbabilityHeatmapProps {
  pairs: CandidatePair[];
  priorMatch: number;
  lowerThreshold: number;
  upperThreshold: number;
}

interface HeatmapCell {
  xi: number;
  yi: number;
  simStart: number;
  simEnd: number;
  probStart: number;
  probEnd: number;
  total: number;
  matchCount: number;
  clericalCount: number;
  nonMatchCount: number;
  meanWeight: number;
}

function weightToPosteriorPct(weight: number, priorMatch: number): number {
  const clampedPrior = Math.min(0.9995, Math.max(0.0005, priorMatch));
  const logPriorOdds = Math.log(clampedPrior / (1 - clampedPrior));
  const logOdds = logPriorOdds + weight * Math.LN2;
  const prob = 1 / (1 + Math.exp(-Math.min(30, Math.max(-30, logOdds))));
  return prob * 100;
}

function pairMeanSimilarityPct(pair: CandidatePair): number {
  const present = pair.comparisons.filter((c) => c.level !== 'missing');
  if (present.length === 0) return 0;
  const sum = present.reduce((acc, c) => acc + c.similarity, 0);
  return (sum / present.length) * 100;
}

export const SimilarityProbabilityHeatmap: React.FC<
  SimilarityProbabilityHeatmapProps
> = ({ pairs, priorMatch, lowerThreshold, upperThreshold }) => {
  const [hoveredCellKey, setHoveredCellKey] = useState<string | null>(null);

  const { cells, maxCount, correlationR } = useMemo(() => {
    const gridSize = 10;
    const cellList: HeatmapCell[] = [];
    const accumulators: Array<{
      total: number;
      matchCount: number;
      clericalCount: number;
      nonMatchCount: number;
      weightSum: number;
    }> = Array.from({ length: gridSize * gridSize }, () => ({
      total: 0,
      matchCount: 0,
      clericalCount: 0,
      nonMatchCount: 0,
      weightSum: 0,
    }));

    const simValues: number[] = [];
    const probValues: number[] = [];

    for (const p of pairs) {
      const simPct = Math.min(100, Math.max(0, pairMeanSimilarityPct(p)));
      const probPct = Math.min(100, Math.max(0, p.posteriorProb * 100));
      simValues.push(simPct);
      probValues.push(probPct);

      const xi = Math.min(gridSize - 1, Math.max(0, Math.floor(simPct / 10)));
      const yi = Math.min(gridSize - 1, Math.max(0, Math.floor(probPct / 10)));
      const idx = yi * gridSize + xi;
      const acc = accumulators[idx];
      acc.total += 1;
      acc.weightSum += p.totalWeight;
      if (p.finalDecision === 'match') acc.matchCount += 1;
      else if (p.finalDecision === 'clerical') acc.clericalCount += 1;
      else acc.nonMatchCount += 1;
    }

    let peak = 1;
    for (let yi = 0; yi < gridSize; yi++) {
      for (let xi = 0; xi < gridSize; xi++) {
        const acc = accumulators[yi * gridSize + xi];
        if (acc.total > peak) peak = acc.total;
        cellList.push({
          xi,
          yi,
          simStart: xi * 10,
          simEnd: (xi + 1) * 10,
          probStart: yi * 10,
          probEnd: (yi + 1) * 10,
          total: acc.total,
          matchCount: acc.matchCount,
          clericalCount: acc.clericalCount,
          nonMatchCount: acc.nonMatchCount,
          meanWeight: acc.total > 0 ? acc.weightSum / acc.total : 0,
        });
      }
    }

    // Compute Pearson correlation between mean similarity and match probability
    let r = 0;
    if (simValues.length >= 2) {
      const n = simValues.length;
      const meanX = simValues.reduce((a, b) => a + b, 0) / n;
      const meanY = probValues.reduce((a, b) => a + b, 0) / n;
      let num = 0;
      let denX = 0;
      let denY = 0;
      for (let i = 0; i < n; i++) {
        const dx = simValues[i] - meanX;
        const dy = probValues[i] - meanY;
        num += dx * dy;
        denX += dx * dx;
        denY += dy * dy;
      }
      const denom = Math.sqrt(denX * denY);
      r = denom > 0 ? num / denom : 0;
    }

    return { cells: cellList, maxCount: peak, correlationR: r };
  }, [pairs]);

  const lowerBoundaryPct = weightToPosteriorPct(lowerThreshold, priorMatch);
  const upperBoundaryPct = weightToPosteriorPct(upperThreshold, priorMatch);

  // D3 sequential blue density color scale
  const colorScale = useMemo(
    () =>
      d3
        .scaleSequential(d3.interpolateBlues)
        .domain([0, Math.max(1, maxCount)]),
    [maxCount]
  );

  const width = 580;
  const height = 290;
  const padL = 56;
  const padR = 20;
  const padT = 18;
  const padB = 42;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const cellW = plotW / 10;
  const cellH = plotH / 10;

  const yForPct = (pct: number) =>
    padT + plotH - (Math.min(100, Math.max(0, pct)) / 100) * plotH;

  const lowerY = yForPct(lowerBoundaryPct);
  const upperY = yForPct(upperBoundaryPct);

  const hoveredCell = cells.find(
    (c) => `${c.xi}-${c.yi}` === hoveredCellKey
  ) ?? null;

  if (pairs.length === 0) {
    return (
      <div className="p-5 bg-white border border-slate-200 rounded-lg">
        <h3 className="text-sm font-semibold text-slate-900">
          2D Density Heatmap: Similarity Score vs. Match Probability
        </h3>
        <div className="mt-3 h-[200px] flex items-center justify-center border border-dashed border-slate-200 rounded-md text-xs text-slate-500">
          No candidate pairs available to compute 2D density heatmap.
        </div>
      </div>
    );
  }

  return (
    <section
      aria-label="2D Density Heatmap of Record Similarity vs Match Probability"
      className="p-5 bg-white border border-slate-200 rounded-lg"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            2D Density Heatmap: Pair Similarity vs. Match Probability
          </h3>
          <p className="text-xs text-slate-500">
            Correlates mean attribute similarity against posterior P(M|γ) with decision boundaries mapped from T_λ and T_μ
          </p>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono tabular-nums text-slate-600">
          <span>Pearson r = {correlationR.toFixed(3)}</span>
          <span>Peak Cell = {maxCount} pairs</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-8">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-auto overflow-visible"
            role="img"
            aria-label="2D density heatmap correlating pair similarity scores with posterior match probability"
          >
            {/* Grid cells */}
            {cells.map((cell) => {
              const x = padL + cell.xi * cellW;
              const y = padT + (9 - cell.yi) * cellH;
              const key = `${cell.xi}-${cell.yi}`;
              const isHovered = hoveredCellKey === key;
              const fillColor =
                cell.total > 0 ? colorScale(cell.total) : '#F8FAFC';
              const isDark = cell.total > maxCount * 0.52;

              return (
                <g
                  key={key}
                  onMouseEnter={() => setHoveredCellKey(key)}
                  onMouseLeave={() => setHoveredCellKey(null)}
                  className="cursor-pointer"
                >
                  <rect
                    x={x}
                    y={y}
                    width={cellW}
                    height={cellH}
                    fill={fillColor}
                    stroke={isHovered ? '#0F172A' : '#E2E8F0'}
                    strokeWidth={isHovered ? 1.75 : 0.75}
                  />
                  {cell.total > 0 && (
                    <text
                      x={x + cellW / 2}
                      y={y + cellH / 2 + 3.5}
                      textAnchor="middle"
                      fill={isDark ? '#FFFFFF' : '#0F172A'}
                      fontSize="10"
                      fontWeight="600"
                      fontFamily="JetBrains Mono, monospace"
                    >
                      {cell.total}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Decision boundary lines mapped from T_lambda and T_mu */}
            <line
              x1={padL}
              y1={lowerY}
              x2={padL + plotW}
              y2={lowerY}
              stroke="#B45309"
              strokeWidth={1.75}
              strokeDasharray="5 3"
            />
            <text
              x={padL + plotW - 4}
              y={Math.min(padT + plotH - 4, lowerY - 4)}
              textAnchor="end"
              fill="#92400E"
              fontSize="10"
              fontWeight="600"
              fontFamily="JetBrains Mono, monospace"
            >
              T_λ ({lowerBoundaryPct.toFixed(1)}%)
            </text>

            <line
              x1={padL}
              y1={upperY}
              x2={padL + plotW}
              y2={upperY}
              stroke="#15803D"
              strokeWidth={1.75}
              strokeDasharray="5 3"
            />
            <text
              x={padL + plotW - 4}
              y={Math.max(padT + 10, upperY - 4)}
              textAnchor="end"
              fill="#166534"
              fontSize="10"
              fontWeight="600"
              fontFamily="JetBrains Mono, monospace"
            >
              T_μ ({upperBoundaryPct.toFixed(1)}%)
            </text>

            {/* X-axis ticks */}
            {[0, 20, 40, 60, 80, 100].map((val) => {
              const x = padL + (val / 100) * plotW;
              return (
                <text
                  key={`x-${val}`}
                  x={x}
                  y={padT + plotH + 16}
                  textAnchor="middle"
                  className="fill-slate-600 text-[10px] font-mono tabular-nums"
                >
                  {val}%
                </text>
              );
            })}
            <text
              x={padL + plotW / 2}
              y={height - 6}
              textAnchor="middle"
              className="fill-slate-500 text-[11px]"
            >
              Mean Pair Similarity Score (%)
            </text>

            {/* Y-axis ticks */}
            {[0, 20, 40, 60, 80, 100].map((val) => {
              const y = yForPct(val);
              return (
                <text
                  key={`y-${val}`}
                  x={padL - 8}
                  y={y + 3.5}
                  textAnchor="end"
                  className="fill-slate-600 text-[10px] font-mono tabular-nums"
                >
                  {val}%
                </text>
              );
            })}
            <text
              x={14}
              y={padT + plotH / 2}
              textAnchor="middle"
              transform={`rotate(-90, 14, ${padT + plotH / 2})`}
              className="fill-slate-500 text-[11px]"
            >
              Match Probability P(M|γ)
            </text>
          </svg>
        </div>

        {/* Decision Boundary & Cell Inspector Sidebar */}
        <div className="lg:col-span-4 space-y-4">
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-md space-y-3">
            <div className="text-xs font-semibold text-slate-800">
              Cell Density Inspector
            </div>
            {hoveredCell ? (
              <div className="space-y-2 text-xs font-mono tabular-nums">
                <div className="text-slate-700">
                  Similarity: [{hoveredCell.simStart}%, {hoveredCell.simEnd}%]
                </div>
                <div className="text-slate-700">
                  P(M|γ): [{hoveredCell.probStart}%, {hoveredCell.probEnd}%]
                </div>
                <div className="pt-2 border-t border-slate-200 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Total Pairs:</span>
                    <span className="font-semibold text-slate-900">
                      {hoveredCell.total}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-emerald-700">Match:</span>
                    <span>{hoveredCell.matchCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-amber-700">Possible Match:</span>
                    <span>{hoveredCell.clericalCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-red-700">Non-Match:</span>
                    <span>{hoveredCell.nonMatchCount}</span>
                  </div>
                  {hoveredCell.total > 0 && (
                    <div className="flex justify-between pt-1 border-t border-slate-200 text-slate-600">
                      <span>Mean Weight:</span>
                      <span>{hoveredCell.meanWeight.toFixed(2)}</span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500 leading-relaxed">
                Hover over any grid cell to inspect pair density, classification counts, and mean log-likelihood weight in that similarity/probability region.
              </p>
            )}
          </div>

          <div className="p-4 border border-slate-200 rounded-md space-y-2.5 text-xs">
            <div className="font-semibold text-slate-800">
              Mapped Decision Boundaries
            </div>
            <div className="flex items-center justify-between text-slate-600 font-mono tabular-nums">
              <span className="text-emerald-700 font-medium">Match (≥ T_μ)</span>
              <span>P(M|γ) ≥ {upperBoundaryPct.toFixed(1)}%</span>
            </div>
            <div className="flex items-center justify-between text-slate-600 font-mono tabular-nums">
              <span className="text-amber-700 font-medium">Possible Match Zone</span>
              <span>
                {lowerBoundaryPct.toFixed(1)}% – {upperBoundaryPct.toFixed(1)}%
              </span>
            </div>
            <div className="flex items-center justify-between text-slate-600 font-mono tabular-nums">
              <span className="text-red-700 font-medium">Non-Match (&lt; T_λ)</span>
              <span>P(M|γ) &lt; {lowerBoundaryPct.toFixed(1)}%</span>
            </div>

            <div className="pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
                <span>Pair Density</span>
                <span className="font-mono tabular-nums">0 → {maxCount}</span>
              </div>
              <div
                className="h-2 w-full rounded-xs border border-slate-200"
                style={{
                  background:
                    'linear-gradient(to right, #F8FAFC, #BFDBFE, #3B82F6, #1E3A8A)',
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
