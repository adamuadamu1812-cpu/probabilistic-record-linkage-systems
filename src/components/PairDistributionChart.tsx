import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import type { CandidatePair } from '../types/linkage';

interface PairDistributionChartProps {
  pairs: CandidatePair[];
}

interface DistributionDatum {
  key: 'match' | 'clerical' | 'non_match';
  label: string;
  count: number;
  pct: number;
  avgWeight: number | null;
  color: string;
}

export const PairDistributionChart: React.FC<PairDistributionChartProps> = ({
  pairs,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoveredKey, setHoveredKey] = useState<DistributionDatum['key'] | null>(null);

  const data: DistributionDatum[] = useMemo(() => {
    const groups: Record<
      DistributionDatum['key'],
      { count: number; weightSum: number }
    > = {
      match: { count: 0, weightSum: 0 },
      clerical: { count: 0, weightSum: 0 },
      non_match: { count: 0, weightSum: 0 },
    };

    for (const p of pairs) {
      groups[p.finalDecision].count += 1;
      groups[p.finalDecision].weightSum += p.totalWeight;
    }

    const total = Math.max(1, pairs.length);

    return [
      {
        key: 'match',
        label: 'Match',
        count: groups.match.count,
        pct: (groups.match.count / total) * 100,
        avgWeight:
          groups.match.count > 0
            ? groups.match.weightSum / groups.match.count
            : null,
        color: '#15803D',
      },
      {
        key: 'clerical',
        label: 'Possible Match',
        count: groups.clerical.count,
        pct: (groups.clerical.count / total) * 100,
        avgWeight:
          groups.clerical.count > 0
            ? groups.clerical.weightSum / groups.clerical.count
            : null,
        color: '#B45309',
      },
      {
        key: 'non_match',
        label: 'Non-Match',
        count: groups.non_match.count,
        pct: (groups.non_match.count / total) * 100,
        avgWeight:
          groups.non_match.count > 0
            ? groups.non_match.weightSum / groups.non_match.count
            : null,
        color: '#B91C1C',
      },
    ];
  }, [pairs]);

  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;

    const width = 560;
    const height = 220;
    const margin = { top: 28, right: 20, bottom: 34, left: 48 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();

    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const x = d3
      .scaleBand<string>()
      .domain(data.map((d) => d.label))
      .range([0, innerW])
      .padding(0.42);

    const maxCount = Math.max(1, d3.max(data, (d) => d.count) ?? 1);
    const y = d3.scaleLinear().domain([0, maxCount]).nice(4).range([innerH, 0]);

    // Horizontal gridlines
    const yTicks = y.ticks(4);
    g.append('g')
      .selectAll('line')
      .data(yTicks)
      .join('line')
      .attr('x1', 0)
      .attr('x2', innerW)
      .attr('y1', (d) => y(d))
      .attr('y2', (d) => y(d))
      .attr('stroke', '#E2E8F0')
      .attr('stroke-width', 1);

    // Y Axis
    const yAxis = d3
      .axisLeft(y)
      .ticks(4)
      .tickSize(0)
      .tickPadding(8)
      .tickFormat((d) => d3.format('d')(Number(d)));

    const yAxisG = g.append('g').call(yAxis);
    yAxisG.select('.domain').remove();
    yAxisG
      .selectAll('text')
      .attr('fill', '#64748B')
      .attr('font-size', '10px')
      .attr('font-family', 'JetBrains Mono, monospace');

    // X Axis
    const xAxis = d3.axisBottom(x).tickSize(0).tickPadding(10);
    const xAxisG = g
      .append('g')
      .attr('transform', `translate(0,${innerH})`)
      .call(xAxis);
    xAxisG.select('.domain').attr('stroke', '#94A3B8');
    xAxisG
      .selectAll('text')
      .attr('fill', '#0F172A')
      .attr('font-size', '11px')
      .attr('font-weight', '600')
      .attr('font-family', 'Public Sans, sans-serif');

    // Bars
    g.append('g')
      .selectAll('rect')
      .data(data)
      .join('rect')
      .attr('x', (d) => x(d.label) ?? 0)
      .attr('y', (d) => y(d.count))
      .attr('width', x.bandwidth())
      .attr('height', (d) => Math.max(0, innerH - y(d.count)))
      .attr('rx', 3)
      .attr('fill', (d) => d.color)
      .attr('opacity', (d) =>
        hoveredKey === null || hoveredKey === d.key ? 0.88 : 0.45
      )
      .style('cursor', 'pointer')
      .on('mouseenter', (_, d) => setHoveredKey(d.key))
      .on('mouseleave', () => setHoveredKey(null));

    // Value labels above bars
    g.append('g')
      .selectAll('text')
      .data(data)
      .join('text')
      .attr('x', (d) => (x(d.label) ?? 0) + x.bandwidth() / 2)
      .attr('y', (d) => y(d.count) - 7)
      .attr('text-anchor', 'middle')
      .attr('fill', '#0F172A')
      .attr('font-size', '11px')
      .attr('font-weight', '600')
      .attr('font-family', 'JetBrains Mono, monospace')
      .text((d) => `${d.count} (${d.pct.toFixed(0)}%)`);
  }, [data, hoveredKey]);

  const activeDatum = data.find((d) => d.key === hoveredKey) ?? null;

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-5 print:border-slate-300 print:break-inside-avoid">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            Candidate Pair Decision Distribution
          </h3>
          <p className="text-xs text-slate-500">
            Classification counts across all {pairs.length.toLocaleString()} candidate pairs generated after blocking
          </p>
        </div>

        <div className="text-xs font-mono tabular-nums text-slate-600">
          {activeDatum ? (
            <span>
              {activeDatum.label}: {activeDatum.count} pairs ({activeDatum.pct.toFixed(1)}%)
              {activeDatum.avgWeight !== null
                ? ` · Mean W = ${activeDatum.avgWeight.toFixed(2)}`
                : ''}
            </span>
          ) : (
            <span>
              Match {data[0].count} · Possible Match {data[1].count} · Non-Match {data[2].count}
            </span>
          )}
        </div>
      </div>

      {pairs.length === 0 ? (
        <div className="h-[200px] flex items-center justify-center border border-dashed border-slate-200 rounded-md text-xs text-slate-500">
          No candidate pairs available to chart.
        </div>
      ) : (
        <svg
          ref={svgRef}
          viewBox="0 0 560 220"
          className="w-full h-auto max-h-[240px]"
          role="img"
          aria-label="Bar chart comparing Match, Possible Match, and Non-Match pair counts"
        />
      )}
    </div>
  );
};
