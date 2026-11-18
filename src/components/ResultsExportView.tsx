import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Download, FileDown, Mail, Printer } from 'lucide-react';
import type {
  CandidatePair,
  EMResult,
  EntityCluster,
  EvaluationMetrics,
  FieldSchema,
} from '../types/linkage';
import {
  exportCombinedResultsCSV,
  exportGoldenClustersCSV,
  exportLinkedPairsCSV,
} from '../engine/fellegiSunter';
import { PairDistributionChart } from './PairDistributionChart';

interface ResultsExportViewProps {
  clusters: EntityCluster[];
  pairs: CandidatePair[];
  fields: FieldSchema[];
  evaluation: EvaluationMetrics;
  emResult: EMResult | null;
  dbAName: string;
  dbBName: string;
  recordsACount: number;
  recordsBCount: number;
  lowerThreshold: number;
  upperThreshold: number;
  enforceOneToOne: boolean;
  onOpenGmailShare?: () => void;
}

function triggerDownload(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export const ResultsExportView: React.FC<ResultsExportViewProps> = ({
  clusters,
  pairs,
  fields,
  evaluation,
  emResult,
  dbAName,
  dbBName,
  recordsACount,
  recordsBCount,
  lowerThreshold,
  upperThreshold,
  enforceOneToOne,
  onOpenGmailShare,
}) => {
  const [expandedClusterId, setExpandedClusterId] = useState<string | null>(
    clusters[0]?.clusterId ?? null
  );

  const totalRecordsProcessed = recordsACount + recordsBCount;
  const matchedPairsCount = pairs.filter((p) => p.finalDecision === 'match').length;
  const clericalPendingCount = pairs.filter((p) => p.finalDecision === 'clerical').length;

  const recordsInClusters = clusters.reduce((sum, c) => sum + c.records.length, 0);
  const singletonRecordsCount = Math.max(0, totalRecordsProcessed - recordsInClusters);
  const totalEntitiesIdentified = clusters.length + singletonRecordsCount;
  const redundantRecordsConsolidated = Math.max(0, recordsInClusters - clusters.length);

  const meanClusterPosterior =
    clusters.length > 0
      ? clusters.reduce((sum, c) => sum + c.avgPosterior, 0) / clusters.length
      : 0;

  const handleDownloadLinkedCSV = () => {
    const csv = exportLinkedPairsCSV(pairs, fields);
    triggerDownload(csv, 'linked_duplicate_pairs.csv', 'text/csv;charset=utf-8;');
  };

  const handleDownloadGoldenCSV = () => {
    const csv = exportGoldenClustersCSV(clusters, fields);
    triggerDownload(csv, 'resolved_entity_clusters.csv', 'text/csv;charset=utf-8;');
  };

  const handleDownloadCombinedResultsCSV = () => {
    const csv = exportCombinedResultsCSV(clusters, pairs, fields);
    triggerDownload(csv, 'record_linkage_results.csv', 'text/csv;charset=utf-8;');
  };

  const handleDownloadAuditJSON = () => {
    const report = {
      generatedAt: new Date().toISOString(),
      databases: {
        databaseA: dbAName,
        databaseB: dbBName,
        recordsA: recordsACount,
        recordsB: recordsBCount,
      },
      summary: {
        totalRecordsProcessed,
        totalEntitiesIdentified,
        linkedClusters: clusters.length,
        singletonRecords: singletonRecordsCount,
        duplicatePairsMatched: matchedPairsCount,
        redundantRecordsConsolidated,
        pendingPossibleMatch: clericalPendingCount,
      },
      evaluation,
      emDiagnostics: emResult,
      linkedClusters: clusters.map((c) => ({
        clusterId: c.clusterId,
        avgPosterior: c.avgPosterior,
        maxWeight: c.maxWeight,
        goldenRecord: c.goldenRecord,
        sourceRecords: c.records.map((r) => ({
          source: r.source,
          id: r.id,
          fields: r.fields,
        })),
      })),
    };
    triggerDownload(
      JSON.stringify(report, null, 2),
      'record_linkage_audit.json',
      'application/json'
    );
  };

  const handlePrintReport = () => {
    delete document.documentElement.dataset.printSummaryOnly;
    window.print();
  };

  const handleSaveAsPDF = () => {
    const previousTitle = document.title;
    const slug = `${dbAName}_vs_${dbBName}`
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    document.title = `Linkage_Summary_Report_${slug}`;
    document.documentElement.dataset.printSummaryOnly = 'true';

    let restored = false;
    const cleanup = () => {
      if (restored) return;
      restored = true;
      document.title = previousTitle;
      delete document.documentElement.dataset.printSummaryOnly;
      window.removeEventListener('afterprint', cleanup);
    };

    window.addEventListener('afterprint', cleanup);
    window.print();
    window.setTimeout(cleanup, 1500);
  };

  return (
    <div className="space-y-6">
      <div className="print:hidden flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">
            05. Resolved Entity Clusters &amp; Export
          </h2>
          <p className="mt-1 text-sm text-slate-600 max-w-3xl">
            Synthesize unified golden records across linked duplicates, review the printable linkage summary report, and export verified outputs.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleDownloadLinkedCSV}
            disabled={matchedPairsCount === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Linked Pairs CSV</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadGoldenCSV}
            disabled={clusters.length === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadCombinedResultsCSV}
            disabled={clusters.length === 0 && pairs.length === 0}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-700 rounded-md hover:bg-blue-800 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Results as CSV</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadAuditJSON}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Audit JSON</span>
          </button>
        </div>
      </div>

      {/* Printable Summary Report Card */}
      <section
        aria-label="Printable Linkage Summary Report"
        className="bg-white border border-slate-200 rounded-lg overflow-hidden print:border-slate-300 print:break-inside-avoid"
      >
        <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Probabilistic Record Linkage Summary Report
            </h3>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
              <span>
                {dbAName} ({recordsACount}) ↔ {dbBName} ({recordsBCount})
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                T_λ = {lowerThreshold.toFixed(1)} / T_μ = {upperThreshold.toFixed(1)}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                {emResult
                  ? `EM Calibrated (${emResult.iterations} iter)`
                  : 'Domain Prior Weights'}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                {enforceOneToOne ? '1-to-1 Bipartite Match' : 'Many-to-Many Match'}
              </span>
            </div>
          </div>

          <div className="print:hidden flex items-center gap-2 self-start sm:self-auto shrink-0">
            <button
              type="button"
              onClick={handlePrintReport}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Report</span>
            </button>

            <button
              type="button"
              onClick={handleSaveAsPDF}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-blue-700 rounded-md hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0"
            >
              <FileDown className="w-3.5 h-3.5" />
              <span>Save as PDF</span>
            </button>

            {onOpenGmailShare && (
              <button
                type="button"
                onClick={onOpenGmailShare}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 transition-colors whitespace-nowrap shrink-0"
              >
                <Mail className="w-3.5 h-3.5" />
                <span>Send via Gmail</span>
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 border-t border-slate-200 divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
          <div className="p-5">
            <div className="text-xs font-medium text-slate-500">
              Total Records Processed
            </div>
            <div className="mt-1.5 text-2xl font-semibold text-slate-900 font-mono tabular-nums">
              {totalRecordsProcessed.toLocaleString()}
            </div>
            <div className="mt-1.5 text-xs text-slate-600 font-mono tabular-nums">
              DB A: {recordsACount.toLocaleString()} · DB B: {recordsBCount.toLocaleString()}
            </div>
          </div>

          <div className="p-5">
            <div className="text-xs font-medium text-slate-500">
              Total Entities Identified
            </div>
            <div className="mt-1.5 text-2xl font-semibold text-slate-900 font-mono tabular-nums">
              {totalEntitiesIdentified.toLocaleString()}
            </div>
            <div className="mt-1.5 text-xs text-slate-600 font-mono tabular-nums">
              {clusters.length} linked clusters · {singletonRecordsCount} singletons
            </div>
          </div>

          <div className="p-5">
            <div className="text-xs font-medium text-slate-500">
              Duplicate Count
            </div>
            <div className="mt-1.5 text-2xl font-semibold text-emerald-700 font-mono tabular-nums">
              {matchedPairsCount.toLocaleString()}
            </div>
            <div className="mt-1.5 text-xs text-slate-600 font-mono tabular-nums">
              {redundantRecordsConsolidated} records merged · {clericalPendingCount} possible match
            </div>
          </div>

          <div className="p-5">
            <div className="text-xs font-medium text-slate-500">
              {evaluation.hasGroundTruth ? 'F1 Score Accuracy' : 'Mean Match Posterior'}
            </div>
            <div className="mt-1.5 text-2xl font-semibold text-blue-700 font-mono tabular-nums">
              {evaluation.hasGroundTruth
                ? `${(evaluation.f1 * 100).toFixed(1)}%`
                : clusters.length > 0
                  ? `${(meanClusterPosterior * 100).toFixed(1)}%`
                  : 'N/A'}
            </div>
            <div className="mt-1.5 text-xs text-slate-600 font-mono tabular-nums">
              {evaluation.hasGroundTruth
                ? `Precision ${(evaluation.precision * 100).toFixed(1)}% · Recall ${(evaluation.recall * 100).toFixed(1)}%`
                : 'No ground truth column present'}
            </div>
          </div>
        </div>

        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-600">
          {evaluation.hasGroundTruth ? (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 font-mono tabular-nums">
              <span>TP: {evaluation.truePositives}</span>
              <span>FP: {evaluation.falsePositives}</span>
              <span>FN: {evaluation.falseNegatives}</span>
              <span>TN: {evaluation.trueNegatives.toLocaleString()}</span>
              <span>
                Pairs Completeness: {(evaluation.pairsCompleteness * 100).toFixed(1)}%
              </span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 font-mono tabular-nums">
              <span>Candidate Pairs: {evaluation.candidateCount.toLocaleString()}</span>
              <span>Cartesian Space: {evaluation.cartesianSize.toLocaleString()}</span>
              <span>Active Attributes: {fields.filter((f) => f.enabled).length}</span>
            </div>
          )}

          <div className="font-mono tabular-nums text-slate-700">
            Blocking Reduction Ratio: {(evaluation.reductionRatio * 100).toFixed(2)}%
          </div>
        </div>
      </section>

      {/* D3 Candidate Pair Classification Bar Chart */}
      <PairDistributionChart pairs={pairs} />

      {/* Golden Clusters Table */}
      <div className="print-summary-exclude bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">
            Master Golden Entities ({clusters.length})
          </h3>
          <span className="print:hidden text-xs text-slate-500">
            Click any cluster row to inspect constituent records from DB A &amp; DB B
          </span>
        </div>

        {clusters.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            No entity clusters have crossed the Match threshold yet. Lower T_μ or confirm pairs in Possible Match Review.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
                <tr>
                  <th className="print:hidden py-2.5 px-3 w-8"></th>
                  <th className="py-2.5 px-3">Cluster ID</th>
                  <th className="py-2.5 px-3">Source Records</th>
                  {fields.slice(0, 5).map((f) => (
                    <th key={f.key} className="py-2.5 px-3">
                      {f.label}
                    </th>
                  ))}
                  <th className="py-2.5 px-3 text-right">Max Weight</th>
                  <th className="py-2.5 px-3 text-right">Avg P(M|γ)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {clusters.map((cluster) => {
                  const isOpen = expandedClusterId === cluster.clusterId;
                  return (
                    <React.Fragment key={cluster.clusterId}>
                      <tr
                        onClick={() =>
                          setExpandedClusterId(isOpen ? null : cluster.clusterId)
                        }
                        className="hover:bg-slate-50 cursor-pointer"
                      >
                        <td className="print:hidden py-2.5 px-3 text-slate-400">
                          {isOpen ? (
                            <ChevronDown className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5" />
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-medium text-slate-900 whitespace-nowrap tabular-nums">
                          {cluster.clusterId}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-600 whitespace-nowrap">
                          {cluster.records.map((r) => `${r.source}:${r.id}`).join(' · ')}
                        </td>
                        {fields.slice(0, 5).map((f) => (
                          <td
                            key={f.key}
                            className="py-2.5 px-3 text-slate-800 whitespace-nowrap max-w-[180px] truncate"
                          >
                            {cluster.goldenRecord[f.key] || '—'}
                          </td>
                        ))}
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums font-medium text-emerald-700">
                          {cluster.maxWeight.toFixed(2)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700">
                          {(cluster.avgPosterior * 100).toFixed(1)}%
                        </td>
                      </tr>

                      {isOpen && (
                        <tr className="bg-slate-50/70 print:hidden">
                          <td colSpan={fields.slice(0, 5).length + 5} className="p-4">
                            <div className="text-xs font-semibold text-slate-700 mb-2">
                              Constituent Source Records Merged into {cluster.clusterId}
                            </div>
                            <div className="overflow-x-auto border border-slate-200 rounded bg-white">
                              <table className="w-full text-left border-collapse text-xs">
                                <thead className="bg-slate-50 border-b border-slate-200 text-[11px] text-slate-600">
                                  <tr>
                                    <th className="py-2 px-3">Database</th>
                                    <th className="py-2 px-3">Record ID</th>
                                    {fields.map((f) => (
                                      <th key={f.key} className="py-2 px-3">
                                        {f.label}
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {cluster.records.map((rec) => (
                                    <tr key={`${rec.source}:${rec.id}`}>
                                      <td className="py-2 px-3 font-medium text-slate-700 whitespace-nowrap">
                                        {rec.source === 'A' ? dbAName : dbBName} ({rec.source})
                                      </td>
                                      <td className="py-2 px-3 font-mono text-slate-700 whitespace-nowrap">
                                        {rec.id}
                                      </td>
                                      {fields.map((f) => (
                                        <td
                                          key={f.key}
                                          className="py-2 px-3 font-mono text-slate-800 whitespace-nowrap"
                                        >
                                          {rec.fields[f.key] || (
                                            <span className="text-slate-400 italic">
                                              missing
                                            </span>
                                          )}
                                        </td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
