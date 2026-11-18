import type {
  AgreementLevel,
  BlockingKeyPart,
  BlockingRule,
  CandidatePair,
  DatabaseRecord,
  EMResult,
  EntityCluster,
  EvaluationMetrics,
  FieldComparison,
  FieldSchema,
  LearnedFieldParams,
  LinkageDecision,
} from '../types/linkage';
import {
  alnumOnly,
  computeFieldSimilarity,
  normalizeText,
  soundex,
} from './comparators';

function clampProb(p: number): number {
  return Math.min(0.9995, Math.max(0.0005, p));
}

export function transformForBlocking(
  value: string | undefined,
  transform: BlockingKeyPart['transform']
): string {
  const raw = (value ?? '').trim();
  if (!raw) return '';

  switch (transform) {
    case 'exact':
      return normalizeText(raw);
    case 'alnum_only':
      return alnumOnly(raw);
    case 'soundex':
      return soundex(raw);
    case 'prefix_3':
      return alnumOnly(raw).slice(0, 3);
    case 'prefix_4':
      return alnumOnly(raw).slice(0, 4);
    case 'year': {
      const m = raw.match(/(19|20)\d{2}/);
      return m ? m[0] : alnumOnly(raw).slice(0, 4);
    }
    default:
      return normalizeText(raw);
  }
}

export function computeBlockingKey(
  record: DatabaseRecord,
  rule: BlockingRule
): string | null {
  const parts: string[] = [];
  for (const kp of rule.keyParts) {
    const val = transformForBlocking(record.fields[kp.field], kp.transform);
    if (!val) return null;
    parts.push(val);
  }
  return parts.join('|');
}

export interface BlockingOutput {
  candidateMap: Map<string, { recordA: DatabaseRecord; recordB: DatabaseRecord; passes: string[] }>;
  passStats: Array<{
    ruleId: string;
    label: string;
    distinctKeysA: number;
    distinctKeysB: number;
    pairsGenerated: number;
  }>;
}

export function generateCandidatePairs(
  recordsA: DatabaseRecord[],
  recordsB: DatabaseRecord[],
  blockingRules: BlockingRule[]
): BlockingOutput {
  const candidateMap = new Map<
    string,
    { recordA: DatabaseRecord; recordB: DatabaseRecord; passes: string[] }
  >();
  const passStats: BlockingOutput['passStats'] = [];

  const activeRules = blockingRules.filter((r) => r.enabled && r.keyParts.length > 0);

  // If no blocking rules are enabled, fall back to full Cartesian product (capped safely for interactive UI)
  if (activeRules.length === 0) {
    for (const a of recordsA) {
      for (const b of recordsB) {
        const key = `${a.id}::${b.id}`;
        candidateMap.set(key, { recordA: a, recordB: b, passes: ['Full Cartesian'] });
      }
    }
    return { candidateMap, passStats };
  }

  for (const rule of activeRules) {
    const indexA = new Map<string, DatabaseRecord[]>();
    const indexB = new Map<string, DatabaseRecord[]>();

    for (const a of recordsA) {
      const bk = computeBlockingKey(a, rule);
      if (!bk) continue;
      const list = indexA.get(bk);
      if (list) list.push(a);
      else indexA.set(bk, [a]);
    }

    for (const b of recordsB) {
      const bk = computeBlockingKey(b, rule);
      if (!bk) continue;
      const list = indexB.get(bk);
      if (list) list.push(b);
      else indexB.set(bk, [b]);
    }

    let pairsInPass = 0;
    for (const [bk, listA] of indexA.entries()) {
      const listB = indexB.get(bk);
      if (!listB) continue;

      for (const a of listA) {
        for (const b of listB) {
          pairsInPass++;
          const pairId = `${a.id}::${b.id}`;
          const existing = candidateMap.get(pairId);
          if (existing) {
            if (!existing.passes.includes(rule.label)) {
              existing.passes.push(rule.label);
            }
          } else {
            candidateMap.set(pairId, {
              recordA: a,
              recordB: b,
              passes: [rule.label],
            });
          }
        }
      }
    }

    passStats.push({
      ruleId: rule.id,
      label: rule.label,
      distinctKeysA: indexA.size,
      distinctKeysB: indexB.size,
      pairsGenerated: pairsInPass,
    });
  }

  return { candidateMap, passStats };
}

