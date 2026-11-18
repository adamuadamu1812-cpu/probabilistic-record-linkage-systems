import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  getAuth,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getFirestore,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Timestamp,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

export const GMAIL_SCOPES = [
  'https://mail.google.com/',
  'https://www.googleapis.com/auth/gmail.addons.current.action.compose',
  'https://www.googleapis.com/auth/gmail.addons.current.message.action',
  'https://www.googleapis.com/auth/gmail.addons.current.message.metadata',
  'https://www.googleapis.com/auth/gmail.addons.current.message.readonly',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.insert',
  'https://www.googleapis.com/auth/gmail.labels',
  'https://www.googleapis.com/auth/gmail.metadata',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.settings.basic',
  'https://www.googleapis.com/auth/gmail.settings.sharing',
] as const;

const app = initializeApp(firebaseConfig);
const firestoreDatabaseId =
  (firebaseConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId ??
  'ai-studio-fellegisunterrec-bf9bc962-8d41-41e4-ab5e-442f217d1bd9';
export const db = getFirestore(app, firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });
for (const scope of GMAIL_SCOPES) {
  googleProvider.addScope(scope);
}

// In-memory cache only (never localStorage or sessionStorage)
let cachedGmailAccessToken: string | null = null;
const tokenListeners = new Set<(token: string | null) => void>();

export function getCachedGmailAccessToken(): string | null {
  return cachedGmailAccessToken;
}

export function setCachedGmailAccessToken(token: string | null): void {
  cachedGmailAccessToken = token;
  for (const listener of tokenListeners) {
    listener(token);
  }
}

export function clearCachedGmailAccessToken(): void {
  setCachedGmailAccessToken(null);
}

export function subscribeGmailAccessToken(
  listener: (token: string | null) => void
): () => void {
  tokenListeners.add(listener);
  return () => {
    tokenListeners.delete(listener);
  };
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('the client is offline')
    ) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

void testConnection();

export interface UserProfileRecord {
  uid: string;
  displayName: string;
  roleLabel?: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface UserPrivateRecord {
  uid: string;
  email: string;
}

export interface SavedWorkspaceRecord {
  id: string;
  ownerId: string;
  name: string;
  presetId: string;
  dbAName: string;
  dbBName: string;
  lowerThreshold: number;
  upperThreshold: number;
  priorMatch: number;
  enforceOneToOne: boolean;
  matchCount: number;
  clericalCount: number;
  updatedAtMs: number;
}

const ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

function clampText(value: string, maxLen: number, fallback: string): string {
  const trimmed = value.trim().slice(0, maxLen);
  return trimmed.length > 0 ? trimmed : fallback;
}

function sanitizeId(value: string, maxLen: number, fallback: string): string {
  const cleaned = value
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, maxLen);
  return cleaned.length > 0 && ID_PATTERN.test(cleaned) ? cleaned : fallback;
}

export async function signInWithGooglePopup(): Promise<User> {
  const cred = await signInWithPopup(auth, googleProvider);
  const oauthCredential = GoogleAuthProvider.credentialFromResult(cred);
  if (oauthCredential?.accessToken) {
    setCachedGmailAccessToken(oauthCredential.accessToken);
  }
  return cred.user;
}

export async function signOutAccount(): Promise<void> {
  await signOut(auth);
  clearCachedGmailAccessToken();
}

