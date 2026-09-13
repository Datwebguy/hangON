import assert from 'node:assert/strict';
import { once } from 'node:events';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function startProductionServer() {
  const port = await freePort();
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(port),
      HANGON_OPERATOR_TOKEN: 'operator-test-token',
      HANGON_SESSION_SECRET: 'session-test-secret',
      HANGON_CONFIRMATION_SECRET: 'confirmation-test-secret',
      HANGON_INTEGRATION_ENCRYPTION_KEY: 'integration-test-secret'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { output += chunk.toString(); });
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (output.includes(`http://localhost:${port}`)) return { child, baseUrl: `http://127.0.0.1:${port}` };
    if (child.exitCode !== null) throw new Error(`Server exited before starting: ${output}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  child.kill();
  throw new Error(`Server did not start: ${output}`);
}

test('production operator access is completed through the login endpoint', async () => {
  const { child, baseUrl } = await startProductionServer();
  try {
    const unauthenticated = await fetch(`${baseUrl}/api/session`);
    assert.equal(unauthenticated.status, 401);
    assert.equal((await unauthenticated.json()).error.code, 'authentication_required');

    const login = await fetch(`${baseUrl}/api/operator/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'operator-test-token' })
    });
    assert.equal(login.status, 200);
    const loginBody = await login.json();
    assert.equal(typeof loginBody.data.csrf, 'string');
    const cookie = login.headers.get('set-cookie')?.split(';', 1)[0];
    assert.ok(cookie);

    const session = await fetch(`${baseUrl}/api/session`, { headers: { cookie } });
    assert.equal(session.status, 200);
    assert.equal((await session.json()).data.role, 'operator');

    const demo = await fetch(`${baseUrl}/api/demo/session`);
    assert.equal(demo.status, 200);
    assert.equal((await demo.json()).data.role, 'demo');
    const demoCookie = demo.headers.get('set-cookie')?.split(';', 1)[0];
    assert.ok(demoCookie);

    const blockedOperatorPage = await fetch(`${baseUrl}/api/session`, { headers: { cookie: demoCookie } });
    assert.equal(blockedOperatorPage.status, 403);
    assert.equal((await blockedOperatorPage.json()).error.code, 'operator_required');

    const demoRequests = await fetch(`${baseUrl}/api/requests`, { headers: { cookie: demoCookie } });
    assert.equal(demoRequests.status, 200);
    assert.deepEqual((await demoRequests.json()).data, []);
  } finally {
    child.kill();
    await once(child, 'exit').catch(() => {});
  }
});