export interface IntraDatabaseDetectionResult {
  source: 'A' | 'B';
  recordCount: number;
  cartesianPairs: number;
  candidateCount: number;
  reductionRatio: number;
  pairs: CandidatePair[];
  matchCount: number;
  clericalCount: number;
  suspectCount: number;
}

export function generateIntraDatabaseCandidatePairs(
  records: DatabaseRecord[],
  blockingRules: BlockingRule[]
): BlockingOutput['candidateMap'] {
  const candidateMap: BlockingOutput['candidateMap'] = new Map();
  const activeRules = blockingRules.filter((r) => r.enabled && r.keyParts.length > 0);

  if (activeRules.length === 0) {
    for (let i = 0; i < records.length; i++) {
      for (let j = i + 1; j < records.length; j++) {
        const r1 = records[i];
        const r2 = records[j];
        const pairId = `${r1.id}::${r2.id}`;
        candidateMap.set(pairId, {
          recordA: r1,
          recordB: r2,
          passes: ['Full Cartesian'],
        });
      }
    }
    return candidateMap;
  }

  // Track original index so (i < j) guarantees canonical unordered pair deduplication
  const indexById = new Map<string, number>();
  records.forEach((r, idx) => indexById.set(r.id, idx));

  for (const rule of activeRules) {
    const buckets = new Map<string, DatabaseRecord[]>();
    for (const r of records) {
      const bk = computeBlockingKey(r, rule);
      if (!bk) continue;
      const list = buckets.get(bk);
      if (list) list.push(r);
      else buckets.set(bk, [r]);
    }

    for (const list of buckets.values()) {
      if (list.length < 2) continue;
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const rec1 = list[i];
          const rec2 = list[j];
          const idx1 = indexById.get(rec1.id) ?? 0;
          const idx2 = indexById.get(rec2.id) ?? 0;
          const [first, second] = idx1 <= idx2 ? [rec1, rec2] : [rec2, rec1];
          const pairId = `${first.id}::${second.id}`;
          const existing = candidateMap.get(pairId);
          if (existing) {
            if (!existing.passes.includes(rule.label)) {
              existing.passes.push(rule.label);
            }
          } else {
            candidateMap.set(pairId, {
              recordA: first,
              recordB: second,
              passes: [rule.label],
            });
          }
        }
      }
    }
  }

  return candidateMap;
}

export function detectIntraDatabaseDuplicates(
  source: 'A' | 'B',
  records: DatabaseRecord[],
  blockingRules: BlockingRule[],
  fields: FieldSchema[],
  fieldParams: Record<string, LearnedFieldParams>,
  priorMatch: number,
  upperThreshold: number,
  lowerThreshold: number
): IntraDatabaseDetectionResult {
  const n = records.length;
  const cartesianPairs = Math.floor((n * (n - 1)) / 2);
  const candidateMap = generateIntraDatabaseCandidatePairs(records, blockingRules);
  const candidateCount = candidateMap.size;
  const reductionRatio = cartesianPairs > 0 ? 1 - candidateCount / cartesianPairs : 0;

  const vectors = extractComparisonVectors(candidateMap, fields);
  const scored = scoreAndClassifyPairs(
    vectors,
    fields,
    fieldParams,
    priorMatch,
    upperThreshold,
    lowerThreshold,
    {},
    false
  );

  let matchCount = 0;
  let clericalCount = 0;
  for (const p of scored) {
    if (p.finalDecision === 'match') matchCount++;
    else if (p.finalDecision === 'clerical') clericalCount++;
  }

  return {
    source,
    recordCount: n,
    cartesianPairs,
    candidateCount,
    reductionRatio,
    pairs: scored,
    matchCount,
    clericalCount,
    suspectCount: matchCount + clericalCount,
  };
}

