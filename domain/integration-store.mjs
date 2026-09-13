import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const integrationsPath = path.join(root, '..', 'data', 'integrations.json');

function encryptionKey() {
  const configured = String(process.env.HANGON_INTEGRATION_ENCRYPTION_KEY || '').trim();
  if (/^[0-9a-f]{64}$/i.test(configured)) return Buffer.from(configured, 'hex');
  if (configured) {
    const decoded = Buffer.from(configured, 'base64');
    if (decoded.length === 32) return decoded;
  }
  return null;
}

function encrypt(value) {
  const key = encryptionKey();
  if (!key) throw new Error('HANGON_INTEGRATION_ENCRYPTION_KEY must be a 32-byte hex or base64 value.');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return { iv: iv.toString('base64url'), tag: cipher.getAuthTag().toString('base64url'), value: ciphertext.toString('base64url') };
}

function decrypt(payload) {
  const key = encryptionKey();
  if (!key || !payload?.iv || !payload?.tag || !payload?.value) return null;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(payload.tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(payload.value, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

async function readAll() {
  try {
    const data = JSON.parse(await fsp.readFile(integrationsPath, 'utf8'));
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

async function writeAll(data) {
  await fsp.mkdir(path.dirname(integrationsPath), { recursive: true });
  const temporary = integrationsPath + '.' + process.pid + '.tmp';
  await fsp.writeFile(temporary, JSON.stringify(data, null, 2) + '\n', 'utf8');
  await fsp.rename(temporary, integrationsPath);
}

function validate(url, secret) {
  let parsed;
  try { parsed = new URL(url); } catch { throw Object.assign(new Error('Webhook URL must be a valid URL.'), { statusCode: 422 }); }
  if (!['https:', 'http:'].includes(parsed.protocol)) throw Object.assign(new Error('Webhook URL must use HTTP or HTTPS.'), { statusCode: 422 });
  if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') throw Object.assign(new Error('Production webhooks must use HTTPS.'), { statusCode: 422 });
  if (typeof secret !== 'string' || secret.length < 32 || secret.length > 512) throw Object.assign(new Error('Webhook secret must be between 32 and 512 characters.'), { statusCode: 422 });
}

function maskedUrl(url) {
  try {
    const parsed = new URL(url);
    const pathPart = parsed.pathname.length > 1 ? parsed.pathname.slice(0, 10) + '...' : '';
    return parsed.origin + pathPart;
  } catch {
    return 'Invalid URL';
  }
}

export async function getWebhookIntegration(workspaceId) {
  const all = await readAll();
  const saved = all[workspaceId];
  if (saved) {
    if (saved.enabled === false) return null;
    const secret = decrypt(saved.secret);
    return secret ? { url: saved.url, secret, source: 'workspace', updated_at: saved.updated_at } : null;
  }
  if (workspaceId === 'workspace-local' && process.env.HANGON_REQUEST_WEBHOOK_URL && process.env.HANGON_REQUEST_WEBHOOK_SECRET) {
    return { url: process.env.HANGON_REQUEST_WEBHOOK_URL, secret: process.env.HANGON_REQUEST_WEBHOOK_SECRET, source: 'environment' };
  }
  return null;
}

export async function getPublicWebhookIntegration(workspaceId) {
  const all = await readAll();
  const saved = all[workspaceId];
  if (saved?.enabled === false) return { configured: false, enabled: false, source: 'workspace', updated_at: saved.updated_at };
  if (saved?.url) return { configured: Boolean(decrypt(saved.secret)), enabled: true, source: 'workspace', url: maskedUrl(saved.url), updated_at: saved.updated_at };
  if (workspaceId === 'workspace-local' && process.env.HANGON_REQUEST_WEBHOOK_URL && process.env.HANGON_REQUEST_WEBHOOK_SECRET) {
    return { configured: true, enabled: true, source: 'environment', url: maskedUrl(process.env.HANGON_REQUEST_WEBHOOK_URL) };
  }
  return { configured: false, enabled: false, source: 'workspace' };
}

export async function configureWebhookIntegration(workspaceId, { url, secret }) {
  validate(url, secret);
  const all = await readAll();
  all[workspaceId] = { url, secret: encrypt(secret), enabled: true, updated_at: new Date().toISOString() };
  await writeAll(all);
  return getPublicWebhookIntegration(workspaceId);
}

export async function removeWebhookIntegration(workspaceId) {
  const all = await readAll();
  if (all[workspaceId]) {
    delete all[workspaceId];
    await writeAll(all);
  }
  return { configured: false, enabled: false, source: 'workspace' };
}
