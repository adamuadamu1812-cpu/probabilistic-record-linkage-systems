import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type {
  CandidatePair,
  ComparatorType,
  EMResult,
  EvaluationMetrics,
  FieldSchema,
  LearnedFieldParams,
} from '../types/linkage';
import {
  EMConvergenceChart,
  type HistogramMetric,
  WeightHistogram,
} from './WeightHistogram';
import { SimilarityProbabilityHeatmap } from './SimilarityProbabilityHeatmap';
import { AttributeCorrelationMatrix } from './AttributeCorrelationMatrix';

interface ModelWeightsViewProps {
  fields: FieldSchema[];
  learnedParams: Record<string, LearnedFieldParams>;
  priorMatch: number;
  emResult: EMResult | null;
  pairs: CandidatePair[];
  evaluation: EvaluationMetrics;
  upperThreshold: number;
  lowerThreshold: number;
  enforceOneToOne: boolean;
  onUpdateField: (key: string, patch: Partial<FieldSchema>) => void;
  onRunEM: () => void;
  onResetManualParams: () => void;
  onChangeThresholds: (lower: number, upper: number) => void;
  onToggleOneToOne: (val: boolean) => void;
}

const COMPARATOR_OPTIONS: Array<{ value: ComparatorType; label: string }> = [
  { value: 'jaro_winkler', label: 'Jaro-Winkler' },
  { value: 'levenshtein', label: 'Levenshtein' },
  { value: 'soundex', label: 'Phonetic (Soundex)' },
  { value: 'token_jaccard', label: 'Token Jaccard' },
  { value: 'date_tolerance', label: 'Date Tolerance' },
  { value: 'exact', label: 'Exact Normalized' },
];