export function classifyAgreementLevel(
  similarity: number | null,
  field: FieldSchema
): AgreementLevel {
  if (similarity === null) return 'missing';
  if (similarity >= field.agreeThreshold) return 'agree';
  if (similarity >= field.partialThreshold) return 'partial';
  return 'disagree';
}

export function computeFieldWeights(params: {
  mAgree: number;
  uAgree: number;
  mPartial: number;
  uPartial: number;
}): LearnedFieldParams {
  const mA = clampProb(params.mAgree);
  const uA = clampProb(params.uAgree);
  // Ensure mPartial + mAgree <= 0.999
  const mP = Math.min(clampProb(params.mPartial), Math.max(0.0005, 0.999 - mA));
  const uP = Math.min(clampProb(params.uPartial), Math.max(0.0005, 0.999 - uA));
  const mD = Math.max(0.0005, 1 - mA - mP);
  const uD = Math.max(0.0005, 1 - uA - uP);

  return {
    mAgree: mA,
    uAgree: uA,
    mPartial: mP,
    uPartial: uP,
    mDisagree: mD,
    uDisagree: uD,
    wAgree: Math.log2(mA / uA),
    wPartial: Math.log2(mP / uP),
    wDisagree: Math.log2(mD / uD),
  };
}

export interface RawPairVector {
  pairId: string;
  recordA: DatabaseRecord;
  recordB: DatabaseRecord;
  passes: string[];
  levels: Record<string, { similarity: number | null; level: AgreementLevel }>;
}

export function extractComparisonVectors(
  candidateMap: BlockingOutput['candidateMap'],
  fields: FieldSchema[]
): RawPairVector[] {
  const enabledFields = fields.filter((f) => f.enabled);
  const vectors: RawPairVector[] = [];

  for (const [pairId, item] of candidateMap.entries()) {
    const levels: RawPairVector['levels'] = {};
    for (const f of enabledFields) {
      const sim = computeFieldSimilarity(
        item.recordA.fields[f.key],
        item.recordB.fields[f.key],
        f.comparator
      );
      levels[f.key] = {
        similarity: sim,
        level: classifyAgreementLevel(sim, f),
      };
    }
    vectors.push({
      pairId,
      recordA: item.recordA,
      recordB: item.recordB,
      passes: item.passes,
      levels,
    });
  }

  return vectors;
}

/**
 * Runs 3-level Expectation-Maximization (Fellegi-Sunter / Winkler) on candidate comparison vectors.
 */
