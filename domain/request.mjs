import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { routeRequest } from './routing.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));

const blockedDetailKeys = /^(?:password|passcode|secret|token|api[_-]?key|authorization|cookie|session|audio|recording|transcript|raw[_-]?text|credit[_-]?card|card[_-]?number|cvv|bank[_-]?account|ssn|social[_-]?security)$/i;

export function sanitizeDetails(value, depth = 0) {
  if (depth > 3) return '[omitted]';
  if (typeof value === 'string') return value.slice(0, 2000);
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeDetails(item, depth + 1));
  if (value && typeof value === 'object') {
    return Object.entries(value).slice(0, 40).reduce((result, [key, item]) => {
      if (!blockedDetailKeys.test(key) && key !== '__proto__' && key !== 'constructor' && key !== 'prototype') {
        result[key] = sanitizeDetails(item, depth + 1);
      }
      return result;
    }, {});
  }
  return undefined;
}

function configuredWorkspace() {
  try { return JSON.parse(fs.readFileSync(path.join(root, '..', 'data', 'workspace.json'), 'utf8')); } catch { return {}; }
}

export function validateRequest(input) {
  const errors = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, errors: [{ field: 'body', message: 'Request body must be an object.' }] };
  const summary = typeof input.request_summary === 'string' ? input.request_summary.trim() : '';
  const details = input.details && typeof input.details === 'object' && !Array.isArray(input.details) ? sanitizeDetails(input.details) : null;
  const idempotencyKey = typeof input.idempotency_key === 'string' ? input.idempotency_key.trim() : '';
  if (summary.length < 4 || summary.length > 1000) errors.push({ field: 'request_summary', message: 'Provide a request summary between 4 and 1000 characters.' });
  if (!details) errors.push({ field: 'details', message: 'Request details must be an object.' }); else if (JSON.stringify(details).length > 10000) errors.push({ field: 'details', message: 'Request details are too large.' });
  if (input.confirmed !== true) errors.push({ field: 'confirmed', message: 'The caller must explicitly confirm the request.' });
  if (idempotencyKey.length < 8 || idempotencyKey.length > 200) errors.push({ field: 'idempotency_key', message: 'A valid request idempotency key is required.' });
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { request_summary: summary, details, confirmed: true, idempotency_key: idempotencyKey, source: input.source === 'voice' ? 'voice' : 'operator' } };
}

export function createPreparedRequest(input, context) {
  const workspace = context.workspace || configuredWorkspace();
  const safeInput = { ...input, details: sanitizeDetails(input.details) };
  return { id: crypto.randomUUID(), ...safeInput, workspace_id: context.workspaceId, session_id: context.sessionId, route: routeRequest(safeInput, workspace), status: 'prepared', record_changed: false, confirmation: 'explicit', created_at: new Date().toISOString() };
}

export function requestProposal(input, context) {
  const workspace = context.workspace || configuredWorkspace();
  const details = sanitizeDetails(input.details);
  const route = routeRequest({ ...input, details }, workspace);
  return { idempotencyKey: input.idempotency_key, summary: input.request_summary, details, route };
}
