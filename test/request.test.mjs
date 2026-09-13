import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createPreparedRequest, requestProposal, validateRequest } from '../domain/request.mjs';
import { createRequestStore } from '../domain/request-store.mjs';
import { createConfirmationToken, verifyConfirmationToken } from '../domain/confirmation.mjs';

test('accepts a confirmed request without organization-specific identity fields', () => {
  const result = validateRequest({ request_summary: 'Please verify whether last week’s payment was received.', details: { subject: 'payment', period: 'last week' }, confirmed: true, idempotency_key: 'call-123456' });
  assert.equal(result.ok, true);
  assert.deepEqual(result.value.details, { subject: 'payment', period: 'last week' });
});

test('rejects an unconfirmed or idempotency-free request', () => {
  const result = validateRequest({ request_summary: 'Please check the payment.', details: { subject: 'payment' }, confirmed: false });
  assert.equal(result.ok, false);
  assert.deepEqual(result.errors.map((error) => error.field), ['confirmed', 'idempotency_key']);
});

test('prepared requests are workspace-scoped and never claim a record changed', () => {
  const request = createPreparedRequest({ request_summary: 'Please call the customer back.', details: { channel: 'phone' }, confirmed: true, idempotency_key: 'call-123456', source: 'voice' }, { workspaceId: 'workspace-a' });
  assert.equal(request.workspace_id, 'workspace-a');
  assert.equal(request.status, 'prepared');
  assert.equal(request.record_changed, false);
});

test('the request store is idempotent under repeated writes', async () => {
  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), 'hangon-'));
  const store = createRequestStore(path.join(directory, 'requests.json'));
  const base = createPreparedRequest({ request_summary: 'Please send a follow-up.', details: { channel: 'email' }, confirmed: true, idempotency_key: 'call-repeat-123', source: 'voice' }, { workspaceId: 'workspace-a' });
  const results = await Promise.all([store.create(base), store.create({ ...base, id: 'different-id' })]);
  assert.equal(results.filter((result) => !result.duplicate).length, 1);
  assert.equal((await store.list({ workspaceId: 'workspace-a', limit: 20 })).length, 1);
  await fsp.rm(directory, { recursive: true, force: true });
});

test('confirmation is bound to the exact sanitized proposal and cannot be reused for changed content', () => {
  const input = validateRequest({ request_summary: 'Please call me back about an invoice.', details: { channel: 'phone', transcript: 'never store this' }, confirmed: true, idempotency_key: 'call-confirm-123' });
  assert.equal(input.ok, true);
  const proposal = requestProposal(input.value, { workspaceId: 'workspace-a', workspace: { routing: { default_route: 'general' } } });
  assert.deepEqual(proposal.details, { channel: 'phone' });
  const token = createConfirmationToken({ workspaceId: 'workspace-a', idempotencyKey: proposal.idempotencyKey, summary: proposal.summary, details: proposal.details, route: proposal.route });
  assert.equal(verifyConfirmationToken(token, { workspaceId: 'workspace-a', idempotencyKey: proposal.idempotencyKey, summary: proposal.summary, details: proposal.details, route: proposal.route }).ok, true);
  assert.equal(verifyConfirmationToken(token, { workspaceId: 'workspace-a', idempotencyKey: proposal.idempotencyKey, summary: 'Please delete the invoice.', details: proposal.details, route: proposal.route }).reason, 'confirmation_content_mismatch');
});
