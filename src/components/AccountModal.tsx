import React, { useEffect, useState } from 'react';
import { BookmarkPlus, Check, LogOut, Trash2, Upload, User, X } from 'lucide-react';
import type {
  SavedWorkspaceRecord,
  UserPrivateRecord,
  UserProfileRecord,
} from '../lib/firebase';

interface AccountModalProps {
  isOpen: boolean;
  profile: UserProfileRecord | null;
  privateInfo: UserPrivateRecord | null;
  snapshots: SavedWorkspaceRecord[];
  currentSummary: {
    presetId: string;
    dbAName: string;
    dbBName: string;
    lowerThreshold: number;
    upperThreshold: number;
    priorMatch: number;
    enforceOneToOne: boolean;
    matchCount: number;
    clericalCount: number;
  };
  onClose: () => void;
  onUpdateProfile: (displayName: string, roleLabel?: string) => Promise<void>;
  onSaveSnapshot: (name: string) => Promise<void>;
  onLoadSnapshot: (snapshot: SavedWorkspaceRecord) => void;
  onDeleteSnapshot: (workspaceId: string) => Promise<void>;
  onSignOut: () => Promise<void>;
}

export const AccountModal: React.FC<AccountModalProps> = ({
  isOpen,
  profile,
  privateInfo,
  snapshots,
  currentSummary,
  onClose,
  onUpdateProfile,
  onSaveSnapshot,
  onLoadSnapshot,
  onDeleteSnapshot,
  onSignOut,
}) => {
  const [displayName, setDisplayName] = useState(profile?.displayName ?? '');
  const [roleLabel, setRoleLabel] = useState(profile?.roleLabel ?? '');
  const [snapshotName, setSnapshotName] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [savingSnapshot, setSavingSnapshot] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && profile) {
      setDisplayName(profile.displayName);
      setRoleLabel(profile.roleLabel ?? '');
      setSnapshotName(`${currentSummary.dbAName} × ${currentSummary.dbBName}`.slice(0, 80));
      setErrorMsg(null);
      setProfileSaved(false);
    }
  }, [isOpen, profile, currentSummary.dbAName, currentSummary.dbBName]);

  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen || !profile) return null;

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) return;
    setSavingProfile(true);
    setErrorMsg(null);
    try {
      await onUpdateProfile(displayName.trim(), roleLabel.trim() || undefined);
      setProfileSaved(true);
      window.setTimeout(() => setProfileSaved(false), 2000);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleCreateSnapshot = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = snapshotName.trim() || 'Calibration Snapshot';
    setSavingSnapshot(true);
    setErrorMsg(null);
    try {
      await onSaveSnapshot(title);
      setSnapshotName('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save snapshot.');
    } finally {
      setSavingSnapshot(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="account-modal-title"
    >
      <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <User className="w-4 h-4 text-blue-700" />
            <div>
              <h2 id="account-modal-title" className="text-base font-semibold text-slate-900">
                Analyst Account &amp; Saved Snapshots
              </h2>
              {privateInfo?.email && (
                <p className="text-xs text-slate-500 font-mono">{privateInfo.email}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onSignOut}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 bg-white border border-red-200 rounded-md hover:bg-red-50 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Log Out</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close account modal"
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md hover:bg-slate-100 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto space-y-6">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-700">
              {errorMsg}
            </div>
          )}

          {/* Profile section */}
          <form onSubmit={handleSaveProfile} className="space-y-3">
            <div className="text-xs font-semibold text-slate-800">Profile Settings</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="account-display-name"
                  className="block text-xs font-medium text-slate-600 mb-1"
                >
                  Display Name
                </label>
                <input
                  id="account-display-name"
                  type="text"
                  required
                  maxLength={80}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-md bg-white text-slate-900 focus:outline-none focus:border-blue-600"
                />
              </div>
              <div>
                <label
                  htmlFor="account-role-label"
                  className="block text-xs font-medium text-slate-600 mb-1"
                >
                  Team / Role
                </label>
                <input
                  id="account-role-label"
                  type="text"
                  maxLength={60}
                  value={roleLabel}
                  onChange={(e) => setRoleLabel(e.target.value)}
                  placeholder="Optional"
                  className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-md bg-white text-slate-900 focus:outline-none focus:border-blue-600"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={savingProfile}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-slate-800 bg-slate-100 border border-slate-300 rounded-md hover:bg-slate-200 transition-colors disabled:opacity-50"
              >
                {profileSaved ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-700" />
                    <span>Saved</span>
                  </>
                ) : (
                  <span>{savingProfile ? 'Saving...' : 'Update Profile'}</span>
                )}
              </button>
            </div>
          </form>

          {/* Save current model snapshot */}
          <div className="pt-5 border-t border-slate-200 space-y-3">
            <div>
              <div className="text-xs font-semibold text-slate-800">
                Save Current Calibration Snapshot
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Stores active thresholds (T_λ={currentSummary.lowerThreshold.toFixed(1)}, T_μ=
                {currentSummary.upperThreshold.toFixed(1)}), prior π_M=
                {(currentSummary.priorMatch * 100).toFixed(1)}%, and 1-to-1 mode to your account.
              </p>
            </div>

            <form onSubmit={handleCreateSnapshot} className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                maxLength={100}
                value={snapshotName}
                onChange={(e) => setSnapshotName(e.target.value)}
                placeholder="Snapshot label (e.g., Strict Census Calibration)"
                className="flex-1 px-3 py-1.5 text-sm border border-slate-300 rounded-md bg-white text-slate-900 focus:outline-none focus:border-blue-600"
              />
              <button
                type="submit"
                disabled={savingSnapshot}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white bg-blue-700 rounded-md hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
              >
                <BookmarkPlus className="w-3.5 h-3.5" />
                <span>{savingSnapshot ? 'Saving...' : 'Save Snapshot'}</span>
              </button>
            </form>
          </div>

          {/* Saved snapshots list */}
          <div className="pt-5 border-t border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-800">
                Saved Snapshots ({snapshots.length})
              </span>
            </div>

            {snapshots.length === 0 ? (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-md text-xs text-slate-500 text-center">
                No saved calibration snapshots yet.
              </div>
            ) : (
              <div className="divide-y divide-slate-200 border border-slate-200 rounded-md">
                {snapshots.map((snap) => (
                  <div
                    key={snap.id}
                    className="px-4 py-3 flex flex-wrap items-center justify-between gap-3 bg-white"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-900 truncate">
                        {snap.name}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono tabular-nums mt-0.5">
                        T_λ {snap.lowerThreshold.toFixed(1)} · T_μ {snap.upperThreshold.toFixed(1)}{' '}
                        · π_M {(snap.priorMatch * 100).toFixed(1)}% · {snap.matchCount} matches
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => onLoadSnapshot(snap)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100 transition-colors"
                      >
                        <Upload className="w-3 h-3" />
                        <span>Apply</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteSnapshot(snap.id)}
                        aria-label={`Delete ${snap.name}`}
                        className="p-1.5 text-slate-400 hover:text-red-700 rounded hover:bg-red-50 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
