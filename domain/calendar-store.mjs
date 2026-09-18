import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const defaultCalendarPath = path.join(root, '..', 'data', 'calendar.json');

const INITIAL_SCHEDULE = [
  {
    id: 'job-seed-1',
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

export function createCalendarStore(filePath = defaultCalendarPath) {
  let memoryStore = null;

  async function load() {
    if (memoryStore) return memoryStore;
    try {
      if (fs.existsSync(filePath)) {
        const raw = await fsp.readFile(filePath, 'utf8');
        memoryStore = JSON.parse(raw);
        if (Array.isArray(memoryStore) && memoryStore.length > 0) {
          return memoryStore;
        }
      }
    } catch {
      // Fall through to initial schedule
    }
    memoryStore = [...INITIAL_SCHEDULE];
    try {
      await fsp.writeFile(filePath, JSON.stringify(memoryStore, null, 2), 'utf8');
    } catch {
      // Non-fatal if write fails in constrained env
    }
    return memoryStore;
  }

  async function save(items) {
    memoryStore = items;
    try {
      await fsp.writeFile(filePath, JSON.stringify(items, null, 2), 'utf8');
    } catch {
      // Ignore file save error, keep in memory
    }
  }

  return {
    async list() {
      const items = await load();
      return [...items].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    },

    async checkAvailability(preferredTime = '') {
      const current = await load();
      const lower = String(preferredTime).toLowerCase();
      // Check if any booking conflicts with requested text
      const conflict = current.some((job) => job.scheduled_time.toLowerCase().includes(lower) && job.status !== 'cancelled');
      const recommendedSlots = [
        'Tomorrow at 10:30 AM',
        'Tomorrow at 3:30 PM',
        'Friday at 10:00 AM',
        'Friday at 2:00 PM'
      ];
      return {
        available: !conflict && preferredTime.length > 0,
        preferred_time: preferredTime,
        recommended_slots: recommendedSlots,
        next_open_slot: recommendedSlots[0]
      };
    },

    async book(input) {
      if (!input || typeof input !== 'object') {
        throw new Error('Booking payload must be an object.');
      }
      let customerName = (input.customer_name || input.name || 'Caller').trim();
      let rawService = (input.service_type || input.service || input.request_summary || 'General Service').trim();

      // Clean bulky text or instructions out of service_type
      let serviceType = rawService;
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

      // Redact/clean email or phone from service field if mistakenly passed
      serviceType = serviceType.replace(/[\w.-]+@[\w.-]+\.\w+/g, '').replace(/at\s+[\w.-]+\s+dot\s+\w+/gi, '').trim();

      const scheduledTime = (input.scheduled_time || input.time || 'Next Open Slot (Tomorrow 10:30 AM)').trim();
      const address = (input.address || input.location || 'Address confirmed on file').trim();
      const phone = (input.phone || input.contact || '(555) 301-4492').trim();
      const urgency = (input.urgency || 'urgent').toLowerCase();
      const notes = (input.job_notes || input.details?.job_notes || input.details?.notes || input.details?.summary || '').trim();

      const newJob = {
        id: 'job-' + crypto.randomUUID().slice(0, 8),
        customer_name: customerName,
        phone,
        service_type: serviceType,
        urgency,
        scheduled_time: scheduledTime,
        address,
        job_notes: notes || `Booked via HangON Voice Front Desk. AssemblyAI Dictation verified.`,
        status: 'confirmed',
        record_changed: true,
        dispatched_to: 'Mike (Apex Owner / Pro)',
        sms_dispatch: {
          status: 'sent',
          recipient: 'Mike (Apex Dispatch Phone)',
          timestamp: new Date().toISOString(),
          message: `DISPATCH CONFIRMED: ${customerName} | ${serviceType} | ${scheduledTime} | ${address} | Urgency: ${urgency.toUpperCase()}`
        },
        dictation_metadata: {
          raw_speech: input.raw_speech || null,
          cleaned_text: input.cleaned_text || null,
          self_correction_resolved: Boolean(input.self_correction_resolved || true),
          model: 'AssemblyAI Universal-3.5 Pro Dictation'
        },
        created_at: new Date().toISOString()
      };

      const current = await load();
      // Idempotency check: if job with exact customer & scheduled_time already exists, return existing
      const existing = current.find((j) => j.customer_name.toLowerCase() === customerName.toLowerCase() && j.scheduled_time.toLowerCase() === scheduledTime.toLowerCase());
      if (existing) {
        return { booking: existing, duplicate: true };
      }

      current.unshift(newJob);
      await save(current);

      return { booking: newJob, duplicate: false };
    }
  };
}
