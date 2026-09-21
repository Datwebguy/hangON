import { deliverPreparedRequest } from './delivery.mjs';
import { createJsonStore } from './json-store.mjs';

const inScope = (record, scope) => record.workspace_id === scope.workspaceId && (!scope.sessionId || record.session_id === scope.sessionId);

export function createRequestStore(file, options = {}) {
  const store = createJsonStore(file, { fallback: [] });

  return {
    async list(scope) {
      const records = await store.read();
      const list = Array.isArray(records) ? records : [];
      return list.filter((record) => inScope(record, scope)).slice(0, scope.limit || 20);
    },
    async findById(id, scope) {
      const records = await store.read();
      const list = Array.isArray(records) ? records : [];
      return list.find((record) => record.id === id && inScope(record, scope)) || null;
    },
    async create(record, scope = { workspaceId: record.workspace_id }) {
      let result = null;

      await store.update(async (current) => {
        const records = Array.isArray(current) ? [...current] : [];
        const duplicate = records.find((item) => item.idempotency_key === record.idempotency_key && inScope(item, scope));
        if (duplicate) {
          result = { record: duplicate, duplicate: true };
          return records;
        }

        const pending = { ...record, delivery: { status: 'pending', attempts: 0 } };
        records.unshift(pending);

        const integration = scope.demo ? null : (options.getDeliveryConfig ? await options.getDeliveryConfig(pending.workspace_id) : null);
        const delivery = scope.demo ? { status: 'demo_only', attempts: 0 } : await deliverPreparedRequest(pending, integration);
        const delivered = { ...pending, delivery };
        const index = records.findIndex((item) => item.id === pending.id);
        if (index >= 0) records[index] = delivered;
        result = { record: delivered, duplicate: false };
        return records;
      });

      return result;
    }
  };
}

export function createPgRequestStore(options = {}) {
  async function ready() {
    const mod = await import('./db.mjs');
    await mod.migrate();
    return mod.getSql();
  }

  return {
    async list(scope) {
      const db = await ready();
      const limit = scope.limit || 20;
      let rows;
      if (scope.sessionId) {
        rows = await db`
          SELECT payload FROM requests
          WHERE workspace_id = ${scope.workspaceId}
            AND session_id = ${scope.sessionId}
          ORDER BY created_at DESC
          LIMIT ${limit}
        `;
      } else {
        rows = await db`
          SELECT payload FROM requests
          WHERE workspace_id = ${scope.workspaceId}
          ORDER BY created_at DESC
          LIMIT ${limit}
        `;
      }
      return rows.map((row) => row.payload);
    },

    async findById(id, scope) {
      const db = await ready();
      const rows = await db`
        SELECT payload FROM requests
        WHERE id = ${id} AND workspace_id = ${scope.workspaceId}
        LIMIT 1
      `;
      const record = rows[0]?.payload || null;
      if (!record) return null;
      if (scope.sessionId && record.session_id !== scope.sessionId) return null;
      return record;
    },

    async create(record, scope = { workspaceId: record.workspace_id }) {
      const db = await ready();
      const existing = await db`
        SELECT payload FROM requests
        WHERE workspace_id = ${scope.workspaceId}
          AND idempotency_key = ${record.idempotency_key}
        LIMIT 1
      `;
      if (existing[0]?.payload && inScope(existing[0].payload, scope)) {
        return { record: existing[0].payload, duplicate: true };
      }

      const pending = { ...record, delivery: { status: 'pending', attempts: 0 } };
      const integration = scope.demo ? null : (options.getDeliveryConfig ? await options.getDeliveryConfig(pending.workspace_id) : null);
      const delivery = scope.demo ? { status: 'demo_only', attempts: 0 } : await deliverPreparedRequest(pending, integration);
      const delivered = { ...pending, delivery };

      try {
        await db`
          INSERT INTO requests (id, workspace_id, session_id, idempotency_key, payload, created_at)
          VALUES (
            ${delivered.id},
            ${delivered.workspace_id},
            ${delivered.session_id || null},
            ${delivered.idempotency_key},
            ${db.json(delivered)},
            ${delivered.created_at || new Date().toISOString()}
          )
        `;
        return { record: delivered, duplicate: false };
      } catch (error) {
        if (String(error?.code) === '23505') {
          const again = await db`
            SELECT payload FROM requests
            WHERE workspace_id = ${scope.workspaceId}
              AND idempotency_key = ${record.idempotency_key}
            LIMIT 1
          `;
          if (again[0]?.payload) return { record: again[0].payload, duplicate: true };
        }
        throw error;
      }
    }
  };
}
