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
  let serviceType = String(rawService || 'General Service').trim();
  if (serviceType.length > 50) {
    if (/plumb|drain|sink|pipe|leak|water heater/i.test(serviceType)) {
      serviceType = 'Kitchen Plumbing & Pipe Inspection';
    } else if (/electric|panel|breaker|spark|outlet/i.test(serviceType)) {
      serviceType = 'Electrical Service & Diagnostic';
    } else if (/hvac|air condition|ac|heat|cooling|thermostat/i.test(serviceType)) {
      serviceType = 'HVAC System Diagnostic & Repair';
    } else {
      serviceType = serviceType.slice(0, 48) + '...';
    }
  }
  return serviceType.replace(/[\w.-]+@[\w.-]+\.\w+/g, '').replace(/at\s+[\w.-]+\s+dot\s+\w+/gi, '').trim();
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
      if (!input || typeof input !== 'object') {
        throw new Error('Booking details are missing.');
      }

      const customerName = (input.customer_name || input.name || 'Caller').trim();
      const serviceType = normalizeServiceType(input.service_type || input.service || input.request_summary || 'General Service');
      const scheduledTime = (input.scheduled_time || input.time || 'Next Open Slot (Tomorrow 10:30 AM)').trim();
      const address = (input.address || input.location || 'Address confirmed on file').trim();
      const phone = (input.phone || input.contact || '(555) 301-4492').trim();
      const urgency = String(input.urgency || 'urgent').toLowerCase();
      const notes = (input.job_notes || input.details?.job_notes || input.details?.notes || input.details?.summary || '').trim();

      const newJob = {
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
          status: 'queued',
          recipient: 'Mike (Apex Dispatch Phone)',
          timestamp: new Date().toISOString(),
          message: `New job: ${customerName} | ${serviceType} | ${scheduledTime} | ${address} | Urgency: ${urgency.toUpperCase()}`
        },
        dictation_metadata: {
          raw_speech: input.raw_speech || null,
          cleaned_text: input.cleaned_text || null,
          self_correction_resolved: Boolean(input.self_correction_resolved),
          model: 'AssemblyAI Universal-3.5 Pro Dictation'
        },
        created_at: new Date().toISOString()
      };

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
      if (!input || typeof input !== 'object') {
        throw new Error('Booking details are missing.');
      }

      const customerName = (input.customer_name || input.name || 'Caller').trim();
      const serviceType = normalizeServiceType(input.service_type || input.service || input.request_summary || 'General Service');
      const scheduledTime = (input.scheduled_time || input.time || 'Next Open Slot (Tomorrow 10:30 AM)').trim();
      const address = (input.address || input.location || 'Address confirmed on file').trim();
      const phone = (input.phone || input.contact || '(555) 301-4492').trim();
      const urgency = String(input.urgency || 'urgent').toLowerCase();
      const notes = (input.job_notes || input.details?.job_notes || input.details?.notes || input.details?.summary || '').trim();

      const newJob = {
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
          status: 'queued',
          recipient: 'Mike (Apex Dispatch Phone)',
          timestamp: new Date().toISOString(),
          message: `New job: ${customerName} | ${serviceType} | ${scheduledTime} | ${address} | Urgency: ${urgency.toUpperCase()}`
        },
        dictation_metadata: {
          raw_speech: input.raw_speech || null,
          cleaned_text: input.cleaned_text || null,
          self_correction_resolved: Boolean(input.self_correction_resolved),
          model: 'AssemblyAI Universal-3.5 Pro Dictation'
        },
        created_at: new Date().toISOString()
      };

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
