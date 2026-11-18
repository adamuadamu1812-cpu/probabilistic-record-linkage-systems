import React, { useEffect, useState } from 'react';
import { LogIn, ShieldCheck, UserPlus, X } from 'lucide-react';
import { GoogleSignInButton } from './GoogleSignInButton';

export type AuthModalMode = 'login' | 'signup';

interface AuthModalProps {
  isOpen: boolean;
  initialMode: AuthModalMode;
  isSubmitting: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onAuthenticate: (
    mode: AuthModalMode,
    metadata?: { displayName?: string; roleLabel?: string }
  ) => Promise<void>;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  initialMode,
  isSubmitting,
  errorMessage,
  onClose,
  onAuthenticate,
}) => {
  const [mode, setMode] = useState<AuthModalMode>(initialMode);
  const [displayName, setDisplayName] = useState('');
  const [roleLabel, setRoleLabel] = useState('');

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
    }
  }, [isOpen, initialMode]);

  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'signup') {
      await onAuthenticate('signup', {
        displayName: displayName.trim() || undefined,
        roleLabel: roleLabel.trim() || undefined,
      });
    } else {
      await onAuthenticate('login');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 id="auth-modal-title" className="text-base font-semibold text-slate-900">
              {mode === 'login' ? 'Log in to RecordLinkage' : 'Create Analyst Account'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {mode === 'login'
                ? 'Access your saved model calibration snapshots and Gmail tools.'
                : 'Set up your profile to persist thresholds and connect Gmail.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Close authentication modal"
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md hover:bg-slate-100 transition-colors disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 pt-4">
          <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-md">
            <button
              type="button"
              onClick={() => setMode('login')}
              disabled={isSubmitting}
              className={`inline-flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded transition-colors ${
                mode === 'login'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Log In</span>
            </button>
            <button
              type="button"
              onClick={() => setMode('signup')}
              disabled={isSubmitting}
              className={`inline-flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded transition-colors ${
                mode === 'signup'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Sign Up</span>
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {mode === 'signup' && (
            <div className="space-y-3">
              <div>
                <label
                  htmlFor="signup-display-name"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Display Name <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <input
                  id="signup-display-name"
                  type="text"
                  maxLength={80}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g., Dr. Ada Lovelace"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label
                  htmlFor="signup-role-label"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Team or Role <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <input
                  id="signup-role-label"
                  type="text"
                  maxLength={60}
                  value={roleLabel}
                  onChange={(e) => setRoleLabel(e.target.value)}
                  placeholder="e.g., Data Quality Lead"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600"
                />
              </div>
            </div>
          )}

          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-md flex items-start gap-2.5 text-xs text-slate-600">
            <ShieldCheck className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
            <span>
              {mode === 'login'
                ? 'Authenticate with Google to access your profile, snapshots, and Gmail integration.'
                : 'Your Google account verifies your identity, creates an analyst profile, and connects Gmail with your permission.'}
            </span>
          </div>

          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-700">
              {errorMessage}
            </div>
          )}

          <GoogleSignInButton
            type="submit"
            disabled={isSubmitting}
            className="w-full"
            label={
              isSubmitting
                ? 'Connecting...'
                : mode === 'login'
                  ? 'Sign in with Google'
                  : 'Sign up with Google'
            }
          />
        </form>
      </div>
    </div>
  );
};
