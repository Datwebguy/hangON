import { closeDb, isDatabaseConfigured, migrate } from '../domain/db.mjs';

if (!isDatabaseConfigured()) {
  console.error('Set DATABASE_URL before running migrations.');
  process.exitCode = 1;
} else {
  const result = await migrate();
  console.log(result.already ? 'Schema already up to date.' : 'Postgres schema migrated and seeded.');
  await closeDb();
}
