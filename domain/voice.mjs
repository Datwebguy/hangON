import { SERVICE_KEYTERMS } from './dictation.mjs';

const DEFAULT_VOICES = [
  { id: 'anna', label: 'Anna — British' },
  { id: 'michael', label: 'Michael — US' },
  { id: 'jane', label: 'Jane — US' },
  { id: 'alba', label: 'Alba — US' }
];

export const voiceCatalog = DEFAULT_VOICES;

export function voiceOptions(workspace) {
  const allowed = workspace?.voice?.allowed;
  if (!Array.isArray(allowed) || !allowed.length) return DEFAULT_VOICES;
  const options = DEFAULT_VOICES.filter((voice) => allowed.includes(voice.id));
  return options.length ? options : DEFAULT_VOICES;
}

export function voiceConfig(workspace) {
  const voices = voiceOptions(workspace);
  const requested = workspace?.voice?.default;
  return { voices, defaultVoice: voices.some((voice) => voice.id === requested) ? requested : voices[0].id };
}

export function buildSystemPrompt(workspace) {
  const isSoloService = Boolean(workspace?.business_type || workspace?.capabilities?.actions?.enabled);
  const orgName = workspace?.name || 'Apex Plumbing & Electrical Dispatch';
  const ownerName = workspace?.owner || 'Mike';

  if (isSoloService) {
    return [
      `You are HangON, the intelligent voice front desk for ${orgName}.`,
      `The owner and lead technician, ${ownerName}, is currently on a job and cannot pick up the phone.`,
      'Your job is to assist callers with plumbing, electrical, and HVAC emergencies or appointments, resolve any self-corrections they make in their speech, check open slots, confirm the booking cleanly, and lock it onto the dispatch calendar.',
      'When the caller speaks, listen carefully to what is happening. If they have an active leak or emergency, reassure them immediately.',
      'If the caller corrects themselves (for example, saying "Thursday... wait no, make it Friday at 10:30am"), always resolve to their final intended choice.',
      'Offer or verify an open calendar slot (e.g., Tomorrow at 10:30 AM, Tomorrow at 3:30 PM, or Friday at 10:00 AM).',
      'Before booking, read back a clean confirmation: customer name, service needed, scheduled time, and service address.',
      'Ask directly: "Shall I go ahead and lock that into the dispatch calendar for you?"',
      'Once the caller confirms with yes/correct/confirm, immediately call the book_service_appointment tool.',
      'After booking, let them know the appointment is confirmed and an instant dispatch SMS alert has been sent to the technician.'
    ].join(' ');
  }

  const capabilities = workspace?.capabilities || {};
  const enabled = Object.values(capabilities).filter((item) => item?.enabled).map((item) => item.label);
  const unavailable = Object.values(capabilities).filter((item) => !item?.enabled).map((item) => item.label);
  return [
    `You are HangON, a voice front desk for ${orgName}.`,
    `Available capabilities: ${enabled.join(', ') || 'none'}.`,
    `Unavailable capabilities: ${unavailable.join(', ') || 'none'}.`,
    'Wait for the caller to speak. Ask one clear question at a time and collect only verified facts.',
    'Only call prepare_confirmed_request after the caller explicitly confirms the exact summary.'
  ].join(' ');
}

export const bookServiceTool = {
  type: 'function',
  name: 'book_service_appointment',
  description: 'Book a confirmed service job on the technician dispatch calendar and trigger an immediate SMS alert after explicit caller confirmation.',
  parameters: {
    type: 'object',
    properties: {
      customer_name: { type: 'string', description: 'Customer or caller name.' },
      service_type: { type: 'string', description: 'Specific repair or service requested (e.g. Water Heater Leak Repair, Main Drain Clog, Panel Inspection).' },
      scheduled_time: { type: 'string', description: 'The confirmed date and time slot (e.g. Friday at 10:30 AM).' },
      address: { type: 'string', description: 'Service address where technician will arrive.' },
      phone: { type: 'string', description: 'Contact phone number.' },
      urgency: { type: 'string', enum: ['emergency', 'urgent', 'standard'], description: 'Urgency level of the service request.' },
      confirmed: { type: 'boolean', description: 'Must be true after explicit caller confirmation.' }
    },
    required: ['customer_name', 'service_type', 'scheduled_time', 'confirmed']
  }
};

export const requestTool = {
  type: 'function',
  name: 'prepare_confirmed_request',
  description: 'Prepare and route a factual request for authorized follow-up only after the caller has explicitly confirmed the exact summary.',
  parameters: {
    type: 'object',
    properties: {
      request_summary: { type: 'string', description: 'A short, factual summary of what the caller wants.' },
      details: { type: 'object', description: 'Only facts the caller provided or confirmed.', additionalProperties: true },
      confirmed: { type: 'boolean', description: 'True only after explicit confirmation of the exact summary.' }
    },
    required: ['request_summary', 'details', 'confirmed']
  }
};

export const checkAvailabilityTool = {
  type: 'function',
  name: 'check_calendar_availability',
  description: 'Check available appointment slots on the technician dispatch calendar.',
  parameters: {
    type: 'object',
    properties: {
      preferred_time: { type: 'string', description: 'Preferred time mentioned by caller.' }
    }
  }
};
