import type { ComparatorType } from '../types/linkage';

const ADDRESS_ABBREVIATIONS: Record<string, string> = {
  st: 'street',
  str: 'street',
  ave: 'avenue',
  av: 'avenue',
  rd: 'road',
  blvd: 'boulevard',
  dr: 'drive',
  ln: 'lane',
  ct: 'court',
  pl: 'place',
  sq: 'square',
  pkwy: 'parkway',
  apt: 'apartment',
  ste: 'suite',
  n: 'north',
  s: 'south',
  e: 'east',
  w: 'west',
};

export function normalizeText(input: string | undefined | null): string {
  if (!input) return '';
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function alnumOnly(input: string | undefined | null): string {
  if (!input) return '';
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function soundex(input: string | undefined | null): string {
  const cleaned = (input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '');

  if (!cleaned) return '';

  const firstChar = cleaned[0];
  const map: Record<string, string> = {
    B: '1', F: '1', P: '1', V: '1',
    C: '2', G: '2', J: '2', K: '2', Q: '2', S: '2', X: '2', Z: '2',
    D: '3', T: '3',
    L: '4',
    M: '5', N: '5',
    R: '6',
  };

  let result = firstChar;
  let prevCode = map[firstChar] ?? '';

  for (let i = 1; i < cleaned.length && result.length < 4; i++) {
    const ch = cleaned[i];
    const code = map[ch] ?? '';
    if (code && code !== prevCode) {
      result += code;
    }
    if (ch !== 'H' && ch !== 'W') {
      prevCode = code;
    }
  }

  return result.padEnd(4, '0');
}

export function jaroSimilarity(s1: string, s2: string): number {
  if (s1 === s2) return 1;
  const len1 = s1.length;
  const len2 = s2.length;
  if (len1 === 0 || len2 === 0) return 0;

  const matchDistance = Math.max(0, Math.floor(Math.max(len1, len2) / 2) - 1);
  const s1Matches = new Array<boolean>(len1).fill(false);
  const s2Matches = new Array<boolean>(len2).fill(false);

  let matches = 0;
  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, len2);
    for (let j = start; j < end; j++) {
      if (s2Matches[j]) continue;
      if (s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  return (
    (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3
  );
}

export function jaroWinkler(rawA: string, rawB: string, prefixScale = 0.1): number {
  const a = normalizeText(rawA);
  const b = normalizeText(rawB);
  if (!a || !b) return 0;
  if (a === b) return 1;

  const jaro = jaroSimilarity(a, b);
  let prefix = 0;
  const maxPrefix = Math.min(4, a.length, b.length);
  for (let i = 0; i < maxPrefix; i++) {
    if (a[i] === b[i]) prefix++;
    else break;
  }

  return Math.min(1, jaro + prefix * prefixScale * (1 - jaro));
}

export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);

  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }

  return prev[n];
}

export function levenshteinSimilarity(rawA: string, rawB: string): number {
  const a = normalizeText(rawA);
  const b = normalizeText(rawB);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  return Math.max(0, 1 - levenshteinDistance(a, b) / maxLen);
}

export function tokenJaccard(rawA: string, rawB: string): number {
  const tokenize = (s: string) =>
    normalizeText(s)
      .split(' ')
      .filter(Boolean)
      .map((tok) => ADDRESS_ABBREVIATIONS[tok] ?? tok);

  const tokensA = new Set(tokenize(rawA));
  const tokensB = new Set(tokenize(rawB));

  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection++;
  }

  const union = new Set([...tokensA, ...tokensB]).size;
  return union === 0 ? 0 : intersection / union;
}

function parseDateParts(raw: string): { year: string; month: string; day: string } | null {
  const cleaned = raw.trim();
  const isoMatch = cleaned.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (isoMatch) {
    return {
      year: isoMatch[1],
      month: isoMatch[2].padStart(2, '0'),
      day: isoMatch[3].padStart(2, '0'),
    };
  }
  const dmyMatch = cleaned.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmyMatch) {
    return {
      year: dmyMatch[3],
      month: dmyMatch[2].padStart(2, '0'),
      day: dmyMatch[1].padStart(2, '0'),
    };
  }
  return null;
}

export function dateSimilarity(rawA: string, rawB: string): number {
  const a = rawA.trim();
  const b = rawB.trim();
  if (!a || !b) return 0;
  if (a === b) return 1;

  const pA = parseDateParts(a);
  const pB = parseDateParts(b);

  if (pA && pB) {
    if (pA.year === pB.year && pA.month === pB.month && pA.day === pB.day) {
      return 1;
    }
    // Month-day transposition (e.g. 1984-04-11 vs 1984-11-04)
    if (pA.year === pB.year && pA.month === pB.day && pA.day === pB.month) {
      return 0.88;
    }
    const isoA = `${pA.year}${pA.month}${pA.day}`;
    const isoB = `${pB.year}${pB.month}${pB.day}`;
    const dist = levenshteinDistance(isoA, isoB);
    if (dist === 1) return 0.85;
    if (dist === 2 && pA.year === pB.year) return 0.72;
    if (pA.year === pB.year && (pA.month === pB.month || pA.day === pB.day)) return 0.65;
    return Math.max(0, 1 - dist / 8);
  }

  return levenshteinSimilarity(a, b);
}

export function computeFieldSimilarity(
  rawA: string | undefined,
  rawB: string | undefined,
  comparator: ComparatorType
): number | null {
  const a = (rawA ?? '').trim();
  const b = (rawB ?? '').trim();

  if (!a || !b) return null;

  switch (comparator) {
    case 'exact':
      return alnumOnly(a) === alnumOnly(b) ? 1 : 0;
    case 'jaro_winkler':
      return jaroWinkler(a, b);
    case 'levenshtein':
      return levenshteinSimilarity(a, b);
    case 'soundex': {
      const sA = soundex(a);
      const sB = soundex(b);
      if (!sA || !sB) return 0;
      if (sA === sB) return jaroWinkler(a, b) >= 0.85 ? 1 : 0.92;
      return jaroWinkler(a, b) * 0.75;
    }
    case 'token_jaccard': {
      const jac = tokenJaccard(a, b);
      const jw = jaroWinkler(a, b);
      return Math.max(jac, jac * 0.7 + jw * 0.3);
    }
    case 'date_tolerance':
      return dateSimilarity(a, b);
    default:
      return jaroWinkler(a, b);
  }
}
