import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Mail,
  RefreshCw,
  Send,
  ShieldAlert,
  Upload,
  X,
} from 'lucide-react';
import type { DatabaseRecord } from '../types/linkage';
import {
  buildRecordsFromGmailContacts,
  createGmailReportDraft,
  fetchGmailProfile,
  GmailAuthError,
  listGmailMessageSenders,
  sendGmailReportEmail,
  type GmailContactPreview,
} from '../lib/gmail';
import { clearCachedGmailAccessToken } from '../lib/firebase';
import { GoogleSignInButton } from './GoogleSignInButton';

interface GmailImportModalProps {
  isOpen: boolean;
  accessToken: string | null;
  onAuthorizeGoogle: () => Promise<void>;
  onClose: () => void;
  onImportRecords: (
    source: 'A' | 'B',
    records: DatabaseRecord[],
    columns: string[],
    datasetLabel: string
  ) => void;
}

export const GmailImportModal: React.FC<GmailImportModalProps> = ({
  isOpen,
  accessToken,
  onAuthorizeGoogle,
  onClose,
  onImportRecords,
}) => {
  const [gmailAddress, setGmailAddress] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [targetSource, setTargetSource] = useState<'A' | 'B'>('A');
  const [contacts, setContacts] = useState<GmailContactPreview[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [authorizing, setAuthorizing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadMessages = async (token: string, queryText: string) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [profile, items] = await Promise.all([
        fetchGmailProfile(token),
        listGmailMessageSenders(token, queryText, 20),
      ]);
      setGmailAddress(profile.emailAddress);
      setContacts(items);
      setSelectedIds(new Set(items.map((c) => c.messageId)));
    } catch (err) {
      if (err instanceof GmailAuthError) {
        clearCachedGmailAccessToken();
      }
      setErrorMsg(err instanceof Error ? err.message : 'Failed to fetch Gmail messages.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && accessToken) {
      void loadMessages(accessToken, '');
    } else if (!isOpen) {
      setErrorMsg(null);
    }
  }, [isOpen, accessToken]);

  useEffect(() => {
    if (!isOpen) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleAuth = async () => {
    setAuthorizing(true);
    setErrorMsg(null);
    try {
      await onAuthorizeGoogle();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Google sign-in failed.');
    } finally {
      setAuthorizing(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleImport = () => {
    const chosen = contacts.filter((c) => selectedIds.has(c.messageId));
    if (chosen.length === 0) return;
    const { records, columns } = buildRecordsFromGmailContacts(chosen, targetSource);
    const label = gmailAddress ? `Gmail (${gmailAddress})` : 'Gmail Senders';
    onImportRecords(targetSource, records, columns, label);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="gmail-import-title"
    >
      <div className="w-full max-w-3xl bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Mail className="w-4 h-4 text-blue-700" />
            <div>
              <h2 id="gmail-import-title" className="text-base font-semibold text-slate-900">
                Import Contact Records from Gmail
              </h2>
              <p className="text-xs text-slate-500">
                Extract sender names, emails, and organizations from Gmail messages into Database A or B for deduplication.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Gmail import modal"
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md hover:bg-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-4">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-2 text-xs text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {!accessToken ? (
            <div className="p-6 bg-slate-50 border border-slate-200 rounded-lg text-center space-y-4">
              <div className="text-sm font-medium text-slate-900">
                Connect your Google Account to read Gmail messages
              </div>
              <p className="text-xs text-slate-600 max-w-md mx-auto">
                With your permission, RecordLinkage reads message headers (`From`, `Subject`, `Date`) to extract contact records for probabilistic linkage.
              </p>
              <div className="flex justify-center">
                <GoogleSignInButton
                  label={authorizing ? 'Authorizing...' : 'Sign in with Google'}
                  disabled={authorizing}
                  onClick={handleAuth}
                />
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="text-xs text-slate-600">
                  Connected Mailbox:{' '}
                  <span className="font-mono font-medium text-slate-900">
                    {gmailAddress || 'Authenticated'}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-600">Import into:</span>
                  <select
                    value={targetSource}
                    onChange={(e) => setTargetSource(e.target.value as 'A' | 'B')}
                    className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-md bg-white text-slate-900"
                  >
                    <option value="A">Database A</option>
                    <option value="B">Database B</option>
                  </select>
                </div>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void loadMessages(accessToken, searchQuery);
                }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Optional Gmail search filter (e.g., from:acme.com or invoice)"
                  className="flex-1 px-3 py-1.5 text-xs border border-slate-300 rounded-md bg-white text-slate-900 focus:outline-none focus:border-blue-600"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-slate-800 bg-slate-100 border border-slate-300 rounded-md hover:bg-slate-200 disabled:opacity-50 whitespace-nowrap shrink-0"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                  <span>{loading ? 'Fetching...' : 'Search Gmail'}</span>
                </button>
              </form>

              <div className="border border-slate-200 rounded-md overflow-hidden">
                <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs text-slate-600">
                  <span>
                    Extracted Senders ({selectedIds.size} of {contacts.length} selected)
                  </span>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedIds(new Set(contacts.map((c) => c.messageId)))
                      }
                      className="text-blue-700 hover:underline"
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedIds(new Set())}
                      className="text-slate-600 hover:underline"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="max-h-72 overflow-y-auto">
                  {contacts.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-500">
                      {loading
                        ? 'Loading Gmail messages...'
                        : 'No messages found for this search filter.'}
                    </div>
                  ) : (
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
                        <tr>
                          <th className="py-2 px-3 w-8"></th>
                          <th className="py-2 px-3">First Name</th>
                          <th className="py-2 px-3">Last Name</th>
                          <th className="py-2 px-3">Email</th>
                          <th className="py-2 px-3">Org</th>
                          <th className="py-2 px-3">Subject</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {contacts.map((c) => (
                          <tr key={c.messageId} className="hover:bg-slate-50">
                            <td className="py-2 px-3">
                              <input
                                type="checkbox"
                                checked={selectedIds.has(c.messageId)}
                                onChange={() => toggleSelect(c.messageId)}
                                className="w-3.5 h-3.5 accent-blue-700"
                              />
                            </td>
                            <td className="py-2 px-3 text-slate-800">{c.firstName || '—'}</td>
                            <td className="py-2 px-3 text-slate-800">{c.lastName || '—'}</td>
                            <td className="py-2 px-3 font-mono text-[11px] text-slate-700">
                              {c.email}
                            </td>
                            <td className="py-2 px-3 text-slate-600">{c.organization || '—'}</td>
                            <td className="py-2 px-3 text-slate-500 truncate max-w-[180px]">
                              {c.subject}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-100"
          >
            Cancel
          </button>
          {accessToken && (
            <button
              type="button"
              disabled={selectedIds.size === 0 || loading}
              onClick={handleImport}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-700 rounded-md hover:bg-blue-800 disabled:opacity-50"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>
                Import {selectedIds.size} to DB {targetSource}
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

interface GmailShareModalProps {
  isOpen: boolean;
  accessToken: string | null;
  defaultRecipient: string;
  defaultSubject: string;
  defaultBody: string;
  attachmentFilename: string;
  attachmentCsv: string;
  onAuthorizeGoogle: () => Promise<void>;
  onClose: () => void;
  onSentOrDrafted: (action: 'sent' | 'draft', recipient: string, subject: string) => void;
}

export const GmailShareModal: React.FC<GmailShareModalProps> = ({
  isOpen,
  accessToken,
  defaultRecipient,
  defaultSubject,
  defaultBody,
  attachmentFilename,
  attachmentCsv,
  onAuthorizeGoogle,
  onClose,
  onSentOrDrafted,
}) => {
  const [gmailAddress, setGmailAddress] = useState<string>('');
  const [to, setTo] = useState(defaultRecipient);
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);
  const [includeAttachment, setIncludeAttachment] = useState(true);
  const [confirmAction, setConfirmAction] = useState<'send' | 'draft' | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [authorizing, setAuthorizing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTo(defaultRecipient);
      setSubject(defaultSubject);
      setBody(defaultBody);
      setConfirmAction(null);
      setErrorMsg(null);
      setSuccessMsg(null);
    }
  }, [isOpen, defaultRecipient, defaultSubject, defaultBody]);

  useEffect(() => {
    if (!isOpen || !accessToken) return;
    let active = true;
    fetchGmailProfile(accessToken)
      .then((profile) => {
        if (!active) return;
        setGmailAddress(profile.emailAddress);
        setTo((prev) => prev || profile.emailAddress);
      })
      .catch((err) => {
        if (!active) return;
        if (err instanceof GmailAuthError) {
          clearCachedGmailAccessToken();
        }
      });
    return () => {
      active = false;
    };
  }, [isOpen, accessToken]);

  useEffect(() => {
    if (!isOpen) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [isOpen, submitting, onClose]);

  if (!isOpen) return null;

  const handleAuth = async () => {
    setAuthorizing(true);
    setErrorMsg(null);
    try {
      await onAuthorizeGoogle();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Google sign-in failed.');
    } finally {
      setAuthorizing(false);
    }
  };

  const handleConfirmedExecute = async () => {
    if (!accessToken || !confirmAction) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const payload = {
        to: to.trim(),
        subject: subject.trim(),
        body,
        ...(includeAttachment
          ? { attachmentFilename, attachmentCsv }
          : {}),
      };

      if (confirmAction === 'send') {
        await sendGmailReportEmail(accessToken, payload);
        setSuccessMsg(`Email sent to ${to.trim()} via Gmail.`);
        onSentOrDrafted('sent', to.trim(), subject.trim());
      } else {
        await createGmailReportDraft(accessToken, payload);
        setSuccessMsg(`Draft saved to your Gmail account (${gmailAddress || 'me'}).`);
        onSentOrDrafted('draft', to.trim(), subject.trim());
      }
      setConfirmAction(null);
    } catch (err) {
      if (err instanceof GmailAuthError) {
        clearCachedGmailAccessToken();
      }
      setErrorMsg(err instanceof Error ? err.message : 'Gmail request failed.');
      setConfirmAction(null);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="gmail-share-title"
    >
      <div className="w-full max-w-xl bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Mail className="w-4 h-4 text-blue-700" />
            <div>
              <h2 id="gmail-share-title" className="text-base font-semibold text-slate-900">
                Share Linkage Report via Gmail
              </h2>
              <p className="text-xs text-slate-500">
                Send summary metrics and CSV results directly from your Gmail account.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close Gmail share modal"
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md hover:bg-slate-100 disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-4">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-2 text-xs text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-md flex items-start gap-2 text-xs text-emerald-800">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {!accessToken ? (
            <div className="p-6 bg-slate-50 border border-slate-200 rounded-lg text-center space-y-4">
              <div className="text-sm font-medium text-slate-900">
                Sign in with Google to send or draft emails via Gmail
              </div>
              <p className="text-xs text-slate-600 max-w-md mx-auto">
                RecordLinkage requests permission to compose and send your linkage report using your connected Gmail account.
              </p>
              <div className="flex justify-center">
                <GoogleSignInButton
                  label={authorizing ? 'Authorizing...' : 'Sign in with Google'}
                  disabled={authorizing}
                  onClick={handleAuth}
                />
              </div>
            </div>
          ) : confirmAction ? (
            <div className="p-5 bg-amber-50 border border-amber-200 rounded-lg space-y-4">
              <div className="flex items-start gap-2.5">
                <ShieldAlert className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    {confirmAction === 'send'
                      ? 'Confirm Sending Email via Gmail?'
                      : 'Confirm Saving Gmail Draft?'}
                  </h3>
                  <p className="text-xs text-slate-700 mt-1">
                    {confirmAction === 'send'
                      ? 'This will send an actual email from your Gmail account to the recipient below.'
                      : 'This will create a new draft message in your Gmail mailbox.'}
                  </p>
                </div>
              </div>

              <div className="p-3 bg-white border border-amber-200 rounded text-xs space-y-1.5 text-slate-700">
                <div>
                  <span className="font-semibold text-slate-900">From:</span>{' '}
                  <span className="font-mono">{gmailAddress || 'Connected Gmail'}</span>
                </div>
                <div>
                  <span className="font-semibold text-slate-900">To:</span>{' '}
                  <span className="font-mono">{to.trim()}</span>
                </div>
                <div>
                  <span className="font-semibold text-slate-900">Subject:</span> {subject.trim()}
                </div>
                {includeAttachment && (
                  <div>
                    <span className="font-semibold text-slate-900">Attachment:</span>{' '}
                    <span className="font-mono">{attachmentFilename}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setConfirmAction(null)}
                  className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleConfirmedExecute}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-700 rounded-md hover:bg-blue-800 disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>
                    {submitting
                      ? 'Processing...'
                      : confirmAction === 'send'
                        ? 'Confirm & Send Email'
                        : 'Confirm & Save Draft'}
                  </span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {gmailAddress && (
                <div className="text-xs text-slate-600">
                  Sending as{' '}
                  <span className="font-mono font-medium text-slate-900">{gmailAddress}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Recipient (To)
                </label>
                <input
                  type="email"
                  required
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  placeholder="colleague@organization.org"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md bg-white text-slate-900 focus:outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Subject
                </label>
                <input
                  type="text"
                  required
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md bg-white text-slate-900 focus:outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Summary Body
                </label>
                <textarea
                  rows={7}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-md bg-white text-slate-900 focus:outline-none focus:border-blue-600"
                />
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeAttachment}
                  onChange={(e) => setIncludeAttachment(e.target.checked)}
                  className="w-3.5 h-3.5 accent-blue-700"
                />
                <span>
                  Attach <span className="font-mono">{attachmentFilename}</span>
                </span>
              </label>
            </div>
          )}
        </div>

        {accessToken && !confirmAction && (
          <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-100"
            >
              Close
            </button>
            <button
              type="button"
              disabled={!to.trim() || !subject.trim()}
              onClick={() => setConfirmAction('draft')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-100 disabled:opacity-40"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Save as Draft</span>
            </button>
            <button
              type="button"
              disabled={!to.trim() || !subject.trim()}
              onClick={() => setConfirmAction('send')}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-700 rounded-md hover:bg-blue-800 disabled:opacity-40"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Send via Gmail</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