export const ModelWeightsView: React.FC<ModelWeightsViewProps> = ({
  fields,
  learnedParams,
  priorMatch,
  emResult,
  pairs,
  evaluation,
  upperThreshold,
  lowerThreshold,
  enforceOneToOne,
  onUpdateField,
  onRunEM,
  onResetManualParams,
  onChangeThresholds,
  onToggleOneToOne,
}) => {
  const [histogramMetric, setHistogramMetric] = useState<HistogramMetric>('weight');

  const matchCount = pairs.filter((p) => p.finalDecision === 'match').length;
  const clericalCount = pairs.filter((p) => p.finalDecision === 'clerical').length;
  const nonMatchCount = pairs.filter((p) => p.finalDecision === 'non_match').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">
            03. Fellegi-Sunter Weights &amp; EM Calibration
          </h2>
          <p className="mt-1 text-sm text-slate-600 max-w-3xl">
            Configure attribute comparators, estimate conditional m and u probabilities using Expectation-Maximization, and calibrate decision thresholds T_λ and T_μ.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onResetManualParams}
            className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
          >
            Reset to Priors
          </button>
          <button
            type="button"
            onClick={onRunEM}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-700 rounded-md hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Estimate m/u via EM Algorithm</span>
          </button>
        </div>
      </div>

      {/* Distribution Histogram + Threshold Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-8 p-5 bg-white border border-slate-200 rounded-lg">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Match Score Frequency Histogram
              </h3>
              <p className="text-xs text-slate-500">
                {histogramMetric === 'weight'
                  ? 'Distribution of composite weights W(γ) with T_λ and T_μ cut-offs'
                  : 'Distribution of posterior match scores P(M|γ) across classified pairs'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-md">
                <button
                  type="button"
                  onClick={() => setHistogramMetric('weight')}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                    histogramMetric === 'weight'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Weight W(γ)
                </button>
                <button
                  type="button"
                  onClick={() => setHistogramMetric('posterior')}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                    histogramMetric === 'posterior'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Score P(M|γ)
                </button>
              </div>
              <div className="flex items-center gap-3 text-xs font-mono tabular-nums">
                <span className="text-emerald-700 font-semibold">Match: {matchCount}</span>
                <span className="text-amber-700 font-semibold">Possible Match: {clericalCount}</span>
                <span className="text-red-700 font-semibold">Non-Match: {nonMatchCount}</span>
              </div>
            </div>
          </div>

          <WeightHistogram
            pairs={pairs}
            upperThreshold={upperThreshold}
            lowerThreshold={lowerThreshold}
            metric={histogramMetric}
          />
        </div>

        {/* Threshold & EM Diagnostics Panel */}
        <div className="lg:col-span-4 space-y-4">
          <div className="p-5 bg-white border border-slate-200 rounded-lg space-y-4">
            <h3 className="text-sm font-semibold text-slate-900">
              Decision Threshold Calibration
            </h3>

            <div>
              <div className="flex justify-between text-xs text-slate-700 mb-1">
                <span>Upper Match Threshold (T_μ)</span>
                <span className="font-mono tabular-nums font-semibold text-emerald-700">
                  {upperThreshold.toFixed(1)}
                </span>
              </div>
              <input
                type="range"
                min={-5}
                max={30}
                step={0.5}
                value={upperThreshold}
                onChange={(e) => {
                  const nextUpper = Number(e.target.value);
                  onChangeThresholds(Math.min(lowerThreshold, nextUpper), nextUpper);
                }}
                className="w-full accent-emerald-700"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs text-slate-700 mb-1">
                <span>Lower Non-Match Threshold (T_λ)</span>
                <span className="font-mono tabular-nums font-semibold text-amber-700">
                  {lowerThreshold.toFixed(1)}
                </span>
              </div>
              <input
                type="range"
                min={-15}
                max={25}
                step={0.5}
                value={lowerThreshold}
                onChange={(e) => {
                  const nextLower = Number(e.target.value);
                  onChangeThresholds(nextLower, Math.max(upperThreshold, nextLower));
                }}
                className="w-full accent-amber-700"
              />
            </div>

            <label className="flex items-start gap-2 pt-2 border-t border-slate-100 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={enforceOneToOne}
                onChange={(e) => onToggleOneToOne(e.target.checked)}
                className="mt-0.5 w-3.5 h-3.5 accent-blue-700"
              />
              <span>
                Enforce 1-to-1 bipartite assignment (prevents one record in DB A matching multiple records in DB B)
              </span>
            </label>

            {evaluation.hasGroundTruth && (
              <div className="pt-3 border-t border-slate-100 grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-[11px] text-slate-500">Precision</div>
                  <div className="text-sm font-semibold font-mono tabular-nums text-slate-900">
                    {(evaluation.precision * 100).toFixed(1)}%
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">Recall</div>
                  <div className="text-sm font-semibold font-mono tabular-nums text-slate-900">
                    {(evaluation.recall * 100).toFixed(1)}%
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">F1 Score</div>
                  <div className="text-sm font-semibold font-mono tabular-nums text-blue-700">
                    {(evaluation.f1 * 100).toFixed(1)}%
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="p-5 bg-white border border-slate-200 rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">
                EM Parameter Diagnostics
              </h3>
              <span className="text-xs font-mono tabular-nums text-slate-600">
                P(M) = {(priorMatch * 100).toFixed(1)}%
              </span>
            </div>

            {emResult ? (
              <>
                <div className="text-xs text-slate-600 flex items-center justify-between font-mono tabular-nums">
                  <span>
                    {emResult.converged ? 'Converged' : 'Max Iter'} in {emResult.iterations} steps
                  </span>
                  <span>
                    LL: {emResult.logLikelihoodHistory[emResult.logLikelihoodHistory.length - 1]?.toFixed(1) ?? '—'}
                  </span>
                </div>
                <EMConvergenceChart history={emResult.logLikelihoodHistory} />
              </>
            ) : (
              <p className="text-xs text-slate-500 leading-relaxed">
                Currently using domain prior m_i and u_i parameters. Click &ldquo;Estimate m/u via EM Algorithm&rdquo; to learn parameters directly from candidate comparison vectors.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* 2D Similarity vs Match Probability Density Heatmap */}
      <SimilarityProbabilityHeatmap
        pairs={pairs}
        priorMatch={priorMatch}
        lowerThreshold={lowerThreshold}
        upperThreshold={upperThreshold}
      />

      {/* D3 Attribute & Score Correlation Matrix */}
      <AttributeCorrelationMatrix pairs={pairs} fields={fields} />

      {/* Field Comparison Schema & Learned Weights Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">
            Attribute Comparators &amp; Fellegi-Sunter Log-Odds Weights
          </h3>
          <span className="text-xs text-slate-500">
            w⁺ = log₂(m_agree / u_agree) · w⁻ = log₂(m_disagree / u_disagree)
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
              <tr>
                <th className="py-2.5 px-3">Use</th>
                <th className="py-2.5 px-3">Attribute</th>
                <th className="py-2.5 px-3">Comparator</th>
                <th className="py-2.5 px-3 text-right">Agree ≥</th>
                <th className="py-2.5 px-3 text-right">Partial ≥</th>
                <th className="py-2.5 px-3 text-right">m (Agree|M)</th>
                <th className="py-2.5 px-3 text-right">u (Agree|U)</th>
                <th className="py-2.5 px-3 text-right">w⁺ (Agree)</th>
                <th className="py-2.5 px-3 text-right">w (Partial)</th>
                <th className="py-2.5 px-3 text-right">w⁻ (Disagree)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {fields.map((f) => {
                const lp = learnedParams[f.key];
                return (
                  <tr
                    key={f.key}
                    className={`hover:bg-slate-50/80 ${!f.enabled ? 'opacity-50' : ''}`}
                  >
                    <td className="py-2.5 px-3">
                      <input
                        type="checkbox"
                        checked={f.enabled}
                        onChange={(e) => onUpdateField(f.key, { enabled: e.target.checked })}
                        aria-label={`Enable ${f.label}`}
                        className="w-4 h-4 accent-blue-700 cursor-pointer"
                      />
                    </td>
                    <td className="py-2.5 px-3 font-medium text-slate-900 whitespace-nowrap">
                      {f.label}
                      <div className="text-[10px] font-mono text-slate-400">{f.key}</div>
                    </td>
                    <td className="py-2.5 px-3">
                      <select
                        value={f.comparator}
                        onChange={(e) =>
                          onUpdateField(f.key, {
                            comparator: e.target.value as ComparatorType,
                          })
                        }
                        className="px-2 py-1 text-xs border border-slate-300 rounded bg-white text-slate-800"
                      >
                        {COMPARATOR_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <input
                        type="number"
                        min={0.5}
                        max={1}
                        step={0.02}
                        value={f.agreeThreshold}
                        onChange={(e) =>
                          onUpdateField(f.key, { agreeThreshold: Number(e.target.value) })
                        }
                        className="w-16 px-1.5 py-1 text-right font-mono tabular-nums border border-slate-300 rounded text-xs"
                      />
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <input
                        type="number"
                        min={0.3}
                        max={0.98}
                        step={0.02}
                        value={f.partialThreshold}
                        onChange={(e) =>
                          onUpdateField(f.key, { partialThreshold: Number(e.target.value) })
                        }
                        className="w-16 px-1.5 py-1 text-right font-mono tabular-nums border border-slate-300 rounded text-xs"
                      />
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-800">
                      {lp ? lp.mAgree.toFixed(3) : f.mAgree.toFixed(3)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-800">
                      {lp ? lp.uAgree.toFixed(4) : f.uAgree.toFixed(4)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-emerald-700">
                      {lp ? `+${lp.wAgree.toFixed(2)}` : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-amber-700">
                      {lp
                        ? `${lp.wPartial >= 0 ? '+' : ''}${lp.wPartial.toFixed(2)}`
                        : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-red-700">
                      {lp ? lp.wDisagree.toFixed(2) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
