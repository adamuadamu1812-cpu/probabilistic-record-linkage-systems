import type { DatabaseRecord } from '../types/linkage';

export class GmailAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GmailAuthError';
  }
}

export interface GmailContactPreview {
  messageId: string;
  firstName: string;
  lastName: string;
  email: string;
  organization: string;
  subject: string;
  date: string;
}

export interface GmailProfileInfo {
  emailAddress: string;
  messagesTotal: number;
}

function encodeBase64UrlUtf8(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function encodeBase64StandardUtf8(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

async function gmailFetch<T>(
  url: string,
  accessToken: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers ?? {}),
    },
  });

  if (res.status === 401 || res.status === 403) {
    throw new GmailAuthError(
      'Gmail session expired or missing permissions. Please sign in with Google again.'
    );
  }

  if (!res.ok) {
    let detail = `Gmail API error (${res.status})`;
    try {
      const errBody = (await res.json()) as { error?: { message?: string } };
      if (errBody?.error?.message) {
        detail = errBody.error.message;
      }
    } catch {
      // ignore parse failure
    }
    throw new Error(detail);
  }

  return (await res.json()) as T;
}

export async function fetchGmailProfile(
  accessToken: string
): Promise<GmailProfileInfo> {
  const data = await gmailFetch<{
    emailAddress?: string;
    messagesTotal?: number;
  }>('https://gmail.googleapis.com/gmail/v1/users/me/profile', accessToken);
  return {
    emailAddress: data.emailAddress ?? '',
    messagesTotal: Number(data.messagesTotal ?? 0),
  };
}

function parseFromHeader(rawFrom: string): {
  firstName: string;
  lastName: string;
  email: string;
  organization: string;
} {
  const angleMatch = rawFrom.match(/^(.*?)<([^>]+)>/);
  const email = (angleMatch ? angleMatch[2] : rawFrom).trim().toLowerCase();
  const displayRaw = (angleMatch ? angleMatch[1] : '')
    .replace(/["']/g, '')
    .trim();

  let firstName = '';
  let lastName = '';

  if (displayRaw) {
    if (displayRaw.includes(',')) {
      const [last, first] = displayRaw.split(',').map((s) => s.trim());
      firstName = first ?? '';
      lastName = last ?? '';
    } else {
      const parts = displayRaw.split(/\s+/).filter(Boolean);
      firstName = parts[0] ?? '';
      lastName = parts.slice(1).join(' ');
    }
  } else if (email.includes('@')) {
    const localPart = email.split('@')[0];
    const tokens = localPart.split(/[._-]+/).filter(Boolean);
    firstName = tokens[0] ? tokens[0][0].toUpperCase() + tokens[0].slice(1) : '';
    lastName = tokens[1] ? tokens[1][0].toUpperCase() + tokens[1].slice(1) : '';
  }

  const domain = email.includes('@') ? email.split('@')[1] : '';
  const orgRoot = domain ? domain.split('.')[0] : '';
  const organization = orgRoot
    ? orgRoot[0].toUpperCase() + orgRoot.slice(1)
    : '';

  return { firstName, lastName, email, organization };
}

export async function listGmailMessageSenders(
  accessToken: string,
  queryText: string,
  maxResults = 20
): Promise<GmailContactPreview[]> {
  const qParam = queryText.trim()
    ? `&q=${encodeURIComponent(queryText.trim())}`
    : '';
  const listData = await gmailFetch<{
    messages?: Array<{ id: string }>;
  }>(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}${qParam}`,
    accessToken
  );

  const ids = (listData.messages ?? []).map((m) => m.id);
  if (ids.length === 0) return [];

  const details = await Promise.all(
    ids.map((id) =>
      gmailFetch<{
        id: string;
        payload?: {
          headers?: Array<{ name?: string; value?: string }>;
        };
      }>(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(
          id
        )}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
        accessToken
      )
    )
  );

  return details.map((msg) => {
    const headers = msg.payload?.headers ?? [];
    const getHeader = (name: string) =>
      headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? '';
    const parsed = parseFromHeader(getHeader('From'));
    return {
      messageId: msg.id,
      firstName: parsed.firstName,
      lastName: parsed.lastName,
      email: parsed.email,
      organization: parsed.organization,
      subject: getHeader('Subject') || '(No subject)',
      date: getHeader('Date'),
    };
  });
}

export function buildRecordsFromGmailContacts(
  contacts: GmailContactPreview[],
  source: 'A' | 'B'
): { records: DatabaseRecord[]; columns: string[] } {
  const columns = ['first_name', 'last_name', 'email', 'organization'];
  const records: DatabaseRecord[] = contacts.map((c, idx) => ({
    id: `GM-${source}-${idx + 1}`,
    source,
    fields: {
      first_name: c.firstName,
      last_name: c.lastName,
      email: c.email,
      organization: c.organization,
    },
  }));
  return { records, columns };
}

function buildMimeEmail(params: {
  to: string;
  subject: string;
  body: string;
  attachmentFilename?: string;
  attachmentCsv?: string;
}): string {
  const cleanTo = params.to.replace(/[\r\n]/g, '').trim();
  const cleanSubject = params.subject.replace(/[\r\n]/g, '').trim();

  if (!params.attachmentFilename || !params.attachmentCsv) {
    return [
      `To: ${cleanTo}`,
      `Subject: ${cleanSubject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset="UTF-8"',
      '',
      params.body,
    ].join('\r\n');
  }

  const boundary = `rl_boundary_${Date.now()}`;
  const b64Csv = encodeBase64StandardUtf8(params.attachmentCsv);
  const safeFilename = params.attachmentFilename.replace(/["\r\n]/g, '');

  return [
    `To: ${cleanTo}`,
    `Subject: ${cleanSubject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
    '',
    params.body,
    '',
    `--${boundary}`,
    `Content-Type: text/csv; charset="UTF-8"; name="${safeFilename}"`,
    `Content-Disposition: attachment; filename="${safeFilename}"`,
    'Content-Transfer-Encoding: base64',
    '',
    b64Csv,
    `--${boundary}--`,
  ].join('\r\n');
}

export async function sendGmailReportEmail(
  accessToken: string,
  params: {
    to: string;
    subject: string;
    body: string;
    attachmentFilename?: string;
    attachmentCsv?: string;
  }
): Promise<{ id: string; threadId?: string }> {
  const rawMime = buildMimeEmail(params);
  const raw = encodeBase64UrlUtf8(rawMime);

  return gmailFetch<{ id: string; threadId?: string }>(
    'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
    accessToken,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw }),
    }
  );
}

export async function createGmailReportDraft(
  accessToken: string,
  params: {
    to: string;
    subject: string;
    body: string;
    attachmentFilename?: string;
    attachmentCsv?: string;
  }
): Promise<{ id: string }> {
  const rawMime = buildMimeEmail(params);
  const raw = encodeBase64UrlUtf8(rawMime);

  return gmailFetch<{ id: string }>(
    'https://gmail.googleapis.com/gmail/v1/users/me/drafts',
    accessToken,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: { raw } }),
    }
  );
}
