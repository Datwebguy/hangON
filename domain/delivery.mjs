import crypto from 'node:crypto';
import { getWebhookIntegration } from './integration-store.mjs';

const blockedKeys = /^(password|passcode|secret|token|api[_-]?key|authorization|cookie|session|audio|recording|transcript|raw[_-]?text|credit[_-]?card|card[_-]?number|cvv|bank[_-]?account|ssn|social[_-]?security)$/i;

function safeValue(value, depth = 0) {
  if (depth > 3) return '[omitted]';
  if (typeof value === 'string') return value.slice(0, 2000);
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => safeValue(item, depth + 1));
  if (value && typeof value === 'object') {
    return Object.entries(value).slice(0, 40).reduce((result, [key, item]) => {
      if (!blockedKeys.test(key)) result[key] = safeValue(item, depth + 1);
      return result;
    }, {});
  }
  return undefined;
}

function publicPayload(record) {
  return {
    event: 'hangon.request.confirmed',
    occurred_at: new Date().toISOString(),
    request: {
      request_id: record.id,
      workspace_id: record.workspace_id,
      request_summary: record.request_summary,
      details: safeValue(record.details),
      route: record.route,
      source: record.source,
      confirmation: record.confirmation,
      created_at: record.created_at
    }
  };
}

function signature(body, secret) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
}

async function postWithTimeout(url, options, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...options, signal: controller.signal }); } finally { clearTimeout(timer); }
}

export async function deliverPreparedRequest(record, integration = null) {
  const configured = integration || await getWebhookIntegration(record.workspace_id);
  if (!configured) return { status: 'not_configured', destination: record.route?.id || 'unassigned', attempts: 0 };
  const { url: destination, secret } = configured;
  let parsed;
  try { parsed = new URL(destination); } catch { return { status: 'failed', destination: 'invalid', attempts: 0, error: 'Webhook URL is invalid.' }; }
  if (!['https:', 'http:'].includes(parsed.protocol)) return { status: 'failed', destination: 'invalid', attempts: 0, error: 'Webhook URL must use HTTP or HTTPS.' };

  const body = JSON.stringify(publicPayload(record));
  const requestHeaders = {
    'content-type': 'application/json',
    'user-agent': 'HangON-Webhook/1.0',
    'x-hangon-event': 'request.confirmed',
    'x-hangon-signature': signature(body, secret),
    'x-hangon-request-id': record.id,
    'x-hangon-idempotency-key': record.idempotency_key
  };
  let lastError = 'Webhook delivery failed.';
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await postWithTimeout(parsed, { method: 'POST', headers: requestHeaders, body });
      if (response.ok) return { status: 'delivered', destination: parsed.origin, attempts: attempt, delivered_at: new Date().toISOString() };
      lastError = 'Webhook returned HTTP ' + response.status + '.';
      if (response.status < 500 && response.status !== 408 && response.status !== 429) break;
    } catch (error) {
      lastError = error.name === 'AbortError' ? 'Webhook timed out.' : 'Webhook could not be reached.';
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 250));
  }
  return { status: 'failed', destination: parsed.origin, attempts: 3, error: lastError };
}
