import React, { useMemo, useState } from 'react';
import {
  CheckCheck,
  Database,
  Gauge,
  History,
  Layers,
  PanelRightClose,
  PanelRightOpen,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import type { ActivityCategory, ActivityLogEntry } from '../types/linkage';

interface ActivityLogProps {
  entries: ActivityLogEntry[];
  isOpen: boolean;
  onToggle: () => void;
  onClear: () => void;
}

type CategoryFilter = 'all' | 'calibration' | 'threshold' | 'adjudication' | 'data';

const CATEGORY_META: Record<
  ActivityCategory,
  {
    label: string;
    colorClass: string;
    Icon: typeof SlidersHorizontal;
  }
> = {
  calibration: {
    label: 'EM',
    colorClass: 'text-blue-700',
    Icon: SlidersHorizontal,
  },
  model: {
    label: 'Model',
    colorClass: 'text-indigo-700',
    Icon: SlidersHorizontal,
  },
  threshold: {
    label: 'Cutoff',
    colorClass: 'text-amber-700',
    Icon: Gauge,
  },
  adjudication: {
    label: 'Review',
    colorClass: 'text-emerald-700',
    Icon: CheckCheck,
  },
  blocking: {
    label: 'Blocking',
    colorClass: 'text-slate-700',
    Icon: Layers,
  },
  dataset: {
    label: 'Data',
    colorClass: 'text-slate-700',
    Icon: Database,
  },
};

export const ActivityLog: React.FC<ActivityLogProps> = ({
  entries,
  isOpen,
  onToggle,
  onClear,
}) => {
  const [filter, setFilter] = useState<CategoryFilter>('all');

  const filteredEntries = useMemo(() => {
    if (filter === 'all') return entries;
    if (filter === 'calibration') {
      return entries.filter(
        (e) => e.category === 'calibration' || e.category === 'model'
      );
    }
    if (filter === 'data') {
      return entries.filter(
        (e) => e.category === 'dataset' || e.category === 'blocking'
      );
    }
    return entries.filter((e) => e.category === filter);
  }, [entries, filter]);

  if (!isOpen) {
    return (
      <>
        <aside
          aria-label="Activity Log collapsed sidebar"
          className="print:hidden hidden sm:flex w-11 shrink-0 bg-white border-l border-slate-200 flex-col items-center py-3 gap-4"
        >
          <button
            type="button"
            onClick={onToggle}
            title="Expand Activity Log"
            aria-label="Expand Activity Log"
            className="p-1.5 rounded-md text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
          >
            <PanelRightOpen className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onToggle}
            title="Expand Activity Log"
            className="flex flex-col items-center gap-2 text-slate-500 hover:text-slate-900 transition-colors"
          >
            <History className="w-4 h-4" />
            <span className="font-mono tabular-nums text-[11px] font-medium text-slate-700">
              {entries.length}
            </span>
            <span
              className="text-[11px] font-medium tracking-wide text-slate-500 select-none"
              style={{ writingMode: 'vertical-rl' }}
            >
              Activity Log
            </span>
          </button>
        </aside>

        <button
          type="button"
          onClick={onToggle}
          className="print:hidden sm:hidden fixed bottom-4 right-4 z-20 inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-md shadow-sm hover:bg-slate-50"
        >
          <History className="w-3.5 h-3.5 text-blue-700" />
          <span>Activity</span>
          <span className="font-mono tabular-nums text-slate-500">
            ({entries.length})
          </span>
        </button>
      </>
    );
  }

  return (
    <>
      <div
        onClick={onToggle}
        className="print:hidden fixed inset-0 top-14 z-10 bg-slate-900/15 xl:hidden"
        aria-hidden="true"
      />
      <aside
        aria-label="Activity Log"
        className="print:hidden fixed inset-y-14 right-0 z-20 w-80 xl:static xl:w-80 shrink-0 bg-white border-l border-slate-200 shadow-lg xl:shadow-none flex flex-col max-h-[calc(100vh-3.5rem)] xl:sticky xl:top-14"
      >
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <History className="w-4 h-4 text-slate-700 shrink-0" />
            <h2 className="text-xs font-semibold text-slate-900 whitespace-nowrap">
              Activity Log
            </h2>
            <span className="font-mono tabular-nums text-[11px] text-slate-500">
              {filteredEntries.length}
              {filter !== 'all' ? `/${entries.length}` : ''}
            </span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {entries.length > 0 && (
              <button
                type="button"
                onClick={onClear}
                title="Clear activity log"
                aria-label="Clear activity log"
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-600 hover:text-red-700 hover:bg-slate-100 rounded transition-colors whitespace-nowrap"
              >
                <Trash2 className="w-3 h-3" />
                <span>Clear</span>
              </button>
            )}
            <button
              type="button"
              onClick={onToggle}
              title="Collapse Activity Log"
              aria-label="Collapse Activity Log"
              className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            >
              <PanelRightClose className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="px-3 py-2 border-b border-slate-200 bg-slate-50 flex items-center gap-1 overflow-x-auto">
          {(
            [
              ['all', 'All'],
              ['calibration', 'EM'],
              ['threshold', 'Cutoffs'],
              ['adjudication', 'Review'],
              ['data', 'Data'],
            ] as Array<[CategoryFilter, string]>
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                filter === key
                  ? 'bg-white text-slate-900 border border-slate-200 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {filteredEntries.length === 0 ? (
            <div className="px-4 py-10 text-center text-xs text-slate-500">
              {entries.length === 0
                ? 'No activity recorded in this session yet.'
                : 'No activity entries match this filter.'}
            </div>
          ) : (
            filteredEntries.map((entry) => {
              const meta = CATEGORY_META[entry.category];
              const Icon = meta.Icon;
              return (
                <div
                  key={entry.id}
                  className="px-4 py-3 hover:bg-slate-50/80 transition-colors"
                >
                  <div className="flex items-start gap-2.5">
                    <Icon
                      className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${meta.colorClass}`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-xs font-medium text-slate-900 truncate">
                          {entry.title}
                        </span>
                        <span className="font-mono tabular-nums text-[10px] text-slate-400 shrink-0">
                          {entry.timestamp}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-slate-600 leading-relaxed break-words">
                        {entry.detail}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>
    </>
  );
};
