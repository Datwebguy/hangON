import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const keyFile = process.env.HANGON_KEY_FILE || 'C:/Users/DELL/Downloads/assembly api key.txt';
const integrationKeyFile = path.join(root, 'data', 'integration-master.key');

if (!process.env.ASSEMBLYAI_API_KEY) {
  if (!fs.existsSync(keyFile)) throw new Error('AssemblyAI key file not found. Set ASSEMBLYAI_API_KEY or HANGON_KEY_FILE.');
  const raw = fs.readFileSync(keyFile, 'utf8');
  const candidates = raw.match(/[A-Za-z0-9_-]{20,}/g) ?? [];
  if (candidates.length !== 1) throw new Error('Expected exactly one AssemblyAI key; found ' + candidates.length + '.');
  process.env.ASSEMBLYAI_API_KEY = candidates[0];
}

if (!process.env.HANGON_INTEGRATION_ENCRYPTION_KEY && process.env.NODE_ENV !== 'production') {
  if (!fs.existsSync(integrationKeyFile)) fs.writeFileSync(integrationKeyFile, crypto.randomBytes(32).toString('hex') + '\n', { encoding: 'utf8', flag: 'wx' });
  process.env.HANGON_INTEGRATION_ENCRYPTION_KEY = fs.readFileSync(integrationKeyFile, 'utf8').trim();
  console.log('Workspace integration encryption key loaded locally.');
}

console.log('AssemblyAI key loaded server-side. Starting HangON without exposing it to the browser.');
await import('./server.mjs');
