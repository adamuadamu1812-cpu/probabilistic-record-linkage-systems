export type ComparatorType =
  | 'jaro_winkler'
  | 'levenshtein'
  | 'exact'
  | 'soundex'
  | 'token_jaccard'
  | 'date_tolerance';

export type AgreementLevel = 'agree' | 'partial' | 'disagree' | 'missing';

export type LinkageDecision = 'match' | 'clerical' | 'non_match';

export type BlockingTransform =
  | 'exact'
  | 'soundex'
  | 'prefix_3'
  | 'prefix_4'
  | 'year'
  | 'alnum_only';

export interface DatabaseRecord {
  id: string;
  source: 'A' | 'B';
  groundTruthId?: string;
  fields: Record<string, string>;
}

export interface FieldSchema {
  key: string;
  label: string;
  comparator: ComparatorType;
  agreeThreshold: number;
  partialThreshold: number;
  mAgree: number;
  uAgree: number;
  mPartial: number;
  uPartial: number;
  enabled: boolean;
}

export interface BlockingKeyPart {
  field: string;
  transform: BlockingTransform;
}

export interface BlockingRule {
  id: string;
  label: string;
  keyParts: BlockingKeyPart[];
  enabled: boolean;
}

export interface FieldComparison {
  field: string;
  label: string;
  valueA: string;
  valueB: string;
  similarity: number;
  level: AgreementLevel;
  weight: number;
}

export interface CandidatePair {
  pairId: string;
  recordA: DatabaseRecord;
  recordB: DatabaseRecord;
  matchedBlockPasses: string[];
  comparisons: FieldComparison[];
  totalWeight: number;
  posteriorProb: number;
  modelDecision: LinkageDecision;
  humanDecision: LinkageDecision | null;
  finalDecision: LinkageDecision;
}

export interface LearnedFieldParams {
  mAgree: number;
  uAgree: number;
  mPartial: number;
  uPartial: number;
  mDisagree: number;
  uDisagree: number;
  wAgree: number;
  wPartial: number;
  wDisagree: number;
}

export interface EMResult {
  priorMatch: number;
  iterations: number;
  converged: boolean;
  logLikelihoodHistory: number[];
  fieldParams: Record<string, LearnedFieldParams>;
}

export interface EvaluationMetrics {
  hasGroundTruth: boolean;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  trueNegatives: number;
  clericalGroundTruthMatches: number;
  clericalTotal: number;
  precision: number;
  recall: number;
  f1: number;
  pairsCompleteness: number;
  reductionRatio: number;
  totalGroundTruthMatches: number;
  cartesianSize: number;
  candidateCount: number;
}

export interface EntityCluster {
  clusterId: string;
  records: DatabaseRecord[];
  goldenRecord: Record<string, string>;
  avgPosterior: number;
  maxWeight: number;
  pairCount: number;
  sourceCoverage: 'A+B' | 'A_only' | 'B_only';
}

export interface DatasetPreset {
  id: string;
  name: string;
  domain: string;
  dbAName: string;
  dbBName: string;
  description: string;
  recordsA: DatabaseRecord[];
  recordsB: DatabaseRecord[];
  fields: FieldSchema[];
  blockingRules: BlockingRule[];
}

export type ActivityCategory =
  | 'calibration'
  | 'threshold'
  | 'adjudication'
  | 'blocking'
  | 'dataset'
  | 'model';

export interface ActivityLogEntry {
  id: string;
  timestamp: string;
  category: ActivityCategory;
  title: string;
  detail: string;
}
