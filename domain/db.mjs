import postgres from 'postgres';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const workspaceSeedPath = path.join(root, '..', 'data', 'workspace.json');

let sql = null;
let migrated = false;

export function isDatabaseConfigured() {
  return Boolean(String(process.env.DATABASE_URL || '').trim());
}

export function getSql() {
  if (!isDatabaseConfigured()) {
    throw new Error('DATABASE_URL is not configured.');
  }
  if (!sql) {
    sql = postgres(process.env.DATABASE_URL, {
      max: Number(process.env.DATABASE_POOL_MAX || 5),
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
      onnotice: () => {}
    });
  }
  return sql;
}

export async function migrate() {
  if (!isDatabaseConfigured()) return { skipped: true };
  if (migrated) return { skipped: false, already: true };

  const db = getSql();
  await db`
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await db`
    CREATE TABLE IF NOT EXISTS calendar_jobs (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      scheduled_time TEXT NOT NULL,
      payload JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await db`CREATE INDEX IF NOT EXISTS calendar_jobs_workspace_created_idx ON calendar_jobs (workspace_id, created_at DESC)`;
  await db`
    CREATE UNIQUE INDEX IF NOT EXISTS calendar_jobs_idempotency_idx
    ON calendar_jobs (workspace_id, lower(customer_name), lower(scheduled_time))
  `;
  await db`
    CREATE TABLE IF NOT EXISTS requests (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      session_id TEXT,
      idempotency_key TEXT NOT NULL,
      payload JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await db`CREATE UNIQUE INDEX IF NOT EXISTS requests_idempotency_idx ON requests (workspace_id, idempotency_key)`;
  await db`CREATE INDEX IF NOT EXISTS requests_workspace_created_idx ON requests (workspace_id, created_at DESC)`;
  await db`
    CREATE TABLE IF NOT EXISTS integrations (
      workspace_id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  await seedDefaults(db);
  migrated = true;
  return { skipped: false, already: false };
}

async function seedDefaults(db) {
  let workspace;
  try {
    workspace = JSON.parse(await fsp.readFile(workspaceSeedPath, 'utf8'));
  } catch {
    workspace = {
      id: 'workspace-local',
      name: 'Apex Home Services',
      description: 'Voice front desk for service trades.'
    };
  }
  const workspaceId = workspace.id || 'workspace-local';
  await db`
    INSERT INTO workspaces (id, data)
    VALUES (${workspaceId}, ${db.json(workspace)})
    ON CONFLICT (id) DO NOTHING
  `;

  const existing = await db`SELECT count(*)::int AS count FROM calendar_jobs WHERE workspace_id = ${workspaceId}`;
  if ((existing[0]?.count || 0) > 0) return;

  const seeds = [
    {
      id: 'job-seed-1',
      workspace_id: workspaceId,
      customer_name: 'David Chen',
      phone: '(555) 234-8901',
      service_type: 'Water Heater Thermocouple Replacement',
      urgency: 'high',
      scheduled_time: 'Today at 2:00 PM',
      address: '88 Meadowbrook Rd',
      job_notes: 'Water heater pilot light won’t stay lit. Pilot assembly diagnostic.',
      status: 'in_progress',
      dispatched_to: 'Mike (Apex Owner / Pro)',
      created_at: new Date(Date.now() - 3600000 * 3).toISOString()
    },
    {
      id: 'job-seed-2',
      workspace_id: workspaceId,
      customer_name: 'Elena Rostova',
      phone: '(555) 789-1234',
      service_type: '200-Amp Subpanel Inspection',
      urgency: 'standard',
      scheduled_time: 'Tomorrow at 8:30 AM',
      address: '410 Highland Blvd',
      job_notes: 'Flickering garage circuits and breaker reset test.',
      status: 'confirmed',
      dispatched_to: 'Mike (Apex Owner / Pro)',
      created_at: new Date(Date.now() - 3600000 * 12).toISOString()
    },
    {
      id: 'job-seed-3',
      workspace_id: workspaceId,
      customer_name: 'Marcus Vance',
      phone: '(555) 432-6789',
      service_type: 'Kitchen Sink Main Line Snaking',
      urgency: 'urgent',
      scheduled_time: 'Tomorrow at 1:30 PM',
      address: '19 Elm St',
      job_notes: 'Kitchen sink backing up into dishwasher line. Main P-trap checked.',
      status: 'confirmed',
      dispatched_to: 'Mike (Apex Owner / Pro)',
      created_at: new Date(Date.now() - 3600000 * 6).toISOString()
    }
  ];

  for (const job of seeds) {
    await db`
      INSERT INTO calendar_jobs (id, workspace_id, customer_name, scheduled_time, payload, created_at)
      VALUES (${job.id}, ${job.workspace_id}, ${job.customer_name}, ${job.scheduled_time}, ${db.json(job)}, ${job.created_at})
      ON CONFLICT (id) DO NOTHING
    `;
  }
}

export async function readWorkspace(workspaceId = 'workspace-local') {
  if (!isDatabaseConfigured()) {
    try {
      return JSON.parse(await fsp.readFile(workspaceSeedPath, 'utf8'));
    } catch {
      return { id: workspaceId, name: 'HangON Workspace' };
    }
  }
  await migrate();
  const db = getSql();
  const rows = await db`SELECT data FROM workspaces WHERE id = ${workspaceId} LIMIT 1`;
  if (rows[0]?.data) return rows[0].data;
  const fallback = JSON.parse(await fsp.readFile(workspaceSeedPath, 'utf8'));
  await db`
    INSERT INTO workspaces (id, data)
    VALUES (${fallback.id || workspaceId}, ${db.json(fallback)})
    ON CONFLICT (id) DO NOTHING
  `;
  return fallback;
}

export async function closeDb() {
  if (sql) {
    await sql.end({ timeout: 5 });
    sql = null;
    migrated = false;
  }
}