export async function syncUserAccount(
  user: User,
  signUpMetadata?: { displayName?: string; roleLabel?: string }
): Promise<{
  profile: UserProfileRecord;
  privateInfo: UserPrivateRecord | null;
  isNewUser: boolean;
}> {
  const userPath = `users/${user.uid}`;
  const privatePath = `users/${user.uid}/private/info`;
  const userRef = doc(db, 'users', user.uid);
  const privateRef = doc(db, 'users', user.uid, 'private', 'info');

  let existingSnap;
  try {
    existingSnap = await getDoc(userRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, userPath);
  }

  const fallbackName =
    user.displayName || user.email?.split('@')[0] || 'Linkage Analyst';
  const requestedName = signUpMetadata?.displayName
    ? clampText(signUpMetadata.displayName, 80, fallbackName)
    : clampText(fallbackName, 80, 'Linkage Analyst');
  const requestedRole = signUpMetadata?.roleLabel?.trim()
    ? clampText(signUpMetadata.roleLabel, 60, '')
    : '';

  if (!existingSnap.exists()) {
    const profilePayload: Record<string, unknown> = {
      uid: user.uid,
      displayName: requestedName,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (requestedRole) {
      profilePayload.roleLabel = requestedRole;
    }

    const batch = writeBatch(db);
    batch.set(userRef, profilePayload);

    const userEmail = user.email?.trim().slice(0, 254) || '';
    if (userEmail) {
      batch.set(privateRef, {
        uid: user.uid,
        email: userEmail,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, userPath);
    }

    return {
      profile: {
        uid: user.uid,
        displayName: requestedName,
        ...(requestedRole ? { roleLabel: requestedRole } : {}),
      },
      privateInfo: userEmail ? { uid: user.uid, email: userEmail } : null,
      isNewUser: true,
    };
  }

  const existingData = existingSnap.data() as UserProfileRecord;
  if (
    signUpMetadata &&
    (signUpMetadata.displayName?.trim() || signUpMetadata.roleLabel?.trim())
  ) {
    const nextDisplayName = signUpMetadata.displayName?.trim()
      ? clampText(signUpMetadata.displayName, 80, existingData.displayName)
      : existingData.displayName;
    const nextRole = signUpMetadata.roleLabel?.trim()
      ? clampText(signUpMetadata.roleLabel, 60, '')
      : existingData.roleLabel;

    const patch: Record<string, unknown> = {
      displayName: nextDisplayName,
      updatedAt: serverTimestamp(),
    };
    if (nextRole) {
      patch.roleLabel = nextRole;
    }

    try {
      await updateDoc(userRef, patch);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, userPath);
    }

    existingData.displayName = nextDisplayName;
    if (nextRole) existingData.roleLabel = nextRole;
  }

  let privateInfo: UserPrivateRecord | null = null;
  try {
    const privSnap = await getDoc(privateRef);
    if (privSnap.exists()) {
      privateInfo = privSnap.data() as UserPrivateRecord;
    } else if (user.email) {
      const userEmail = user.email.trim().slice(0, 254);
      await setDoc(privateRef, {
        uid: user.uid,
        email: userEmail,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      privateInfo = { uid: user.uid, email: userEmail };
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, privatePath);
  }

  return {
    profile: existingData,
    privateInfo,
    isNewUser: false,
  };
}

export async function updateUserProfile(
  uid: string,
  displayName: string,
  roleLabel?: string
): Promise<UserProfileRecord> {
  const userPath = `users/${uid}`;
  const cleanName = clampText(displayName, 80, 'Linkage Analyst');
  const cleanRole = roleLabel?.trim() ? clampText(roleLabel, 60, '') : '';

  const patch: Record<string, unknown> = {
    displayName: cleanName,
    updatedAt: serverTimestamp(),
  };
  if (cleanRole) {
    patch.roleLabel = cleanRole;
  }

  try {
    await updateDoc(doc(db, 'users', uid), patch);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, userPath);
  }

  return {
    uid,
    displayName: cleanName,
    ...(cleanRole ? { roleLabel: cleanRole } : {}),
  };
}

export function subscribeUserWorkspaces(
  uid: string,
  onData: (items: SavedWorkspaceRecord[]) => void
): () => void {
  const path = `users/${uid}/workspaces`;
  const q = query(
    collection(db, 'users', uid, 'workspaces'),
    where('ownerId', '==', uid)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const items: SavedWorkspaceRecord[] = snapshot.docs.map((d) => {
        const data = d.data();
        const updatedTs = data.updatedAt as Timestamp | undefined;
        return {
          id: d.id,
          ownerId: String(data.ownerId ?? uid),
          name: String(data.name ?? 'Untitled Snapshot'),
          presetId: String(data.presetId ?? 'custom'),
          dbAName: String(data.dbAName ?? 'Source A'),
          dbBName: String(data.dbBName ?? 'Source B'),
          lowerThreshold: Number(data.lowerThreshold ?? 4.5),
          upperThreshold: Number(data.upperThreshold ?? 11.0),
          priorMatch: Number(data.priorMatch ?? 0.25),
          enforceOneToOne: Boolean(data.enforceOneToOne ?? true),
          matchCount: Number(data.matchCount ?? 0),
          clericalCount: Number(data.clericalCount ?? 0),
          updatedAtMs: updatedTs?.toMillis ? updatedTs.toMillis() : Date.now(),
        };
      });
      items.sort((a, b) => b.updatedAtMs - a.updatedAtMs);
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function saveWorkspaceSnapshot(
  uid: string,
  input: {
    name: string;
    presetId: string;
    dbAName: string;
    dbBName: string;
    lowerThreshold: number;
    upperThreshold: number;
    priorMatch: number;
    enforceOneToOne: boolean;
    matchCount: number;
    clericalCount: number;
  }
): Promise<string> {
  const workspaceId = `ws_${Date.now()}`;
  const path = `users/${uid}/workspaces/${workspaceId}`;

  const clampedLower = Math.max(-30, Math.min(50, input.lowerThreshold));
  const clampedUpper = Math.max(clampedLower, Math.min(50, input.upperThreshold));
  const clampedPrior = Math.max(0, Math.min(1, input.priorMatch));

  try {
    await setDoc(doc(db, 'users', uid, 'workspaces', workspaceId), {
      ownerId: uid,
      name: clampText(input.name, 100, 'Calibration Snapshot'),
      presetId: sanitizeId(input.presetId, 64, 'custom'),
      dbAName: clampText(input.dbAName, 100, 'Source A'),
      dbBName: clampText(input.dbBName, 100, 'Source B'),
      lowerThreshold: clampedLower,
      upperThreshold: clampedUpper,
      priorMatch: clampedPrior,
      enforceOneToOne: Boolean(input.enforceOneToOne),
      matchCount: Math.max(0, Math.round(input.matchCount)),
      clericalCount: Math.max(0, Math.round(input.clericalCount)),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }

  return workspaceId;
}

export async function deleteWorkspaceSnapshot(
  uid: string,
  workspaceId: string
): Promise<void> {
  const path = `users/${uid}/workspaces/${workspaceId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'workspaces', workspaceId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