export function runExpectationMaximization(
  vectors: RawPairVector[],
  fields: FieldSchema[],
  maxIterations = 40,
  tolerance = 1e-5
): EMResult {
  const enabledFields = fields.filter((f) => f.enabled);
  const N = vectors.length;

  const fieldParams: Record<string, LearnedFieldParams> = {};
  for (const f of enabledFields) {
    fieldParams[f.key] = computeFieldWeights({
      mAgree: f.mAgree,
      uAgree: f.uAgree,
      mPartial: f.mPartial,
      uPartial: f.uPartial,
    });
  }

  if (N === 0 || enabledFields.length === 0) {
    return {
      priorMatch: 0.15,
      iterations: 0,
      converged: true,
      logLikelihoodHistory: [],
      fieldParams,
    };
  }

  let p = 0.25;
  const history: number[] = [];
  let converged = false;
  let iter = 0;

  // Pre-allocate posterior array
  const gammaPosteriors = new Float64Array(N);

  for (iter = 1; iter <= maxIterations; iter++) {
    let logLikelihood = 0;
    let sumGamma = 0;

    // E-Step
    for (let idx = 0; idx < N; idx++) {
      const vec = vectors[idx];
      let logLikM = Math.log(clampProb(p));
      let logLikU = Math.log(clampProb(1 - p));

      for (const f of enabledFields) {
        const lvl = vec.levels[f.key]?.level ?? 'missing';
        const fp = fieldParams[f.key];
        if (lvl === 'agree') {
          logLikM += Math.log(fp.mAgree);
          logLikU += Math.log(fp.uAgree);
        } else if (lvl === 'partial') {
          logLikM += Math.log(fp.mPartial);
          logLikU += Math.log(fp.uPartial);
        } else if (lvl === 'disagree') {
          logLikM += Math.log(fp.mDisagree);
          logLikU += Math.log(fp.uDisagree);
        }
      }

      // Log-sum-exp for numerical stability
      const maxLog = Math.max(logLikM, logLikU);
      const expM = Math.exp(logLikM - maxLog);
      const expU = Math.exp(logLikU - maxLog);
      const denom = expM + expU;
      const posterior = expM / denom;

      gammaPosteriors[idx] = posterior;
      sumGamma += posterior;
      logLikelihood += maxLog + Math.log(denom);
    }

    history.push(logLikelihood);

    // M-Step
    const nextP = clampProb(sumGamma / N);
    let maxParamDelta = Math.abs(nextP - p);
    p = nextP;

    for (const f of enabledFields) {
      let mAgreeNum = 0;
      let mPartialNum = 0;
      let mDenom = 0;
      let uAgreeNum = 0;
      let uPartialNum = 0;
      let uDenom = 0;

      for (let idx = 0; idx < N; idx++) {
        const lvl = vectors[idx].levels[f.key]?.level ?? 'missing';
        if (lvl === 'missing') continue;

        const g = gammaPosteriors[idx];
        const invG = 1 - g;

        mDenom += g;
        uDenom += invG;

        if (lvl === 'agree') {
          mAgreeNum += g;
          uAgreeNum += invG;
        } else if (lvl === 'partial') {
          mPartialNum += g;
          uPartialNum += invG;
        }
      }

      // Laplace smoothing (+0.05) prevents collapse when candidate blocks are small
      const nextMAgree = clampProb((mAgreeNum + 0.05) / (mDenom + 0.15));
      const nextMPartial = clampProb((mPartialNum + 0.02) / (mDenom + 0.15));
      const nextUAgree = clampProb((uAgreeNum + 0.02) / (uDenom + 0.15));
      const nextUPartial = clampProb((uPartialNum + 0.02) / (uDenom + 0.15));

      // Enforce Fellegi-Sunter ordering sanity: mAgree >= uAgree
      const prev = fieldParams[f.key];
      const updated = computeFieldWeights({
        mAgree: Math.max(nextMAgree, nextUAgree + 0.02),
        uAgree: nextUAgree,
        mPartial: nextMPartial,
        uPartial: nextUPartial,
      });

      maxParamDelta = Math.max(
        maxParamDelta,
        Math.abs(updated.mAgree - prev.mAgree),
        Math.abs(updated.uAgree - prev.uAgree)
      );

      fieldParams[f.key] = updated;
    }

    if (iter > 1) {
      const llDelta = Math.abs(history[history.length - 1] - history[history.length - 2]);
      if (llDelta < tolerance && maxParamDelta < tolerance) {
        converged = true;
        break;
      }
    }
  }

  return {
    priorMatch: p,
    iterations: iter,
    converged,
    logLikelihoodHistory: history,
    fieldParams,
  };
}

