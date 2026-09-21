import crypto from 'node:crypto';
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { publicWorkspace } from './domain/workspace.mjs';
import { createPreparedRequest, requestProposal, sanitizeDetails, validateRequest } from './domain/request.mjs';
import { transcribeWithDictation, extractStructuredJob } from './domain/dictation.mjs';
import { generateLeMURDossier } from './domain/lemur.mjs';
import { configureWebhookIntegration, getPublicWebhookIntegration, getWebhookIntegration, removeWebhookIntegration } from './domain/integration-store.mjs';
import { buildSystemPrompt, requestTool, bookServiceTool, checkAvailabilityTool, voiceConfig } from './domain/voice.mjs';
import { createSession, hasConfiguredOperatorAccess, isProduction, readSession, sessionCookie, verifyOperatorToken } from './domain/security.mjs';
import { createConfirmationToken, verifyConfirmationToken } from './domain/confirmation.mjs';
import { readWorkspace } from './domain/db.mjs';
import { getStores, initStores } from './domain/stores.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 4180);
const publicFiles = new Set(['index.html', 'live.html', 'styles.css', 'production.css', 'app.next.js', 'live.js', 'voice-ui.js', 'auth-ui.js', 'theme-toggle.js', 'pcm-processor.js', 'hangon-logo.png']);
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png' };
const rateBuckets = new Map();

function stores() {
  return getStores();
}

function headers() {
  return {
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'same-origin',
    'permissions-policy': 'camera=(), geolocation=(), payment=()',
    'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://agents.assemblyai.com wss://agents.assemblyai.com https://dictation.assemblyai.com; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
  };
}

function sendJson(res, status, body, extra = {}) {
  res.writeHead(status, { ...headers(), 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra });
  res.end(JSON.stringify(body));
}

function error(res, status, code, message, details) {
  return sendJson(res, status, { error: { code, message, ...(details ? { details } : {}) } });
}

function publicRequest(record) {
  if (!record) return null;
  const { session_id: ignored, details, ...safe } = record;
  return { ...safe, details: sanitizeDetails(details) };
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fsp.readFile(file, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return fallback;
    throw e;
  }
}

