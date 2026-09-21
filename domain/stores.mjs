import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCalendarStore, createPgCalendarStore } from './calendar-store.mjs';
import { createRequestStore, createPgRequestStore } from './request-store.mjs';
import { getWebhookIntegration } from './integration-store.mjs';
import { isDatabaseConfigured, migrate } from './db.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));

let calendarStore;
let requestStore;
let backend = 'json';

export async function initStores() {
  if (calendarStore && requestStore) {
    return { calendarStore, requestStore, backend };
  }

  if (isDatabaseConfigured()) {
    await migrate();
    calendarStore = createPgCalendarStore();
    requestStore = createPgRequestStore({ getDeliveryConfig: getWebhookIntegration });
    backend = 'postgres';
  } else {
    calendarStore = createCalendarStore(path.join(root, '..', 'data', 'calendar.json'));
    requestStore = createRequestStore(path.join(root, '..', 'data', 'requests.json'), {
      getDeliveryConfig: getWebhookIntegration
    });
    backend = 'json';
  }

  return { calendarStore, requestStore, backend };
}

export function getStores() {
  if (!calendarStore || !requestStore) {
    throw new Error('Stores are not initialized. Call initStores() first.');
  }
  return { calendarStore, requestStore, backend };
}
