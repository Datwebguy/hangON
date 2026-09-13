import fsp from 'node:fs/promises';
import path from 'node:path';
import { deliverPreparedRequest } from './delivery.mjs';

const queues = new Map();
function enqueue(file, operation) {
  const previous = queues.get(file) || Promise.resolve();
  const next = previous.catch(() => {}).then(operation);
  const tracked = next.finally(() => { if (queues.get(file) === tracked) queues.delete(file); });
  queues.set(file, tracked);
  return next;
}

export function createRequestStore(file, options = {}) {
  async function read() {
    try {
      const value = JSON.parse(await fsp.readFile(file, 'utf8'));
      return Array.isArray(value) ? value : [];
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  }

  async function write(value) {
    await fsp.mkdir(path.dirname(file), { recursive: true });
    const temporary = file + '.' + process.pid + '.tmp';
    const backup = file + '.bak';
    await fsp.writeFile(temporary, JSON.stringify(value, null, 2) + '\n', 'utf8');
    try { await fsp.copyFile(file, backup); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    await fsp.rename(temporary, file);
  }

  const inScope = (record, scope) => record.workspace_id === scope.workspaceId && (!scope.sessionId || record.session_id === scope.sessionId);

  return {
    list(scope) {
      return enqueue(file, async () => (await read()).filter((record) => inScope(record, scope)).slice(0, scope.limit || 20));
    },
    findById(id, scope) {
      return enqueue(file, async () => (await read()).find((record) => record.id === id && inScope(record, scope)) || null);
    },
    create(record, scope = { workspaceId: record.workspace_id }) {
      return enqueue(file, async () => {
        const records = await read();
        const duplicate = records.find((item) => item.idempotency_key === record.idempotency_key && inScope(item, scope));
        if (duplicate) return { record: duplicate, duplicate: true };

        const pending = { ...record, delivery: { status: 'pending', attempts: 0 } };
        records.unshift(pending);
        await write(records);

        const integration = options.getDeliveryConfig ? await options.getDeliveryConfig(pending.workspace_id) : null;
        const delivery = await deliverPreparedRequest(pending, integration);
        const delivered = { ...pending, delivery };
        const index = records.findIndex((item) => item.id === pending.id);
        if (index >= 0) records[index] = delivered;
        await write(records);
        return { record: delivered, duplicate: false };
      });
    }
  };
}
