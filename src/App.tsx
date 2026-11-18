import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import {
  Database,
  FileCheck2,
  GitCompare,
  Layers,
  LogIn,
  Menu,
  SlidersHorizontal,
  User as UserIcon,
  UserPlus,
  X,
} from 'lucide-react';
import {
  BENCHMARK_PRESETS,
  generateSyntheticDataset,
} from './data/benchmarkDatasets';
import {
  buildEntityClusters,
  computeFieldWeights,
  evaluateLinkage,
  extractComparisonVectors,
  exportCombinedResultsCSV,
  generateCandidatePairs,
  runExpectationMaximization,
  scoreAndClassifyPairs,
} from './engine/fellegiSunter';
import type {
  ActivityCategory,
  ActivityLogEntry,
  BlockingRule,
  ComparatorType,
  DatabaseRecord,
  DatasetPreset,
  EMResult,
  FieldSchema,
  LearnedFieldParams,
  LinkageDecision,
} from './types/linkage';
import { DataSourcesView } from './components/DataSourcesView';
import { BlockingView } from './components/BlockingView';
import { ModelWeightsView } from './components/ModelWeightsView';
import { ClericalReviewView } from './components/ClericalReviewView';
import { ResultsExportView } from './components/ResultsExportView';
import { ActivityLog } from './components/ActivityLog';
import { AuthModal, type AuthModalMode } from './components/AuthModal';
import { AccountModal } from './components/AccountModal';
import { GmailImportModal, GmailShareModal } from './components/GmailModals';
import {
  auth,
  clearCachedGmailAccessToken,
  deleteWorkspaceSnapshot,
  getCachedGmailAccessToken,
  saveWorkspaceSnapshot,
  signInWithGooglePopup,
  signOutAccount,
  subscribeGmailAccessToken,
  subscribeUserWorkspaces,
  syncUserAccount,
  updateUserProfile,
  type SavedWorkspaceRecord,
  type UserPrivateRecord,
  type UserProfileRecord,
} from './lib/firebase';

type StageKey = 'sources' | 'blocking' | 'model' | 'review' | 'results';

const STAGE_ORDER: StageKey[] = ['sources', 'blocking', 'model', 'review', 'results'];

function formatActivityTime(): string {
  return new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function buildInitialFieldParams(fields: FieldSchema[]): Record<string, LearnedFieldParams> {
  const out: Record<string, LearnedFieldParams> = {};
  for (const f of fields) {
    out[f.key] = computeFieldWeights({
      mAgree: f.mAgree,
      uAgree: f.uAgree,
      mPartial: f.mPartial,
      uPartial: f.uPartial,
    });
  }
  return out;
}

function inferComparator(colName: string): ComparatorType {
  const lower = colName.toLowerCase();
  if (/dob|birth|date/.test(lower)) return 'date_tolerance';
  if (/address|street|addr|location/.test(lower)) return 'token_jaccard';
  if (/gender|sex|_id$|^id$|ssn|tin/.test(lower)) return 'exact';
  if (/zip|postal|code|phone/.test(lower)) return 'levenshtein';
  return 'jaro_winkler';
}

function inferFieldSchema(columns: string[]): FieldSchema[] {
  return columns.map((col) => {
    const comparator = inferComparator(col);
    const label = col
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, (ch) => ch.toUpperCase());
    return {
      key: col,
      label,
      comparator,
      agreeThreshold: comparator === 'token_jaccard' ? 0.85 : 0.92,
      partialThreshold: comparator === 'token_jaccard' ? 0.6 : 0.78,
      mAgree: 0.9,
      uAgree: comparator === 'exact' ? 0.05 : 0.02,
      mPartial: 0.06,
      uPartial: 0.05,
      enabled: true,
    };
  });
}