export function scoreAndClassifyPairs(
  vectors: RawPairVector[],
  fields: FieldSchema[],
  fieldParams: Record<string, LearnedFieldParams>,
  priorMatch: number,
  upperThreshold: number,
  lowerThreshold: number,
  humanDecisions: Record<string, LinkageDecision>,
  enforceOneToOne: boolean
): CandidatePair[] {
  const enabledFields = fields.filter((f) => f.enabled);
  const logPriorOdds = Math.log(clampProb(priorMatch) / clampProb(1 - priorMatch));

  const scored: CandidatePair[] = vectors.map((vec) => {
    const comparisons: FieldComparison[] = [];
    let totalWeight = 0;

    for (const f of enabledFields) {
      const info = vec.levels[f.key];
      const fp = fieldParams[f.key] ?? computeFieldWeights(f);
      let weight = 0;

      if (info.level === 'agree') weight = fp.wAgree;
      else if (info.level === 'partial') weight = fp.wPartial;
      else if (info.level === 'disagree') weight = fp.wDisagree;
      else weight = 0;

      totalWeight += weight;

      comparisons.push({
        field: f.key,
        label: f.label,
        valueA: vec.recordA.fields[f.key] ?? '',
        valueB: vec.recordB.fields[f.key] ?? '',
        similarity: info.similarity ?? 0,
        level: info.level,
        weight,
      });
    }

    // Posterior P(M | gamma) using Bayes rule from log2 weights:
    // ln(LR) = totalWeight * ln(2)
    const logOdds = logPriorOdds + totalWeight * Math.LN2;
    const posteriorProb = 1 / (1 + Math.exp(-Math.min(30, Math.max(-30, logOdds))));

    let modelDecision: LinkageDecision = 'non_match';
    if (totalWeight >= upperThreshold) modelDecision = 'match';
    else if (totalWeight >= lowerThreshold) modelDecision = 'clerical';

    const humanDecision = humanDecisions[vec.pairId] ?? null;
    const finalDecision: LinkageDecision = humanDecision ?? modelDecision;

    return {
      pairId: vec.pairId,
      recordA: vec.recordA,
      recordB: vec.recordB,
      matchedBlockPasses: vec.passes,
      comparisons,
      totalWeight,
      posteriorProb,
      modelDecision,
      humanDecision,
      finalDecision,
    };
  });

  // Sort descending by composite Fellegi-Sunter weight
  scored.sort((a, b) => b.totalWeight - a.totalWeight);

  if (!enforceOneToOne) {
    return scored;
  }

  // Greedy 1-to-1 bipartite assignment across automatic/human matches
  const matchedA = new Set<string>();
  const matchedB = new Set<string>();

  return scored.map((pair) => {
    if (pair.finalDecision !== 'match') return pair;
    // Respect explicit human confirmations first (already sorted by weight, or preserve if unassigned)
    if (matchedA.has(pair.recordA.id) || matchedB.has(pair.recordB.id)) {
      return {
        ...pair,
        finalDecision: pair.humanDecision === 'match' ? 'clerical' : 'non_match',
      };
    }
    matchedA.add(pair.recordA.id);
    matchedB.add(pair.recordB.id);
    return pair;
  });
}

