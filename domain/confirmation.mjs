import crypto from 'node:crypto';

const TTL_MS = 5 * 60 * 1000;

function secret() {
  const value = process.env.HANGON_CONFIRMATION_SECRET || process.env.HANGON_SESSION_SECRET;
  if (!value && process.env.NODE_ENV === 'production') {
    throw new Error('HANGON_CONFIRMATION_SECRET is required in production.');
  }
  return value || 'local-confirmation-secret';
}

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function createConfirmationToken({ workspaceId, idempotencyKey, summary, details, route }) {
  const issuedAt = Date.now();
  const payload = {
    workspaceId,
    idempotencyKey,
    proposalHash: digest(JSON.stringify({ summary, details, route })),
    issuedAt,
    expiresAt: issuedAt + TTL_MS,
    nonce: crypto.randomBytes(16).toString('hex'),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret()).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

export function verifyConfirmationToken(token, { workspaceId, idempotencyKey, summary, details, route }) {
  if (typeof token !== 'string') return { ok: false, reason: 'confirmation_token_required' };
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) return { ok: false, reason: 'invalid_confirmation_token' };
  const expected = crypto.createHmac('sha256', secret()).update(encoded).digest('base64url');
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return { ok: false, reason: 'invalid_confirmation_token' };
  }
  let payload;
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, reason: 'invalid_confirmation_token' };
  }
  if (payload.workspaceId !== workspaceId || payload.idempotencyKey !== idempotencyKey) {
    return { ok: false, reason: 'confirmation_scope_mismatch' };
  }
  if (!Number.isFinite(payload.expiresAt) || payload.expiresAt < Date.now()) {
    return { ok: false, reason: 'confirmation_expired' };
  }
  const expectedHash = digest(JSON.stringify({ summary, details, route }));
  if (payload.proposalHash !== expectedHash) return { ok: false, reason: 'confirmation_content_mismatch' };
  return { ok: true, payload };
}
