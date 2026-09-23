import { closeDb, isDatabaseConfigured, migrate } from '../domain/db.mjs';

if (!isDatabaseConfigured()) {
  process.exitCode = 1;
} else {
  await migrate();
  await closeDb();
}
