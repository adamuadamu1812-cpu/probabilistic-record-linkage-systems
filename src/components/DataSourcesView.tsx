import React, { useMemo, useState } from 'react';
import { Mail, Plus, Search, Trash2, Upload } from 'lucide-react';
import { BENCHMARK_PRESETS } from '../data/benchmarkDatasets';
import type { DatabaseRecord, DatasetPreset, FieldSchema } from '../types/linkage';
import { parseCSVRecords } from '../engine/fellegiSunter';

interface DataSourcesViewProps {
  activePresetId: string;
  dbAName: string;
  dbBName: string;
  recordsA: DatabaseRecord[];
  recordsB: DatabaseRecord[];
  fields: FieldSchema[];
  onSelectPreset: (preset: DatasetPreset) => void;
  onGenerateSynthetic: (opts: { sizePerDb: number; overlapRate: number; noiseRate: number }) => void;
  onUploadCSV: (
    source: 'A' | 'B',
    records: DatabaseRecord[],
    columns: string[],
    fileName: string
  ) => void;
  onAddRecord: (source: 'A' | 'B', record: DatabaseRecord) => void;
  onRemoveRecord: (source: 'A' | 'B', id: string) => void;
  onOpenGmailImport?: () => void;
}

export const DataSourcesView: React.FC<DataSourcesViewProps> = ({
  activePresetId,
  dbAName,
  dbBName,
  recordsA,
  recordsB,
  fields,
  onSelectPreset,
  onGenerateSynthetic,
  onUploadCSV,
  onAddRecord,
  onRemoveRecord,
  onOpenGmailImport,
}) => {
  const [inspectSource, setInspectSource] = useState<'A' | 'B'>('A');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSyntheticPanel, setShowSyntheticPanel] = useState(false);
  const [synSize, setSynSize] = useState(80);
  const [synOverlap, setSynOverlap] = useState(0.55);
  const [synNoise, setSynNoise] = useState(0.35);

  const [showAddForm, setShowAddForm] = useState(false);
  const [draftFields, setDraftFields] = useState<Record<string, string>>({});
  const [uploadError, setUploadError] = useState<string | null>(null);

  const activeRecords = inspectSource === 'A' ? recordsA : recordsB;

  const filteredRecords = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return activeRecords;
    return activeRecords.filter(
      (r) =>
        r.id.toLowerCase().includes(q) ||
        Object.values(r.fields).some((v) => v.toLowerCase().includes(q))
    );
  }, [activeRecords, searchQuery]);

  const dataQualityStats = useMemo(() => {
    const totalA = recordsA.length;
    const totalB = recordsB.length;
    let totalMissingCellsA = 0;
    let totalMissingCellsB = 0;

    const rows = fields.map((f) => {
      let missingA = 0;
      for (const r of recordsA) {
        if (!(r.fields[f.key] ?? '').trim()) missingA += 1;
      }
      let missingB = 0;
      for (const r of recordsB) {
        if (!(r.fields[f.key] ?? '').trim()) missingB += 1;
      }

      totalMissingCellsA += missingA;
      totalMissingCellsB += missingB;

      const pctA = totalA > 0 ? (missingA / totalA) * 100 : 0;
      const pctB = totalB > 0 ? (missingB / totalB) * 100 : 0;
      const combinedTotal = totalA + totalB;
      const combinedCompleteness =
        combinedTotal > 0
          ? ((combinedTotal - (missingA + missingB)) / combinedTotal) * 100
          : 100;

      return {
        key: f.key,
        label: f.label,
        missingA,
        pctA,
        missingB,
        pctB,
        combinedCompleteness,
      };
    });

    const totalCells = (totalA + totalB) * Math.max(1, fields.length);
    const overallCompleteness =
      totalA + totalB > 0 && fields.length > 0
        ? ((totalCells - (totalMissingCellsA + totalMissingCellsB)) / totalCells) * 100
        : 100;

    return {
      rows,
      totalA,
      totalB,
      totalMissingCellsA,
      totalMissingCellsB,
      overallCompleteness,
    };
  }, [recordsA, recordsB, fields]);

  const handleFileChange = (source: 'A' | 'B', e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      const parsed = parseCSVRecords(text, source);
      if (parsed.records.length === 0 || parsed.columns.length === 0) {
        setUploadError(
          `Could not parse rows from "${file.name}". Ensure CSV includes a header row and at least one data row.`
        );
        return;
      }
      onUploadCSV(source, parsed.records, parsed.columns, file.name.replace(/\.[^.]+$/, ''));
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleCreateRecord = (e: React.FormEvent) => {
    e.preventDefault();
    const id = `${inspectSource === 'A' ? 'DBA' : 'DBB'}-${Date.now().toString().slice(-4)}`;
    const fieldsCopy: Record<string, string> = {};
    for (const f of fields) {
      fieldsCopy[f.key] = (draftFields[f.key] ?? '').trim();
    }
    onAddRecord(inspectSource, {
      id,
      source: inspectSource,
      fields: fieldsCopy,
    });
    setDraftFields({});
    setShowAddForm(false);
  };

  const cartesianCount = recordsA.length * recordsB.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">
            01. Independent Database Sources
          </h2>
          <p className="mt-1 text-sm text-slate-600 max-w-3xl">
            Select a benchmark pair of independent registries, synthesize a noisy scale test, or upload CSV tables for Database A and Database B.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowSyntheticPanel((v) => !v)}
            className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
          >
            {showSyntheticPanel ? 'Hide Synthetic Generator' : 'Synthetic Scale Benchmark'}
          </button>

          <label className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap shrink-0">
            <Upload className="w-3.5 h-3.5" />
            <span>Import CSV (DB A)</span>
            <input
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(e) => handleFileChange('A', e)}
            />
          </label>

          <label className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap shrink-0">
            <Upload className="w-3.5 h-3.5" />
            <span>Import CSV (DB B)</span>
            <input
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(e) => handleFileChange('B', e)}
            />
          </label>

          {onOpenGmailImport && (
            <button
              type="button"
              onClick={onOpenGmailImport}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 transition-colors whitespace-nowrap shrink-0"
            >
              <Mail className="w-3.5 h-3.5" />
              <span>Import from Gmail</span>
            </button>
          )}
        </div>
      </div>

      {uploadError && (
        <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-800">
          {uploadError}
        </div>
      )}

      {/* Benchmark Preset Selector */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {BENCHMARK_PRESETS.map((preset) => {
          const isSelected = activePresetId === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => onSelectPreset(preset)}
              className={`text-left p-4 rounded-lg border transition-colors ${
                isSelected
                  ? 'bg-white border-blue-600 ring-1 ring-blue-600'
                  : 'bg-white border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="text-xs text-slate-500">
                {preset.domain} · {preset.recordsA.length} × {preset.recordsB.length} records
              </div>
              <div className="mt-1 text-sm font-semibold text-slate-900">
                {preset.name}
              </div>
              <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
                {preset.description}
              </p>
            </button>
          );
        })}
      </div>

      {/* Synthetic Scale Generator */}
      {showSyntheticPanel && (
        <div className="p-5 bg-white border border-slate-200 rounded-lg space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Synthetic Benchmark Generator
              </h3>
              <p className="text-xs text-slate-600">
                Generate two shuffled independent tables with known ground-truth entity IDs, character swaps, date transpositions, and missing identifiers.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                onGenerateSynthetic({
                  sizePerDb: synSize,
                  overlapRate: synOverlap,
                  noiseRate: synNoise,
                });
                setShowSyntheticPanel(false);
              }}
              className="px-4 py-2 text-xs font-medium text-white bg-blue-700 rounded-md hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0"
            >
              Generate {synSize} × {synSize} Dataset
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-2 border-t border-slate-100">
            <div>
              <div className="flex justify-between text-xs text-slate-700 mb-1.5">
                <span>Records per Database</span>
                <span className="font-mono tabular-nums font-medium">{synSize}</span>
              </div>
              <input
                type="range"
                min={30}
                max={250}
                step={10}
                value={synSize}
                onChange={(e) => setSynSize(Number(e.target.value))}
                className="w-full accent-blue-700"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs text-slate-700 mb-1.5">
                <span>Cross-DB Duplicate Overlap</span>
                <span className="font-mono tabular-nums font-medium">
                  {Math.round(synOverlap * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0.1}
                max={0.9}
                step={0.05}
                value={synOverlap}
                onChange={(e) => setSynOverlap(Number(e.target.value))}
                className="w-full accent-blue-700"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs text-slate-700 mb-1.5">
                <span>Field Corruption / Missingness</span>
                <span className="font-mono tabular-nums font-medium">
                  {Math.round(synNoise * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0.05}
                max={0.75}
                step={0.05}
                value={synNoise}
                onChange={(e) => setSynNoise(Number(e.target.value))}
                className="w-full accent-blue-700"
              />
            </div>
          </div>
        </div>
      )}

      {/* Database Inspector */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md w-fit">
            <button
              type="button"
              onClick={() => setInspectSource('A')}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                inspectSource === 'A'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Database A: {dbAName} ({recordsA.length})
            </button>
            <button
              type="button"
              onClick={() => setInspectSource('B')}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                inspectSource === 'B'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Database B: {dbBName} ({recordsB.length})
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs text-slate-500 font-mono tabular-nums">
              Cartesian Space: {cartesianCount.toLocaleString()} pairs
            </span>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter records..."
                className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-md bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
            </div>

            <button
              type="button"
              onClick={() => setShowAddForm((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Record</span>
            </button>
          </div>
        </div>

        {showAddForm && (
          <form
            onSubmit={handleCreateRecord}
            className="p-4 bg-slate-50 border-b border-slate-200 space-y-3"
          >
            <div className="text-xs font-semibold text-slate-800">
              Insert New Record into Database {inspectSource} ({inspectSource === 'A' ? dbAName : dbBName})
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
              {fields.map((f) => (
                <div key={f.key}>
                  <label className="block text-[11px] text-slate-600 mb-1">
                    {f.label}
                  </label>
                  <input
                    type="text"
                    value={draftFields[f.key] ?? ''}
                    onChange={(e) =>
                      setDraftFields((prev) => ({ ...prev, [f.key]: e.target.value }))
                    }
                    className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white text-slate-900 focus:outline-none focus:border-blue-600"
                  />
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="submit"
                className="px-3 py-1.5 text-xs font-medium text-white bg-blue-700 rounded hover:bg-blue-800 transition-colors"
              >
                Save to Database {inspectSource}
              </button>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        <div className="overflow-x-auto max-h-[420px]">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200">
              <tr className="text-[11px] font-semibold text-slate-600">
                <th className="py-2.5 px-3 whitespace-nowrap">Record ID</th>
                {fields.map((f) => (
                  <th key={f.key} className="py-2.5 px-3 whitespace-nowrap">
                    {f.label}
                  </th>
                ))}
                <th className="py-2.5 px-3 text-right whitespace-nowrap">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td
                    colSpan={fields.length + 2}
                    className="py-10 text-center text-slate-500"
                  >
                    No matching records found in Database {inspectSource}.
                  </td>
                </tr>
              ) : (
                filteredRecords.slice(0, 100).map((rec) => (
                  <tr key={rec.id} className="hover:bg-slate-50/80 h-10">
                    <td className="py-2 px-3 font-mono text-slate-700 whitespace-nowrap tabular-nums">
                      {rec.id}
                    </td>
                    {fields.map((f) => {
                      const val = rec.fields[f.key] ?? '';
                      return (
                        <td
                          key={f.key}
                          className="py-2 px-3 text-slate-800 whitespace-nowrap max-w-[200px] truncate"
                          title={val}
                        >
                          {val ? (
                            val
                          ) : (
                            <span className="text-slate-400 italic">missing</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="py-2 px-3 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => onRemoveRecord(inspectSource, rec.id)}
                        className="p-1 text-slate-400 hover:text-red-600 transition-colors"
                        title={`Remove ${rec.id}`}
                        aria-label={`Remove ${rec.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {filteredRecords.length > 100 && (
          <div className="px-4 py-2 bg-slate-50 border-t border-slate-200 text-xs text-slate-500 tabular-nums">
            Showing first 100 of {filteredRecords.length} records.
          </div>
        )}
      </div>

      {/* Data Quality Summary Panel */}
      <section
        aria-label="Data Quality Summary"
        className="bg-white border border-slate-200 rounded-lg overflow-hidden"
      >
        <div className="px-4 py-3 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Data Quality
            </h3>
            <p className="text-xs text-slate-500">
              Missing value percentages per attribute across Source A ({dbAName}) and Source B ({dbBName})
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs font-mono tabular-nums text-slate-600">
            <span>
              Overall Completeness:{' '}
              <strong className="text-slate-900">
                {dataQualityStats.overallCompleteness.toFixed(1)}%
              </strong>
            </span>
            <span>
              Missing Cells: A {dataQualityStats.totalMissingCellsA} · B{' '}
              {dataQualityStats.totalMissingCellsB}
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
              <tr>
                <th className="py-2.5 px-4">Column</th>
                <th className="py-2.5 px-4 text-right">
                  Source A Missing ({dataQualityStats.totalA})
                </th>
                <th className="py-2.5 px-4 w-40">Source A Missing %</th>
                <th className="py-2.5 px-4 text-right">
                  Source B Missing ({dataQualityStats.totalB})
                </th>
                <th className="py-2.5 px-4 w-40">Source B Missing %</th>
                <th className="py-2.5 px-4 text-right">Combined Completeness</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {dataQualityStats.rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    No columns available to assess data quality.
                  </td>
                </tr>
              ) : (
                dataQualityStats.rows.map((row) => {
                  const colorForPct = (pct: number) =>
                    pct >= 30
                      ? { text: 'text-red-700', bar: 'bg-red-600' }
                      : pct > 0
                        ? { text: 'text-amber-700', bar: 'bg-amber-600' }
                        : { text: 'text-emerald-700', bar: 'bg-emerald-600' };

                  const styleA = colorForPct(row.pctA);
                  const styleB = colorForPct(row.pctB);

                  return (
                    <tr key={row.key} className="hover:bg-slate-50/70 h-10">
                      <td className="py-2 px-4 whitespace-nowrap">
                        <span className="font-medium text-slate-900">{row.label}</span>
                        <span className="ml-2 font-mono text-[11px] text-slate-400">
                          {row.key}
                        </span>
                      </td>
                      <td className="py-2 px-4 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                        {row.missingA} / {dataQualityStats.totalA}
                      </td>
                      <td className="py-2 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${styleA.bar}`}
                              style={{ width: `${Math.min(100, row.pctA)}%` }}
                            />
                          </div>
                          <span
                            className={`w-12 text-right font-mono tabular-nums font-medium ${styleA.text}`}
                          >
                            {row.pctA.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                      <td className="py-2 px-4 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                        {row.missingB} / {dataQualityStats.totalB}
                      </td>
                      <td className="py-2 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${styleB.bar}`}
                              style={{ width: `${Math.min(100, row.pctB)}%` }}
                            />
                          </div>
                          <span
                            className={`w-12 text-right font-mono tabular-nums font-medium ${styleB.text}`}
                          >
                            {row.pctB.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                      <td className="py-2 px-4 text-right font-mono tabular-nums font-medium text-slate-900 whitespace-nowrap">
                        {row.combinedCompleteness.toFixed(1)}%
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
