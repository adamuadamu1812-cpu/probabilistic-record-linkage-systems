import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, CheckCheck, Clock, RotateCcw, Search, X, XCircle } from 'lucide-react';
import type { CandidatePair, LinkageDecision } from '../types/linkage';

interface ClericalReviewViewProps {
  pairs: CandidatePair[];
  dbAName: string;
  dbBName: string;
  onAdjudicate: (pairId: string, decision: LinkageDecision | null) => void;
  onBulkAdjudicate: (
    pairIds: string[],
    decision: LinkageDecision | null
  ) => void;
}

type FilterMode = 'clerical' | 'all' | 'match' | 'non_match';

const DECISION_LABEL: Record<LinkageDecision, { text: string; colorClass: string }> = {
  match: { text: 'Match', colorClass: 'text-emerald-700' },
  clerical: { text: 'Possible Match', colorClass: 'text-amber-700' },
  non_match: { text: 'Non-Match', colorClass: 'text-red-700' },
};

export const ClericalReviewView: React.FC<ClericalReviewViewProps> = ({
  pairs,
  dbAName,
  dbBName,
  onAdjudicate,
  onBulkAdjudicate,
}) => {
  const [filterMode, setFilterMode] = useState<FilterMode>('clerical');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPairId, setSelectedPairId] = useState<string | null>(null);

  const [acceptCutoffPct, setAcceptCutoffPct] = useState<number>(80);
  const [rejectCutoffPct, setRejectCutoffPct] = useState<number>(25);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());

  const counts = useMemo(() => {
    let clerical = 0;
    let match = 0;
    let non_match = 0;
    for (const p of pairs) {
      if (p.finalDecision === 'clerical') clerical++;
      else if (p.finalDecision === 'match') match++;
      else non_match++;
    }
    return { clerical, match, non_match, all: pairs.length };
  }, [pairs]);

  // Gray-zone workload progress (all pairs originally routed to clerical review by the model,
  // plus any pairs still remaining in clerical review)
  const reviewProgress = useMemo(() => {
    const grayZonePairs = pairs.filter(
      (p) => p.modelDecision === 'clerical' || p.finalDecision === 'clerical'
    );
    const total = grayZonePairs.length;
    const confirmed = grayZonePairs.filter(
      (p) => p.humanDecision === 'match'
    ).length;
    const rejected = grayZonePairs.filter(
      (p) => p.humanDecision === 'non_match'
    ).length;
    const remaining = grayZonePairs.filter(
      (p) => p.finalDecision === 'clerical'
    ).length;
    const processed = Math.max(0, total - remaining);
    const pct = total > 0 ? (processed / total) * 100 : 100;

    return {
      grayZonePairs,
      total,
      confirmed,
      rejected,
      remaining,
      processed,
      pct,
    };
  }, [pairs]);

  const filteredPairs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return pairs.filter((p) => {
      if (filterMode !== 'all' && p.finalDecision !== filterMode) return false;
      if (!q) return true;
      const inA =
        p.recordA.id.toLowerCase().includes(q) ||
        Object.values(p.recordA.fields).some((v) => v.toLowerCase().includes(q));
      const inB =
        p.recordB.id.toLowerCase().includes(q) ||
        Object.values(p.recordB.fields).some((v) => v.toLowerCase().includes(q));
      return inA || inB;
    });
  }, [pairs, filterMode, searchQuery]);

  // High-confidence bulk candidates from remaining clerical pairs
  const bulkCandidates = useMemo(() => {
    const pendingClerical = pairs.filter((p) => p.finalDecision === 'clerical');
    const acceptIds = pendingClerical
      .filter((p) => p.posteriorProb * 100 >= acceptCutoffPct)
      .map((p) => p.pairId);
    const rejectIds = pendingClerical
      .filter((p) => p.posteriorProb * 100 <= rejectCutoffPct)
      .map((p) => p.pairId);
    return { acceptIds, rejectIds };
  }, [pairs, acceptCutoffPct, rejectCutoffPct]);

  // Keep selectedPairId valid when filters or data change
  useEffect(() => {
    if (filteredPairs.length === 0) {
      setSelectedPairId(null);
      return;
    }
    if (!selectedPairId || !filteredPairs.some((p) => p.pairId === selectedPairId)) {
      setSelectedPairId(filteredPairs[0].pairId);
    }
  }, [filteredPairs, selectedPairId]);

  // Drop checked IDs that no longer exist in pairs
  useEffect(() => {
    setCheckedIds((prev) => {
      if (prev.size === 0) return prev;
      const validSet = new Set(pairs.map((p) => p.pairId));
      const next = new Set<string>();
      for (const id of prev) {
        if (validSet.has(id)) next.add(id);
      }
      return next.size === prev.size ? prev : next;
    });
  }, [pairs]);

  const activeIndex = filteredPairs.findIndex((p) => p.pairId === selectedPairId);
  const activePair = activeIndex >= 0 ? filteredPairs[activeIndex] : null;

  const advanceSelection = useCallback(
    (nextIdx: number) => {
      if (filteredPairs.length === 0) return;
      const bounded = Math.max(0, Math.min(filteredPairs.length - 1, nextIdx));
      setSelectedPairId(filteredPairs[bounded].pairId);
    },
    [filteredPairs]
  );

  const handleDecision = useCallback(
    (decision: LinkageDecision | null) => {
      if (!activePair) return;
      const nextCandidate =
        filteredPairs[activeIndex + 1]?.pairId ??
        filteredPairs[activeIndex - 1]?.pairId ??
        null;
      onAdjudicate(activePair.pairId, decision);
      if (
        decision !== null &&
        filterMode !== 'all' &&
        decision !== filterMode &&
        nextCandidate
      ) {
        setSelectedPairId(nextCandidate);
      }
    },
    [activePair, activeIndex, filteredPairs, filterMode, onAdjudicate]
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      const key = e.key.toLowerCase();
      if (key === 'm') {
        if (!activePair) return;
        e.preventDefault();
        handleDecision('match');
      } else if (key === 'n') {
        if (!activePair) return;
        e.preventDefault();
        handleDecision('non_match');
      } else if (key === 'd') {
        if (!activePair) return;
        e.preventDefault();
        handleDecision('clerical');
      } else if (e.key === 'ArrowDown') {
        if (filteredPairs.length === 0) return;
        e.preventDefault();
        advanceSelection(activeIndex + 1);
      } else if (e.key === 'ArrowUp') {
        if (filteredPairs.length === 0) return;
        e.preventDefault();
        advanceSelection(activeIndex - 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activePair, activeIndex, advanceSelection, filteredPairs.length, handleDecision]);

  const toggleChecked = (pairId: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(pairId)) next.delete(pairId);
      else next.add(pairId);
      return next;
    });
  };

  const manualSelectionIds = Array.from(checkedIds);
  const usingManualSelection = manualSelectionIds.length > 0;
  const targetAcceptIds = usingManualSelection
    ? manualSelectionIds
    : bulkCandidates.acceptIds;
  const targetRejectIds = usingManualSelection
    ? manualSelectionIds
    : bulkCandidates.rejectIds;

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">
            04. Possible Match Review &amp; Pair Adjudication
          </h2>
          <p className="mt-1 text-sm text-slate-600 max-w-3xl">
            Inspect candidate pairs classified as Possible Match in the [T_λ, T_μ) band or audit automated Match and Non-Match links side-by-side with attribute log-odds contributions.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md">
            {(
              [
                ['clerical', `Possible Match (${counts.clerical})`],
                ['match', `Match (${counts.match})`],
                ['non_match', `Non-Match (${counts.non_match})`],
                ['all', `All (${counts.all})`],
              ] as Array<[FilterMode, string]>
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setFilterMode(mode)}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                  filterMode === mode
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search pair or name..."
              className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-md bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600"
            />
          </div>
        </div>
      </div>

      {/* Progress Mini-Map & High-Confidence Bulk Adjudication Bar */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Queue Progress & Mini-Map */}
        <section
          aria-label="Clerical Review Progress Mini-Map"
          className="lg:col-span-6 p-4 bg-white border border-slate-200 rounded-lg space-y-3"
        >
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-slate-900">
              Possible Match Queue Progress
            </span>
            <span className="font-mono tabular-nums text-slate-700">
              {reviewProgress.remaining} left to process · {reviewProgress.processed} /{' '}
              {reviewProgress.total} reviewed ({reviewProgress.pct.toFixed(0)}%)
            </span>
          </div>

          {/* Progress Bar */}
          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-700 transition-all duration-150"
              style={{ width: `${reviewProgress.pct}%` }}
            />
          </div>

          {/* Interactive Queue Mini-Map */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-slate-500">
              <span>Queue Mini-Map (click cell to jump)</span>
              <span className="font-mono tabular-nums">
                Confirmed {reviewProgress.confirmed} · Rejected {reviewProgress.rejected} · Pending{' '}
                {reviewProgress.remaining}
              </span>
            </div>

            {reviewProgress.grayZonePairs.length === 0 ? (
              <div className="text-xs text-slate-400 py-1">
                No Possible Match pairs in the current threshold band.
              </div>
            ) : (
              <div
                className="flex flex-wrap gap-1 pt-0.5"
                role="navigation"
                aria-label="Clerical pair mini-map"
              >
                {reviewProgress.grayZonePairs.slice(0, 96).map((p) => {
                  const isCurrent = p.pairId === activePair?.pairId;
                  const cellColor =
                    p.finalDecision === 'match'
                      ? 'bg-emerald-600'
                      : p.finalDecision === 'non_match'
                        ? 'bg-red-600'
                        : 'bg-amber-400';

                  return (
                    <button
                      key={p.pairId}
                      type="button"
                      onClick={() => {
                        if (filterMode !== 'all' && p.finalDecision !== filterMode) {
                          setFilterMode('all');
                        }
                        setSelectedPairId(p.pairId);
                      }}
                      title={`${p.recordA.id} ↔ ${p.recordB.id} · P(M|γ)=${(
                        p.posteriorProb * 100
                      ).toFixed(1)}% (${DECISION_LABEL[p.finalDecision].text})`}
                      aria-label={`Jump to ${p.recordA.id} and ${p.recordB.id}`}
                      className={`w-3.5 h-3.5 rounded-[2px] transition-transform ${cellColor} ${
                        isCurrent
                          ? 'ring-2 ring-slate-900 ring-offset-1 scale-110'
                          : 'opacity-85 hover:opacity-100'
                      }`}
                    />
                  );
                })}
                {reviewProgress.grayZonePairs.length > 96 && (
                  <span className="text-[11px] font-mono text-slate-400 ml-1 self-center">
                    +{reviewProgress.grayZonePairs.length - 96}
                  </span>
                )}
              </div>
            )}
          </div>
        </section>

        {/* High-Confidence Bulk Accept / Bulk Reject Tool */}
        <section
          aria-label="Bulk Adjudication Tool"
          className="lg:col-span-6 p-4 bg-white border border-slate-200 rounded-lg flex flex-col justify-between gap-3"
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-semibold text-slate-900">
                {usingManualSelection
                  ? `Bulk Adjudication (${manualSelectionIds.length} manually selected)`
                  : 'High-Confidence Bulk Adjudication'}
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {usingManualSelection
                  ? 'Apply decision to checked queue items or clear checkboxes to use posterior cutoffs.'
                  : 'Batch-resolve pending Possible Match pairs meeting high-confidence posterior thresholds.'}
              </p>
            </div>

            {usingManualSelection && (
              <button
                type="button"
                onClick={() => setCheckedIds(new Set())}
                className="text-xs font-medium text-slate-600 hover:text-slate-900 underline whitespace-nowrap shrink-0"
              >
                Clear Selection
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            {/* Bulk Accept Control */}
            <div className="flex items-center justify-between gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-md">
              <div className="min-w-0">
                <label
                  htmlFor="bulk-accept-cutoff"
                  className="block text-[11px] text-slate-600"
                >
                  Accept ≥ P(M|γ)
                </label>
                <select
                  id="bulk-accept-cutoff"
                  value={acceptCutoffPct}
                  disabled={usingManualSelection}
                  onChange={(e) => setAcceptCutoffPct(Number(e.target.value))}
                  className="mt-0.5 text-xs font-mono tabular-nums bg-white border border-slate-300 rounded px-1.5 py-1 text-slate-900 disabled:opacity-50"
                >
                  {[65, 70, 75, 80, 85, 90, 95].map((pct) => (
                    <option key={pct} value={pct}>
                      {pct}%
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                disabled={targetAcceptIds.length === 0}
                onClick={() => {
                  onBulkAdjudicate(targetAcceptIds, 'match');
                  if (usingManualSelection) setCheckedIds(new Set());
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-emerald-700 rounded-md hover:bg-emerald-800 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Bulk Accept ({targetAcceptIds.length})</span>
              </button>
            </div>

            {/* Bulk Reject Control */}
            <div className="flex items-center justify-between gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-md">
              <div className="min-w-0">
                <label
                  htmlFor="bulk-reject-cutoff"
                  className="block text-[11px] text-slate-600"
                >
                  Reject ≤ P(M|γ)
                </label>
                <select
                  id="bulk-reject-cutoff"
                  value={rejectCutoffPct}
                  disabled={usingManualSelection}
                  onChange={(e) => setRejectCutoffPct(Number(e.target.value))}
                  className="mt-0.5 text-xs font-mono tabular-nums bg-white border border-slate-300 rounded px-1.5 py-1 text-slate-900 disabled:opacity-50"
                >
                  {[5, 10, 15, 20, 25, 30, 40].map((pct) => (
                    <option key={pct} value={pct}>
                      {pct}%
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                disabled={targetRejectIds.length === 0}
                onClick={() => {
                  onBulkAdjudicate(targetRejectIds, 'non_match');
                  if (usingManualSelection) setCheckedIds(new Set());
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-700 bg-white border border-red-300 rounded-md hover:bg-red-50 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
              >
                <XCircle className="w-3.5 h-3.5" />
                <span>Bulk Reject ({targetRejectIds.length})</span>
              </button>
            </div>
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Queue */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between text-xs font-semibold text-slate-600">
            <span>Candidate Queue</span>
            <span className="font-mono tabular-nums">{filteredPairs.length} pairs</span>
          </div>

          <div className="divide-y divide-slate-100 max-h-[540px] overflow-y-auto">
            {filteredPairs.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                {filterMode === 'clerical'
                  ? 'No candidate pairs currently remain in the Possible Match band. Switch filter to inspect Match or All Candidates.'
                  : 'No candidate pairs match the current filter.'}
              </div>
            ) : (
              filteredPairs.slice(0, 120).map((pair) => {
                const isSelected = pair.pairId === activePair?.pairId;
                const isChecked = checkedIds.has(pair.pairId);
                const badge = DECISION_LABEL[pair.finalDecision];
                const summaryA = Object.values(pair.recordA.fields).slice(0, 2).join(' ');
                const summaryB = Object.values(pair.recordB.fields).slice(0, 2).join(' ');

                return (
                  <div
                    key={pair.pairId}
                    className={`flex items-start gap-2.5 px-3.5 py-3 transition-colors ${
                      isSelected ? 'bg-blue-50/70' : 'hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleChecked(pair.pairId)}
                      aria-label={`Select pair ${pair.recordA.id} and ${pair.recordB.id}`}
                      className="mt-1 w-3.5 h-3.5 accent-blue-700 cursor-pointer shrink-0"
                    />

                    <button
                      type="button"
                      onClick={() => setSelectedPairId(pair.pairId)}
                      className="flex-1 min-w-0 text-left"
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-mono font-medium text-slate-800 tabular-nums truncate">
                          {pair.recordA.id} ↔ {pair.recordB.id}
                        </span>
                        <span className={`font-medium shrink-0 ${badge.colorClass}`}>
                          {badge.text}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-slate-600 truncate">
                        {summaryA} / {summaryB}
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-500">
                        <span>W = {pair.totalWeight.toFixed(2)}</span>
                        <span>P(M|γ) = {(pair.posteriorProb * 100).toFixed(1)}%</span>
                      </div>
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Side-by-Side Comparison Inspector */}
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-lg overflow-hidden">
          {!activePair ? (
            <div className="p-12 text-center text-sm text-slate-500">
              Select a candidate pair from the queue to inspect attribute comparisons and composite weights.
            </div>
          ) : (
            <div>
              <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="font-mono tabular-nums">
                      {activePair.recordA.id} ↔ {activePair.recordB.id}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>Blocking: {activePair.matchedBlockPasses.join(', ')}</span>
                    {activePair.humanDecision && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-blue-700 font-medium">
                          Human Adjudicated
                        </span>
                      </>
                    )}
                  </div>
                  <div className="mt-1 flex items-baseline gap-4">
                    <span className="text-lg font-semibold text-slate-900 font-mono tabular-nums">
                      Composite Weight: {activePair.totalWeight.toFixed(2)}
                    </span>
                    <span className="text-sm text-slate-600 font-mono tabular-nums">
                      Posterior P(M|γ): {(activePair.posteriorProb * 100).toFixed(2)}%
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => advanceSelection(activeIndex - 1)}
                    disabled={activeIndex <= 0}
                    className="px-2.5 py-1.5 text-xs font-medium text-slate-700 border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-40"
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    onClick={() => advanceSelection(activeIndex + 1)}
                    disabled={activeIndex >= filteredPairs.length - 1}
                    className="px-2.5 py-1.5 text-xs font-medium text-slate-700 border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
                    <tr>
                      <th className="py-2.5 px-4">Attribute</th>
                      <th className="py-2.5 px-4">{dbAName} (A)</th>
                      <th className="py-2.5 px-4">{dbBName} (B)</th>
                      <th className="py-2.5 px-4 text-right">Similarity</th>
                      <th className="py-2.5 px-4">Level</th>
                      <th className="py-2.5 px-4 text-right">Weight w_i</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {activePair.comparisons.map((comp) => {
                      const levelText =
                        comp.level === 'agree'
                          ? 'Agree'
                          : comp.level === 'partial'
                            ? 'Partial'
                            : comp.level === 'disagree'
                              ? 'Disagree'
                              : 'Missing';
                      const levelColor =
                        comp.level === 'agree'
                          ? 'text-emerald-700'
                          : comp.level === 'partial'
                            ? 'text-amber-700'
                            : comp.level === 'disagree'
                              ? 'text-red-700'
                              : 'text-slate-400';

                      const barPct = Math.min(100, Math.abs(comp.weight) * 10);

                      return (
                        <tr key={comp.field} className="hover:bg-slate-50/70">
                          <td className="py-2.5 px-4 font-medium text-slate-900 whitespace-nowrap">
                            {comp.label}
                          </td>
                          <td className="py-2.5 px-4 font-mono text-slate-800">
                            {comp.valueA || <span className="text-slate-400 italic">missing</span>}
                          </td>
                          <td className="py-2.5 px-4 font-mono text-slate-800">
                            {comp.valueB || <span className="text-slate-400 italic">missing</span>}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700">
                            {comp.level === 'missing'
                              ? '—'
                              : `${(comp.similarity * 100).toFixed(0)}%`}
                          </td>
                          <td className={`py-2.5 px-4 font-medium ${levelColor}`}>
                            {levelText}
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-14 h-1.5 bg-slate-100 rounded-full overflow-hidden hidden sm:block">
                                <div
                                  className={`h-full ${
                                    comp.weight >= 0 ? 'bg-emerald-600' : 'bg-red-600'
                                  }`}
                                  style={{ width: `${barPct}%` }}
                                />
                              </div>
                              <span
                                className={`font-mono tabular-nums font-semibold w-12 text-right ${
                                  comp.weight > 0
                                    ? 'text-emerald-700'
                                    : comp.weight < 0
                                      ? 'text-red-700'
                                      : 'text-slate-400'
                                }`}
                              >
                                {comp.weight > 0 ? `+${comp.weight.toFixed(2)}` : comp.weight.toFixed(2)}
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Adjudication Action Bar */}
              <div className="px-5 py-4 bg-slate-50 border-t border-slate-200 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs text-slate-600">
                    Final Classification:{' '}
                    <span
                      className={`font-semibold ${
                        DECISION_LABEL[activePair.finalDecision].colorClass
                      }`}
                    >
                      {DECISION_LABEL[activePair.finalDecision].text}
                    </span>
                    {activePair.recordA.groundTruthId && activePair.recordB.groundTruthId && (
                      <span className="ml-3 text-slate-500">
                        (Ground Truth:{' '}
                        {activePair.recordA.groundTruthId === activePair.recordB.groundTruthId
                          ? 'True Same Entity'
                          : 'Distinct Entities'}
                        )
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {activePair.humanDecision !== null && (
                      <button
                        type="button"
                        onClick={() => handleDecision(null)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Revert to Model</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleDecision('non_match')}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-red-700 bg-white border border-red-300 rounded-md hover:bg-red-50 transition-colors whitespace-nowrap shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Non-Match (N)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDecision('clerical')}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-amber-800 bg-white border border-amber-300 rounded-md hover:bg-amber-50 transition-colors whitespace-nowrap shrink-0"
                    >
                      <Clock className="w-3.5 h-3.5" />
                      <span>Possible Match (D)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDecision('match')}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-emerald-700 rounded-md hover:bg-emerald-800 transition-colors whitespace-nowrap shrink-0"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Match (M)</span>
                    </button>
                  </div>
                </div>

                <div className="text-[11px] text-slate-500">
                  Shortcuts: <span className="font-mono text-slate-700">M</span> Match ·{' '}
                  <span className="font-mono text-slate-700">N</span> Non-Match ·{' '}
                  <span className="font-mono text-slate-700">D</span> Possible Match ·{' '}
                  <span className="font-mono text-slate-700">↑/↓</span> Prev/Next Pair ·{' '}
                  <span className="font-mono text-slate-700">←/→</span> Switch Stage
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
