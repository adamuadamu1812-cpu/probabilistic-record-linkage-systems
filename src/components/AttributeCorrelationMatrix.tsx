import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import type { CandidatePair, FieldSchema } from '../types/linkage';

interface AttributeCorrelationMatrixProps {
  pairs: CandidatePair[];
  fields: FieldSchema[];
}

type MatrixBasis = 'weight' | 'similarity';

interface MatrixAxisItem {
  key: string;
  label: string;
  shortLabel: string;
  isTotal: boolean;
}

interface CorrelationCell {
  rowIdx: number;
  colIdx: number;
  rowKey: string;
  colKey: string;
  rowLabel: string;
  colLabel: string;
  r: number | null;
  sampleSize: number;
}

function pearsonCorrelation(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 3) return null;

  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i++) {
    sumX += xs[i];
    sumY += ys[i];
  }
  const meanX = sumX / n;
  const meanY = sumY / n;

  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }

  const denom = Math.sqrt(denX * denY);
  if (denom < 1e-9) return null;
  return Math.max(-1, Math.min(1, num / denom));
}

export const AttributeCorrelationMatrix: React.FC<
  AttributeCorrelationMatrixProps
> = ({ pairs, fields }) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [basis, setBasis] = useState<MatrixBasis>('weight');
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const enabledFields = useMemo(() => fields.filter((f) => f.enabled), [fields]);

  const { axisItems, cells, topDrivers, redundantPairs } = useMemo(() => {
    const items: MatrixAxisItem[] = [
      ...enabledFields.map((f) => ({
        key: f.key,
        label: f.label,
        shortLabel:
          f.label.length > 11 ? `${f.label.slice(0, 10).trim()}…` : f.label,
        isTotal: false,
      })),
      {
        key: '__total_score__',
        label: 'Match Score W(γ)',
        shortLabel: 'Score W(γ)',
        isTotal: true,
      },
    ];

    if (pairs.length < 3 || enabledFields.length === 0) {
      return {
        axisItems: items,
        cells: [] as CorrelationCell[],
        topDrivers: [] as Array<{ label: string; r: number }>,
        redundantPairs: [] as Array<{ a: string; b: string; r: number }>,
      };
    }

    // Pre-extract value vectors per pair
    const pairMaps = pairs.map((p) => {
      const m = new Map<string, number | null>();
      for (const comp of p.comparisons) {
        if (comp.level === 'missing') {
          m.set(comp.field, basis === 'weight' ? 0 : null);
        } else {
          m.set(comp.field, basis === 'weight' ? comp.weight : comp.similarity);
        }
      }
      m.set('__total_score__', p.totalWeight);
      return m;
    });

    const computedCells: CorrelationCell[] = [];
    for (let rIdx = 0; rIdx < items.length; rIdx++) {
      for (let cIdx = 0; cIdx < items.length; cIdx++) {
        const rowItem = items[rIdx];
        const colItem = items[cIdx];

        const xs: number[] = [];
        const ys: number[] = [];
        for (const pm of pairMaps) {
          const vx = pm.get(rowItem.key);
          const vy = pm.get(colItem.key);
          if (vx === null || vx === undefined || vy === null || vy === undefined) {
            continue;
          }
          xs.push(vx);
          ys.push(vy);
        }

        const r =
          rIdx === cIdx
            ? xs.length >= 1
              ? 1
              : null
            : pearsonCorrelation(xs, ys);

        computedCells.push({
          rowIdx: rIdx,
          colIdx: cIdx,
          rowKey: rowItem.key,
          colKey: colItem.key,
          rowLabel: rowItem.label,
          colLabel: colItem.label,
          r,
          sampleSize: xs.length,
        });
      }
    }

    // Rank attributes by correlation with total composite score W(gamma)
    const drivers = computedCells
      .filter(
        (c) =>
          c.colKey === '__total_score__' &&
          c.rowKey !== '__total_score__' &&
          c.r !== null
      )
      .map((c) => ({ label: c.rowLabel, r: c.r as number }))
      .sort((a, b) => Math.abs(b.r) - Math.abs(a.r));

    // Find top inter-attribute pairs (upper triangle, excluding total score)
    const redundancies = computedCells
      .filter(
        (c) =>
          c.rowIdx < c.colIdx &&
          c.rowKey !== '__total_score__' &&
          c.colKey !== '__total_score__' &&
          c.r !== null
      )
      .map((c) => ({
        a: c.rowLabel,
        b: c.colLabel,
        r: c.r as number,
      }))
      .sort((x, y) => Math.abs(y.r) - Math.abs(x.r));

    return {
      axisItems: items,
      cells: computedCells,
      topDrivers: drivers,
      redundantPairs: redundancies,
    };
  }, [enabledFields, pairs, basis]);

  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl || cells.length === 0) return;

    const n = axisItems.length;
    const cellSize = 46;
    const margin = { top: 82, right: 20, bottom: 18, left: 108 };
    const gridSize = n * cellSize;
    const width = margin.left + gridSize + margin.right;
    const height = margin.top + gridSize + margin.bottom;

    const svg = d3.select(svgEl);
    svg.attr('viewBox', `0 0 ${width} ${height}`);
    svg.selectAll('*').remove();

    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const labels = axisItems.map((it) => it.shortLabel);
    const band = d3
      .scaleBand<string>()
      .domain(labels)
      .range([0, gridSize])
      .padding(0.06);

    const colorScale = d3
      .scaleLinear<string>()
      .domain([-1, 0, 1])
      .range(['#B91C1C', '#F8FAFC', '#1D4ED8'])
      .clamp(true);

    // Top rotated column labels
    g.append('g')
      .selectAll('text')
      .data(axisItems)
      .join('text')
      .attr('x', (d) => (band(d.shortLabel) ?? 0) + band.bandwidth() / 2)
      .attr('y', -10)
      .attr(
        'transform',
        (d) =>
          `rotate(-35, ${(band(d.shortLabel) ?? 0) + band.bandwidth() / 2}, -10)`
      )
      .attr('text-anchor', 'start')
      .attr('fill', (d) => (d.isTotal ? '#1D4ED8' : '#334155'))
      .attr('font-size', '10.5px')
      .attr('font-weight', (d) => (d.isTotal ? '700' : '600'))
      .attr('font-family', 'Public Sans, sans-serif')
      .text((d) => d.shortLabel);

    // Left row labels
    g.append('g')
      .selectAll('text')
      .data(axisItems)
      .join('text')
      .attr('x', -10)
      .attr('y', (d) => (band(d.shortLabel) ?? 0) + band.bandwidth() / 2 + 3.5)
      .attr('text-anchor', 'end')
      .attr('fill', (d) => (d.isTotal ? '#1D4ED8' : '#334155'))
      .attr('font-size', '10.5px')
      .attr('font-weight', (d) => (d.isTotal ? '700' : '600'))
      .attr('font-family', 'Public Sans, sans-serif')
      .text((d) => d.shortLabel);

    // Matrix cells
    const cellGroups = g
      .append('g')
      .selectAll('g')
      .data(cells)
      .join('g')
      .style('cursor', 'pointer')
      .on('mouseenter', (_, d) => setHoveredKey(`${d.rowIdx}-${d.colIdx}`))
      .on('mouseleave', () => setHoveredKey(null));

    cellGroups
      .append('rect')
      .attr('x', (d) => band(axisItems[d.colIdx].shortLabel) ?? 0)
      .attr('y', (d) => band(axisItems[d.rowIdx].shortLabel) ?? 0)
      .attr('width', band.bandwidth())
      .attr('height', band.bandwidth())
      .attr('rx', 3)
      .attr('fill', (d) => (d.r === null ? '#F1F5F9' : colorScale(d.r)))
      .attr('stroke', (d) => {
        const isScoreBorder =
          d.rowKey === '__total_score__' || d.colKey === '__total_score__';
        if (hoveredKey === `${d.rowIdx}-${d.colIdx}`) return '#0F172A';
        return isScoreBorder ? '#93C5FD' : '#E2E8F0';
      })
      .attr('stroke-width', (d) =>
        hoveredKey === `${d.rowIdx}-${d.colIdx}` ? 1.75 : 1
      );

    cellGroups
      .append('text')
      .attr(
        'x',
        (d) =>
          (band(axisItems[d.colIdx].shortLabel) ?? 0) + band.bandwidth() / 2
      )
      .attr(
        'y',
        (d) =>
          (band(axisItems[d.rowIdx].shortLabel) ?? 0) +
          band.bandwidth() / 2 +
          3.5
      )
      .attr('text-anchor', 'middle')
      .attr('fill', (d) => {
        if (d.r === null) return '#94A3B8';
        return Math.abs(d.r) >= 0.52 ? '#FFFFFF' : '#0F172A';
      })
      .attr('font-size', '10px')
      .attr('font-weight', '600')
      .attr('font-family', 'JetBrains Mono, monospace')
      .text((d) => (d.r === null ? '—' : d.r.toFixed(2)));
  }, [axisItems, cells, hoveredKey]);

  const hoveredCell =
    cells.find((c) => `${c.rowIdx}-${c.colIdx}` === hoveredKey) ?? null;

  const describeCorrelation = (cell: CorrelationCell) => {
    if (cell.r === null) return 'Insufficient variance or sample size (< 3 pairs).';
    if (cell.rowKey === cell.colKey) return 'Identity diagonal (r = 1.00).';
    const absR = Math.abs(cell.r);
    const involvesScore =
      cell.rowKey === '__total_score__' || cell.colKey === '__total_score__';
    if (involvesScore) {
      if (absR >= 0.65) return 'Highly discriminative driver of overall match score.';
      if (absR >= 0.35) return 'Moderate contributor to composite match score.';
      return 'Weak direct linear impact on composite match score.';
    }
    if (absR >= 0.65)
      return 'High inter-attribute correlation — potential conditional redundancy.';
    if (absR >= 0.35) return 'Moderate co-variation across candidate pairs.';
    return 'Near-independent attributes (supports Fellegi-Sunter independence).';
  };

  return (
    <section
      aria-label="D3 Attribute Correlation Matrix"
      className="p-5 bg-white border border-slate-200 rounded-lg"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            Attribute &amp; Score Correlation Matrix
          </h3>
          <p className="text-xs text-slate-500">
            D3 Pearson correlation matrix showing inter-attribute redundancy and each field&apos;s influence on overall Match Score W(γ)
          </p>
        </div>

        <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-md w-fit shrink-0">
          <button
            type="button"
            onClick={() => setBasis('weight')}
            className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
              basis === 'weight'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Weight Contribution (w_i)
          </button>
          <button
            type="button"
            onClick={() => setBasis('similarity')}
            className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
              basis === 'similarity'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Raw Similarity (s_i)
          </button>
        </div>
      </div>

      {pairs.length < 3 || enabledFields.length === 0 ? (
        <div className="h-[220px] flex items-center justify-center border border-dashed border-slate-200 rounded-md text-xs text-slate-500">
          At least 3 candidate pairs and 1 enabled attribute are required to compute correlations.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-8 overflow-x-auto">
            <svg
              ref={svgRef}
              className="w-full max-w-[560px] h-auto"
              role="img"
              aria-label="D3 correlation matrix heatmap between attributes and composite matching score"
            />
            <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-500 max-w-[560px]">
              <span className="font-mono tabular-nums">-1.00</span>
              <div
                className="flex-1 h-2 rounded-xs border border-slate-200"
                style={{
                  background:
                    'linear-gradient(to right, #B91C1C, #F8FAFC, #1D4ED8)',
                }}
              />
              <span className="font-mono tabular-nums">+1.00</span>
            </div>
          </div>

          <div className="lg:col-span-4 space-y-4">
            {/* Hover Cell Inspector */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-md space-y-2">
              <div className="text-xs font-semibold text-slate-800">
                Cell Correlation Inspector
              </div>
              {hoveredCell ? (
                <div className="space-y-1.5 text-xs">
                  <div className="font-medium text-slate-900">
                    {hoveredCell.rowLabel} × {hoveredCell.colLabel}
                  </div>
                  <div className="flex justify-between font-mono tabular-nums text-slate-700">
                    <span>Pearson r:</span>
                    <span className="font-semibold text-slate-900">
                      {hoveredCell.r === null ? 'N/A' : hoveredCell.r.toFixed(3)}
                    </span>
                  </div>
                  <div className="flex justify-between font-mono tabular-nums text-slate-600">
                    <span>Pairs (n):</span>
                    <span>{hoveredCell.sampleSize}</span>
                  </div>
                  <p className="pt-1 border-t border-slate-200 text-[11px] text-slate-600 leading-relaxed">
                    {describeCorrelation(hoveredCell)}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-slate-500 leading-relaxed">
                  Hover over any matrix cell to inspect correlation r and independence diagnostics.
                </p>
              )}
            </div>

            {/* Discriminative Drivers */}
            <div className="p-4 border border-slate-200 rounded-md space-y-2 text-xs">
              <div className="font-semibold text-slate-800">
                Top Score Drivers |r(attr, W)|
              </div>
              {topDrivers.length === 0 ? (
                <div className="text-slate-500">No variance detected across fields.</div>
              ) : (
                <div className="space-y-1.5">
                  {topDrivers.slice(0, 4).map((d) => (
                    <div
                      key={d.label}
                      className="flex items-center justify-between gap-2 font-mono tabular-nums"
                    >
                      <span className="font-sans text-slate-700 truncate">
                        {d.label}
                      </span>
                      <span className="font-semibold text-blue-700 shrink-0">
                        {d.r >= 0 ? `+${d.r.toFixed(2)}` : d.r.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Redundant Pairs */}
            <div className="p-4 border border-slate-200 rounded-md space-y-2 text-xs">
              <div className="font-semibold text-slate-800">
                Strongest Inter-Field Pairs
              </div>
              {redundantPairs.length === 0 ? (
                <div className="text-slate-500">Enable ≥ 2 varying fields to check redundancy.</div>
              ) : (
                <div className="space-y-1.5">
                  {redundantPairs.slice(0, 3).map((rp) => (
                    <div
                      key={`${rp.a}-${rp.b}`}
                      className="flex items-center justify-between gap-2 font-mono tabular-nums"
                    >
                      <span className="font-sans text-slate-700 truncate">
                        {rp.a} ↔ {rp.b}
                      </span>
                      <span
                        className={`font-semibold shrink-0 ${
                          Math.abs(rp.r) >= 0.6
                            ? 'text-amber-700'
                            : 'text-slate-700'
                        }`}
                      >
                        {rp.r >= 0 ? `+${rp.r.toFixed(2)}` : rp.r.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