export default function App() {
  const initialPreset = BENCHMARK_PRESETS[0];

  const [activeStage, setActiveStage] = useState<StageKey>('model');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [activePresetId, setActivePresetId] = useState<string>(initialPreset.id);
  const [dbAName, setDbAName] = useState<string>(initialPreset.dbAName);
  const [dbBName, setDbBName] = useState<string>(initialPreset.dbBName);
  const [recordsA, setRecordsA] = useState<DatabaseRecord[]>(initialPreset.recordsA);
  const [recordsB, setRecordsB] = useState<DatabaseRecord[]>(initialPreset.recordsB);
  const [fields, setFields] = useState<FieldSchema[]>(initialPreset.fields);
  const [blockingRules, setBlockingRules] = useState<BlockingRule[]>(
    initialPreset.blockingRules
  );

  const [emResult, setEmResult] = useState<EMResult | null>(null);
  const [customLearnedParams, setCustomLearnedParams] = useState<Record<
    string,
    LearnedFieldParams
  > | null>(null);
  const [priorMatch, setPriorMatch] = useState<number>(0.25);

  const [lowerThreshold, setLowerThreshold] = useState<number>(4.5);
  const [upperThreshold, setUpperThreshold] = useState<number>(11.0);
  const [enforceOneToOne, setEnforceOneToOne] = useState<boolean>(true);
  const [humanDecisions, setHumanDecisions] = useState<
    Record<string, LinkageDecision>
  >({});

  const [activityLogOpen, setActivityLogOpen] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1280 : true
  );
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>(() => [
    {
      id: `act_init_${Date.now()}`,
      timestamp: formatActivityTime(),
      category: 'dataset',
      title: 'Workspace Initialized',
      detail: `${initialPreset.name} (${initialPreset.recordsA.length}×${initialPreset.recordsB.length} records)`,
    },
  ]);
  const activitySeqRef = useRef(0);
  const thresholdTimerRef = useRef<number | null>(null);
  const pendingThresholdOriginRef = useRef<{ lower: number; upper: number } | null>(
    null
  );

  // Firebase Auth & Account state
  const [authReady, setAuthReady] = useState(false);
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfileRecord | null>(null);
  const [userPrivateInfo, setUserPrivateInfo] = useState<UserPrivateRecord | null>(
    null
  );
  const [savedSnapshots, setSavedSnapshots] = useState<SavedWorkspaceRecord[]>([]);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<AuthModalMode>('login');
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [gmailImportOpen, setGmailImportOpen] = useState(false);
  const [gmailShareOpen, setGmailShareOpen] = useState(false);
  const [gmailAccessToken, setGmailAccessToken] = useState<string | null>(() =>
    getCachedGmailAccessToken()
  );
  const [renderError, setRenderError] = useState<Error | null>(null);
  const syncedUidRef = useRef<string | null>(null);
  const modalOpenRef = useRef(false);
  modalOpenRef.current =
    authModalOpen || accountModalOpen || gmailImportOpen || gmailShareOpen;

  const appendActivity = useCallback(
    (category: ActivityCategory, title: string, detail: string) => {
      activitySeqRef.current += 1;
      const entry: ActivityLogEntry = {
        id: `act_${Date.now()}_${activitySeqRef.current}`,
        timestamp: formatActivityTime(),
        category,
        title,
        detail,
      };
      setActivityLog((prev) => [entry, ...prev].slice(0, 120));
    },
    []
  );

  useEffect(() => {
    const unsubToken = subscribeGmailAccessToken(setGmailAccessToken);
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      setAuthReady(true);
      if (!user) {
        clearCachedGmailAccessToken();
        syncedUidRef.current = null;
        setUserProfile(null);
        setUserPrivateInfo(null);
        setSavedSnapshots([]);
        return;
      }

      if (syncedUidRef.current !== user.uid) {
        try {
          const res = await syncUserAccount(user);
          syncedUidRef.current = user.uid;
          setUserProfile(res.profile);
          setUserPrivateInfo(res.privateInfo);
        } catch (err) {
          setRenderError(err instanceof Error ? err : new Error(String(err)));
        }
      }
    });
    return () => {
      unsubscribe();
      unsubToken();
    };
  }, []);

  useEffect(() => {
    if (!authReady || !currentUser) return;
    const unsubscribe = subscribeUserWorkspaces(currentUser.uid, (items) => {
      setSavedSnapshots(items);
    });
    return () => unsubscribe();
  }, [authReady, currentUser]);

  useEffect(() => {
    return () => {
      if (thresholdTimerRef.current !== null) {
        window.clearTimeout(thresholdTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (modalOpenRef.current) return;
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

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        setActiveStage((prev) => {
          const idx = STAGE_ORDER.indexOf(prev);
          return STAGE_ORDER[(idx + 1) % STAGE_ORDER.length];
        });
        setMobileNavOpen(false);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setActiveStage((prev) => {
          const idx = STAGE_ORDER.indexOf(prev);
          return STAGE_ORDER[(idx - 1 + STAGE_ORDER.length) % STAGE_ORDER.length];
        });
        setMobileNavOpen(false);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  // Stage 1 -> 2: Multi-pass Blocking
  const blockingOutput = useMemo(
    () => generateCandidatePairs(recordsA, recordsB, blockingRules),
    [recordsA, recordsB, blockingRules]
  );

  // Stage 2 -> 3: Extract comparison vectors
  const comparisonVectors = useMemo(
    () => extractComparisonVectors(blockingOutput.candidateMap, fields),
    [blockingOutput.candidateMap, fields]
  );

  // Active parameter table (either EM-learned or derived from field priors)
  const effectiveFieldParams = useMemo(() => {
    if (customLearnedParams) return customLearnedParams;
    return buildInitialFieldParams(fields);
  }, [customLearnedParams, fields]);

  // Stage 3 -> 4: Score and classify candidate pairs
  const scoredPairs = useMemo(
    () =>
      scoreAndClassifyPairs(
        comparisonVectors,
        fields,
        effectiveFieldParams,
        priorMatch,
        upperThreshold,
        lowerThreshold,
        humanDecisions,
        enforceOneToOne
      ),
    [
      comparisonVectors,
      fields,
      effectiveFieldParams,
      priorMatch,
      upperThreshold,
      lowerThreshold,
      humanDecisions,
      enforceOneToOne,
    ]
  );

  // Stage 5: Evaluation & Cluster Resolution
  const evaluation = useMemo(
    () => evaluateLinkage(recordsA, recordsB, scoredPairs),
    [recordsA, recordsB, scoredPairs]
  );

  const entityClusters = useMemo(
    () => buildEntityClusters(scoredPairs, fields),
    [scoredPairs, fields]
  );

  const clericalCount = useMemo(
    () => scoredPairs.filter((p) => p.finalDecision === 'clerical').length,
    [scoredPairs]
  );

  const matchCount = useMemo(
    () => scoredPairs.filter((p) => p.finalDecision === 'match').length,
    [scoredPairs]
  );

  // Handlers
  const handleSelectPreset = (preset: DatasetPreset) => {
    setActivePresetId(preset.id);
    setDbAName(preset.dbAName);
    setDbBName(preset.dbBName);
    setRecordsA(preset.recordsA);
    setRecordsB(preset.recordsB);
    setFields(preset.fields);
    setBlockingRules(preset.blockingRules);
    setEmResult(null);
    setCustomLearnedParams(null);
    setPriorMatch(0.25);
    setHumanDecisions({});
    appendActivity(
      'dataset',
      'Loaded Preset Dataset',
      `${preset.name} (${preset.recordsA.length}×${preset.recordsB.length} records)`
    );
  };

  const handleGenerateSynthetic = (opts: {
    sizePerDb: number;
    overlapRate: number;
    noiseRate: number;
  }) => {
    const syn = generateSyntheticDataset(opts);
    setActivePresetId('synthetic');
    setDbAName(`Synthetic Registry A (${opts.sizePerDb})`);
    setDbBName(`Synthetic Registry B (${opts.sizePerDb})`);
    setRecordsA(syn.recordsA);
    setRecordsB(syn.recordsB);
    setFields(syn.fields);
    setBlockingRules(syn.blockingRules);
    setEmResult(null);
    setCustomLearnedParams(null);
    setPriorMatch(opts.overlapRate);
    setHumanDecisions({});
    appendActivity(
      'dataset',
      'Generated Synthetic Dataset',
      `${opts.sizePerDb}×${opts.sizePerDb} records · ${(opts.overlapRate * 100).toFixed(0)}% overlap · ${(opts.noiseRate * 100).toFixed(0)}% noise`
    );
  };

  const handleUploadCSV = (
    source: 'A' | 'B',
    newRecords: DatabaseRecord[],
    columns: string[],
    fileName: string
  ) => {
    setActivePresetId('custom-csv');
    if (source === 'A') {
      setDbAName(fileName);
      setRecordsA(newRecords);
    } else {
      setDbBName(fileName);
      setRecordsB(newRecords);
    }

    const otherCols = Object.keys(
      (source === 'A' ? recordsB[0]?.fields : recordsA[0]?.fields) ?? {}
    );
    const sharedCols =
      otherCols.length > 0
        ? columns.filter((c) => otherCols.includes(c))
        : columns;
    const colsToUse = sharedCols.length > 0 ? sharedCols : columns;

    const currentFieldKeys = fields.map((f) => f.key);
    const schemaChanged =
      colsToUse.length !== currentFieldKeys.length ||
      colsToUse.some((c, i) => c !== currentFieldKeys[i]);

    if (schemaChanged) {
      const nextFields = inferFieldSchema(colsToUse);
      setFields(nextFields);
      const firstKey = nextFields[0]?.key;
      const secondKey = nextFields[1]?.key;
      const nextRules: BlockingRule[] = [];
      if (secondKey) {
        nextRules.push({
          id: 'blk_auto_1',
          label: `Prefix(3)(${secondKey})`,
          keyParts: [{ field: secondKey, transform: 'prefix_3' }],
          enabled: true,
        });
      }
      if (firstKey) {
        nextRules.push({
          id: 'blk_auto_2',
          label: `Prefix(3)(${firstKey})`,
          keyParts: [{ field: firstKey, transform: 'prefix_3' }],
          enabled: true,
        });
      }
      setBlockingRules(nextRules);
    }

    setEmResult(null);
    setCustomLearnedParams(null);
    setHumanDecisions({});
    appendActivity(
      'dataset',
      `Imported CSV Source ${source}`,
      `${fileName} (${newRecords.length} rows, ${colsToUse.length} columns)`
    );
  };

  const handleAddRecord = (source: 'A' | 'B', record: DatabaseRecord) => {
    if (source === 'A') setRecordsA((prev) => [record, ...prev]);
    else setRecordsB((prev) => [record, ...prev]);
    appendActivity('dataset', `Added Record (${source})`, `Record ID ${record.id}`);
  };

  const handleRemoveRecord = (source: 'A' | 'B', id: string) => {
    if (source === 'A') setRecordsA((prev) => prev.filter((r) => r.id !== id));
    else setRecordsB((prev) => prev.filter((r) => r.id !== id));
    appendActivity('dataset', `Removed Record (${source})`, `Record ID ${id}`);
  };

  const handleToggleRule = (ruleId: string) => {
    const targetRule = blockingRules.find((r) => r.id === ruleId);
    setBlockingRules((prev) =>
      prev.map((r) => (r.id === ruleId ? { ...r, enabled: !r.enabled } : r))
    );
    if (targetRule) {
      appendActivity(
        'blocking',
        targetRule.enabled ? 'Disabled Blocking Pass' : 'Enabled Blocking Pass',
        targetRule.label
      );
    }
  };

  const handleAddRule = (rule: BlockingRule) => {
    setBlockingRules((prev) => [...prev, rule]);
    appendActivity('blocking', 'Added Blocking Pass', rule.label);
  };

  const handleRemoveRule = (ruleId: string) => {
    const targetRule = blockingRules.find((r) => r.id === ruleId);
    setBlockingRules((prev) => prev.filter((r) => r.id !== ruleId));
    if (targetRule) {
      appendActivity('blocking', 'Removed Blocking Pass', targetRule.label);
    }
  };

  const handleUpdateField = (key: string, patch: Partial<FieldSchema>) => {
    const existing = fields.find((f) => f.key === key);
    setFields((prev) => prev.map((f) => (f.key === key ? { ...f, ...patch } : f)));
    if (existing) {
      if (patch.enabled !== undefined && patch.enabled !== existing.enabled) {
        appendActivity(
          'model',
          patch.enabled ? 'Enabled Linkage Field' : 'Disabled Linkage Field',
          existing.label
        );
      } else if (
        patch.comparator !== undefined &&
        patch.comparator !== existing.comparator
      ) {
        appendActivity(
          'model',
          'Updated Field Comparator',
          `${existing.label}: ${existing.comparator} → ${patch.comparator}`
        );
      }
    }
  };

  const handleRunEM = () => {
    const res = runExpectationMaximization(comparisonVectors, fields);
    setEmResult(res);
    setCustomLearnedParams(res.fieldParams);
    setPriorMatch(res.priorMatch);
    appendActivity(
      'calibration',
      'EM Model Calibrated',
      `${res.iterations} iter (${res.converged ? 'converged' : 'max iter'}) · π_M = ${(res.priorMatch * 100).toFixed(1)}% · ${comparisonVectors.length} pairs`
    );
  };

  const handleResetManualParams = () => {
    setEmResult(null);
    setCustomLearnedParams(null);
    setPriorMatch(0.25);
    appendActivity(
      'model',
      'Parameters Reset to Priors',
      'Cleared EM-learned weights; restored π_M = 25.0%'
    );
  };

  const handleChangeThresholds = (nextLower: number, nextUpper: number) => {
    if (pendingThresholdOriginRef.current === null) {
      pendingThresholdOriginRef.current = {
        lower: lowerThreshold,
        upper: upperThreshold,
      };
    }
    setLowerThreshold(nextLower);
    setUpperThreshold(nextUpper);

    if (thresholdTimerRef.current !== null) {
      window.clearTimeout(thresholdTimerRef.current);
    }
    thresholdTimerRef.current = window.setTimeout(() => {
      const origin = pendingThresholdOriginRef.current;
      pendingThresholdOriginRef.current = null;
      thresholdTimerRef.current = null;
      if (
        origin &&
        (Math.abs(origin.lower - nextLower) > 1e-6 ||
          Math.abs(origin.upper - nextUpper) > 1e-6)
      ) {
        appendActivity(
          'threshold',
          'Decision Thresholds Adjusted',
          `T_λ ${origin.lower.toFixed(1)} → ${nextLower.toFixed(1)} · T_μ ${origin.upper.toFixed(1)} → ${nextUpper.toFixed(1)}`
        );
      }
    }, 450);
  };

  const handleToggleOneToOne = (enabled: boolean) => {
    setEnforceOneToOne(enabled);
    appendActivity(
      'model',
      enabled ? '1-to-1 Constraint Enabled' : '1-to-1 Constraint Disabled',
      enabled
        ? 'Enforcing greedy bipartite match uniqueness'
        : 'Allowing many-to-many candidate matches'
    );
  };

  const handleAdjudicate = (pairId: string, decision: LinkageDecision | null) => {
    setHumanDecisions((prev) => {
      const next = { ...prev };
      if (decision === null) delete next[pairId];
      else next[pairId] = decision;
      return next;
    });
    const labelMap: Record<LinkageDecision, string> = {
      match: 'Match',
      non_match: 'Non-Match',
      clerical: 'Possible Match',
    };
    appendActivity(
      'adjudication',
      decision === null ? 'Reverted Pair Decision' : 'Pair Adjudicated',
      `${pairId} → ${decision === null ? 'Model Default' : labelMap[decision]}`
    );
  };

  const handleBulkAdjudicate = (
    pairIds: string[],
    decision: LinkageDecision | null
  ) => {
    if (pairIds.length === 0) return;
    setHumanDecisions((prev) => {
      const next = { ...prev };
      for (const id of pairIds) {
        if (decision === null) delete next[id];
        else next[id] = decision;
      }
      return next;
    });
    const titleMap: Record<LinkageDecision, string> = {
      match: 'Bulk Marked Match',
      non_match: 'Bulk Marked Non-Match',
      clerical: 'Bulk Marked Possible Match',
    };
    appendActivity(
      'adjudication',
      decision === null ? 'Bulk Reverted to Model' : titleMap[decision],
      `${pairIds.length} candidate pair${pairIds.length === 1 ? '' : 's'} updated`
    );
  };

  const openAuthModal = (mode: AuthModalMode) => {
    setAuthModalMode(mode);
    setAuthError(null);
    setAuthModalOpen(true);
  };

  const handleAuthenticate = async (
    mode: AuthModalMode,
    metadata?: { displayName?: string; roleLabel?: string }
  ) => {
    setAuthSubmitting(true);
    setAuthError(null);
    try {
      const user = await signInWithGooglePopup();
      const res = await syncUserAccount(
        user,
        mode === 'signup' ? metadata : undefined
      );
      syncedUidRef.current = user.uid;
      setUserProfile(res.profile);
      setUserPrivateInfo(res.privateInfo);
      setAuthModalOpen(false);
      appendActivity(
        'dataset',
        res.isNewUser || mode === 'signup' ? 'Account Signed Up' : 'Account Logged In',
        `${res.profile.displayName}${res.privateInfo?.email ? ` (${res.privateInfo.email})` : ''}`
      );
    } catch (err) {
      const code =
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code?: unknown }).code)
          : '';
      if (code === 'auth/popup-closed-by-user') {
        setAuthError('Sign-in popup was closed before completing authentication.');
      } else if (code === 'auth/popup-blocked') {
        setAuthError(
          'Browser blocked the sign-in popup. Please allow popups for this site and retry.'
        );
      } else {
        setAuthError(
          err instanceof Error ? err.message : 'Authentication failed. Please retry.'
        );
      }
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    const label = userProfile?.displayName || currentUser?.email || 'Account';
    await signOutAccount();
    setAccountModalOpen(false);
    appendActivity('dataset', 'Account Logged Out', label);
  };

  const handleUpdateProfile = async (displayName: string, roleLabel?: string) => {
    if (!currentUser) return;
    const updated = await updateUserProfile(currentUser.uid, displayName, roleLabel);
    setUserProfile(updated);
    appendActivity('dataset', 'Updated Analyst Profile', updated.displayName);
  };

  const handleSaveSnapshot = async (name: string) => {
    if (!currentUser) return;
    await saveWorkspaceSnapshot(currentUser.uid, {
      name,
      presetId: activePresetId,
      dbAName,
      dbBName,
      lowerThreshold,
      upperThreshold,
      priorMatch,
      enforceOneToOne,
      matchCount,
      clericalCount,
    });
    appendActivity(
      'model',
      'Saved Calibration Snapshot',
      `${name} (T_λ ${lowerThreshold.toFixed(1)}, T_μ ${upperThreshold.toFixed(1)})`
    );
  };

  const handleLoadSnapshot = (snap: SavedWorkspaceRecord) => {
    const matchedPreset = BENCHMARK_PRESETS.find((p) => p.id === snap.presetId);
    if (matchedPreset && matchedPreset.id !== activePresetId) {
      setActivePresetId(matchedPreset.id);
      setDbAName(matchedPreset.dbAName);
      setDbBName(matchedPreset.dbBName);
      setRecordsA(matchedPreset.recordsA);
      setRecordsB(matchedPreset.recordsB);
      setFields(matchedPreset.fields);
      setBlockingRules(matchedPreset.blockingRules);
      setEmResult(null);
      setCustomLearnedParams(null);
      setHumanDecisions({});
    }
    setLowerThreshold(snap.lowerThreshold);
    setUpperThreshold(snap.upperThreshold);
    setPriorMatch(snap.priorMatch);
    setEnforceOneToOne(snap.enforceOneToOne);
    setAccountModalOpen(false);
    setActiveStage('model');
    appendActivity(
      'model',
      'Applied Saved Snapshot',
      `${snap.name} (T_λ ${snap.lowerThreshold.toFixed(1)}, T_μ ${snap.upperThreshold.toFixed(1)})`
    );
  };

  const handleDeleteSnapshot = async (workspaceId: string) => {
    if (!currentUser) return;
    await deleteWorkspaceSnapshot(currentUser.uid, workspaceId);
    appendActivity('model', 'Deleted Calibration Snapshot', workspaceId);
  };

  const handleAuthorizeGoogleForGmail = async () => {
    const user = await signInWithGooglePopup();
    const res = await syncUserAccount(user);
    syncedUidRef.current = user.uid;
    setUserProfile(res.profile);
    setUserPrivateInfo(res.privateInfo);
    appendActivity(
      'dataset',
      'Authorized Gmail Integration',
      res.privateInfo?.email || res.profile.displayName
    );
  };

  const gmailReportBody = useMemo(() => {
    const lines = [
      'Probabilistic Record Linkage Summary Report',
      '==========================================',
      `Database A: ${dbAName} (${recordsA.length} records)`,
      `Database B: ${dbBName} (${recordsB.length} records)`,
      `Candidate Pairs Evaluated: ${scoredPairs.length}`,
      `Resolved Entity Clusters: ${entityClusters.length}`,
      `Linked Duplicate Pairs (Match): ${matchCount}`,
      `Possible Match Pairs: ${clericalCount}`,
      `Thresholds: T_lambda = ${lowerThreshold.toFixed(1)}, T_mu = ${upperThreshold.toFixed(1)}`,
      `Match Prior (pi_M): ${(priorMatch * 100).toFixed(1)}%`,
      `1-to-1 Constraint: ${enforceOneToOne ? 'Enabled' : 'Disabled'}`,
    ];
    if (evaluation.hasGroundTruth) {
      lines.push(
        `Evaluation Metrics: Precision ${(evaluation.precision * 100).toFixed(1)}% | Recall ${(
          evaluation.recall * 100
        ).toFixed(1)}% | F1 ${(evaluation.f1 * 100).toFixed(1)}%`
      );
    }
    return lines.join('\n');
  }, [
    dbAName,
    dbBName,
    recordsA.length,
    recordsB.length,
    scoredPairs.length,
    entityClusters.length,
    matchCount,
    clericalCount,
    lowerThreshold,
    upperThreshold,
    priorMatch,
    enforceOneToOne,
    evaluation,
  ]);

  const gmailAttachmentCsv = useMemo(() => {
    if (!gmailShareOpen) return '';
    return exportCombinedResultsCSV(entityClusters, scoredPairs, fields);
  }, [gmailShareOpen, entityClusters, scoredPairs, fields]);

  if (renderError) {
    throw renderError;
  }

  const navItems: Array<{
    key: StageKey;
    shortLabel: string;
    sidebarLabel: string;
    count: string;
    Icon: typeof Database;
  }> = [
    {
      key: 'sources',
      shortLabel: 'Data Sources',
      sidebarLabel: '01. Data Sources',
      count: `${recordsA.length}×${recordsB.length}`,
      Icon: Database,
    },
    {
      key: 'blocking',
      shortLabel: 'Blocking',
      sidebarLabel: '02. Blocking & Keys',
      count: `${blockingOutput.candidateMap.size}`,
      Icon: Layers,
    },
    {
      key: 'model',
      shortLabel: 'Fellegi-Sunter',
      sidebarLabel: '03. Fellegi-Sunter Model',
      count: `${fields.filter((f) => f.enabled).length} attr`,
      Icon: SlidersHorizontal,
    },
    {
      key: 'review',
      shortLabel: 'Possible Match',
      sidebarLabel: '04. Possible Match Review',
      count: `${clericalCount}`,
      Icon: GitCompare,
    },
    {
      key: 'results',
      shortLabel: 'Entities & Export',
      sidebarLabel: '05. Linked Entities',
      count: `${entityClusters.length}`,
      Icon: FileCheck2,
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Top Bar Contract: Brand wordmark — 5 single-line nav links — 1 primary CTA */}
      <header className="print:hidden sticky top-0 z-30 bg-white border-b border-slate-200 px-6 h-14 flex items-center justify-between gap-8">
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setMobileNavOpen((v) => !v)}
            className="lg:hidden p-1.5 -ml-1.5 text-slate-600 hover:text-slate-900"
            aria-label="Toggle workspace navigation"
          >
            {mobileNavOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setActiveStage('sources');
            }}
            className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            RecordLinkage
          </a>
        </div>

        <nav className="hidden lg:flex items-center gap-7 text-sm font-medium text-slate-600">
          {navItems.map((item) => {
            const isActive = activeStage === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setActiveStage(item.key)}
                className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                  isActive
                    ? 'text-slate-900 border-blue-700'
                    : 'text-slate-600 border-transparent hover:text-slate-900 hover:border-slate-300'
                }`}
              >
                {item.shortLabel}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              handleRunEM();
              setActiveStage('model');
            }}
            className="px-3.5 py-1.5 text-xs font-medium text-white bg-blue-700 rounded-md hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0"
          >
            Calibrate EM Model
          </button>

          {authReady && !currentUser && (
            <>
              <button
                type="button"
                onClick={() => openAuthModal('login')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Log In</span>
              </button>
              <button
                type="button"
                onClick={() => openAuthModal('signup')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 transition-colors whitespace-nowrap shrink-0"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Sign Up</span>
              </button>
            </>
          )}

          {authReady && currentUser && (
            <button
              type="button"
              onClick={() => setAccountModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
            >
              <UserIcon className="w-3.5 h-3.5 text-blue-700 shrink-0" />
              <span className="max-w-[120px] truncate">
                {userProfile?.displayName || currentUser.displayName || 'Account'}
              </span>
              {savedSnapshots.length > 0 && (
                <span className="font-mono tabular-nums text-[11px] text-slate-500">
                  ({savedSnapshots.length})
                </span>
              )}
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        {/* Left Sidebar */}
        <aside
          className={`print:hidden ${
            mobileNavOpen ? 'fixed inset-y-14 left-0 z-20 block' : 'hidden'
          } lg:static lg:block w-64 shrink-0 bg-white border-r border-slate-200 flex flex-col justify-between`}
        >
          <div className="p-4 space-y-6">
            <div>
              <div className="px-2 text-xs font-semibold text-slate-500 mb-2">
                Linkage Pipeline
              </div>
              <div className="space-y-1">
                {navItems.map((item) => {
                  const isActive = activeStage === item.key;
                  const Icon = item.Icon;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => {
                        setActiveStage(item.key);
                        setMobileNavOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2.5 text-xs font-medium rounded-md transition-colors ${
                        isActive
                          ? 'bg-blue-50 text-blue-800'
                          : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                      }`}
                    >
                      <span className="flex items-center gap-2.5 truncate">
                        <Icon className="w-4 h-4 shrink-0" />
                        <span className="truncate">{item.sidebarLabel}</span>
                      </span>
                      <span className="font-mono tabular-nums text-[11px] text-slate-500 ml-2 shrink-0">
                        {item.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 px-2 space-y-2.5 text-xs">
              <div className="font-semibold text-slate-700">Active Databases</div>
              <div className="space-y-1 text-slate-600">
                <div className="flex justify-between gap-2">
                  <span className="truncate">A: {dbAName}</span>
                  <span className="font-mono tabular-nums shrink-0">{recordsA.length}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="truncate">B: {dbBName}</span>
                  <span className="font-mono tabular-nums shrink-0">{recordsB.length}</span>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 space-y-1.5 text-slate-600">
                <div className="flex justify-between">
                  <span>Reduction Ratio</span>
                  <span className="font-mono tabular-nums text-slate-900 font-medium">
                    {(evaluation.reductionRatio * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Linked Matches</span>
                  <span className="font-mono tabular-nums text-emerald-700 font-medium">
                    {matchCount}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Possible Match</span>
                  <span className="font-mono tabular-nums text-amber-700 font-medium">
                    {clericalCount}
                  </span>
                </div>
                {evaluation.hasGroundTruth && (
                  <div className="flex justify-between">
                    <span>F1 Score</span>
                    <span className="font-mono tabular-nums text-blue-700 font-semibold">
                      {(evaluation.f1 * 100).toFixed(1)}%
                    </span>
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-slate-100 text-[11px] text-slate-500">
                <span className="font-mono text-slate-700">← / →</span> Cycle pipeline stages
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 min-w-0 p-6 lg:p-8 print:p-0">
          <div className="max-w-[1280px] mx-auto">
            {activeStage === 'sources' && (
              <DataSourcesView
                activePresetId={activePresetId}
                dbAName={dbAName}
                dbBName={dbBName}
                recordsA={recordsA}
                recordsB={recordsB}
                fields={fields}
                onSelectPreset={handleSelectPreset}
                onGenerateSynthetic={handleGenerateSynthetic}
                onUploadCSV={handleUploadCSV}
                onAddRecord={handleAddRecord}
                onRemoveRecord={handleRemoveRecord}
                onOpenGmailImport={() => setGmailImportOpen(true)}
              />
            )}

            {activeStage === 'blocking' && (
              <BlockingView
                fields={fields}
                blockingRules={blockingRules}
                blockingOutput={blockingOutput}
                evaluation={evaluation}
                recordsA={recordsA}
                recordsB={recordsB}
                dbAName={dbAName}
                dbBName={dbBName}
                learnedParams={effectiveFieldParams}
                priorMatch={priorMatch}
                lowerThreshold={lowerThreshold}
                upperThreshold={upperThreshold}
                onToggleRule={handleToggleRule}
                onAddRule={handleAddRule}
                onRemoveRule={handleRemoveRule}
              />
            )}

            {activeStage === 'model' && (
              <ModelWeightsView
                fields={fields}
                learnedParams={effectiveFieldParams}
                priorMatch={priorMatch}
                emResult={emResult}
                pairs={scoredPairs}
                evaluation={evaluation}
                upperThreshold={upperThreshold}
                lowerThreshold={lowerThreshold}
                enforceOneToOne={enforceOneToOne}
                onUpdateField={handleUpdateField}
                onRunEM={handleRunEM}
                onResetManualParams={handleResetManualParams}
                onChangeThresholds={handleChangeThresholds}
                onToggleOneToOne={handleToggleOneToOne}
              />
            )}

            {activeStage === 'review' && (
              <ClericalReviewView
                pairs={scoredPairs}
                dbAName={dbAName}
                dbBName={dbBName}
                onAdjudicate={handleAdjudicate}
                onBulkAdjudicate={handleBulkAdjudicate}
              />
            )}

            {activeStage === 'results' && (
              <ResultsExportView
                clusters={entityClusters}
                pairs={scoredPairs}
                fields={fields}
                evaluation={evaluation}
                emResult={emResult}
                dbAName={dbAName}
                dbBName={dbBName}
                recordsACount={recordsA.length}
                recordsBCount={recordsB.length}
                lowerThreshold={lowerThreshold}
                upperThreshold={upperThreshold}
                enforceOneToOne={enforceOneToOne}
                onOpenGmailShare={() => setGmailShareOpen(true)}
              />
            )}
          </div>
        </main>

        <ActivityLog
          entries={activityLog}
          isOpen={activityLogOpen}
          onToggle={() => setActivityLogOpen((v) => !v)}
          onClear={() => setActivityLog([])}
        />
      </div>

      <AuthModal
        isOpen={authModalOpen}
        initialMode={authModalMode}
        isSubmitting={authSubmitting}
        errorMessage={authError}
        onClose={() => setAuthModalOpen(false)}
        onAuthenticate={handleAuthenticate}
      />

      <AccountModal
        isOpen={accountModalOpen}
        profile={userProfile}
        privateInfo={userPrivateInfo}
        snapshots={savedSnapshots}
        currentSummary={{
          presetId: activePresetId,
          dbAName,
          dbBName,
          lowerThreshold,
          upperThreshold,
          priorMatch,
          enforceOneToOne,
          matchCount,
          clericalCount,
        }}
        onClose={() => setAccountModalOpen(false)}
        onUpdateProfile={handleUpdateProfile}
        onSaveSnapshot={handleSaveSnapshot}
        onLoadSnapshot={handleLoadSnapshot}
        onDeleteSnapshot={handleDeleteSnapshot}
        onSignOut={handleSignOut}
      />

      <GmailImportModal
        isOpen={gmailImportOpen}
        accessToken={gmailAccessToken}
        onAuthorizeGoogle={handleAuthorizeGoogleForGmail}
        onClose={() => setGmailImportOpen(false)}
        onImportRecords={(source, records, columns, label) => {
          handleUploadCSV(source, records, columns, label);
          appendActivity(
            'dataset',
            `Imported Gmail Contacts (${source})`,
            `${records.length} sender records from ${label}`
          );
        }}
      />

      <GmailShareModal
        isOpen={gmailShareOpen}
        accessToken={gmailAccessToken}
        defaultRecipient={userPrivateInfo?.email || currentUser?.email || ''}
        defaultSubject={`Record Linkage Report: ${dbAName} × ${dbBName}`}
        defaultBody={gmailReportBody}
        attachmentFilename="record_linkage_results.csv"
        attachmentCsv={gmailAttachmentCsv}
        onAuthorizeGoogle={handleAuthorizeGoogleForGmail}
        onClose={() => setGmailShareOpen(false)}
        onSentOrDrafted={(action, recipient, subject) => {
          appendActivity(
            'dataset',
            action === 'sent' ? 'Sent Report via Gmail' : 'Saved Gmail Report Draft',
            `${subject} → ${recipient}`
          );
        }}
      />
    </div>
  );
}