export function evaluateLinkage(
  recordsA: DatabaseRecord[],
  recordsB: DatabaseRecord[],
  pairs: CandidatePair[]
): EvaluationMetrics {
  const cartesianSize = recordsA.length * recordsB.length;
  const candidateCount = pairs.length;
  const reductionRatio = cartesianSize > 0 ? 1 - candidateCount / cartesianSize : 0;

  // Check if ground truth IDs exist on both sides
  const gtA = new Set(recordsA.map((r) => r.groundTruthId).filter(Boolean));
  const gtB = new Set(recordsB.map((r) => r.groundTruthId).filter(Boolean));
  const hasGroundTruth = gtA.size > 0 && gtB.size > 0;

  if (!hasGroundTruth) {
    return {
      hasGroundTruth: false,
      truePositives: 0,
      falsePositives: 0,
      falseNegatives: 0,
      trueNegatives: 0,
      clericalGroundTruthMatches: 0,
      clericalTotal: pairs.filter((p) => p.finalDecision === 'clerical').length,
      precision: 0,
      recall: 0,
      f1: 0,
      pairsCompleteness: 0,
      reductionRatio,
      totalGroundTruthMatches: 0,
      cartesianSize,
      candidateCount,
    };
  }

  // Count total true matching pairs in A x B
  const countByGtB = new Map<string, number>();
  for (const b of recordsB) {
    if (!b.groundTruthId) continue;
    countByGtB.set(b.groundTruthId, (countByGtB.get(b.groundTruthId) ?? 0) + 1);
  }
  let totalGroundTruthMatches = 0;
  for (const a of recordsA) {
    if (!a.groundTruthId) continue;
    totalGroundTruthMatches += countByGtB.get(a.groundTruthId) ?? 0;
  }

  let truePositives = 0;
  let falsePositives = 0;
  let candidateTrueMatches = 0;
  let clericalGroundTruthMatches = 0;
  let clericalTotal = 0;

  for (const p of pairs) {
    const isTrueMatch =
      Boolean(p.recordA.groundTruthId) &&
      p.recordA.groundTruthId === p.recordB.groundTruthId;

    if (isTrueMatch) candidateTrueMatches++;

    if (p.finalDecision === 'match') {
      if (isTrueMatch) truePositives++;
      else falsePositives++;
    } else if (p.finalDecision === 'clerical') {
      clericalTotal++;
      if (isTrueMatch) clericalGroundTruthMatches++;
    }
  }

  const falseNegatives = Math.max(0, totalGroundTruthMatches - truePositives);
  const trueNegatives = Math.max(
    0,
    cartesianSize - totalGroundTruthMatches - falsePositives
  );

  const precision =
    truePositives + falsePositives > 0
      ? truePositives / (truePositives + falsePositives)
      : 0;
  const recall =
    totalGroundTruthMatches > 0 ? truePositives / totalGroundTruthMatches : 0;
  const f1 =
    precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  const pairsCompleteness =
    totalGroundTruthMatches > 0
      ? candidateTrueMatches / totalGroundTruthMatches
      : 0;

  return {
    hasGroundTruth: true,
    truePositives,
    falsePositives,
    falseNegatives,
    trueNegatives,
    clericalGroundTruthMatches,
    clericalTotal,
    precision,
    recall,
    f1,
    pairsCompleteness,
    reductionRatio,
    totalGroundTruthMatches,
    cartesianSize,
    candidateCount,
  };
}

export function buildEntityClusters(
  pairs: CandidatePair[],
  fields: FieldSchema[]
): EntityCluster[] {
  const matchedPairs = pairs.filter((p) => p.finalDecision === 'match');
  if (matchedPairs.length === 0) return [];

  // Union-Find over record keys `A:<id>` and `B:<id>`
  const parent = new Map<string, string>();
  const recordByNode = new Map<string, DatabaseRecord>();

  const find = (x: string): string => {
    const p = parent.get(x);
    if (!p || p === x) return x;
    const root = find(p);
    parent.set(x, root);
    return root;
  };

  const union = (x: string, y: string) => {
    const rx = find(x);
    const ry = find(y);
    if (rx !== ry) parent.set(ry, rx);
  };

  for (const p of matchedPairs) {
    const kA = `A:${p.recordA.id}`;
    const kB = `B:${p.recordB.id}`;
    if (!parent.has(kA)) parent.set(kA, kA);
    if (!parent.has(kB)) parent.set(kB, kB);
    recordByNode.set(kA, p.recordA);
    recordByNode.set(kB, p.recordB);
    union(kA, kB);
  }

  const groups = new Map<
    string,
    { records: DatabaseRecord[]; posteriors: number[]; weights: number[] }
  >();

  for (const [node, rec] of recordByNode.entries()) {
    const root = find(node);
    const g = groups.get(root);
    if (g) g.records.push(rec);
    else groups.set(root, { records: [rec], posteriors: [], weights: [] });
  }

  for (const p of matchedPairs) {
    const root = find(`A:${p.recordA.id}`);
    const g = groups.get(root);
    if (g) {
      g.posteriors.push(p.posteriorProb);
      g.weights.push(p.totalWeight);
    }
  }

  const clusters: EntityCluster[] = [];
  let idx = 1;

  for (const g of groups.values()) {
    // Synthesize golden record by selecting most complete/frequent value per field
    const goldenRecord: Record<string, string> = {};
    for (const f of fields) {
      const candidates = g.records
        .map((r) => (r.fields[f.key] ?? '').trim())
        .filter(Boolean);
      if (candidates.length === 0) {
        goldenRecord[f.key] = '';
      } else {
        // Prefer longest / cleanest non-empty representation on ties
        const counts = new Map<string, number>();
        for (const c of candidates) {
          counts.set(c, (counts.get(c) ?? 0) + 1);
        }
        candidates.sort((a, b) => {
          const diff = (counts.get(b) ?? 0) - (counts.get(a) ?? 0);
          return diff !== 0 ? diff : b.length - a.length;
        });
        goldenRecord[f.key] = candidates[0];
      }
    }

    const hasA = g.records.some((r) => r.source === 'A');
    const hasB = g.records.some((r) => r.source === 'B');
    const avgPosterior =
      g.posteriors.reduce((acc, v) => acc + v, 0) / Math.max(1, g.posteriors.length);
    const maxWeight = Math.max(...g.weights);

    clusters.push({
      clusterId: `ENT-${String(idx++).padStart(4, '0')}`,
      records: g.records,
      goldenRecord,
      avgPosterior,
      maxWeight,
      pairCount: g.weights.length,
      sourceCoverage: hasA && hasB ? 'A+B' : hasA ? 'A_only' : 'B_only',
    });
  }

  return clusters.sort((a, b) => b.maxWeight - a.maxWeight);
}

