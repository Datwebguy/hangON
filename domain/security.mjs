import crypto from 'node:crypto';

const COOKIE_NAME = 'hangon_session';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

function secret() {
  if (process.env.HANGON_SESSION_SECRET) return process.env.HANGON_SESSION_SECRET;
  if (!globalThis.__hangonSessionSecret) globalThis.__hangonSessionSecret = crypto.randomBytes(32).toString('hex');
  return globalThis.__hangonSessionSecret;
}

function sign(value) {
  return crypto.createHmac('sha256', secret()).update(value).digest('base64url');
}

function safeEqual(left, right) {
  const a = Buffer.from(left || '');
  const b = Buffer.from(right || '');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map((part) => {
    const index = part.indexOf('=');
    if (index < 0) return ['', ''];
    return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
  }).filter(([key]) => key));
}

export function createSession(workspaceId) {
  const payload = {
    sid: crypto.randomUUID(),
    workspace_id: workspaceId,
    role: 'operator',
    csrf: crypto.randomBytes(24).toString('base64url'),
    exp: Date.now() + SESSION_TTL_MS
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return { payload, value: encoded + '.' + sign(encoded) };
}

export function readSession(req) {
  const raw = parseCookies(req.headers.cookie || '')[COOKIE_NAME];
  if (!raw) return null;
  const [encoded, signature] = raw.split('.');
  if (!encoded || !safeEqual(signature, sign(encoded))) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!payload.sid || !payload.workspace_id || !payload.csrf || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function sessionCookie(value) {
  return `${COOKIE_NAME}=${encodeURIComponent(value)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_MS / 1000}`;
}

export function isProduction() {
  return process.env.NODE_ENV === 'production';
}

export function hasConfiguredOperatorAccess(req) {
  const expected = process.env.HANGON_OPERATOR_TOKEN;
  if (!expected) return false;
  const supplied = req.headers['x-hangon-operator-token'] || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  return safeEqual(String(supplied), expected);
}

export { COOKIE_NAME };
