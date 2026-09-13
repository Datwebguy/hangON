import crypto from 'node:crypto';
import http from 'node:http';
import test from 'node:test';
import assert from 'node:assert/strict';
import { deliverPreparedRequest } from '../domain/delivery.mjs';

test('delivers only a signed minimal confirmed request payload', async () => {
  const secret = 'a'.repeat(64);
  let received;
  const server = http.createServer((request, response) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      received = { body, headers: request.headers };
      response.writeHead(204);
      response.end();
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const result = await deliverPreparedRequest({
    id: 'request-test-1',
    workspace_id: 'workspace-test',
    request_summary: 'Please call me back about an invoice.',
    details: { contact: 'demo@example.invalid', password: 'do-not-send', transcript: 'do-not-send' },
    route: { id: 'billing', label: 'Billing' },
    source: 'voice',
    confirmation: 'explicit',
    created_at: new Date().toISOString(),
    idempotency_key: 'request-test-1'
  }, { url: 'http://127.0.0.1:' + address.port, secret });
  await new Promise((resolve) => server.close(resolve));

  assert.equal(result.status, 'delivered');
  const parsed = JSON.parse(received.body);
  assert.equal(parsed.event, 'hangon.request.confirmed');
  assert.equal(parsed.request.request_summary, 'Please call me back about an invoice.');
  assert.equal(parsed.request.details.contact, 'demo@example.invalid');
  assert.equal(parsed.request.details.password, undefined);
  assert.equal(parsed.request.details.transcript, undefined);
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(received.body).digest('hex');
  assert.equal(received.headers['x-hangon-signature'], expected);
});
