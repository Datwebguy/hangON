import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJsonStore } from './json-store.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const defaultCalendarPath = path.join(root, '..', 'data', 'calendar.json');

const INITIAL_SCHEDULE = [
  {
    id: 'job-seed-1',
    workspace_id: 'workspace-local',
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
    workspace_id: 'workspace-local',
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
    workspace_id: 'workspace-local',
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

const MAX_JOBS = 500;

function normalizeServiceType(rawService) {
  let serviceType = String(rawService).trim();
  if (serviceType.length > 80) serviceType = serviceType.slice(0, 78) + '…';
  return serviceType.replace(/[\w.-]+@[\w.-]+\.\w+/g, '').replace(/at\s+[\w.-]+\s+dot\s+\w+/gi, '').trim();
}

function field(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

// Builds a job only from what the caller actually said. Missing essentials are an error,
// never a placeholder; optional fields stay null.
export function buildJob(input, workspaceId) {
  if (!input || typeof input !== 'object') {
    throw Object.assign(new Error('Booking details are missing.'), { statusCode: 400 });
  }
  const customerName = field(input.customer_name) || field(input.name);
  const rawService = field(input.service_type) || field(input.service) || field(input.request_summary);
  const scheduledTime = field(input.scheduled_time) || field(input.time);
  const missing = [!customerName && 'customer_name', !rawService && 'service_type', !scheduledTime && 'scheduled_time'].filter(Boolean);
  if (missing.length) {
    throw Object.assign(new Error(`Cannot book without: ${missing.join(', ')}.`), { statusCode: 422 });
  }
  const serviceType = normalizeServiceType(rawService);
  const address = field(input.address) || field(input.location);
  const phone = field(input.phone) || field(input.contact);
  const urgencyRaw = String(input.urgency || '').toLowerCase();
  const urgency = ['emergency', 'urgent', 'standard'].includes(urgencyRaw) ? urgencyRaw : null;
  const notes = field(input.job_notes) || field(input.details?.job_notes) || field(input.details?.notes) || field(input.details?.summary);

  return {
    id: 'job-' + crypto.randomUUID().slice(0, 8),
    workspace_id: workspaceId,
    customer_name: customerName,
    phone,
    service_type: serviceType,
    urgency,
    scheduled_time: scheduledTime,
    address,
    job_notes: notes || 'Booked by HangON during the call.',
    status: 'confirmed',
    record_changed: true,
    dispatched_to: 'Mike (Apex Owner / Pro)',
    sms_dispatch: {
      // No SMS provider is wired up; this is the prepared text shown in the UI, not a sent message.
      status: 'prepared',
      recipient: 'Mike (Apex Dispatch Phone)',
      timestamp: new Date().toISOString(),
      message: `New job: ${[customerName, serviceType, scheduledTime, address || 'address not given'].join(' | ')}${urgency ? ` | Urgency: ${urgency.toUpperCase()}` : ''}`
    },
    dictation_metadata: {
      raw_speech: input.raw_speech || null,
      cleaned_text: input.cleaned_text || null,
      self_correction_resolved: Boolean(input.self_correction_resolved),
      model: field(input.extraction_model)
    },
    created_at: new Date().toISOString()
  };
}

export function createCalendarStore(filePath = defaultCalendarPath) {
  const store = createJsonStore(filePath, { fallback: () => [...INITIAL_SCHEDULE] });

  async function ensureSeeded() {
    const items = await store.read();
    if (Array.isArray(items) && items.length > 0) return items;
    const seeded = [...INITIAL_SCHEDULE];
    await store.write(seeded);
    return seeded;
  }

  return {
    async list({ workspaceId, limit = 50 } = {}) {
      const items = await ensureSeeded();
      const capped = Math.min(Math.max(Number(limit) || 50, 1), 100);
      return items
        .filter((job) => !workspaceId || !job.workspace_id || job.workspace_id === workspaceId)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, capped);
    },

    async checkAvailability(preferredTime = '', { workspaceId } = {}) {
      const current = await ensureSeeded();
      const lower = String(preferredTime || '').toLowerCase().trim();
      const scoped = current.filter((job) => !workspaceId || !job.workspace_id || job.workspace_id === workspaceId);
      const conflict = lower
        ? scoped.some((job) => job.scheduled_time.toLowerCase().includes(lower) && job.status !== 'cancelled')
        : false;
      const recommendedSlots = [
        'Tomorrow at 10:30 AM',
        'Tomorrow at 3:30 PM',
        'Friday at 10:00 AM',
        'Friday at 2:00 PM'
      ];
      return {
        available: Boolean(lower) && !conflict,
        preferred_time: preferredTime,
        recommended_slots: recommendedSlots,
        next_open_slot: recommendedSlots[0]
      };
    },

    async book(input, { workspaceId = 'workspace-local' } = {}) {
      const newJob = buildJob(input, workspaceId);
      const { customer_name: customerName, scheduled_time: scheduledTime } = newJob;

      let duplicate = false;
      let booking = newJob;

      await store.update(async (current) => {
        const items = Array.isArray(current) && current.length ? current : [...INITIAL_SCHEDULE];
        const existing = items.find((job) =>
          (job.workspace_id || workspaceId) === workspaceId
          && job.customer_name.toLowerCase() === customerName.toLowerCase()
          && job.scheduled_time.toLowerCase() === scheduledTime.toLowerCase()
        );
        if (existing) {
          duplicate = true;
          booking = existing;
          return items;
        }
        items.unshift(newJob);
        return items.slice(0, MAX_JOBS);
      });

      return { booking, duplicate };
    }
  };
}

export function createPgCalendarStore() {
  async function ready() {
    const mod = await import('./db.mjs');
    await mod.migrate();
    return mod.getSql();
  }

  return {
    async list({ workspaceId, limit = 50 } = {}) {
      const db = await ready();
      const capped = Math.min(Math.max(Number(limit) || 50, 1), 100);
      const rows = workspaceId
        ? await db`
            SELECT payload FROM calendar_jobs
            WHERE workspace_id = ${workspaceId}
            ORDER BY created_at DESC
            LIMIT ${capped}
          `
        : await db`
            SELECT payload FROM calendar_jobs
            ORDER BY created_at DESC
            LIMIT ${capped}
          `;
      return rows.map((row) => row.payload);
    },

    async checkAvailability(preferredTime = '', { workspaceId } = {}) {
      const db = await ready();
      const lower = String(preferredTime || '').toLowerCase().trim();
      const recommendedSlots = [
        'Tomorrow at 10:30 AM',
        'Tomorrow at 3:30 PM',
        'Friday at 10:00 AM',
        'Friday at 2:00 PM'
      ];
      if (!lower) {
        return {
          available: false,
          preferred_time: preferredTime,
          recommended_slots: recommendedSlots,
          next_open_slot: recommendedSlots[0]
        };
      }
      const rows = workspaceId
        ? await db`
            SELECT scheduled_time, payload->>'status' AS status
            FROM calendar_jobs
            WHERE workspace_id = ${workspaceId}
          `
        : await db`SELECT scheduled_time, payload->>'status' AS status FROM calendar_jobs`;
      const conflict = rows.some((job) => String(job.scheduled_time).toLowerCase().includes(lower) && job.status !== 'cancelled');
      return {
        available: !conflict,
        preferred_time: preferredTime,
        recommended_slots: recommendedSlots,
        next_open_slot: recommendedSlots[0]
      };
    },

    async book(input, { workspaceId = 'workspace-local' } = {}) {
      const newJob = buildJob(input, workspaceId);
      const { customer_name: customerName, scheduled_time: scheduledTime } = newJob;

      const db = await ready();
      const existing = await db`
        SELECT payload FROM calendar_jobs
        WHERE workspace_id = ${workspaceId}
          AND lower(customer_name) = ${customerName.toLowerCase()}
          AND lower(scheduled_time) = ${scheduledTime.toLowerCase()}
        LIMIT 1
      `;
      if (existing[0]?.payload) {
        return { booking: existing[0].payload, duplicate: true };
      }

      try {
        await db`
          INSERT INTO calendar_jobs (id, workspace_id, customer_name, scheduled_time, payload, created_at)
          VALUES (
            ${newJob.id},
            ${workspaceId},
            ${customerName},
            ${scheduledTime},
            ${db.json(newJob)},
            ${newJob.created_at}
          )
        `;
        return { booking: newJob, duplicate: false };
      } catch (error) {
        if (String(error?.code) === '23505') {
          const again = await db`
            SELECT payload FROM calendar_jobs
            WHERE workspace_id = ${workspaceId}
              AND lower(customer_name) = ${customerName.toLowerCase()}
              AND lower(scheduled_time) = ${scheduledTime.toLowerCase()}
            LIMIT 1
          `;
          if (again[0]?.payload) return { booking: again[0].payload, duplicate: true };
        }
        throw error;
      }
    }
  };
}
