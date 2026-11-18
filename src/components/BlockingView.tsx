import React, { useEffect, useMemo, useState } from 'react';
import { CopyCheck, Layers, Plus, Search, Trash2 } from 'lucide-react';
import type {
  BlockingRule,
  BlockingTransform,
  CandidatePair,
  DatabaseRecord,
  EvaluationMetrics,
  FieldSchema,
  LearnedFieldParams,
  LinkageDecision,
} from '../types/linkage';
import type { BlockingOutput } from '../engine/fellegiSunter';
import {
  computeBlockingKey,
  detectIntraDatabaseDuplicates,
} from '../engine/fellegiSunter';

interface BlockingViewProps {
  fields: FieldSchema[];
  blockingRules: BlockingRule[];
  blockingOutput: BlockingOutput;
  evaluation: EvaluationMetrics;
  recordsA: DatabaseRecord[];
  recordsB: DatabaseRecord[];
  dbAName: string;
  dbBName: string;
  learnedParams: Record<string, LearnedFieldParams>;
  priorMatch: number;
  lowerThreshold: number;
  upperThreshold: number;
  onToggleRule: (ruleId: string) => void;
  onAddRule: (rule: BlockingRule) => void;
  onRemoveRule: (ruleId: string) => void;
}

type BlockingTab = 'cross' | 'intra';
type IntraSourceFilter = 'both' | 'A' | 'B';
type IntraClassFilter = 'suspects' | 'all';

interface TaggedIntraPair {
  key: string;
  source: 'A' | 'B';
  pair: CandidatePair;
}

const TRANSFORM_LABELS: Record<BlockingTransform, string> = {
  soundex: 'Soundex Phonetic',
  prefix_3: 'First 3 Chars',
  prefix_4: 'First 4 Chars',
  year: 'Year (YYYY)',
  exact: 'Normalized Exact',
  alnum_only: 'Alphanumeric Exact',
};

const DECISION_META: Record<LinkageDecision, { label: string; colorClass: string }> = {
  match: { label: 'Match', colorClass: 'text-emerald-700' },
  clerical: { label: 'Possible Match', colorClass: 'text-amber-700' },
  non_match: { label: 'Non-Match', colorClass: 'text-slate-500' },
};