export function parseCSVRecords(
  csvText: string,
  source: 'A' | 'B'
): { records: DatabaseRecord[]; columns: string[] } {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) {
    return { records: [], columns: [] };
  }

  const splitRow = (line: string): string[] => {
    const out: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        out.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    out.push(current.trim());
    return out;
  };

  const headers = splitRow(lines[0]).map((h) => h.trim());
  const idIdx = headers.findIndex((h) => /^id$|record_id/i.test(h));
  const gtIdx = headers.findIndex((h) => /ground_truth|entity_id|true_id/i.test(h));

  const featureColumns = headers.filter(
    (_, i) => i !== idIdx && i !== gtIdx
  );

  const records: DatabaseRecord[] = [];
  for (let r = 1; r < lines.length; r++) {
    const cells = splitRow(lines[r]);
    if (cells.length === 1 && !cells[0]) continue;
    const fields: Record<string, string> = {};
    headers.forEach((h, i) => {
      if (i !== idIdx && i !== gtIdx) {
        fields[h] = cells[i] ?? '';
      }
    });

    records.push({
      id: idIdx >= 0 && cells[idIdx] ? cells[idIdx] : `${source}-${r}`,
      source,
      groundTruthId: gtIdx >= 0 && cells[gtIdx] ? cells[gtIdx] : undefined,
      fields,
    });
  }

  return { records, columns: featureColumns };
}