async function readBody(req) {
  const ctype = String(req.headers['content-type'] || '');
  if (!ctype.startsWith('application/json')) {
    throw Object.assign(new Error('Content-Type must be application/json.'), { statusCode: 415 });
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 64 * 1024) throw Object.assign(new Error('Request body is too large.'), { statusCode: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw Object.assign(new Error('Request body must be valid JSON.'), { statusCode: 400 });
  }
}

function pruneRateBuckets(now = Date.now()) {
  for (const [key, value] of rateBuckets) {
    if (now - value.startedAt >= 120000) rateBuckets.delete(key);
  }
}

function rateLimit(req, bucket, limit) {
  const now = Date.now();
  if (rateBuckets.size > 2000) pruneRateBuckets(now);
  const key = `${req.socket.remoteAddress || 'unknown'}:${bucket}`;
  const current = rateBuckets.get(key);
  if (!current || now - current.startedAt >= 60000) {
    rateBuckets.set(key, { startedAt: now, count: 1 });
    return true;
  }
  current.count += 1;
  return current.count <= limit;
}

function sessionOrError(req, res, roles = ['operator']) {
  const session = readSession(req);
  if (session && roles.includes(session.role)) return session;
  if (session && !roles.includes(session.role)) {
    error(res, 403, 'role_forbidden', 'This session cannot access that resource.');
    return null;
  }
  if (isProduction() && !hasConfiguredOperatorAccess(req)) {
    error(res, 401, 'authentication_required', 'Sign in as an operator before using this resource.');
    return null;
  }
  error(res, 401, 'session_required', 'Open a HangON session before using this resource.');
  return null;
}

function csrfOrError(req, res, session) {
  if (String(req.headers['x-hangon-csrf'] || '') !== session.csrf) {
    error(res, 403, 'csrf_failed', 'This request could not be verified. Refresh the HangON session and try again.');
    return false;
  }
  return true;
}

function requestScope(session, limit) {
  return {
    workspaceId: session.workspace_id,
    sessionId: session.role === 'demo' || !isProduction() ? session.sid : undefined,
    demo: session.role === 'demo',
    limit
  };
}

async function fetchTimeout(url, options, ms = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function assemblyToken() {
  if (!process.env.ASSEMBLYAI_API_KEY) return null;
  const tokenUrl = new URL('https://agents.assemblyai.com/v1/token');
  tokenUrl.searchParams.set('expires_in_seconds', '300');
  tokenUrl.searchParams.set('max_session_duration_seconds', '600');
  const response = await fetchTimeout(tokenUrl, { headers: { Authorization: `Bearer ${process.env.ASSEMBLYAI_API_KEY}` } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || typeof body.token !== 'string') {
    throw Object.assign(new Error('Voice token request failed.'), { statusCode: response.status >= 500 ? 502 : 503 });
  }
  return body.token;
}

async function api(req, res, url) {
  await initStores();
  const { calendarStore, requestStore, backend } = stores();
  if (!rateLimit(req, 'api', 120)) return error(res, 429, 'rate_limited', 'Too many requests. Please try again shortly.');

  if (url.pathname === '/api/health') {
    if (req.method !== 'GET') return error(res, 405, 'method_not_allowed', 'Use GET for health.');
    return sendJson(res, 200, { data: { ok: true, store: backend } });
  }

  if (url.pathname === '/api/demo/session') {
    if (req.method !== 'GET') return error(res, 405, 'method_not_allowed', 'Use GET for a demo session.');
    if (!rateLimit(req, 'demo-session', 20)) return error(res, 429, 'demo_rate_limited', 'Too many demo sessions were requested.');
    const workspace = await readWorkspace();
    const current = readSession(req);
    if (current?.role === 'demo' && current.workspace_id === workspace.id) {
      return sendJson(res, 200, { data: { workspace_id: current.workspace_id, role: current.role, csrf: current.csrf, demo: true } });
    }
    const created = createSession(workspace.id, 'demo');
    return sendJson(res, 200, { data: { workspace_id: created.payload.workspace_id, role: created.payload.role, csrf: created.payload.csrf, demo: true } }, { 'set-cookie': sessionCookie(created.value) });
  }

  if (url.pathname === '/api/operator/login') {
    if (req.method !== 'POST') return error(res, 405, 'method_not_allowed', 'Use POST to sign in as an operator.');
    if (!rateLimit(req, 'operator-login', 10)) return error(res, 429, 'login_rate_limited', 'Too many sign in attempts.');
    if (isProduction() && !process.env.HANGON_OPERATOR_TOKEN) return error(res, 503, 'auth_not_configured', 'Operator access is not configured on the server.');
    let input;
    try { input = await readBody(req); } catch (e) { return error(res, e.statusCode || 400, 'invalid_json', e.message); }
    if (isProduction() && !verifyOperatorToken(input?.token)) return error(res, 401, 'invalid_operator_token', 'The operator token is invalid.');
    const workspace = await readWorkspace();
    const created = createSession(workspace.id);
    return sendJson(res, 200, { data: { workspace_id: created.payload.workspace_id, role: created.payload.role, csrf: created.payload.csrf } }, { 'set-cookie': sessionCookie(created.value) });
  }

  if (url.pathname === '/api/session') {
    if (req.method !== 'GET') return error(res, 405, 'method_not_allowed', 'Use GET for a session.');
    const workspace = await readWorkspace();
    const current = readSession(req);
    if (current?.role === 'operator' && current.workspace_id === workspace.id) {
      return sendJson(res, 200, { data: { workspace_id: current.workspace_id, role: current.role, csrf: current.csrf } });
    }
    if (current?.role === 'demo') {
      return error(res, 403, 'operator_required', 'This page is reserved for workspace operators.');
    }
    if (isProduction() && !hasConfiguredOperatorAccess(req)) {
      return error(res, 401, 'authentication_required', 'Sign in as an operator before using this resource.');
    }
    const created = createSession(workspace.id);
    return sendJson(res, 200, { data: { workspace_id: created.payload.workspace_id, role: created.payload.role, csrf: created.payload.csrf } }, { 'set-cookie': sessionCookie(created.value) });
  }

  if (url.pathname === '/api/workspace') {
    if (req.method !== 'GET') return error(res, 405, 'method_not_allowed', 'Use GET for workspace information.');
    const session = sessionOrError(req, res, ['operator', 'demo']);
    if (!session) return;
    const workspace = await readWorkspace(session.workspace_id);
    return sendJson(res, 200, { data: publicWorkspace(workspace) });
  }

  // --- Calendar & Dispatch Endpoints ---
  if (url.pathname === '/api/calendar') {
    if (req.method !== 'GET') return error(res, 405, 'method_not_allowed', 'Use GET for calendar schedule.');
    const session = sessionOrError(req, res, ['operator', 'demo']);
    if (!session) return;
    const requested = Number(url.searchParams.get('limit') || 50);
    const limit = Number.isInteger(requested) ? Math.min(Math.max(requested, 1), 100) : 50;
    const preferred = url.searchParams.get('preferred_time') || '';
    const appointments = await calendarStore.list({ workspaceId: session.workspace_id, limit });
    const availability = await calendarStore.checkAvailability(preferred, { workspaceId: session.workspace_id });
    return sendJson(res, 200, { data: { appointments, availability }, meta: { limit } });
  }

  if (url.pathname === '/api/calendar/book') {
    if (req.method !== 'POST') return error(res, 405, 'method_not_allowed', 'Use POST to book an appointment.');
    const session = sessionOrError(req, res, ['operator', 'demo']);
    if (!session) return;
    if (!csrfOrError(req, res, session)) return;
    let input;
    try { input = await readBody(req); } catch (e) { return error(res, e.statusCode || 400, 'invalid_json', e.message); }
    try {
      const result = await calendarStore.book(input, { workspaceId: session.workspace_id });
      return sendJson(res, result.duplicate ? 200 : 201, { data: result.booking, meta: { duplicate: result.duplicate, record_changed: true } });
    } catch (e) {
      return error(res, 400, 'booking_failed', e.message);
    }
  }

  // --- AssemblyAI Dictation API Endpoint ---
  if (url.pathname === '/api/dictate') {
    if (req.method !== 'POST') return error(res, 405, 'method_not_allowed', 'Use POST for dictation extraction.');
    const session = sessionOrError(req, res, ['operator', 'demo']);
    if (!session) return;
    if (!csrfOrError(req, res, session)) return;
    if (!rateLimit(req, 'dictate', 30)) return error(res, 429, 'dictate_rate_limited', 'Too many dictation requests.');
    let input = {};
    try { input = await readBody(req); } catch { input = {}; }
    const sampleText = input.utterance || input.text || '';
    const result = await transcribeWithDictation(null, { sampleText });
    return sendJson(res, 200, { data: result });
  }

  // --- Post-call intelligence dossier ---
  if (url.pathname === '/api/lemur') {
    if (req.method !== 'POST') return error(res, 405, 'method_not_allowed', 'Use POST for dossier generation.');
    const session = sessionOrError(req, res, ['operator', 'demo']);
    if (!session) return;
    if (!csrfOrError(req, res, session)) return;
    if (!rateLimit(req, 'lemur', 30)) return error(res, 429, 'lemur_rate_limited', 'Too many dossier requests.');
    let input = {};
    try { input = await readBody(req); } catch { input = {}; }
    const transcript = input.transcript || input.text || '';
    const metadata = input.metadata || input;
    const dossier = generateLeMURDossier(transcript, metadata);
    return sendJson(res, 200, { data: dossier });
  }

  if (url.pathname === '/api/integrations/webhook') {
    const session = sessionOrError(req, res);
    if (!session) return;
    if (req.method === 'GET') return sendJson(res, 200, { data: await getPublicWebhookIntegration(session.workspace_id) });
    if (!csrfOrError(req, res, session)) return;
    if (req.method === 'DELETE') return sendJson(res, 200, { data: await removeWebhookIntegration(session.workspace_id) });
    if (req.method === 'PUT') {
      let input;
      try { input = await readBody(req); } catch (e) { return error(res, e.statusCode || 400, 'invalid_json', e.message); }
      try {
        const data = await configureWebhookIntegration(session.workspace_id, { url: input.url, secret: input.secret });
        return sendJson(res, 200, { data });
      } catch (e) {
        return error(res, e.statusCode || 503, 'integration_configuration_failed', e.message);
      }
    }
    return error(res, 405, 'method_not_allowed', 'Use GET, PUT, or DELETE for webhook settings.');
  }

  if (url.pathname === '/api/voice-session' || url.pathname === '/api/voice-token') {
    if (req.method !== 'GET') return error(res, 405, 'method_not_allowed', 'Use GET for a voice session.');
    if (!rateLimit(req, 'voice', 20)) return error(res, 429, 'voice_rate_limited', 'Too many voice sessions were requested.');
    const session = sessionOrError(req, res, ['operator', 'demo']);
    if (!session) return;
    if (!process.env.ASSEMBLYAI_API_KEY) return error(res, 503, 'voice_not_configured', 'The voice service is not configured on the server.');
    try {
      const workspace = await readWorkspace(session.workspace_id);
      const token = await assemblyToken();
      if (url.pathname === '/api/voice-token') return sendJson(res, 200, { token });
      return sendJson(res, 200, {
        data: {
          token,
          workspace: publicWorkspace(workspace),
          system_prompt: buildSystemPrompt(workspace),
          tools: [bookServiceTool, checkAvailabilityTool, requestTool],
          voice: voiceConfig(workspace)
        }
      });
    } catch (e) {
      return error(res, e.statusCode || 502, 'voice_upstream_error', 'The voice service could not be reached.');
    }
  }

  if (url.pathname === '/api/requests/confirmation') {
    const session = sessionOrError(req, res, ['operator', 'demo']);
    if (!session) return;
    if (req.method !== 'POST') return error(res, 405, 'method_not_allowed', 'Use POST to confirm a request proposal.');
    if (!csrfOrError(req, res, session)) return;
    let input;
    try { input = await readBody(req); } catch (e) { return error(res, e.statusCode || 400, 'invalid_json', e.message); }
    const validation = validateRequest({ ...input, confirmed: true });
    if (!validation.ok) return error(res, 422, 'validation_error', 'Request proposal is invalid.', validation.errors);
    const workspace = await readWorkspace(session.workspace_id);
    const proposal = requestProposal(validation.value, { workspaceId: session.workspace_id, workspace });
    const confirmationToken = createConfirmationToken({ workspaceId: session.workspace_id, idempotencyKey: proposal.idempotencyKey, summary: proposal.summary, details: proposal.details, route: proposal.route });
    return sendJson(res, 201, { data: { confirmation_token: confirmationToken, route: proposal.route, expires_in_seconds: 300 } });
  }

  if (url.pathname === '/api/requests') {
    const session = sessionOrError(req, res, ['operator', 'demo']);
    if (!session) return;
    const scope = requestScope(session);
    if (req.method === 'GET') {
      const requested = Number(url.searchParams.get('limit') || 20);
      const limit = Number.isInteger(requested) ? Math.min(Math.max(requested, 1), 100) : 20;
      const records = await requestStore.list({ ...scope, limit });
      return sendJson(res, 200, { data: records.map(publicRequest), meta: { limit } });
    }
    if (req.method === 'POST') {
      if (!csrfOrError(req, res, session)) return;
      let input;
      try { input = await readBody(req); } catch (e) { return error(res, e.statusCode || 400, 'invalid_json', e.message); }
      const validation = validateRequest(input);
      if (!validation.ok) return error(res, 422, 'validation_error', 'Request validation failed.', validation.errors);
      const workspace = await readWorkspace(session.workspace_id);
      const proposal = requestProposal(validation.value, { workspaceId: session.workspace_id, workspace });
      const confirmation = verifyConfirmationToken(input.confirmation_token, { workspaceId: session.workspace_id, idempotencyKey: proposal.idempotencyKey, summary: proposal.summary, details: proposal.details, route: proposal.route });
      if (!confirmation.ok) return error(res, 409, 'confirmation_required', 'A fresh confirmation for this exact request is required.', { reason: confirmation.reason });

      // If this request represents a service booking, commit it to the dispatch calendar.
      let bookingResult = null;
      try {
        const details = validation.value.details || {};
        bookingResult = await calendarStore.book({
          customer_name: details.customer_name || details.caller || 'Confirmed Caller',
          service_type: details.service_type || validation.value.request_summary,
          scheduled_time: details.scheduled_time || 'Next Available Slot',
          address: details.address || 'Address confirmed on call',
          urgency: details.urgency || 'urgent',
          job_notes: validation.value.request_summary,
          raw_speech: details.raw_speech || null,
          cleaned_text: details.cleaned_text || null
        }, { workspaceId: session.workspace_id });
      } catch (err) {
        console.error(JSON.stringify({ request_id: 'calendar_hook', error: err.message }));
      }

      const created = createPreparedRequest(validation.value, { workspaceId: session.workspace_id, sessionId: session.sid, workspace });
      // When booked to calendar, update record status and record_changed
      if (bookingResult) {
        created.record_changed = true;
        created.status = 'booked';
        created.booking = bookingResult.booking;
      }
      const result = await requestStore.create(created, scope);
      res.setHeader('location', '/api/requests/' + result.record.id);
      return sendJson(res, result.duplicate ? 200 : 201, { data: publicRequest(result.record), meta: { duplicate: result.duplicate, record_changed: true } });
    }
    return error(res, 405, 'method_not_allowed', 'Use GET or POST for requests.');
  }

  const match = url.pathname.match(/^\/api\/requests\/([^/]+)$/);
  if (match) {
    if (req.method !== 'GET') return error(res, 405, 'method_not_allowed', 'Use GET to retrieve a request.');
    const session = sessionOrError(req, res);
    if (!session) return;
    const record = await requestStore.findById(match[1], requestScope(session));
    if (!record) return error(res, 404, 'not_found', 'Request not found.');
    return sendJson(res, 200, { data: publicRequest(record) });
  }

  return error(res, 404, 'not_found', 'API route not found.');
}

async function handle(req, res) {
  const id = crypto.randomUUID();
  res.setHeader('x-request-id', id);
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (!['GET', 'HEAD'].includes(req.method)) return error(res, 405, 'method_not_allowed', 'This resource is read-only.');
    const requested = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    if (requested.includes('/') || !publicFiles.has(requested)) return error(res, 404, 'not_found', 'Resource not found.');
    const file = path.join(root, requested);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return error(res, 404, 'not_found', 'Resource not found.');
    res.writeHead(200, { ...headers(), 'content-type': mime[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    if (req.method === 'HEAD') return res.end();
    return fs.createReadStream(file).pipe(res);
  } catch (e) {
    console.error(JSON.stringify({ request_id: id, error: e.message }));
    if (!res.headersSent) return error(res, 500, 'internal_error', 'HangON could not complete the request.');
    res.end();
  }
}

function startServer(candidate, attempt = 0) {
  const server = http.createServer(handle);
  server.once('error', (e) => {
    if (e.code === 'EADDRINUSE' && attempt < 20) return startServer(candidate + 1, attempt + 1);
    console.error(e.message);
    process.exitCode = 1;
  });
  server.listen(candidate, async () => {
    const { backend } = await initStores();
    console.log('HangON running at http://localhost:' + candidate + ' (store: ' + backend + ')');
  });
}

if (!process.env.VERCEL) {
  startServer(port);
}

export default async function (req, res) {
  await initStores();
  return handle(req, res);
}
