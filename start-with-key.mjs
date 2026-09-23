import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const keyFile = process.env.HANGON_KEY_FILE;
const integrationKeyFile = path.join(root, 'data', 'integration-master.key');

if (!process.env.ASSEMBLYAI_API_KEY) {
  if (!keyFile) {
    throw new Error('Set ASSEMBLYAI_API_KEY, or set HANGON_KEY_FILE to a local key file path outside the repo.');
  }
  if (!fs.existsSync(keyFile)) throw new Error('AssemblyAI key file not found at HANGON_KEY_FILE: ' + keyFile);
  const raw = fs.readFileSync(keyFile, 'utf8');
  const candidates = raw.match(/[A-Za-z0-9_-]{20,}/g) ?? [];
  if (!candidates.length) throw new Error('No AssemblyAI key found in ' + keyFile);
  process.env.ASSEMBLYAI_API_KEY = candidates[0];
}

if (!process.env.HANGON_INTEGRATION_ENCRYPTION_KEY && process.env.NODE_ENV !== 'production') {
  if (!fs.existsSync(integrationKeyFile)) fs.writeFileSync(integrationKeyFile, crypto.randomBytes(32).toString('hex') + '\n', { encoding: 'utf8', flag: 'wx' });
  process.env.HANGON_INTEGRATION_ENCRYPTION_KEY = fs.readFileSync(integrationKeyFile, 'utf8').trim();
}

await import('./server.mjs');