export function exportLinkedPairsCSV(pairs: CandidatePair[], fields: FieldSchema[]): string {
  const active = pairs.filter((p) => p.finalDecision === 'match');
  const headers = [
    'pair_id',
    'record_a_id',
    'record_b_id',
    'decision',
    'composite_weight',
    'posterior_probability',
    'blocking_passes',
    ...fields.flatMap((f) => [`a_${f.key}`, `b_${f.key}`, `sim_${f.key}`]),
  ];

  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;

  const formatClassification = (d: LinkageDecision) =>
    d === 'match' ? 'Match' : d === 'clerical' ? 'Possible Match' : 'Non-Match';

  const rows = active.map((p) => {
    const compMap = new Map(p.comparisons.map((c) => [c.field, c]));
    return [
      p.pairId,
      p.recordA.id,
      p.recordB.id,
      formatClassification(p.finalDecision),
      p.totalWeight.toFixed(4),
      p.posteriorProb.toFixed(4),
      p.matchedBlockPasses.join('; '),
      ...fields.flatMap((f) => {
        const c = compMap.get(f.key);
        return [
          p.recordA.fields[f.key] ?? '',
          p.recordB.fields[f.key] ?? '',
          c ? c.similarity.toFixed(3) : '',
        ];
      }),
    ]
      .map((cell) => escape(String(cell)))
      .join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

export function exportGoldenClustersCSV(
  clusters: EntityCluster[],
  fields: FieldSchema[]
): string {
  const headers = [
    'cluster_id',
    'linked_record_ids',
    'database_a_record_ids',
    'database_b_record_ids',
    'record_count',
    'avg_posterior',
    'max_weight',
    ...fields.map((f) => f.key),
  ];
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;

  const rows = clusters.map((cl) => {
    const idsA = cl.records.filter((r) => r.source === 'A').map((r) => r.id);
    const idsB = cl.records.filter((r) => r.source === 'B').map((r) => r.id);
    const allIds = cl.records.map((r) => `${r.source}:${r.id}`);
    return [
      cl.clusterId,
      allIds.join('; '),
      idsA.join('; '),
      idsB.join('; '),
      String(cl.records.length),
      cl.avgPosterior.toFixed(4),
      cl.maxWeight.toFixed(4),
      ...fields.map((f) => cl.goldenRecord[f.key] ?? ''),
    ]
      .map((c) => escape(String(c)))
      .join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

export function exportCombinedResultsCSV(
  clusters: EntityCluster[],
  pairs: CandidatePair[],
  fields: FieldSchema[]
): string {
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;

  // Map each linked record key to its resolved clusterId for cross-referencing pairs
  const clusterByRecord = new Map<string, string>();
  for (const cl of clusters) {
    for (const r of cl.records) {
      clusterByRecord.set(`${r.source}:${r.id}`, cl.clusterId);
    }
  }

  const headers = [
    'record_type',
    'cluster_id',
    'pair_id',
    'record_a_id',
    'record_b_id',
    'classification',
    'model_decision',
    'human_decision',
    'composite_weight',
    'posterior_probability',
    'blocking_passes',
    ...fields.flatMap((f) => [
      `golden_or_a_${f.key}`,
      `b_${f.key}`,
      `sim_${f.key}`,
    ]),
  ];

  const clusterRows = clusters.map((cl) => {
    const idsA = cl.records.filter((r) => r.source === 'A').map((r) => r.id);
    const idsB = cl.records.filter((r) => r.source === 'B').map((r) => r.id);
    return [
      'ENTITY_CLUSTER',
      cl.clusterId,
      '',
      idsA.join('; '),
      idsB.join('; '),
      'linked_cluster',
      '',
      '',
      cl.maxWeight.toFixed(4),
      cl.avgPosterior.toFixed(4),
      '',
      ...fields.flatMap((f) => [cl.goldenRecord[f.key] ?? '', '', '']),
    ]
      .map((cell) => escape(String(cell)))
      .join(',');
  });

  const formatClassification = (d: LinkageDecision) =>
    d === 'match' ? 'Match' : d === 'clerical' ? 'Possible Match' : 'Non-Match';

  const pairRows = pairs.map((p) => {
    const compMap = new Map(p.comparisons.map((c) => [c.field, c]));
    const resolvedClusterId =
      p.finalDecision === 'match'
        ? clusterByRecord.get(`A:${p.recordA.id}`) ??
          clusterByRecord.get(`B:${p.recordB.id}`) ??
          ''
        : '';

    return [
      'PAIR_CLASSIFICATION',
      resolvedClusterId,
      p.pairId,
      p.recordA.id,
      p.recordB.id,
      formatClassification(p.finalDecision),
      formatClassification(p.modelDecision),
      p.humanDecision ? formatClassification(p.humanDecision) : '',
      p.totalWeight.toFixed(4),
      p.posteriorProb.toFixed(4),
      p.matchedBlockPasses.join('; '),
      ...fields.flatMap((f) => {
        const c = compMap.get(f.key);
        return [
          p.recordA.fields[f.key] ?? '',
          p.recordB.fields[f.key] ?? '',
          c && c.level !== 'missing' ? c.similarity.toFixed(3) : '',
        ];
      }),
    ]
      .map((cell) => escape(String(cell)))
      .join(',');
  });

  return [headers.join(','), ...clusterRows, ...pairRows].join('\n');
}