export const BlockingView: React.FC<BlockingViewProps> = ({
  fields,
  blockingRules,
  blockingOutput,
  evaluation,
  recordsA,
  recordsB,
  dbAName,
  dbBName,
  learnedParams,
  priorMatch,
  lowerThreshold,
  upperThreshold,
  onToggleRule,
  onAddRule,
  onRemoveRule,
}) => {
  const [activeTab, setActiveTab] = useState<BlockingTab>('cross');
  const [field1, setField1] = useState(fields[1]?.key ?? fields[0]?.key ?? '');
  const [trans1, setTrans1] = useState<BlockingTransform>('soundex');
  const [useSecondPart, setUseSecondPart] = useState(true);
  const [field2, setField2] = useState(fields[2]?.key ?? fields[0]?.key ?? '');
  const [trans2, setTrans2] = useState<BlockingTransform>('year');

  const [intraSourceFilter, setIntraSourceFilter] = useState<IntraSourceFilter>('both');
  const [intraClassFilter, setIntraClassFilter] = useState<IntraClassFilter>('suspects');
  const [intraSearch, setIntraSearch] = useState('');
  const [selectedIntraKey, setSelectedIntraKey] = useState<string | null>(null);

  const intraA = useMemo(
    () =>
      detectIntraDatabaseDuplicates(
        'A',
        recordsA,
        blockingRules,
        fields,
        learnedParams,
        priorMatch,
        upperThreshold,
        lowerThreshold
      ),
    [
      recordsA,
      blockingRules,
      fields,
      learnedParams,
      priorMatch,
      upperThreshold,
      lowerThreshold,
    ]
  );

  const intraB = useMemo(
    () =>
      detectIntraDatabaseDuplicates(
        'B',
        recordsB,
        blockingRules,
        fields,
        learnedParams,
        priorMatch,
        upperThreshold,
        lowerThreshold
      ),
    [
      recordsB,
      blockingRules,
      fields,
      learnedParams,
      priorMatch,
      upperThreshold,
      lowerThreshold,
    ]
  );

  const totalIntraSuspects = intraA.suspectCount + intraB.suspectCount;
  const totalIntraMatches = intraA.matchCount + intraB.matchCount;
  const totalIntraClerical = intraA.clericalCount + intraB.clericalCount;
  const totalIntraCandidates = intraA.candidateCount + intraB.candidateCount;
  const totalIntraCartesian = intraA.cartesianPairs + intraB.cartesianPairs;
  const combinedIntraRR =
    totalIntraCartesian > 0 ? 1 - totalIntraCandidates / totalIntraCartesian : 0;

  const combinedIntraPairs = useMemo<TaggedIntraPair[]>(() => {
    const out: TaggedIntraPair[] = [];
    if (intraSourceFilter === 'both' || intraSourceFilter === 'A') {
      for (const pair of intraA.pairs) {
        out.push({ key: `A:${pair.pairId}`, source: 'A', pair });
      }
    }
    if (intraSourceFilter === 'both' || intraSourceFilter === 'B') {
      for (const pair of intraB.pairs) {
        out.push({ key: `B:${pair.pairId}`, source: 'B', pair });
      }
    }
    out.sort((a, b) => b.pair.totalWeight - a.pair.totalWeight);

    const q = intraSearch.trim().toLowerCase();
    return out.filter((item) => {
      if (
        intraClassFilter === 'suspects' &&
        item.pair.finalDecision === 'non_match'
      ) {
        return false;
      }
      if (!q) return true;
      const in1 =
        item.pair.recordA.id.toLowerCase().includes(q) ||
        Object.values(item.pair.recordA.fields).some((v) =>
          v.toLowerCase().includes(q)
        );
      const in2 =
        item.pair.recordB.id.toLowerCase().includes(q) ||
        Object.values(item.pair.recordB.fields).some((v) =>
          v.toLowerCase().includes(q)
        );
      return in1 || in2;
    });
  }, [intraA.pairs, intraB.pairs, intraSourceFilter, intraClassFilter, intraSearch]);

  useEffect(() => {
    if (combinedIntraPairs.length === 0) {
      setSelectedIntraKey(null);
      return;
    }
    if (
      !selectedIntraKey ||
      !combinedIntraPairs.some((item) => item.key === selectedIntraKey)
    ) {
      setSelectedIntraKey(combinedIntraPairs[0].key);
    }
  }, [combinedIntraPairs, selectedIntraKey]);

  const activeIntraItem =
    combinedIntraPairs.find((item) => item.key === selectedIntraKey) ?? null;

  const handleAddPass = (e: React.FormEvent) => {
    e.preventDefault();
    if (!field1) return;

    const f1Label = fields.find((f) => f.key === field1)?.label ?? field1;
    const f2Label = fields.find((f) => f.key === field2)?.label ?? field2;

    const keyParts = [{ field: field1, transform: trans1 }];
    let label = `${TRANSFORM_LABELS[trans1]}(${f1Label})`;

    if (useSecondPart && field2) {
      keyParts.push({ field: field2, transform: trans2 });
      label += ` + ${TRANSFORM_LABELS[trans2]}(${f2Label})`;
    }

    onAddRule({
      id: `blk_custom_${Date.now()}`,
      label,
      keyParts,
      enabled: true,
    });
  };

  const passStatsMap = new Map(
    blockingOutput.passStats.map((s) => [s.ruleId, s])
  );

  const previewRule = blockingRules.find((r) => r.enabled) ?? blockingRules[0];

  const summarizeRecord = (rec: DatabaseRecord) => {
    const keys = fields.slice(0, 2).map((f) => f.key);
    const vals = keys.map((k) => rec.fields[k]).filter(Boolean);
    return vals.length > 0 ? vals.join(' ') : rec.id;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">
            02. Multi-Pass Blocking &amp; Candidate Generation
          </h2>
          <p className="mt-1 text-sm text-slate-600 max-w-3xl">
            Multi-pass union blocking indexes both independent databases on phonetic or prefix keys, avoiding full Cartesian comparison while maximizing candidate recall.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md self-start lg:self-auto">
          <button
            type="button"
            onClick={() => setActiveTab('cross')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'cross'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Cross-Database Blocking</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('intra')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'intra'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CopyCheck className="w-3.5 h-3.5" />
            <span>Intra-Database Duplicate Detector ({totalIntraSuspects})</span>
          </button>
        </div>
      </div>

      {activeTab === 'cross' ? (
        <>
          {/* Summary Metric Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 bg-white border border-slate-200 rounded-lg">
              <div className="text-xs text-slate-500">Full Cartesian Space</div>
              <div className="mt-1 text-2xl font-semibold text-slate-900 font-mono tabular-nums">
                {evaluation.cartesianSize.toLocaleString()}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                |A| × |B| unblocked pairs
              </div>
            </div>

            <div className="p-4 bg-white border border-slate-200 rounded-lg">
              <div className="text-xs text-slate-500">Unique Candidate Pairs</div>
              <div className="mt-1 text-2xl font-semibold text-blue-700 font-mono tabular-nums">
                {evaluation.candidateCount.toLocaleString()}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Union across active passes
              </div>
            </div>

            <div className="p-4 bg-white border border-slate-200 rounded-lg">
              <div className="text-xs text-slate-500">Reduction Ratio (RR)</div>
              <div className="mt-1 text-2xl font-semibold text-slate-900 font-mono tabular-nums">
                {(evaluation.reductionRatio * 100).toFixed(2)}%
              </div>
              <div className="mt-1 text-xs text-slate-500">
                1 − (|C| / |A × B|)
              </div>
            </div>

            <div className="p-4 bg-white border border-slate-200 rounded-lg">
              <div className="text-xs text-slate-500">Pairs Completeness (PC)</div>
              <div className="mt-1 text-2xl font-semibold text-emerald-700 font-mono tabular-nums">
                {evaluation.hasGroundTruth
                  ? `${(evaluation.pairsCompleteness * 100).toFixed(1)}%`
                  : 'N/A'}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {evaluation.hasGroundTruth
                  ? `True pairs retained of ${evaluation.totalGroundTruthMatches}`
                  : 'Requires ground_truth_id column'}
              </div>
            </div>
          </div>

          {/* Blocking Passes Table + Builder */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">
                  Configured Blocking Passes
                </h3>
                <span className="text-xs text-slate-500 tabular-nums">
                  {blockingRules.filter((r) => r.enabled).length} of {blockingRules.length} active
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
                    <tr>
                      <th className="py-2.5 px-3">Active</th>
                      <th className="py-2.5 px-3">Blocking Key Definition</th>
                      <th className="py-2.5 px-3 text-right">Keys A</th>
                      <th className="py-2.5 px-3 text-right">Keys B</th>
                      <th className="py-2.5 px-3 text-right">Pairs Emitted</th>
                      <th className="py-2.5 px-3 text-right">Remove</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {blockingRules.map((rule) => {
                      const stat = passStatsMap.get(rule.id);
                      return (
                        <tr key={rule.id} className="hover:bg-slate-50/70">
                          <td className="py-2.5 px-3">
                            <input
                              type="checkbox"
                              checked={rule.enabled}
                              onChange={() => onToggleRule(rule.id)}
                              aria-label={`Toggle ${rule.label}`}
                              className="w-4 h-4 accent-blue-700 rounded cursor-pointer"
                            />
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="font-medium text-slate-900">{rule.label}</div>
                            <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                              {rule.keyParts
                                .map((kp) => `${kp.transform}(${kp.field})`)
                                .join(' | ')}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700">
                            {rule.enabled && stat ? stat.distinctKeysA : '—'}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700">
                            {rule.enabled && stat ? stat.distinctKeysB : '—'}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums font-medium text-slate-900">
                            {rule.enabled && stat ? stat.pairsGenerated : '—'}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => onRemoveRule(rule.id)}
                              className="p-1 text-slate-400 hover:text-red-600 transition-colors"
                              aria-label={`Delete ${rule.label}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Add Custom Blocking Pass */}
            <form
              onSubmit={handleAddPass}
              className="lg:col-span-5 p-5 bg-white border border-slate-200 rounded-lg space-y-4"
            >
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Add Custom Blocking Pass
                </h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  Combine an indexing attribute and normalization transform to catch additional candidate pairs.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Primary Field
                  </label>
                  <select
                    value={field1}
                    onChange={(e) => setField1(e.target.value)}
                    className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-md bg-white text-slate-900"
                  >
                    {fields.map((f) => (
                      <option key={f.key} value={f.key}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Transform
                  </label>
                  <select
                    value={trans1}
                    onChange={(e) => setTrans1(e.target.value as BlockingTransform)}
                    className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-md bg-white text-slate-900"
                  >
                    {Object.entries(TRANSFORM_LABELS).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useSecondPart}
                  onChange={(e) => setUseSecondPart(e.target.checked)}
                  className="w-3.5 h-3.5 accent-blue-700"
                />
                <span>Compound with secondary key attribute</span>
              </label>

              {useSecondPart && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Secondary Field
                    </label>
                    <select
                      value={field2}
                      onChange={(e) => setField2(e.target.value)}
                      className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-md bg-white text-slate-900"
                    >
                      {fields.map((f) => (
                        <option key={f.key} value={f.key}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Transform
                    </label>
                    <select
                      value={trans2}
                      onChange={(e) => setTrans2(e.target.value as BlockingTransform)}
                      className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-md bg-white text-slate-900"
                    >
                      {Object.entries(TRANSFORM_LABELS).map(([k, label]) => (
                        <option key={k} value={k}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <button
                type="submit"
                className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-700 rounded-md hover:bg-blue-800 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Append Blocking Pass</span>
              </button>
            </form>
          </div>

          {/* Live Blocking Key Sample */}
          {previewRule && (
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">
                  Index Key Sample — {previewRule.label}
                </h3>
                <span className="text-xs text-slate-500">
                  First 6 records from each database
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-200">
                <div className="p-4">
                  <div className="text-xs font-semibold text-slate-700 mb-2">
                    Database A Keys
                  </div>
                  <div className="space-y-1.5">
                    {recordsA.slice(0, 6).map((r) => (
                      <div
                        key={r.id}
                        className="flex items-center justify-between text-xs py-1 border-b border-slate-100 last:border-b-0"
                      >
                        <span className="font-mono text-slate-600">{r.id}</span>
                        <span className="text-slate-700 truncate max-w-[180px]">
                          {previewRule.keyParts.map((kp) => r.fields[kp.field]).join(' / ')}
                        </span>
                        <span className="font-mono font-medium text-blue-700">
                          {computeBlockingKey(r, previewRule) ?? 'NULL'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="p-4">
                  <div className="text-xs font-semibold text-slate-700 mb-2">
                    Database B Keys
                  </div>
                  <div className="space-y-1.5">
                    {recordsB.slice(0, 6).map((r) => (
                      <div
                        key={r.id}
                        className="flex items-center justify-between text-xs py-1 border-b border-slate-100 last:border-b-0"
                      >
                        <span className="font-mono text-slate-600">{r.id}</span>
                        <span className="text-slate-700 truncate max-w-[180px]">
                          {previewRule.keyParts.map((kp) => r.fields[kp.field]).join(' / ')}
                        </span>
                        <span className="font-mono font-medium text-blue-700">
                          {computeBlockingKey(r, previewRule) ?? 'NULL'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          {/* Intra-Database Summary Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 bg-white border border-slate-200 rounded-lg">
              <div className="text-xs text-slate-500">Suspected Intra-DB Duplicates</div>
              <div className="mt-1 text-2xl font-semibold text-slate-900 font-mono tabular-nums">
                {totalIntraSuspects.toLocaleString()}
              </div>
              <div className="mt-1 text-xs text-slate-500 tabular-nums">
                {totalIntraMatches} match · {totalIntraClerical} possible match
              </div>
            </div>

            <div className="p-4 bg-white border border-slate-200 rounded-lg">
              <div className="text-xs text-slate-500 truncate">
                Source A: {dbAName}
              </div>
              <div className="mt-1 text-2xl font-semibold text-blue-700 font-mono tabular-nums">
                {intraA.suspectCount.toLocaleString()}
              </div>
              <div className="mt-1 text-xs text-slate-500 tabular-nums">
                {intraA.candidateCount} blocked of {intraA.cartesianPairs} pairs
              </div>
            </div>

            <div className="p-4 bg-white border border-slate-200 rounded-lg">
              <div className="text-xs text-slate-500 truncate">
                Source B: {dbBName}
              </div>
              <div className="mt-1 text-2xl font-semibold text-indigo-700 font-mono tabular-nums">
                {intraB.suspectCount.toLocaleString()}
              </div>
              <div className="mt-1 text-xs text-slate-500 tabular-nums">
                {intraB.candidateCount} blocked of {intraB.cartesianPairs} pairs
              </div>
            </div>

            <div className="p-4 bg-white border border-slate-200 rounded-lg">
              <div className="text-xs text-slate-500">Intra-DB Reduction Ratio</div>
              <div className="mt-1 text-2xl font-semibold text-emerald-700 font-mono tabular-nums">
                {(combinedIntraRR * 100).toFixed(2)}%
              </div>
              <div className="mt-1 text-xs text-slate-500 tabular-nums">
                {totalIntraCandidates} evaluated of {totalIntraCartesian} within-DB pairs
              </div>
            </div>
          </div>

          {/* Filter & Threshold Context Bar */}
          <div className="p-4 bg-white border border-slate-200 rounded-lg flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md">
                {(
                  [
                    ['both', `Both (${intraA.suspectCount + intraB.suspectCount})`],
                    ['A', `DB A (${intraA.suspectCount})`],
                    ['B', `DB B (${intraB.suspectCount})`],
                  ] as Array<[IntraSourceFilter, string]>
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setIntraSourceFilter(key)}
                    className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                      intraSourceFilter === key
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md">
                <button
                  type="button"
                  onClick={() => setIntraClassFilter('suspects')}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                    intraClassFilter === 'suspects'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Suspected (Match &amp; Possible Match)
                </button>
                <button
                  type="button"
                  onClick={() => setIntraClassFilter('all')}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                    intraClassFilter === 'all'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  All Blocked ({totalIntraCandidates})
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[11px] font-mono tabular-nums text-slate-500">
                T_λ {lowerThreshold.toFixed(1)} · T_μ {upperThreshold.toFixed(1)} · π_M{' '}
                {(priorMatch * 100).toFixed(1)}%
              </span>

              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={intraSearch}
                  onChange={(e) => setIntraSearch(e.target.value)}
                  placeholder="Filter record ID or value..."
                  className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-md bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600"
                />
              </div>
            </div>
          </div>

          {/* Master-Detail Duplicate Pairs & Field Comparison */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-6 bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">
                  Detected Within-Database Pairs
                </h3>
                <span className="text-xs font-mono tabular-nums text-slate-500">
                  {combinedIntraPairs.length} pair{combinedIntraPairs.length === 1 ? '' : 's'}
                </span>
              </div>

              {combinedIntraPairs.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500 space-y-1">
                  <p className="font-medium text-slate-700">
                    No intra-database candidate pairs match the current filter.
                  </p>
                  <p>
                    {intraClassFilter === 'suspects'
                      ? 'Switch to "All Blocked" to inspect sub-threshold pairs or lower T_λ in Stage 03.'
                      : 'No two records inside the selected database share a blocking key under the active passes.'}
                  </p>
                </div>
              ) : (
                <div className="max-h-[520px] overflow-y-auto divide-y divide-slate-100">
                  {combinedIntraPairs.map((item) => {
                    const isSelected = item.key === activeIntraItem?.key;
                    const meta = DECISION_META[item.pair.finalDecision];
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => setSelectedIntraKey(item.key)}
                        className={`w-full text-left px-4 py-3 transition-colors ${
                          isSelected ? 'bg-blue-50/70' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className={`text-[11px] font-mono font-semibold ${
                                item.source === 'A' ? 'text-blue-700' : 'text-indigo-700'
                              }`}
                            >
                              DB {item.source}
                            </span>
                            <span className="text-xs font-mono font-semibold text-slate-900 truncate">
                              {item.pair.recordA.id} ↔ {item.pair.recordB.id}
                            </span>
                          </div>

                          <div className="flex items-center gap-2.5 shrink-0">
                            <span className="text-xs font-mono tabular-nums font-semibold text-slate-900">
                              W {item.pair.totalWeight.toFixed(2)}
                            </span>
                            <span className={`text-[11px] font-medium ${meta.colorClass}`}>
                              {meta.label}
                            </span>
                          </div>
                        </div>

                        <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-slate-600">
                          <span className="truncate">
                            {summarizeRecord(item.pair.recordA)} ·{' '}
                            {summarizeRecord(item.pair.recordB)}
                          </span>
                          <span className="font-mono tabular-nums text-slate-500 shrink-0">
                            P {(item.pair.posteriorProb * 100).toFixed(1)}%
                          </span>
                        </div>

                        <div className="mt-1 text-[10px] font-mono text-slate-400 truncate">
                          Pass: {item.pair.matchedBlockPasses.join(' · ')}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="lg:col-span-6 bg-white border border-slate-200 rounded-lg overflow-hidden">
              {!activeIntraItem ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  Select an intra-database pair to inspect field-level Fellegi-Sunter agreement scores and log-odds contributions.
                </div>
              ) : (
                <>
                  <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-semibold text-slate-900 font-mono">
                        DB {activeIntraItem.source} ({activeIntraItem.source === 'A' ? dbAName : dbBName}):{' '}
                        {activeIntraItem.pair.recordA.id} ↔ {activeIntraItem.pair.recordB.id}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Matched via {activeIntraItem.pair.matchedBlockPasses.join(', ')}
                      </div>
                    </div>

                    <div className="text-right font-mono tabular-nums">
                      <div className="text-xs font-semibold text-slate-900">
                        W(γ) = {activeIntraItem.pair.totalWeight.toFixed(2)}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        P(M|γ) = {(activeIntraItem.pair.posteriorProb * 100).toFixed(1)}%
                      </div>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
                        <tr>
                          <th className="py-2 px-3">Field</th>
                          <th className="py-2 px-3">Record {activeIntraItem.pair.recordA.id}</th>
                          <th className="py-2 px-3">Record {activeIntraItem.pair.recordB.id}</th>
                          <th className="py-2 px-3 text-right">Sim</th>
                          <th className="py-2 px-3 text-right">w_k</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {activeIntraItem.pair.comparisons.map((comp) => (
                          <tr key={comp.field}>
                            <td className="py-2 px-3 font-medium text-slate-800 whitespace-nowrap">
                              {comp.label}
                            </td>
                            <td className="py-2 px-3 text-slate-700 font-mono text-[11px]">
                              {comp.valueA || <span className="text-slate-400 italic">missing</span>}
                            </td>
                            <td className="py-2 px-3 text-slate-700 font-mono text-[11px]">
                              {comp.valueB || <span className="text-slate-400 italic">missing</span>}
                            </td>
                            <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-700">
                              {comp.level === 'missing'
                                ? '—'
                                : `${(comp.similarity * 100).toFixed(0)}%`}
                            </td>
                            <td
                              className={`py-2 px-3 text-right font-mono tabular-nums font-semibold ${
                                comp.weight > 0
                                  ? 'text-emerald-700'
                                  : comp.weight < 0
                                    ? 'text-red-700'
                                    : 'text-slate-400'
                              }`}
                            >
                              {comp.weight > 0
                                ? `+${comp.weight.toFixed(2)}`
                                : comp.weight.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
